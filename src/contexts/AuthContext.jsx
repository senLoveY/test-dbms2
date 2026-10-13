import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { clearOfflineQuizzes } from "../lib/pwa.js";
import { clearQuizCache } from "../lib/quizStore.js";
import { isSupabaseConfigured, supabase } from "../lib/supabase.js";

/** Whatever this device kept about the signed-out account. */
function forgetLocalData() {
  clearQuizCache();
  clearOfflineQuizzes();
  try {
    sessionStorage.clear();
  } catch {
    // storage may be unavailable (private mode); nothing to clear then
  }
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return undefined;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    // also fires when the session expires or is revoked, not only on "Выйти"
    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === "SIGNED_OUT") forgetLocalData();
      setSession(nextSession);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const userId = session?.user?.id;

  const loadProfile = useCallback(async () => {
    if (!supabase || !userId) {
      setProfile(null);
      return;
    }

    const { data } = await supabase.from("profiles").select("id, username").eq("id", userId).maybeSingle();
    setProfile(data);
  }, [userId]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const value = useMemo(
    () => ({
      session,
      profile,
      user: session?.user ?? null,
      loading,
      isConfigured: isSupabaseConfigured,
      refreshProfile: loadProfile,
      async signUp(email, password, username) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { username } },
        });
        if (error) throw error;
        return data;
      },
      async signIn(email, password) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        return data;
      },
      async signOut() {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
      },
      /** After the account is deleted on the server: drop the session on this device only. */
      async forgetSession() {
        await supabase.auth.signOut({ scope: "local" }).catch(() => {});
        forgetLocalData();
      },
    }),
    [session, profile, loading, loadProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
