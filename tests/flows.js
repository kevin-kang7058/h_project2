// 실행: node tests/flows.js
// 외부 서비스는 모의 응답으로 검증합니다. 실제 Google 인증 검증은 키 설정 후 필요합니다.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "..");

class Element {
  constructor(tag = "div") { this.tagName = tag; this.children = []; this.attributes = {}; this.value = ""; this.textContent = ""; this.hidden = true; this.events = {}; }
  append(...items) { this.children.push(...items); }
  prepend(...items) { this.children.unshift(...items); }
  replaceChildren(...items) { this.children = items; }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  addEventListener(name, handler) { this.events[name] = handler; }
  querySelectorAll() { return []; }
  focus() { this.focused = true; }
  showModal() { this.open = true; }
  close() { this.open = false; }
}

function environment(storage = new Map(), protocol = "http:", windowName = "") {
  const elements = new Map();
  const document = { querySelector(selector) { if (!elements.has(selector)) elements.set(selector, new Element()); return elements.get(selector); }, createElement: tag => new Element(tag), createElementNS: (_, tag) => new Element(tag), head: new Element("head") };
  const context = vm.createContext({ document, location: { protocol, href: "" }, name: windowName, isSecureContext: true, navigator: {}, addEventListener() {}, URL, URLSearchParams, setTimeout, clearTimeout, sessionStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) } });
  context.window = context;
  const run = source => vm.runInContext(source, context);
  const load = file => run(fs.readFileSync(path.join(root, file), "utf8"));
  ["js/mock-data.js", "js/common.js", "js/config.js", "js/google-maps.js", "js/overview.js"].forEach(load);
  return { context, elements, document, run, load, storage };
}

function mockGoogle(env, responses) {
  const markers = [];
  let calls = 0;
  class GoogleMap { fitBounds() {} }
  class Marker extends Element { constructor(options) { super(); this.options = options; markers.push(this); } }
  env.context.google = { maps: {
    Geocoder: class { geocode({ address }, callback) { calls++; const response = responses[address]; callback(response?.results || [], response?.status || "ZERO_RESULTS"); } },
    importLibrary: async name => name === "maps" ? { Map: GoogleMap } : { AdvancedMarkerElement: Marker },
    LatLngBounds: class { extend() {} }
  } };
  env.document.head.append = () => queueMicrotask(() => env.context.initGoogleMaps());
  env.run("appConfig.googleMapsApiKey = 'test-key'");
  return { markers, count: () => calls };
}

function result(address, lat, lng, extra = {}) {
  return { formatted_address: address, place_id: address + "-id", geometry: { location: { lat: () => lat, lng: () => lng }, location_type: "ROOFTOP" }, ...extra };
}

let count = 0;
async function check(name, test) { await test(); console.log("PASS " + name); count++; }
async function main() {
  const input = environment(); input.load("js/main.js");
  await check("blank lines excluded", () => assert.equal(input.run("parseAddresses(' a \\n  \\n b  c ').join('|')"), "a|b c"));
  await check("empty submission blocked", async () => { await input.run("submitAddresses({preventDefault(){}})"); assert.equal(input.context.location.href, ""); assert.ok(input.document.querySelector("#start-error").textContent); });
  await check("arbitrary real addresses accepted without key", async () => { input.run("startInput.value='서울특별시 중구 세종대로 110'; customersInput.value='서울특별시 종로구 사직로 161\\n서울특별시 용산구 남산공원길 105'"); await input.run("submitAddresses({preventDefault(){}})"); assert.equal(input.context.location.href, "route.html"); assert.equal(input.run("readTrip().mode"), "address"); });
  const route = environment(input.storage); await route.load("js/route.js");
  await check("keyless list preserves input order and unknown distances", () => { assert.equal(route.run("buildRoute(readTrip()).stops[0].address"), "서울특별시 종로구 사직로 161"); assert.equal(route.run("buildRoute(readTrip()).stops[0].distance"), undefined); });
  await check("real directions link carries origin and destination", () => { const link = route.document.querySelector("#visit-list").children[0].children[2].children[0]; const url = new URL(link.href); assert.equal(url.hostname, "www.google.com"); assert.equal(url.searchParams.get("origin"), "서울특별시 중구 세종대로 110"); assert.equal(url.searchParams.get("destination"), "서울특별시 종로구 사직로 161"); assert.equal(url.searchParams.get("api"), "1"); });
  await check("fresh current-location link does not pin old origin", () => { const link = route.document.querySelector("#visit-list").children[0].children[2].children[1]; const url = new URL(link.href); assert.equal(url.searchParams.has("origin"), false); assert.equal(url.searchParams.get("dir_action"), "navigate"); });
  await check("keyless mode has honest map state", () => { assert.equal(route.document.querySelector("#map-unavailable").hidden, false); assert.match(route.document.querySelector("#visit-subtitle").textContent, /입력한 순서/); });
  await check("search without key has working external link", async () => { input.run("openAddressSearch('customer'); document.querySelector('#search-query').value='서울 시청 & 광장'; updateSearchLink()"); await input.run("submitSearch({preventDefault(){}})"); assert.equal(new URL(input.document.querySelector("#external-search").href).searchParams.get("query"), "서울 시청 & 광장"); });
  await check("return restores addresses", () => { const restored = environment(input.storage); restored.load("js/main.js"); assert.equal(restored.run("parseAddresses(customersInput.value).length"), 2); });
  await check("sample flow still works", async () => { input.run("fillSample()"); await input.run("submitAddresses({preventDefault(){}})"); assert.equal(input.run("readTrip().mode"), "demo"); });
  const demo = environment(input.storage); await demo.load("js/route.js");
  await check("sample sorting uses fixed origin", () => assert.equal(demo.run("JSON.stringify(buildRoute(readTrip()).stops.map(stop=>stop.id))"), "[3,2,1,5,4]"));
  await check("sample map and list numbering match", () => { const rows = demo.document.querySelector("#visit-list").children; const markers = demo.document.querySelector("#map-markers").children; assert.equal(markers.length, rows.length + 1); rows.forEach((row, index) => assert.equal(String(row.children[0].textContent), String(markers[index + 1].children[2].textContent))); });
  await check("fake sample destinations do not open real directions", () => { const button = demo.document.querySelector("#visit-list").children[0].children[2].children[0]; assert.equal(button.tagName, "button"); button.events.click(); assert.ok(demo.document.querySelector("#navigation-dialog").open); });
  await check("mixed sample and live addresses blocked", async () => { input.context.location.href = ""; input.run("startInput.value='서울 시청'"); await input.run("submitAddresses({preventDefault(){}})"); assert.equal(input.context.location.href, ""); assert.ok(input.document.querySelector("#form-error").textContent); });
  await check("coordinate range validation", () => { assert.equal(input.run("Boolean(isValidCoordinate({lat:91,lng:0}))"), false); assert.equal(input.run("isValidCoordinate({lat:0,lng:0})"), true); });
  await check("current location saved without API key", async () => { input.context.navigator.geolocation = { getCurrentPosition(success) { success({ coords: { latitude: 37.56, longitude: 126.97 } }); } }; await input.run("selectCurrentLocation()"); input.run("customersInput.value='서울특별시 중구 세종대로 110'"); await input.run("submitAddresses({preventDefault(){}})"); assert.equal(input.run("readTrip().startLocation.lat"), 37.56); });
  await check("manual edit clears stale GPS", () => { input.document.querySelector("#start-address").events.input(); assert.equal(input.run("currentLocation"), null); });
  await check("location denied keeps manual input usable", async () => { input.context.navigator.geolocation = { getCurrentPosition(_, failure) { failure({ code: 1 }); } }; await input.run("selectCurrentLocation()"); assert.match(input.document.querySelector("#start-error").textContent, /권한/); assert.equal(input.document.querySelector("#use-current-location").disabled, false); });
  await check("late GPS response cannot overwrite typed address", async () => { let finish; input.context.navigator.geolocation = { getCurrentPosition(success) { finish = success; } }; const pending = input.run("selectCurrentLocation()"); input.run("startInput.value='manual'; resetCurrentLocation()"); finish({ coords: { latitude: 1, longitude: 2 } }); await pending; assert.equal(input.run("startInput.value"), "manual"); });
  const live = environment(); const sdk = mockGoogle(live, { origin: { status: "OK", results: [result("origin", 37, 127)] }, far: { status: "OK", results: [result("far", 38, 127)] }, near: { status: "OK", results: [result("near", 37.01, 127)] }, ambiguous: { status: "OK", results: [result("one", 37, 127), result("two", 38, 127)] } }); live.load("js/main.js");
  await check("Google geocoding flow stores resolved coordinates", async () => { live.run("startInput.value='origin'; customersInput.value='far\\nnear\\nnear'"); await live.run("submitAddresses({preventDefault(){}})"); assert.equal(live.run("readTrip().mode"), "live"); assert.equal(sdk.count(), 3); });
  const liveRoute = environment(live.storage); const mapSdk = mockGoogle(liveRoute, {}); await liveRoute.load("js/route.js");
  await check("live route sorted by actual supplied coordinates", () => assert.equal(liveRoute.run("JSON.stringify(buildRoute(readTrip()).stops.map(stop=>stop.address))"), '["near","near","far"]'));
  await check("Google markers group duplicates with matching list numbers", () => { assert.equal(mapSdk.markers.length, 3); assert.equal(mapSdk.markers[1].children[0].textContent, "1 · 2"); });
  await check("Google directions uses coordinates and place IDs", () => { const url = new URL(liveRoute.document.querySelector("#visit-list").children[0].children[2].children[0].href); assert.equal(url.searchParams.get("destination"), "37.01,127"); assert.equal(url.searchParams.get("destination_place_id"), "near-id"); });
  await check("ambiguous geocoding blocked until selection", async () => await assert.rejects(live.run("geocodeAddress('ambiguous')"), /정확한 위치/));
  await check("address not found reports visible error", async () => { live.context.location.href = ""; live.run("customersInput.value='missing'"); await live.run("submitAddresses({preventDefault(){}})"); assert.equal(live.context.location.href, ""); assert.match(live.document.querySelector("#customer-error").textContent, /찾을 수 없/); });
  await check("search result selection appends customer address", () => { live.run("searchTarget='customer'; customersInput.value='near'; selectSearchResult({address:'selected',lat:37,lng:127})"); assert.equal(live.run("customersInput.value"), "near\nselected"); });
  await check("no trip shows empty state", async () => { const empty = environment(); await empty.load("js/route.js"); assert.equal(empty.document.querySelector("#empty-state").hidden, false); });
  await check("corrupt session handled", () => { const corrupt = environment(new Map([["today-route-trip", "broken"]])); assert.equal(corrupt.run("readTrip()"), null); });
  await check("malformed live coordinates rejected", () => assert.equal(live.run("isValidTrip({mode:'live',start:'x',addresses:['y'],startLocation:{address:'x',lat:37,lng:127},locations:[{address:'y',lat:200,lng:127}]})"), false));
  await check("file-open fallback preserves trip across pages", async () => { const file = environment(new Map(), "file:"); file.run("sessionStorage.setItem=()=>{throw Error('blocked')}"); file.load("js/main.js"); file.run("startInput.value='origin';customersInput.value='target'"); await file.run("submitAddresses({preventDefault(){}})"); const next = environment(new Map(), "file:", file.context.name); await next.load("js/route.js"); assert.equal(next.document.querySelector("#visit-list").children.length, 1); });
  await check("all HTML asset references exist and IDs are unique", () => { for (const file of ["index.html", "route.html"]) { const html = fs.readFileSync(path.join(root, file), "utf8"); const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]); assert.equal(ids.length, new Set(ids).size); for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) if (!match[1].startsWith("#") && !/^https?:/.test(match[1])) assert.ok(fs.existsSync(path.join(root, match[1].split(/[?#]/)[0])), match[1]); } });
  await check("append missing addresses keeps existing input and ignores blank lines", () => {
    input.run("customersInput.value='existing'; document.querySelector('#additional-addresses').value=' new one \\n\\n new two '; appendAdditionalAddresses({preventDefault(){}})");
    assert.equal(input.run("customersInput.value"), "existing\nnew one\nnew two");
    assert.match(input.document.querySelector("#address-count").textContent, /^3/);
  });
  await check("empty additional address does not change input", () => {
    input.run("document.querySelector('#additional-addresses').value='  '; appendAdditionalAddresses({preventDefault(){}})");
    assert.equal(input.run("parseAddresses(customersInput.value).length"), 3);
    assert.ok(input.document.querySelector("#additional-addresses-error").textContent);
  });
  await check("overview includes every submitted address in order", () => {
    const url = new URL(input.run("createOverviewUrl({address:'origin'}, [{address:'one'},{address:'two'},{address:'three'}],false)"));
    assert.equal(url.searchParams.get("origin"), "origin");
    assert.equal(url.searchParams.get("waypoints"), "one|two");
    assert.equal(url.searchParams.get("destination"), "three");
  });
  await check("overview rejects unsupported counts instead of dropping addresses", () => {
    assert.throws(() => input.run("createOverviewUrl({address:'origin'}, Array.from({length:11},()=>({address:'stop'})),false)"));
    assert.throws(() => input.run("createOverviewUrl({address:'origin'}, Array.from({length:5},()=>({address:'stop'})),true)"));
    assert.throws(() => input.run("createOverviewUrl({address:'origin'}, [{address:'x'.repeat(2100)}],false)"));
  });
  await check("overview input button saves trip then navigates", async () => {
    input.run("startInput.value='origin';customersInput.value='one\\ntwo'");
    await input.run("submitAddresses({preventDefault(){}},true)");
    assert.equal(input.context.location.href, "route.html?view=all");
  });
  await check("numbered Google markers use list order and accessible labels", async () => {
    const numbered = environment();
    const google = mockGoogle(numbered, {});
    await numbered.run("renderGoogleMap({address:'origin',lat:37,lng:127},[{address:'stop',lat:38,lng:127,order:7}])");
    assert.equal(google.markers[1].children[0].textContent, "7");
    assert.match(google.markers[1].options.title, /7번 방문/);
    assert.match(google.markers[1].children[0].attributes['aria-label'], /7번 방문/);
  });
  console.log(`${count} checks passed. Google SDK responses were mocked; live credentials were not tested.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
