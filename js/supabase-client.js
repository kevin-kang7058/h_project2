// CDN 라이브러리는 window.supabase, 앱에서 사용할 클라이언트는 window.supabaseClient입니다.
// 연결 객체만 준비합니다. 인증 동작은 auth.js, auth-form.js에서 처리합니다.
(() => {
  const projectUrl = "https://lxiagmxndvvyiznfdeix.supabase.co";
  const publishableKey = "sb_publishable_4A1VYKCR6kXQF6C7TH3Qbw_kK59yHHH";

  if (window.supabaseClient) return;
  window.supabaseClient = null;

  if (typeof window.supabase?.createClient !== "function") {
    console.warn("Supabase CDN을 불러오지 못했습니다. 인증 화면에서 연결 상태를 확인해 주세요.");
    return;
  }

  try {
    window.supabaseClient = window.supabase.createClient(projectUrl, publishableKey, {
      auth: {
        // 새로고침 이후 세션 유지와 인증 메일 링크 처리를 활성화합니다.
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
  } catch {
    console.warn("Supabase 클라이언트를 초기화하지 못했습니다. CDN 연결과 프로젝트 설정을 확인해 주세요.");
  }
})();
