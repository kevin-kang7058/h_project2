const authForm = document.querySelector("#auth-form");
const emailInput = document.querySelector("#auth-email");
const passwordInput = document.querySelector("#auth-password");
const authSubmit = document.querySelector("#auth-submit");
const isSignUp = document.body.dataset.authPage === "signup";
let authSubmitting = false;

function setAuthFormBusy(busy) {
  authSubmitting = busy;
  authForm.setAttribute("aria-busy", String(busy));
  authForm.querySelectorAll("input, button").forEach(element => { element.disabled = busy; });
  authSubmit.textContent = busy ? "처리하고 있어요…" : isSignUp ? "회원가입하기" : "로그인하기";
}

async function submitAuthForm(event) {
  event.preventDefault();
  if (authSubmitting) return;
  const errorBox = document.querySelector("#auth-error");
  const feedback = document.querySelector("#auth-feedback");
  errorBox.textContent = "";
  feedback.textContent = "";
  const email = emailInput.value.trim();
  const password = passwordInput.value; // 비밀번호의 공백은 변경하지 않습니다.
  if (!email || emailInput.validity.typeMismatch) {
    errorBox.textContent = "올바른 이메일 주소를 입력해 주세요.";
    emailInput.focus();
    return;
  }
  if (!password || (isSignUp && password.length < 6)) {
    errorBox.textContent = isSignUp ? "비밀번호를 6자 이상 입력해 주세요." : "비밀번호를 입력해 주세요.";
    passwordInput.focus();
    return;
  }
  if (!window.supabaseClient) { errorBox.textContent = "인증 서비스에 연결하지 못했어요. 새로고침 후 다시 시도해 주세요."; return; }
  setAuthFormBusy(true);
  try {
    const result = isSignUp
      ? await window.supabaseClient.auth.signUp({ email, password, options: { emailRedirectTo: new URL("login.html", location.href).href } })
      : await window.supabaseClient.auth.signInWithPassword({ email, password });
    if (result.error) throw result.error;
    passwordInput.value = "";
    if (result.data.session) applyAuthSession(result.data.session, "SIGNED_IN");
    else if (isSignUp) feedback.textContent = "가입 가능한 이메일이라면 인증 메일이 발송됩니다. 받은 메일의 인증 링크를 누른 뒤 로그인해 주세요. 메일이 보이지 않으면 스팸함도 확인해 주세요.";
    else errorBox.textContent = "로그인을 완료하지 못했어요. 다시 시도해 주세요.";
  } catch (error) { errorBox.textContent = authErrorMessage(error); }
  finally { setAuthFormBusy(false); }
}

authForm.addEventListener("submit", submitAuthForm);

// 만료된 이메일 인증 링크로 돌아온 경우에도 이해하기 쉬운 안내를 보여줍니다.
function showCallbackError() {
  const callbackUrl = new URL(location.href);
  const callbackHash = new URLSearchParams(callbackUrl.hash.slice(1));
  const callbackError = callbackHash.get("error_code") || callbackUrl.searchParams.get("error_code");
  if (callbackError || callbackHash.has("error") || callbackUrl.searchParams.has("error")) {
    document.querySelector("#auth-error").textContent = authErrorMessage({ code: callbackError });
    ["error", "error_code", "error_description"].forEach(key => callbackUrl.searchParams.delete(key));
    if (callbackHash.has("error") || callbackHash.has("error_code")) callbackUrl.hash = "";
    history.replaceState(null, "", callbackUrl.href);
  }
}
showCallbackError();
window.addEventListener("hashchange", showCallbackError);
