// 모든 화면의 세션 확인, 로그인 상태 변경, 로그아웃을 담당합니다.
let finishAuthCheck;
window.authReady = new Promise(resolve => { finishAuthCheck = resolve; });
let authSubscription;
let authRevision = 0;
let displayedUserId = null;
let signingOut = false;

function authErrorMessage(error) {
  const code = error?.code || "";
  const messages = {
    invalid_credentials: "이메일 또는 비밀번호가 올바르지 않아요.",
    email_not_confirmed: "이메일 인증이 아직 완료되지 않았어요. 받은 메일의 인증 링크를 눌러 주세요.",
    user_already_exists: "이미 가입된 이메일이에요. 로그인 화면에서 로그인해 주세요.",
    email_exists: "이미 사용 중인 이메일이에요. 다른 이메일을 사용하거나 로그인해 주세요.",
    signup_disabled: "현재 회원가입을 받지 않고 있어요. 잠시 후 다시 확인해 주세요.",
    email_provider_disabled: "이메일 로그인이 아직 활성화되지 않았어요. 서비스 설정을 확인해 주세요.",
    weak_password: "비밀번호가 보안 기준에 맞지 않아요. 길이를 늘리고 영문·숫자·특수문자를 함께 사용해 주세요.",
    validation_failed: "이메일과 비밀번호 입력 내용을 확인해 주세요.",
    email_address_invalid: "올바른 이메일 주소를 입력해 주세요.",
    email_address_not_authorized: "현재 메일 발송 설정으로는 이 이메일에 인증 메일을 보낼 수 없어요. 서비스 운영자의 메일 설정이 필요해요.",
    over_email_send_rate_limit: "인증 메일을 너무 자주 요청했어요. 잠시 기다린 뒤 다시 시도해 주세요.",
    over_request_rate_limit: "요청이 많아요. 잠시 기다린 뒤 다시 시도해 주세요.",
    otp_expired: "인증 링크가 만료됐거나 이미 사용됐어요. 이메일 인증 상태를 확인한 뒤 로그인해 주세요.",
    session_not_found: "로그인이 만료됐어요. 다시 로그인해 주세요.",
    refresh_token_not_found: "로그인이 만료됐어요. 다시 로그인해 주세요.",
    user_banned: "이 계정은 현재 사용할 수 없어요. 서비스 운영자에게 문의해 주세요."
  };
  if (messages[code]) return messages[code];
  if (error?.status === 429) return messages.over_request_rate_limit;
  if (/fetch|network|timeout/i.test(error?.message || "")) return "인터넷 연결을 확인한 뒤 다시 시도해 주세요.";
  if (/invalid login credentials/i.test(error?.message || "")) return messages.invalid_credentials;
  if (/email not confirmed/i.test(error?.message || "")) return messages.email_not_confirmed;
  return "인증 요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.";
}

function clearVisitData() {
  try { sessionStorage.removeItem("today-route-trip"); sessionStorage.removeItem("today-route-user"); } catch {}
  if (window.name.startsWith("today-route-trip:")) window.name = "";
}

function showAuthProblem(message) {
  document.body.dataset.authState = "checking";
  document.querySelectorAll("dialog[open]").forEach(dialog => dialog.close());
  document.querySelector("#auth-status").hidden = false;
  document.querySelector("#auth-status-message").textContent = message;
  document.querySelector("#auth-retry").hidden = false;
}

function applyAuthSession(session, event = "") {
  const user = session?.user;
  const authPage = document.body.dataset.authPage;
  const previousUser = displayedUserId;
  displayedUserId = user?.id || null;
  if (!user) {
    if (event === "SIGNED_OUT" || previousUser) clearVisitData();
    document.querySelectorAll("[data-sign-out], [data-user-email]").forEach(element => { element.hidden = true; });
    if (!authPage) {
      document.body.dataset.authState = "checking";
      document.querySelectorAll("dialog[open]").forEach(dialog => dialog.close());
      window.location.replace("login.html");
    } else {
      document.body.dataset.authState = "anonymous";
      document.querySelector("#auth-status").hidden = true;
    }
  } else {
    try {
      const storedUser = sessionStorage.getItem("today-route-user");
      if (storedUser && storedUser !== user.id) clearVisitData();
      sessionStorage.setItem("today-route-user", user.id);
    } catch {}
    document.querySelectorAll("[data-user-email]").forEach(element => { element.textContent = user.email || "로그인됨"; element.hidden = false; });
    document.querySelectorAll("[data-sign-out]").forEach(element => { element.hidden = false; });
    if (authPage || (previousUser && previousUser !== user.id)) window.location.replace("index.html");
    else {
      document.body.dataset.authState = "authenticated";
      document.querySelector("#auth-status").hidden = true;
    }
  }
  finishAuthCheck(session);
}

async function checkAuthSession() {
  const revision = authRevision;
  try {
    const { data, error } = await window.supabaseClient.auth.getSession();
    if (revision !== authRevision) return;
    if (error) throw error;
    applyAuthSession(data.session);
  } catch (error) {
    if (revision === authRevision) showAuthProblem(authErrorMessage(error));
  }
}

async function signOutUser() {
  if (signingOut) return;
  signingOut = true;
  const buttons = document.querySelectorAll("[data-sign-out]");
  buttons.forEach(button => { button.disabled = true; });
  const message = document.querySelector("#account-error");
  message.textContent = "";
  try {
    const { error } = await window.supabaseClient.auth.signOut({ scope: "local" });
    if (error) throw error;
    clearVisitData();
    applyAuthSession(null, "SIGNED_OUT");
  } catch (error) { message.textContent = authErrorMessage(error); }
  finally { signingOut = false; buttons.forEach(button => { button.disabled = false; }); }
}

function initializeAuth() {
  if (location.protocol === "file:") {
    showAuthProblem("로그인은 웹 주소에서 사용할 수 있어요. start.bat 실행 후 http://localhost:8080으로 접속해 주세요.");
    return;
  }
  if (!window.supabaseClient) {
    showAuthProblem("인증 서비스를 불러오지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.");
    return;
  }
  // 콜백 안에서 다른 Supabase 비동기 메서드를 호출하지 않습니다.
  authSubscription = window.supabaseClient.auth.onAuthStateChange((event, session) => {
    authRevision++;
    applyAuthSession(session, event);
  }).data.subscription;
  checkAuthSession();
}

document.querySelector("#auth-retry").addEventListener("click", () => window.location.reload());
document.querySelectorAll("[data-sign-out]").forEach(button => button.addEventListener("click", signOutUser));
window.addEventListener("pageshow", event => {
  // 뒤로가기로 복원된 화면도 현재 세션을 다시 확인합니다.
  if (event.persisted && window.supabaseClient) {
    document.body.dataset.authState = "checking";
    checkAuthSession();
  }
});
initializeAuth();
