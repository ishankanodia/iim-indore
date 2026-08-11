#!/usr/bin/env node
/* Regenerate data/timetable.json and data/mess.json from the sheets.
 *
 * The app reads the published sheets live at boot, so this script is not
 * required for the timetable to be current. What it does is keep the
 * *committed* copies fresh, and those are what you see when the phone has no
 * signal, when Google is down, and on the very first paint before the fetch
 * comes back. A stale fallback is a silent trap; run this whenever you push.
 *
 *   node tools/refresh-data.mjs                        read the published
 *                                                      URLs from config.js
 *   node tools/refresh-data.mjs tt.csv mess.csv        read two local CSV
 *                                                      exports instead
 *
 * It deliberately does NOT contain its own parsers. It lifts the block
 * between the SHEET PARSERS markers straight out of index.html and runs that,
 * so the committed JSON is by construction identical to what the app would
 * have computed from the same sheet. Two copies of this logic would drift,
 * and the drift would only ever show up offline, which is the worst possible
 * place to discover it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

function parsers(){
  const html = read('index.html');
  const a = html.indexOf('/* ===== SHEET PARSERS (start)');
  const b = html.indexOf('/* ===== SHEET PARSERS (end)');
  if(a < 0 || b < 0) throw new Error('index.html: SHEET PARSERS markers not found');
  const src = html.slice(a, b);
  return new Function(src + '\nreturn { parseCSV, parseTimetableCSV, parseMessCSV };')();
}

function config(){
  const win = {};
  new Function('window', read('config.js'))(win);
  return win.TRACKER_CONFIG || {};
}

async function source(arg, url, what){
  if(arg) return fs.readFileSync(path.resolve(arg), 'utf8');
  if(!url) throw new Error(`no ${what} CSV: pass a file path, or set SHEETS.${what} in config.js`);
  const res = await fetch(url);
  if(!res.ok) throw new Error(`${what}: HTTP ${res.status}`);
  const text = await res.text();
  if(/^\s*</.test(text)) throw new Error(`${what}: got HTML, not CSV — is the mirror sheet published to the web?`);
  return text;
}

const write = (f, obj) => {
  fs.writeFileSync(path.join(ROOT, 'data', f), JSON.stringify(obj, null, 1) + '\n');
  console.log('  wrote data/' + f);
};

const P = parsers();
const S = config().SHEETS || {};
const [ttArg, messArg] = process.argv.slice(2);

const tt = P.parseTimetableCSV(await source(ttArg, S.TIMETABLE_CSV, 'TIMETABLE_CSV'), S.SECTION || 'G');
console.log(`timetable · section ${tt.section} · ${tt.entries.length} entries · ` +
            `${tt.entries[0].date} to ${tt.entries[tt.entries.length-1].date} · ` +
            `courses ${Object.keys(tt.courses).join(', ')}`);
write('timetable.json', tt);

const mess = P.parseMessCSV(await source(messArg, S.MESS_CSV, 'MESS_CSV'));
const items = mess.days.reduce((n,d) => n + d.breakfast.length + d.lunch.length + d.dinner.length, 0);
console.log(`mess · ${mess.cycleLength}-day cycle from ${mess.cycleStart} · ${items} items · ${mess.links.length} links`);
write('mess.json', mess);
