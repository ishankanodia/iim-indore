#!/usr/bin/env node
/* A boot-and-render smoke test. Not a unit test suite — just the one check
 * that actually matters for a single-file app with inline onclick handlers:
 * does it boot, does every tab paint, and does the timetable/mess data line up
 * with the sheet on the days we care about.
 *
 *   npm install jsdom     (once, anywhere on the path)
 *   node tools/smoke-test.mjs [tt.csv mess.csv]
 *
 * With two CSVs it exercises the live-sheet path against local files; without
 * them it exercises the committed-JSON fallback path.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [ttCsv, messCsv] = process.argv.slice(2);
let fails = 0;
const ok  = m => console.log('  ok   ' + m);
const bad = m => { fails++; console.log('  FAIL ' + m); };
const is  = (got, want, m) => got === want ? ok(`${m} = ${got}`) : bad(`${m}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

/* The shims have to be in place in beforeParse: the inline script calls boot()
   the moment it is parsed, so anything installed after construction is already
   too late. jsdom does not load config.js either, which is convenient — the
   TRACKER_CONFIG set here is the only one the page sees. */
const dom = new JSDOM(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), {
  runScripts: 'dangerously', url: 'https://example.test/', pretendToBeVisual: true,
  beforeParse(win){
    /* Serve ./data/*.json off disk, and the two sheet URLs off the CSV exports. */
    win.fetch = async (url) => {
      const u = String(url);
      if(u.startsWith('sheet:tt'))   return { ok:true, status:200, text: async () => fs.readFileSync(path.resolve(ttCsv), 'utf8') };
      if(u.startsWith('sheet:mess')) return { ok:true, status:200, text: async () => fs.readFileSync(path.resolve(messCsv), 'utf8') };
      const f = path.join(ROOT, u.replace(/^\.\//,'').split('?')[0]);
      if(!fs.existsSync(f)) return { ok:false, status:404, json: async () => { throw new Error('404'); } };
      return { ok:true, status:200, json: async () => JSON.parse(fs.readFileSync(f,'utf8')), text: async () => fs.readFileSync(f,'utf8') };
    };
    win.TRACKER_CONFIG = {
      SUPABASE_URL:'', SUPABASE_ANON:'',                   // local-only, no network sync
      SHEETS: ttCsv ? { TIMETABLE_CSV:'sheet:tt', MESS_CSV:'sheet:mess', SECTION:'G' } : {},
    };
  },
});
const win = dom.window;
await new Promise(r => setTimeout(r, 600));               // let boot()'s awaits settle

const $ = id => win.document.getElementById(id);
/* SEED / MESS / TT / SRC are `let` bindings, which never land on window, so
   reach them the only way a script-scope binding can be reached from out here. */
const ev = expr => win.eval(expr);
console.log(ttCsv ? 'live-sheet path' : 'committed-JSON path');

is(ev('TT && TT.entries.length > 0'), true, 'timetable loaded');
is(ev('MESS && MESS.days.length'), 14, 'mess cycle length');
is(ev('SEED.length > 0'), true, 'competitions loaded');
if(ttCsv) is(ev('SRC.tt.how'), 'live', 'timetable source');

/* The four things the August emails changed, checked against the sheet. */
const at = (d, s, f) => ev(`(TT.entries.find(e=>e.date==='${d}'&&e.start==='${s}')||{}).${f}`);
is(at('2026-08-31','14:30','title'), 'FAC G 19', 'FAC rescheduled to 31 Aug 2:30 pm');
is(ev("TT.entries.some(e=>e.date==='2026-08-14'&&e.code==='FAC')"), false, 'no FAC left on 14 Aug');
is(at('2026-08-28','14:30','title'), 'SMOD Group Assignment', 'SMOD group assignment 28 Aug');
is(at('2026-08-13','14:30','title').includes('New Audi'), true, 'OB-I 13 Aug in the New Auditorium');
is(ev("SEED.some(c=>c.id==='relead')"), true, 'ReLead 9.0 present');

/* Every tab must paint without throwing and without coming back empty. */
for(const [tab, el] of [['comps','list'], ['mess','messBody'], ['tt','ttBody']]){
  try {
    win.showTab(tab);
    const n = ($(el).innerHTML || '').length;
    n > 40 ? ok(`${tab} tab rendered (${n} chars)`) : bad(`${tab} tab rendered almost nothing (${n} chars)`);
  } catch(e){ bad(`${tab} tab threw: ${e.message}`); }
}

/* Inline onclick means these must stay reachable as globals. */
['advance','selected','await_','elim','revive','togglePpra','removeUser','undo'].forEach(fn =>
  typeof win[fn] === 'function' ? ok(`window.${fn} reachable`) : bad(`window.${fn} missing — inline onclick would break`));

/* Undo has to restore every progress field, not just the one the action was
   named after — elim() clears `waiting` as a side effect, and an undo that
   left that cleared would quietly lose a round. */
try {
  const id = ev('SEED[0].id'), before = ev('JSON.stringify(state.comps[SEED[0].id])');
  win.await_(id); win.elim(id);
  win.undo(id); win.undo(id);
  is(ev('JSON.stringify(state.comps[SEED[0].id])'), before, 'undo restores the full progress record');
  win.undo(id);
  ok('undo on an empty stack is a no-op');
  /* The misclick has to stay recoverable after the card jumps filter tabs and
     after a reload — hence the toast and the separate storage key. */
  win.elim(id);
  is(win.document.getElementById('toast').hidden, false, 'toast offers undo right after a change');
  is(JSON.parse(win.localStorage.getItem(ev('undoKey()')))[id].length, 1, 'undo stack persisted for after a reload');
  is(ev('undoKey().indexOf(KEY) === 0 && undoKey() !== KEY'), true, 'undo stored under its own key, out of the synced blob');
  win.undo(id);
} catch(e){ bad(`undo threw: ${e.message}`); }

/* Accounts. With no Supabase configured the gate must get out of the way
   entirely — that is the single-user fallback, and it is this test's path. */
is(win.document.body.classList.contains('locked'), false, 'gate released in local-only mode');
is($('tabUsers').hidden, true, 'users tab hidden for a non-admin');
is(ev('showTab("users"), tab'), 'comps', 'users tab refuses to open for a non-admin');
is(ev('KEY'), 'case-comp-tracker-v3', 'storage key unscoped when signed out');
/* And with a signed-in user, storage has to move to that user's own row. */
is(ev('AUTH={serial:4,name:"Test",token:"t"}, applyUser(), ROW + " " + KEY'),
   'u4 case-comp-tracker-v3:u4', 'storage scoped to the signed-in user');
is(ev('isAdmin()'), false, 'user 4 is not admin');
is(ev('AUTH.serial=1, applyUser(), isAdmin() && !document.getElementById("tabUsers").hidden'), true, 'user 1 gets the users tab');
is(ev('inheritedRow()'), 'me', 'user 1 inherits the pre-accounts progress row');

console.log(fails ? `\n${fails} failure(s)` : '\nall good');
process.exit(fails ? 1 : 0);
