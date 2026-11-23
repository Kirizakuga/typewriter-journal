// Cloud sync settings (Supabase). Leave empty to keep notes in this browser only.
// The anon key is designed to be public: row-level security in supabase/migrations/
// makes sure each signed-in user can only read and write their own journal.
window.JOURNAL_CONFIG = {
  supabaseUrl: '',
  supabaseAnonKey: '',
};
