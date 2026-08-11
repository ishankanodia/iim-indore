# CLAUDE.md

Guidance for Claude when working in this repository.

## Project

A shared web app for IIM Indore PGP 2026–28 students: case competition tracker,
mess menu, class timetable. Deployed to GitHub Pages, meant to be installed to a
phone home screen. No build step, no dependencies, no package manager.

Multi-user since accounts landed: sign in with a serial number and a 6-digit
PIN, everyone reads the same competition list, everyone keeps their own ticks.
Serial 1 is the owner and the only admin.

```
index.html              the entire app (HTML + inline CSS + inline vanilla JS)
config.js               Supabase keys + the two published sheet CSV URLs
data/competitions.json  competition content
data/mess.json          14-day mess cycle          (regenerated from the sheet)
data/timetable.json     Term I schedule            (regenerated from the sheet)
tools/refresh-data.mjs  rebuild those two from the sheets
tools/smoke-test.mjs    boot + render check (needs jsdom)
supabase-setup.sql      one-time table + RLS setup
sw.js, manifest.webmanifest, icons/
legacy/                 the original single-file localStorage tracker, unused
```

Preview with `./start-local.command` or `python3 -m http.server`. Do **not**
suggest opening `index.html` from Finder — `fetch` is blocked on `file://` and
the three data files will fail to load.

## The one architectural rule

**Content is in git; progress is in Supabase.** Competitions, mess menu and
timetable are JSON files the user edits (via Claude) and pushes. Progress —
`{stage, out, waiting, ppraDone}` per competition — is one JSON blob per user in
one Supabase row (`id = 'u<serial>'`), because a phone can write over HTTP but
cannot push a commit. Do not move content into the database, and do not move
progress into a file, without being asked; each is where it is for a specific
reason.

Accounts did not weaken that rule, they sharpened it: the competition list is
shared *because* it is in git, so one push updates the batch and no two people
can be looking at different lists. Only progress is per-user. If asked for
per-user competitions, say what that costs — it moves content into the database
and gives up exactly that property.

**The timetable and the mess menu now have an upstream.** Both are maintained
by the institute in Google Sheets, and the app reads them live at boot. The
originals are restricted to `iimidr.ac.in`, and a static page has no login, so
`config.js` points at a **mirror** sheet in the user's own Drive: its cells are
`IMPORTRANGE()` against the originals (which runs with the user's credentials)
and the mirror is published to the web as CSV, which is anonymously readable.

That does **not** demote the JSON. `loadData()` loads `data/*.json` first and
renders from it; the sheet read is applied on top and is allowed to fail. No
URL configured, no signal, Google slow, sheet reshaped past recognition — every
one of those keeps the committed copy. Competitions have no sheet at all and
remain hand-edited. So the rule still holds, with one clause added: content is
in git, and for two of the three tabs git holds the *fallback* while the sheet
holds the truth.

## Architecture

- **`SEED`, `MESS`, `TT`** are populated by `loadData()` from the three JSON
  files at boot, and `MESS`/`TT` are then replaced if the live sheet read
  succeeds. They are not literals in the source any more.
- **The sheet parsers live between the `SHEET PARSERS` markers in
  `index.html`, and `tools/refresh-data.mjs` lifts that block out and runs
  it.** That is deliberate: one implementation means the committed JSON cannot
  drift from what the app would compute from the same sheet, and drift would
  only ever surface offline. Keep the block self-contained — it must not
  reference anything outside the markers, or the Node side stops working.
- **`SRC` records where each of the two live tabs got its data**
  (`file` / `live` / `stale`) and `srcNote()` turns that into the footnote
  under each tab. Being able to tell "today's sheet" from "the copy from the
  last push" at a glance is the point; don't quietly drop it.
- **Course codes are discovered from the sheet, not hardcoded.** Anything
  appearing as `<CODE> <SECTION> <n>` becomes a code, which is how `CMT`
  appeared without a code change. A slot column is any header that is a bare
  time range, which is what keeps Lunch/Break/Remarks out without naming them.
- **Consecutive slots with identical text collapse into one entry.** Four days
  of End Term are 4 cards, not 24, and the two-slot SMOD group assignment
  reads as the single sitting it is. A blank slot breaks the run.
- **`AUTH` = `{serial, name, token}`, and `ROW`/`KEY` are derived from it.**
  They are `let`, not `const`: `applyUser()` points them at `u<serial>` and
  `case-comp-tracker-v3:u<serial>` once someone signs in. Nothing that reads
  progress may run before `gate()` resolves, or it reads the wrong person's
  row — that is why `boot()` awaits the gate before `initSync()`.
- **`state`** = `{v, updatedAt, comps: {id: {stage, out, waiting, ppraDone}}}`.
  Written to `localStorage` under `KEY` on every mutation, and pushed to
  Supabase on a 600 ms debounce.
- **`touch()`** is the single mutation epilogue: stamp `updatedAt`, write local,
  queue push. Every state change must call it — a change that skips `touch()`
  will silently fail to sync.
- **`reconcile()`** back-fills defaults for competitions and fields missing from
  a stored state. Follow that pattern when adding a new state field instead of
  bumping `KEY`, which would strand saved progress.
- **`render()`** is a full re-render via template strings, dispatched to
  `renderComps` / `renderMess` / `renderTT` / `renderUsers` by the active tab.
  No diffing, no framework. Card buttons use inline `onclick`, so `advance`,
  `selected`, `await_`, `elim`, `revive`, `togglePpra`, `undo` and `removeUser`
  must stay top-level function declarations (a `const` arrow would not be
  reachable from the attribute).
- **`mutate()` is how every card action changes progress**, and it snapshots
  the whole `{stage, out, waiting, ppraDone}` record into `UNDO[id]` before
  applying the change. A new action that writes state directly still works but
  is silently un-undoable, so route it through `mutate()`.
- **Undo exists for the misclick**, which is why it has two surfaces and its own
  storage. The per-card `↶ Undo` button renders only when that comp's stack is
  non-empty; the `#toast` covers the case the button cannot, because marking a
  card submitted moves it out of *Action needed* and takes its own button with
  it. `UNDO` persists to `KEY + ':undo'` — deliberately a separate key, not a
  field in `state`, because a last-write-wins synced blob shared by one person's
  two devices would have them arguing over whose history is current. The cost is
  accepted: you cannot undo a phone tap from your laptop. Reset clears the stacks
  rather than leaving an Undo that would restore one card to a pre-reset state.

### Accounts

Four Postgres functions, no table reads: `tracker_signup`, `tracker_login`,
`tracker_touch`, `tracker_users_list`, `tracker_user_remove`. `tracker_users`
is granted nothing and has no policies, so the anon key cannot read names or
hashes even though it ships in the page — that is the whole reason accounts go
through functions rather than PostgREST. PINs are bcrypt (`crypt`/`gen_salt`)
and are never returned. What a device stores is a token, never the PIN.

Progress rows stay on plain PostgREST with open policies, as before. Names and
PINs are protected; a checklist of ticks is not. That asymmetry is deliberate —
don't "fix" it by putting progress behind functions without being asked, and
don't level it down by exposing the users table.

`gate()` resolves when someone is signed in, and returns immediately in two
cases: no Supabase configured (single local user, the smoke test's path), or a
saved token in `localStorage` (verified in the background, because being offline
must not lock anyone out). `body.locked` is what hides the app behind it, and
the data-load failure path has to clear it or the error message is invisible.

The Users tab is admin-only in three places that must agree: the nav button is
`hidden`, `showTab()` refuses to open it, and `tracker_users_list` rejects a
non-1 caller. The first two are convenience; the third is the actual control.

### Sync

Last-write-wins on `updatedAt`, whole blob, within one user's row. On boot:
newer remote replaces local; newer local is pushed; a tie keeps local. That is
correct for one person on two devices, and two people never contend because they
are never in the same row. Failed pushes set `dirty` and retry on `online`, on a
30 s interval, and on `visibilitychange` to hidden — the last one matters because
iOS freezes the tab the instant you swipe away, and the debounce timer would
never fire.

Three one-time lifts keep old progress alive, all of them read-only and all of
them serial-1 only (`inheritedKey()` / `inheritedRow()`): the pre-accounts
`case-comp-tracker-v3` local key, the pre-accounts `me` Supabase row, and the
original single-file tracker's `case-comp-tracker-v2` key. Keep those paths.

### Things that are easy to get wrong

- **`stages` vs `timeline` are different lengths on purpose.** `stages` is the
  set of tickable rounds and drives the progress dots and the `stage/length`
  counter; `timeline` is the fuller schedule in the disclosure. Both index
  against the same `state.stage` integer, so the "current" timeline row is only
  correct where the two arrays happen to line up. Don't assume a 1:1 mapping.
- **`stageStarts` is a sparse object keyed by stage index, not an array.**
  Deliberately — it sidesteps the length-mismatch trap `timeline` has, and only
  the rounds you actually know about get filled in. Each entry is
  `{on: ISO|null, short: 'Sim'}`, where `on: null` means announced but
  unscheduled. `nextRound()` reads it to decide whether the round you are
  sitting on has begun; when it has not, `badge()` shows "Sim in 12 days" /
  "Online test — TBA" instead of "In progress", and `pending()` files that
  competition under Waiting rather than Action needed. Index 0 is never
  consulted (stage 0 always uses the `deadline` countdown). A missing entry, or
  an `on` date already past, falls back to "In progress" — correct for a round
  that is genuinely live.
- **The date is live and counted in whole IST calendar days.** `TODAY` is
  recomputed at the top of every `render()`; never reintroduce a literal date.
  `daysLeft()` rounds between IST midnights, so `1` always means tomorrow and
  `0` means today whatever clock time the round carries. A 30 s interval
  re-renders on IST day rollover and on minute changes, so a tab left open
  overnight stays correct and "on right now" stays honest.
- **`pending(c)` is the single source of truth for the Action needed / Waiting
  split.** It drives the tabs, the tab counts, the first two stat tiles, the
  home-screen badge pip, and the `.why` line on each card — change the rule in
  one place and all five follow. It returns `{action, why}` for live
  competitions and `null` for eliminated/complete ones (they belong in neither
  tab, so `inBucket()` null-checks before reading `.action`). "Action" means
  *you* owe something: not registered, or the current round is open. A quiz four
  days out is Waiting, not Action needed — that distinction is the entire point
  of the split, so don't "fix" it by folding upcoming rounds back into the
  active bucket.
- **PPRA deliberately does not move a card between tabs.** It's a form, not a
  round, so a Waiting card with `ppraDone: false` stays in Waiting — but its
  `.why` line appends "· PPRA form still to fill". Keep that note.
- **`waiting` is a modifier, not a stage.** A competition can be at `stage` N
  and `waiting: true`; that fills the current dot as `done`, swaps the buttons
  to Selected/Not selected, and via `urgency()` suppresses the red/amber
  deadline styling. `bump()` clears it.
- **`ppraDone` is tracked independently of `stage`.** The checkbox renders only
  where `c.ppra` is true, and `elim()`/`revive()`/`bump()` deliberately leave it
  alone — filling a form is a fact about the past, not a round.
- `deadline` feeds the countdown and sort order; `deadlineLabel` is what the
  user reads. Keep them consistent by hand.
- `reg`/`pproof` with `url: null` render as greyed-out plain text (used for
  "link is in the placement mail"), not as links.
- **The mess menu is a 14-day cycle** anchored at `MESS.cycleStart`, mapped by
  modulo, so it answers for any date. The published sheet covers two passes
  (3–30 Aug); past that the app keeps cycling and says so in the footnote rather
  than showing nothing.
- **`TT.courses` maps course codes to display names** and currently maps every
  code to itself, because the full course titles were never supplied. Do not
  invent them — ask.

All dates and copy are IST and India-specific (PPRA = placement-committee
proof-of-registration form, Unstop, placecomm mails).
