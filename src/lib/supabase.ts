import { createClient } from "@supabase/supabase-js";

// Le projet SlowRun en production est jisiahjqkxuctzmrsqzd.
// On garde l'URL et la clé hardcodées pour éviter qu'un .env auto-généré
// (ex: nouveau projet Cloud) bascule l'app vers une base vide.
export const SUPABASE_URL = "https://jisiahjqkxuctzmrsqzd.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_0dgR1Ed5bYz8mx6cGapjqw_le7V33t2";
export const SUPABASE_FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const supabase = createClient(
  SUPABASE_URL || "https://placeholder.supabase.co",
  SUPABASE_ANON_KEY || "placeholder-anon-key",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storage: localStorage,
    },
  }
);
