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

  // Which row in the table holds your progress. Only change this if you want
  // to keep two independent sets of progress in the same Supabase project.
  ROW_ID: "me",
};
