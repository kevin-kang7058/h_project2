// Chrome 테스트에서만 CDN 응답을 이 파일로 대체합니다. 실제 계정·메일은 만들지 않습니다.
window.supabase = {
  createClient(url, key, options) {
    const storageKey = "today-route-test-session";
    const listeners = [];
    const read = () => JSON.parse(localStorage.getItem(storageKey) || "null");
    const emit = (event, session) => listeners.forEach(listener => listener(event, session));
    const setSession = email => {
      const session = { user: { id: email, email }, access_token: "test-only", refresh_token: "test-only" };
      localStorage.setItem(storageKey, JSON.stringify(session));
      emit("SIGNED_IN", session);
      return session;
    };
    addEventListener("storage", event => {
      if (event.key === storageKey) emit(event.newValue ? "SIGNED_IN" : "SIGNED_OUT", read());
    });
    return {
      supabaseUrl: url, supabaseKey: key,
      auth: {
        persistSession: options.auth.persistSession,
        async getSession() { return { data: { session: read() }, error: null }; },
        onAuthStateChange(callback) {
          listeners.push(callback);
          queueMicrotask(() => callback("INITIAL_SESSION", read()));
          return { data: { subscription: { unsubscribe() {} } } };
        },
        async signInWithPassword({ email, password }) {
          if (email === "pending@example.com") return { data: {}, error: { code: "email_not_confirmed" } };
          if (password !== "Correct#123") return { data: {}, error: { code: "invalid_credentials" } };
          return { data: { session: setSession(email) }, error: null };
        },
        async signUp(parameters) {
          window.lastSignUp = parameters;
          if (parameters.email === "existing@example.com") return { data: {}, error: { code: "user_already_exists" } };
          if (parameters.email === "auto@example.com") return { data: { session: setSession(parameters.email) }, error: null };
          return { data: { session: null, user: { id: "confirmation-required" } }, error: null };
        },
        async signOut() {
          if (localStorage.getItem("today-route-test-signout-error")) return { error: { message: "Network fetch failed" } };
          localStorage.removeItem(storageKey);
          emit("SIGNED_OUT", null);
          return { error: null };
        }
      }
    };
  }
};
