// ---------------------------------------------------------------------------
// Supabase connection. Fill these two in after creating your project.
// Both values are safe to commit — the anon key is a public client key, and the
// table's row-level-security policies are what actually control access.
//
// Where to find them:  Supabase dashboard -> Project Settings -> API
//   SUPABASE_URL  = "Project URL"        e.g. https://abcdefgh.supabase.co
//   SUPABASE_ANON = "anon public" key    (the long eyJ... string)
//
// Leave them empty and the app still works — it just falls back to storing
// progress in this browser only, with no cross-device sync.
// ---------------------------------------------------------------------------
window.TRACKER_CONFIG = {
  SUPABASE_URL:  "https://jrzpvfqeqvklbveqxism.supabase.co",
  SUPABASE_ANON: "sb_publishable_C8GjtAwq2eDEVvrmn12TUA_Swre-xHj",

  // Progress rows are now per user: signing in as number N reads and writes
  // 'uN'. This is only the row the app used BEFORE accounts existed — user 1
  // inherits it once, so the original progress carries over. Leave it alone.
  ROW_ID: "me",

  // -------------------------------------------------------------------------
  // Live sheets. Leave the two URLs empty and the app reads data/timetable.json
  // and data/mess.json exactly as before — everything still works, it just
  // won't pick up sheet edits on its own.
  //
  // The PGP office and MessCom sheets are restricted to iimidr.ac.in, and this
  // page has no login, so it cannot read them directly. Point these at a
  // MIRROR sheet in your own Drive instead:
  //
  //   1. New sheet in your IIM Drive. Two tabs, "timetable" and "mess".
  //   2. In A1 of each, IMPORTRANGE the original (IMPORTRANGE runs as you, so
  //      it can see the restricted source):
  //        =IMPORTRANGE("15g97jW7cTPlV5qAhx6WoIvb5g-xcUhgKmlOc8MA76q8","Term-I Time Table!A1:Z1000")
  //        =IMPORTRANGE("1n4geM3NTBH19XEXSa6Sn5pEt0VMh5nV1UIzRYkj3JkQ","BLD Menu!A1:Z100")
  //      Each shows #REF! once with an "Allow access" button. Click it.
  //   3. File -> Share -> Publish to web. Publish each TAB separately as
  //      Comma-separated values (.csv), not the whole document.
  //   4. Paste the two /pub?...&output=csv URLs below.
  //
  // Only the mirror is public, and it contains nothing but the timetable and
  // the menu. Google caches published output, so a change upstream shows up
  // here in about five minutes rather than instantly.
  // -------------------------------------------------------------------------
  SHEETS: {
    TIMETABLE_CSV: "",
    MESS_CSV:      "",
    SECTION:       "G",
  },
};
