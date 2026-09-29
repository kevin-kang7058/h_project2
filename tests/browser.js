// 실제 Chrome에서 입력 → 방문 목록 → 돌아가기와 현위치를 확인합니다.
// 실행: node tests/browser.js (Chrome 및 Node.js 필요, 외부 패키지 불필요)
const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "..");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let server, browser, socket, profile;

async function run() {
  const liveAuthCheck = process.argv.includes("--live-auth-check");
  const authFixture = (await fs.readFile(path.join(root, "tests/auth-sdk.js"))).toString("base64");
  server = spawn(process.execPath, ["tools/server.js"], { cwd: root, windowsHide: true });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Local server startup timed out")), 6000);
    server.stdout.once("data", () => { clearTimeout(timer); resolve(); });
    server.once("error", error => { clearTimeout(timer); reject(error); });
    server.once("exit", code => { clearTimeout(timer); reject(new Error(`Local server exited: ${code}`)); });
  });
  console.log("Local server ready");
  for (const file of ["/", "/route.html", "/js/google-maps.js", "/css/style.css", "/assets/logo.svg"]) {
    assert.equal((await fetch(`http://127.0.0.1:8080${file}`, { signal: AbortSignal.timeout(4000) })).status, 200);
  }
  profile = await fs.mkdtemp(path.join(os.tmpdir(), "today-route-browser-"));
  browser = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { windowsHide: true });
  const endpoint = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Chrome startup timed out")), 15000);
    browser.stderr.on("data", data => { const match = data.toString().match(/DevTools listening on (ws:\/\/\S+)/); if (match) { clearTimeout(timer); resolve(match[1]); } });
    browser.once("error", error => { clearTimeout(timer); reject(error); });
    browser.once("exit", code => { clearTimeout(timer); reject(new Error(`Chrome exited: ${code}`)); });
  });
  socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let nextId = 0;
  const pending = new Map();
  const exceptions = [];
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.method === "Fetch.requestPaused") {
      send("Fetch.fulfillRequest", { requestId: message.params.requestId, responseCode: 200, responseHeaders: [{ name: "Content-Type", value: "application/javascript" }], body: authFixture }, message.sessionId).catch(error => exceptions.push(error.message));
    }
    if (message.method === "Runtime.exceptionThrown") exceptions.push(message.params.exceptionDetails.text);
    if (pending.has(message.id)) { const { resolve, reject, timer } = pending.get(message.id); clearTimeout(timer); pending.delete(message.id); message.error ? reject(new Error(message.error.message)) : resolve(message.result); }
  };
  function send(method, params = {}, sessionId) {
    return new Promise((resolve, reject) => { const id = ++nextId; const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Browser command timed out: ${method}`)); }, 8000); pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params, sessionId })); });
  }
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const page = (method, params) => send(method, params, sessionId);
  await page("Page.enable"); await page("Runtime.enable");
  if (!liveAuthCheck) await page("Fetch.enable", { patterns: [{ urlPattern: "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2*", requestStage: "Request" }] });
  async function evaluate(expression) {
    const result = await page("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  }
  async function waitFor(expression) {
    for (let attempt = 0; attempt < 100; attempt++) { if (await evaluate(expression)) return; await delay(50); }
    throw new Error("Condition timed out: " + expression);
  }
  await page("Page.navigate", { url: "http://localhost:8080" });
  await waitFor("location.pathname === '/login.html' && document.body.dataset.authState === 'anonymous'");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('main')).display !== 'none'"), true);
  if (liveAuthCheck) {
    assert.equal(await evaluate("window.supabase !== window.supabaseClient && window.supabaseClient.auth.persistSession"), true);
    const settings = await evaluate("fetch(window.supabaseClient.supabaseUrl + '/auth/v1/settings', {headers:{apikey:window.supabaseClient.supabaseKey},signal:AbortSignal.timeout(5000)}).then(async response=>({status:response.status,settings:await response.json()}))");
    console.log('Live Supabase settings:', JSON.stringify({status:settings.status,emailEnabled:settings.settings.external?.email,signupDisabled:settings.settings.disable_signup,emailAutoConfirm:settings.settings.mailer_autoconfirm}));
    assert.equal(settings.status, 200);
    assert.deepEqual(exceptions, []);
    console.log('PASS real CDN and Supabase client: anonymous session redirects to login, login form visible. No accounts created or emails sent.');
    await send("Browser.close");
    return;
  }
  await page("Page.navigate", { url: "http://localhost:8080/login.html#error=access_denied&error_code=otp_expired" });
  await waitFor("document.body.dataset.authState === 'anonymous' && document.querySelector('#auth-error').textContent.includes('만료')");
  assert.equal(await evaluate("location.hash"), "");
  await evaluate("document.querySelector('#auth-submit').click()");
  assert.match(await evaluate("document.querySelector('#auth-error').textContent"), /이메일/);
  await evaluate("document.querySelector('#auth-email').value='test@example.com'; document.querySelector('#auth-password').value='wrong'; document.querySelector('#auth-submit').click()");
  await waitFor("document.querySelector('#auth-error').textContent.includes('올바르지')");
  await evaluate("document.querySelector('.auth-switch a').click()");
  await waitFor("location.pathname === '/signup.html' && document.body.dataset.authState === 'anonymous'");
  await evaluate("document.querySelector('#auth-email').value='new@example.com';document.querySelector('#auth-password').value='123';document.querySelector('#auth-submit').click()");
  assert.match(await evaluate("document.querySelector('#auth-error').textContent"), /6자/);
  await evaluate("document.querySelector('#auth-password').value='Correct#123';document.querySelector('#auth-submit').click()");
  await waitFor("document.querySelector('#auth-feedback').textContent.includes('인증 메일')");
  assert.equal(await evaluate("window.lastSignUp.options.emailRedirectTo"), "http://localhost:8080/login.html");
  assert.equal(await evaluate("document.querySelector('#auth-password').value"), "");
  await evaluate("document.querySelector('.auth-switch a').click()");
  await waitFor("location.pathname === '/login.html' && document.body.dataset.authState === 'anonymous'");
  await evaluate("document.querySelector('#auth-email').value='pending@example.com';document.querySelector('#auth-password').value='Correct#123';document.querySelector('#auth-submit').click()");
  await waitFor("document.querySelector('#auth-error').textContent.includes('인증이 아직')");
  await evaluate("document.querySelector('#auth-email').value='test@example.com';document.querySelector('#auth-submit').click()");
  await waitFor("location.pathname === '/index.html' && document.body.dataset.authState === 'authenticated' && document.querySelector('#sample-address-list').children.length === 6");
  assert.equal(await evaluate("document.querySelector('[data-sign-out]').hidden"), false);
  assert.equal(await evaluate("document.querySelector('[data-user-email]').textContent"), "test@example.com");
  await evaluate("document.querySelector('#submit-addresses').click()");
  assert.ok(await evaluate("document.querySelector('#start-error').textContent.length > 0"));
  await evaluate("document.querySelector('#start-address').value='서울특별시 중구 세종대로 110'; document.querySelector('#customer-addresses').value='서울특별시 종로구 사직로 161\\n\\n서울특별시 용산구 남산공원길 105'; document.querySelector('#customer-addresses').dispatchEvent(new Event('input'))");
  assert.equal(await evaluate("document.querySelector('#address-count').textContent"), "2개 입력됨");
  await evaluate("document.querySelector('#submit-addresses').click()");
  await waitFor("location.pathname === '/route.html' && document.querySelectorAll('#visit-list li').length === 2");
  assert.equal(await evaluate("document.querySelector('#map-unavailable').hidden"), false);
  assert.match(await evaluate("document.querySelector('.navigate-button').href"), /^https:\/\/www.google.com\/maps\/dir/);
  assert.equal(await evaluate("new URL(document.querySelector('.current-directions').href).searchParams.has('origin')"), false);
  await page("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  assert.equal(await evaluate("document.documentElement.scrollWidth <= window.innerWidth"), true);
  await evaluate("document.querySelector('.route-intro > a').click()");
  await waitFor("location.pathname === '/index.html' && typeof submitAddresses === 'function'");
  assert.equal(await evaluate("document.querySelector('#customer-addresses').value.split('\\n').length"), 2);
  await evaluate("document.querySelector('#search-customer').click()");
  assert.equal(await evaluate("document.querySelector('#address-search-dialog').open"), true);
  await evaluate("document.querySelector('#search-query').value='서울 시청'; document.querySelector('#search-query').dispatchEvent(new Event('input')); document.querySelector('#search-form').requestSubmit()");
  assert.equal(await evaluate("document.querySelector('#external-search').hidden"), false);
  await evaluate("document.querySelector('#address-search-dialog').close()");
  await send("Browser.grantPermissions", { permissions: ["geolocation"], origin: "http://localhost:8080" });
  await page("Emulation.setGeolocationOverride", { latitude: 37.5665, longitude: 126.978, accuracy: 10 });
  await evaluate("document.querySelector('#use-current-location').click()");
  await waitFor("document.querySelector('#start-address').value === '현재 위치'");
  await evaluate("document.querySelector('#submit-addresses').click()");
  await waitFor("location.pathname === '/route.html' && document.querySelectorAll('#visit-list li').length === 2");
  assert.equal(await evaluate("new URL(document.querySelector('.navigate-button').href).searchParams.get('origin')"), "37.5665,126.978");
  await evaluate("document.querySelector('.route-intro > a').click()");
  await waitFor("location.pathname === '/index.html' && typeof fillSample === 'function'");
  await evaluate("document.querySelector('#fill-sample').click(); document.querySelector('#submit-addresses').click()");
  await waitFor("location.pathname === '/route.html' && document.querySelectorAll('#visit-list li').length === 5");
  assert.equal(await evaluate("document.querySelector('#mock-map').hidden"), false);
  assert.equal(await evaluate("document.querySelectorAll('#map-markers > g').length"), 6);
  assert.equal(await evaluate("document.documentElement.scrollWidth <= window.innerWidth"), true);
  await evaluate("document.querySelector('#view-all-addresses').click()");
  assert.equal(await evaluate("document.querySelector('#overview-dialog').open"), true);
  assert.equal(await evaluate("document.querySelectorAll('#overview-map .map-stop').length"), 5);
  assert.equal(await evaluate("document.querySelectorAll('#overview-addresses li').length"), 5);
  assert.equal(await evaluate("new Set([...document.querySelectorAll('[id]')].map(el=>el.id)).size === document.querySelectorAll('[id]').length"), true);
  await evaluate("document.querySelector('#overview-dialog').close(); document.querySelector('.route-actions a').click()");
  await waitFor("location.pathname === '/index.html' && document.querySelector('#add-addresses-dialog')?.open");
  await evaluate("document.querySelector('#add-addresses-form').requestSubmit()");
  assert.ok(await evaluate("document.querySelector('#additional-addresses-error').textContent.length > 0"));
  await evaluate("document.querySelector('#additional-addresses').value='제주특별자치도 제주시 예시주소 1'; document.querySelector('#add-addresses-form').requestSubmit()");
  assert.equal(await evaluate("document.querySelector('#customer-addresses').value.split('\\n').length"), 6);
  await evaluate("document.querySelector('#view-all-input').click()");
  await waitFor("location.pathname === '/route.html' && document.querySelector('#overview-dialog')?.open");
  assert.equal(await evaluate("document.querySelectorAll('#overview-addresses li').length"), 6);
  assert.equal(await evaluate("document.querySelectorAll('#overview-map .map-stop').length"), 6);
  assert.equal(await evaluate("document.documentElement.scrollWidth <= window.innerWidth"), true);
  await page("Page.reload");
  await waitFor("document.body.dataset.authState === 'authenticated' && document.querySelectorAll('#visit-list li').length === 6");
  await evaluate("document.querySelector('#overview-dialog').close(); localStorage.setItem('today-route-test-signout-error','1'); document.querySelector('[data-sign-out]').click()");
  await waitFor("document.querySelector('#account-error').textContent.includes('인터넷')");
  assert.equal(await evaluate("document.body.dataset.authState"), "authenticated");
  await evaluate("localStorage.removeItem('today-route-test-signout-error'); document.querySelector('[data-sign-out]').click()");
  await waitFor("location.pathname === '/login.html' && document.body.dataset.authState === 'anonymous'");
  assert.equal(await evaluate("sessionStorage.getItem('today-route-trip')"), null);
  await page("Page.navigate", { url: "http://localhost:8080/route.html" });
  await waitFor("location.pathname === '/login.html' && document.body.dataset.authState === 'anonymous'");
  await page("Page.navigate", { url: "http://localhost:8080/signup.html" });
  await waitFor("document.body.dataset.authPage === 'signup' && document.body.dataset.authState === 'anonymous'");
  await evaluate("document.querySelector('#auth-email').value='auto@example.com'; document.querySelector('#auth-password').value='Correct#123'; document.querySelector('#auth-submit').click()");
  await waitFor("location.pathname === '/index.html' && document.body.dataset.authState === 'authenticated'");
  // 다른 탭에서 변경된 세션을 storage 이벤트를 통해 자동 반영하는지 확인합니다.
  const second = await send("Target.createTarget", { url: "about:blank" });
  const attached = await send("Target.attachToTarget", { targetId: second.targetId, flatten: true });
  await send("Fetch.enable", { patterns: [{ urlPattern: "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2*", requestStage: "Request" }] }, attached.sessionId);
  await send("Page.navigate", { url: "http://localhost:8080/login.html" }, attached.sessionId);
  await delay(500);
  await send("Runtime.evaluate", { expression: "localStorage.removeItem('today-route-test-session')" }, attached.sessionId);
  await waitFor("location.pathname === '/login.html' && document.body.dataset.authState === 'anonymous'");
  await send("Target.closeTarget", { targetId: second.targetId });
  assert.deepEqual(exceptions, []);
  console.log('PASS mocked Supabase Auth: signup confirmation, auto signup session, validation/errors, login redirect, session restore, logout success/failure, protected routes, cross-tab logout.');
  console.log("PASS actual Chrome: static assets, input validation, typing/count, keyless directions, return/restore, address search dialog, current-location flow (emulated GPS), sample flow, mobile overflow, no uncaught JS errors.");
  console.log("Google authenticated APIs were not tested: no API key configured.");
  await send("Browser.close");
}

run().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (socket) socket.close();
  if (browser && browser.exitCode === null) browser.kill();
  if (server && server.exitCode === null) server.kill();
  if (profile) {
    // 삭제 대상이 이번 테스트가 만든 임시 폴더인지 절대 경로로 확인합니다.
    const resolved = path.resolve(profile);
    const relative = path.relative(path.resolve(os.tmpdir()), resolved);
    if (!relative.startsWith("..") && !path.isAbsolute(relative) && path.basename(resolved).startsWith("today-route-browser-")) {
      await fs.rm(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }).catch(() => {});
    }
  }
});
