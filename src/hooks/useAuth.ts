import { useCallback, useEffect, useState } from "react";
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

const NO_PROFILE_FOUND_CODES = new Set(["PGRST116", "406"]);

interface AuthState {
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  isAdmin: boolean;
}

type DiscordIdentity = Record<string, unknown> & {
  provider?: string;
  identity_data?: Record<string, unknown>;
};

const normalizeIdentity = (identity: unknown): DiscordIdentity => identity as DiscordIdentity;

const digitsOnly = (value: unknown) => String(value ?? "").replace(/\D/g, "");

const buildProfilePayload = (user: User, identities: DiscordIdentity[] = []) => {
  const metadata = user.user_metadata ?? {};
  const discordIdentity = identities.find((identity) => identity.provider === "discord");
  const discordIdentityRecord = (discordIdentity ?? {}) as Record<string, unknown>;
  const discordIdentityData = (discordIdentityRecord.identity_data ?? {}) as Record<string, unknown>;
  const discordIdFromIdentity = digitsOnly(
    discordIdentityRecord.provider_id ??
    discordIdentityRecord.id ??
    discordIdentityData.provider_id ??
    discordIdentityData.sub ??
    discordIdentityData.id,
  );
  const discordIdFromMetadata = digitsOnly(
    metadata.provider_id ?? metadata.sub ?? metadata.preferred_username ?? null,
  );
  const discordDisplayName =
    (typeof discordIdentityData.global_name === "string" && discordIdentityData.global_name) ||
    (typeof discordIdentityData.full_name === "string" && discordIdentityData.full_name) ||
    (typeof discordIdentityData.name === "string" && discordIdentityData.name) ||
    null;

  return {
    id: user.id,
    discord_id: discordIdFromIdentity || discordIdFromMetadata || null,
    display_name:
      discordDisplayName ??
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

const getUserDiscordIdentities = async (user: User): Promise<DiscordIdentity[]> => {
  const embeddedIdentities = (((user as User & { identities?: unknown[] }).identities ?? []).map(normalizeIdentity));
  if (embeddedIdentities.length > 0) return embeddedIdentities;

  try {
    const authApi = supabase.auth as typeof supabase.auth & {
      getUserIdentities?: () => Promise<{ data?: { identities?: DiscordIdentity[] }; error?: { message?: string } | null }>;
    };

    if (!authApi.getUserIdentities) return [];

    const { data, error } = await authApi.getUserIdentities();
    if (error) {
      console.error("Unable to read linked auth identities", error);
      return [];
    }

    return (data?.identities ?? []).map(normalizeIdentity);
  } catch (error) {
    console.error("Unable to read linked auth identities", error);
    return [];
  }
};

export const useAuth = (): AuthState & { signOut: () => Promise<void>; refreshProfile: () => Promise<void> } => {
  const [state, setState] = useState<AuthState>({
    loading: true,
    session: null,
    user: null,
    profile: null,
    isAdmin: false,
  });

  const loadProfile = useCallback(async (user: User | null) => {
    if (!user) return null;

    const identities = await getUserDiscordIdentities(user);
    const nextProfilePayload = buildProfilePayload(user, identities);

    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (data) {
      const profile = data as Profile;
      const needsSync =
        (nextProfilePayload.discord_id && nextProfilePayload.discord_id !== profile.discord_id) ||
        (nextProfilePayload.display_name && nextProfilePayload.display_name !== profile.display_name) ||
        (nextProfilePayload.avatar_url && nextProfilePayload.avatar_url !== profile.avatar_url);

      if (!needsSync) return profile;

      const { data: updatedProfile, error: updateError } = await supabase
        .from("profiles")
        .update({
          discord_id: nextProfilePayload.discord_id,
          display_name: nextProfilePayload.display_name,
          avatar_url: nextProfilePayload.avatar_url,
        })
        .eq("id", user.id)
        .select("*")
        .maybeSingle();

      if (updateError) {
        console.error("Unable to sync profile", updateError);
        return profile;
      }

      return (updatedProfile as Profile | null) ?? profile;
    }

    if (error) {
      console.error("Unable to read profile", error);
      const code = String(error.code ?? "");
      if (!NO_PROFILE_FOUND_CODES.has(code)) {
        return null;
      }
    }

    const { error: insertError } = await supabase
      .from("profiles")
      .insert(nextProfilePayload);

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
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!isSupabaseConfigured) return;

    const { data: { session } } = await supabase.auth.getSession();
    const profile = await loadProfile(session?.user ?? null);

    setState({
      loading: false,
      session,
      user: session?.user ?? null,
      profile,
      isAdmin: Boolean(profile?.is_admin),
    });
  }, [loadProfile]);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }

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
  }, [loadProfile]);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return { ...state, signOut, refreshProfile };
};
