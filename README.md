# IIM Indore — case comps, mess menu, timetable

A single-page app, built to live on GitHub Pages and sit on your phone's home
screen. Competition details, mess menu and class schedule are JSON files in this
repo. Each person's *progress* through the competitions lives in a Supabase
table, which is what makes it follow you from laptop to phone.

Anyone in the batch can use it: you sign in with a user number and a 6-digit
PIN, everyone sees the same competition list, and everyone's ticks are their
own. Whoever signs up first is user 1 and is the only one who can see the
Users tab.

```
index.html                 the whole app (HTML + CSS + vanilla JS, no build step)
config.js                  your Supabase URL and key — the only file you must edit
data/competitions.json     competition details, deadlines, rounds, timelines
data/mess.json             the 14-day mess cycle
data/timetable.json        Term I class schedule
supabase-setup.sql         run once in Supabase to create the tables + login functions
manifest.webmanifest, sw.js, icons/    what makes it installable + work offline
start-local.command        double-click to preview locally on a Mac
```

---

## Why the split (worth understanding before you change things)

**Content is in git. Progress is in a database.**

New competition announced? Ask me to edit `data/competitions.json`, then push.
Mess menu updated? Same. That is the workflow you wanted, and it works because
that content only ever changes on your laptop.

Ticking off a round is different — you do that on your phone, in a queue, on the
bus. Your phone cannot push a git commit, so that state has to go somewhere
writable over HTTP. That is the entire job Supabase does here. It holds one row
of JSON per person, `id = 'u<serial>'`: `{stage, out, waiting, ppraDone}` per
competition. Nothing else.

Adding accounts did not change that split. It only means "progress" is now
per-person. Competitions stay one shared file in git — nobody's copy can drift
from anybody else's, and one push updates the list for the whole batch.

One consequence worth knowing: on iOS, a home-screen app gets its own storage,
separate from Safari. Without the database step you would see different progress
in the app and in the browser, on the same phone. With it, they agree.

---

## Accounts

**Signing up.** New user → name + a 6-digit PIN → the app hands back a number.
Numbers start at 1 and go up; they are never reused, so a removed user's number
does not come back. Write yours down: the number and PIN are the whole login,
and there is no email to recover through.

**Signing in.** Number + PIN, once per device. After that the device stays
signed in — the header shows `#1 Ishan`, and tapping it signs out.

**What's protected, and what isn't.** The PIN is stored as a bcrypt hash and is
never sent back to any device. The users table is invisible to the app's public
key — no grant, no policy on it at all — so names and hashes cannot be read out
of the page even by someone who reads its source. Every account operation goes
through a Postgres function that decides what the caller is allowed to see.

Progress rows are the looser half, exactly as they were before: anyone holding
the anon key can read or write any `u<n>` row if they know it exists. That is
the same trade the app already made for a login-free tracker, and the blast
radius is still a checklist of case-comp ticks. Names and PINs are held to the
higher standard; progress is not.

**The Users tab** appears only for user 1, and only lists what an admin needs:
number, name, when they joined, when they last opened the app, and whether they
have ticked anything. Remove deletes the account and that person's progress
together; user 1 cannot remove themselves.

**Forgotten PIN.** Not recoverable. User 1 removes the account and the person
signs up again with a fresh number.

---

## Setup

### 1. Supabase (about 3 minutes)

1. Go to [supabase.com](https://supabase.com) → **Start your project** → sign in
   with GitHub. Free tier is plenty.
2. **New project**. Any name. Pick the region closest to you (Mumbai / Singapore).
   Save the database password somewhere, though this app never uses it.
3. Wait for the project to finish provisioning (~2 min).
4. Left sidebar → **SQL Editor** → **New query**. Open `supabase-setup.sql` from
   this folder, paste the whole thing in, hit **Run**. It should print one row.
5. Left sidebar → **Project Settings** → **API**. Copy two values:
   - **Project URL** — looks like `https://abcdefgh.supabase.co`
   - **anon public** key — the long `eyJ...` string
6. Paste both into `config.js`:

   ```js
   window.TRACKER_CONFIG = {
     SUPABASE_URL:  "https://abcdefgh.supabase.co",
     SUPABASE_ANON: "eyJhbGciOi...",
     ROW_ID: "me",
   };
   ```

Both values are safe to commit publicly. The anon key is a client key; the SQL
script's grants, policies and security-definer functions are what actually
control access, and they scope it to these two tables. See the comment blocks in
the SQL file for the honest version of what each half is and is not protected
against.

7. Open the app and **create your account first** — the first person to sign up
   gets number 1 and is the admin. Do this before sharing the link.

Skip this step entirely if you want — with no Supabase values the app skips the
sign-in screen altogether, runs as a single local user, and the pill in the
header says "This device only".

### 2. Push to GitHub

From this folder in Terminal:

```bash
git init
git add .
git commit -m "Campus tracker"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/iim-indore.git
git push -u origin main
```

(Create the empty `iim-indore` repo on github.com first, without a README.)

### 3. Turn on GitHub Pages

Repo → **Settings** → **Pages** → under *Build and deployment*, Source =
**Deploy from a branch**, Branch = **main**, folder = **/ (root)** → **Save**.

Give it a minute, then your app is live at:

```
https://YOUR-USERNAME.github.io/iim-indore/
```

The repo must be **public** for Pages on a free account.

### 4. Put it on your home screen

**iPhone (Safari — must be Safari, not Chrome):** open the link → Share button →
**Add to Home Screen** → Add. It lands as **IIM Indore**.

**Android (Chrome):** open the link → ⋮ menu → **Install app** / *Add to Home
screen*.

It opens full-screen with no browser chrome, keeps working offline, and syncs
the moment you have signal again.

### 5. Bring your old progress across (one time)

`localStorage` is scoped to the web address that wrote it. The old tracker saved
under `file://`; the new one lives on `github.io`. Those are different origins,
so the browser will not hand one's data to the other — your old ticks cannot
migrate automatically.

Thirty seconds of manual work fixes it:

1. Open `legacy/case-competitions-tracker-desktop.html` in the **same browser you
   were using before** (double-clicking it from Finder is fine — the old file has
   no data files to fetch).
2. Click **⬇ Export progress for the new app**. A `.json` lands in Downloads.
3. Open your new Pages link → **Case comps** tab → scroll to the bottom →
   **Backup & import progress** → **⬆ Import a backup file** → pick that file.

It will tell you how many competitions it matched, and it imports into whichever
account is signed in — so sign in as yourself first. The progress you had in
this app *before* accounts existed needs none of this: user 1 inherits it
automatically on first sign-in.

From then on everything syncs through Supabase and you never do this again. The same two buttons work as a
plain backup whenever you want one.

---

## Day-to-day

**A new competition comes up.** Tell me the details and I will add it to
`data/competitions.json`. Then:

```bash
git add . && git commit -m "Add <competition>" && git push
```

Live in under a minute. Your phone picks it up on next open — the service worker
fetches data files from the network first, so pushes are never stuck behind a
cache.

**Preview before pushing.** Double-click `start-local.command`, or run
`python3 -m http.server` here and open `http://localhost:8000`. Opening
`index.html` straight from Finder will *not* work — browsers block `fetch` on
`file://` URLs, and the app will tell you so.

**Timetable and mess changes.** Nothing to do. Both come from the institute's
own sheets and the app re-reads them every time it opens, so a session moved by
the PGP office shows up on its own. See the section below if you have not set
that up yet, or if the footnote under a tab says it is showing a saved copy.

---

## Reading the timetable and mess sheets live

The PGP office timetable and the MessCom menu are Google Sheets restricted to
`iimidr.ac.in` accounts. This app is a static page with no login, so it cannot
open them directly no matter how it is written. The way round that is a
**mirror sheet** in your own Drive: `IMPORTRANGE()` runs with *your*
credentials, so it can read the restricted originals, and you publish only the
mirror. Nothing about the originals changes, and the mirror holds nothing but
the timetable and the menu.

1. **New sheet** in your IIM Drive. Two tabs, `timetable` and `mess`.
2. **In A1 of each**, pointing at the source tab by name:

   ```
   =IMPORTRANGE("15g97jW7cTPlV5qAhx6WoIvb5g-xcUhgKmlOc8MA76q8","Term-I Time Table!A1:Z1000")
   =IMPORTRANGE("1n4geM3NTBH19XEXSa6Sn5pEt0VMh5nV1UIzRYkj3JkQ","BLD Menu!A1:Z100")
   ```

   Each shows `#REF!` once with an **Allow access** button. Click it.
3. **File → Share → Publish to web.** Publish each *tab* separately as
   **Comma-separated values (.csv)**, not the whole document.
4. **Paste the two URLs** into `SHEETS` in `config.js`, and set `SECTION` to
   your section letter.

The footnote under the Timetable and Mess tabs tells you which copy you are
looking at: *live from the sheet* with a read time, *showing the saved copy* if
the sheet could not be reached, or *no sheet URL set*. Google caches published
output, so an upstream edit lands here in about five minutes rather than
instantly.

**Keep the offline copy honest.** The committed JSON is what the app renders
before the fetch returns and whenever you have no signal, so refresh it when
you push:

```bash
node tools/refresh-data.mjs                     # from the published URLs
node tools/refresh-data.mjs tt.csv mess.csv     # or from two local exports
```

That script does not have its own parsers. It lifts the block between the
`SHEET PARSERS` markers out of `index.html` and runs that, so the committed
files cannot drift from what the app itself would compute.

**Check it still boots** after changing anything in `index.html`:

```bash
npm install jsdom
node tools/smoke-test.mjs                       # committed-JSON path
node tools/smoke-test.mjs tt.csv mess.csv       # live-sheet path
```

---

## Notes on the data files

**`data/competitions.json`** — same shape as the original tracker's `SEED`.
Two things that are easy to get wrong:

- `stages` and `timeline` are *different lengths on purpose*. `stages` is the
  set of tickable rounds and drives the progress dots; `timeline` is the fuller
  schedule in the disclosure. Both index against the same `stage` integer, so
  they only line up where they happen to.
- `stageStarts` is a sparse object keyed by stage index, not an array. Each
  entry is `{on: ISO|null, short: 'Sim'}`. `on: null` means announced but
  unscheduled. This is what turns a generic "In progress" into "Sim in 12 days",
  and what files a competition under Waiting instead of Action needed. Index 0
  is never read.
- Changing an existing `id` orphans that competition's saved progress.

**`data/timetable.json`** and **`data/mess.json`** are now *generated* — edit the
sheet, not these. Run `node tools/refresh-data.mjs` to rebuild them.

`courses` maps each code to a display name, and every code still maps to itself
(`"FAC": "FAC"`) because the sheet does not carry full course titles and I did
not want to invent them. Tell me what FAC, IPS, MC, ME-I, MM-I, OB-I, OM-I,
SMOD, IA and CMT stand for and I will add them.

`days` in the mess file is 14 entries, one per cycle day, each with
`breakfast` / `lunch` / `dinner` arrays of `{label, item}`. It is a 14-day cycle
anchored at `cycleStart`; the app maps any date onto it with a modulo and warns
you when you have scrolled past the published window into a repeat.

---

## If something looks wrong

| Symptom | Cause |
|---|---|
| "Could not load the data files" | Opened via `file://`. Use `start-local.command` or the Pages link. |
| Pill says "This device only" | `config.js` still has empty Supabase values. |
| Pill says "Offline — will retry" | No network, or the SQL script was not run. Taps are still saved locally and pushed later. |
| Phone and laptop disagree | One of them was offline when you last tapped. Open both with signal; newest change wins. |
| Push went live but phone shows old data | Close the app fully and reopen — the shell is cached, data is not. |
| Old tracker's ticks are missing | Expected. Do the one-time export/import in step 5 — different origins cannot share storage. |
| Signed in but the tracker looks empty | You are on someone else's number, or a new one. Tap the name pill in the header, sign out, sign in as yours. |
| "That number and PIN do not match" | Same message for a wrong number and a wrong PIN, on purpose — the form is not a way to find out who exists. |
| No Users tab | It only shows for user 1. |
| Someone forgot their PIN | Users tab → Remove them → they sign up again and get a new number. |
| "Could not find the function … in the schema cache" | Supabase has not picked up the new functions. SQL Editor → run `notify pgrst, 'reload schema';` |
