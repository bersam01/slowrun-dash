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

const buildProfilePayload = (user: User) => {
  const metadata = user.user_metadata ?? {};

  return {
    id: user.id,
    discord_id:
      metadata.provider_id ??
      metadata.sub ??
      metadata.preferred_username ??
      null,
    display_name:
      metadata.full_name ??
      metadata.global_name ??
      metadata.name ??
      metadata.user_name ??
      user.email ??
      null,
    avatar_url: metadata.avatar_url ?? metadata.picture ?? null,
    status: "pending" as const,
    is_admin: false,
  };
};

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

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      if (data) return data as Profile;

      if (error) {
        console.error("Unable to read profile", error);
      }

      const { error: insertError } = await supabase
        .from("profiles")
        .insert(buildProfilePayload(user));

      if (insertError) {
        console.error("Unable to create missing profile", insertError);
        return null;
      }

      const { data: createdProfile, error: createdProfileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      if (createdProfileError) {
        console.error("Unable to reload created profile", createdProfileError);
      }

      return (createdProfile as Profile | null) ?? null;
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
