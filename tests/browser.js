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
  await waitFor("typeof submitAddresses === 'function'");
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
  assert.deepEqual(exceptions, []);
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
