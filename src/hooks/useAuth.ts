import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

export type ProfileStatus = "pending" | "approved" | "rejected";

export interface Profile {
  id: string;
  discord_id: string | null;
  display_name: string | null;
  avatar_url: string | null;
  status: ProfileStatus;
  is_admin: boolean;
  created_at: string;
}

interface AuthState {
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  isAdmin: boolean;
}

export const useAuth = (): AuthState & { signOut: () => Promise<void> } => {
  const [state, setState] = useState<AuthState>({
    loading: true,
    session: null,
    user: null,
    profile: null,
    isAdmin: false,
  });

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }

    const loadProfile = async (user: User | null) => {
      if (!user) return null;
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();
      return (data as Profile | null) ?? null;
    };

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setState((s) => ({ ...s, session, user: session?.user ?? null }));
      // Defer profile fetch to avoid deadlock
      setTimeout(async () => {
        const profile = await loadProfile(session?.user ?? null);
        setState({
          loading: false,
          session,
          user: session?.user ?? null,
          profile,
          isAdmin: Boolean(profile?.is_admin),
        });
      }, 0);
    });

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const profile = await loadProfile(session?.user ?? null);
      setState({
        loading: false,
        session,
        user: session?.user ?? null,
        profile,
        isAdmin: Boolean(profile?.is_admin),
      });
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return { ...state, signOut };
};
