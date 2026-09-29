// CDN 라이브러리는 window.supabase, 앱에서 사용할 클라이언트는 window.supabaseClient입니다.
// 이 파일에서는 연결 객체만 준비하며 로그인이나 DB 읽기·쓰기를 실행하지 않습니다.
(() => {
  const projectUrl = "https://lxiagmxndvvyiznfdeix.supabase.co";
  const publishableKey = "sb_publishable_4A1VYKCR6kXQF6C7TH3Qbw_kK59yHHH";

  if (window.supabaseClient) return;
  window.supabaseClient = null;

  if (typeof window.supabase?.createClient !== "function") {
    console.warn("Supabase CDN을 불러오지 못했습니다. 기존 주소 입력과 지도 기능은 계속 사용할 수 있습니다.");
    return;
  }

  try {
    window.supabaseClient = window.supabase.createClient(projectUrl, publishableKey, {
      auth: {
        // 로그인 도입 전에는 세션 저장, 토큰 자동 갱신, URL 인증 처리를 하지 않습니다.
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    });
  } catch {
    console.warn("Supabase 클라이언트를 초기화하지 못했습니다. CDN 연결과 프로젝트 설정을 확인해 주세요.");
  }
})();
