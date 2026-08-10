# IIM Indore — case comps, mess menu, timetable

A single-page app with three tabs, built to live on GitHub Pages and sit on your
phone's home screen. Competition details, mess menu and class schedule are JSON
files in this repo. Your *progress* through the competitions lives in a Supabase
table, which is what makes it follow you from laptop to phone.

```
index.html                 the whole app (HTML + CSS + vanilla JS, no build step)
config.js                  your Supabase URL and key — the only file you must edit
data/competitions.json     competition details, deadlines, rounds, timelines
data/mess.json             the 14-day mess cycle
data/timetable.json        Term I class schedule
supabase-setup.sql         run once in Supabase to create the table
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
of JSON: `{stage, out, waiting, ppraDone}` per competition. Nothing else.

One consequence worth knowing: on iOS, a home-screen app gets its own storage,
separate from Safari. Without the database step you would see different progress
in the app and in the browser, on the same phone. With it, they agree.

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
script's row-level-security policies are what actually control access, and they
scope it to this one table. See the comment block in the SQL file for the honest
version of the trade-off you are making by having no login.

Skip this step entirely if you want — the app still runs, it just saves progress
to one browser and the pill in the header says "This device only".

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

It will tell you how many competitions it matched. From then on everything syncs
through Supabase and you never do this again. The same two buttons work as a
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

**Mess menu changes.** Send me the new sheet and I will regenerate
`data/mess.json`. It is a 14-day cycle anchored at `cycleStart`; the app maps any
date onto it with a modulo, and warns you when you have scrolled past the
published window into a repeat.

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

**`data/timetable.json`** — `courses` maps each code to a display name. Right now
every code maps to itself (`"FAC": "FAC"`) because I did not want to guess your
course titles. Tell me what FAC, IPS, MC, ME-I, MM-I, OB-I, OM-I, SMOD and IA
actually stand for and I will fill them in; the app will show the full names
under each class.

**`data/mess.json`** — `days` is 14 entries, one per cycle day, each with
`breakfast` / `lunch` / `dinner` arrays of `{label, item}` plus a `nonveg` string.

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
