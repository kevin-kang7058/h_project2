const addressForm = document.querySelector("#address-form");
const startInput = document.querySelector("#start-address");
const customersInput = document.querySelector("#customer-addresses");
const selectedLocations = new Map();
let currentLocation = null;
let locationRequest = 0;
let searchRequest = 0;
let searchTarget = "start";
let submitting = false;

function updateAddressCount() {
  document.querySelector("#address-count").textContent = `${parseAddresses(customersInput.value).length}개 입력됨`;
}

function setFieldError(input, message) {
  document.querySelector(input === startInput ? "#start-error" : "#customer-error").textContent = message;
  input.setAttribute("aria-invalid", String(Boolean(message)));
}

function setProgress(message) {
  document.querySelector("#form-status").textContent = message;
}

function resetCurrentLocation() {
  currentLocation = null;
  locationRequest++;
  document.querySelector("#current-location-status").textContent = "";
  document.querySelector("#use-current-location").disabled = false;
}

function renderSampleAddresses() {
  [mockStart, ...mockLocations].forEach(location => {
    const item = document.createElement("li");
    item.textContent = location.address;
    document.querySelector("#sample-address-list").append(item);
  });
}

function fillSample() {
  resetCurrentLocation();
  startInput.value = mockStart.address;
  customersInput.value = mockLocations.map(location => location.address).join("\n");
  setFieldError(startInput, "");
  setFieldError(customersInput, "");
  document.querySelector("#form-error").textContent = "";
  setProgress("샘플 주소를 채웠어요. 경로 확인하기를 눌러 체험해 보세요.");
  updateAddressCount();
}

async function selectCurrentLocation() {
  const request = ++locationRequest;
  document.querySelector("#use-current-location").disabled = true;
  setFieldError(startInput, "");
  document.querySelector("#current-location-status").textContent = "현재 위치를 확인하고 있어요. 위치 권한을 허용해 주세요.";
  try {
    const point = await getCurrentLocation();
    if (request !== locationRequest) return;
    currentLocation = point;
    startInput.value = point.address;
    document.querySelector("#current-location-status").textContent = `현재 위치 확인 완료 (${point.lat.toFixed(5)}, ${point.lng.toFixed(5)})`;
  } catch (error) {
    if (request !== locationRequest) return;
    document.querySelector("#current-location-status").textContent = "";
    setFieldError(startInput, error.message);
  } finally {
    if (request === locationRequest) document.querySelector("#use-current-location").disabled = false;
  }
}

function openAddressSearch(target) {
  searchTarget = target;
  searchRequest++;
  document.querySelector("#search-results").replaceChildren();
  document.querySelector("#search-query").value = target === "start" && !currentLocation ? startInput.value : "";
  document.querySelector("#search-status").textContent = getGoogleSetupMessage() || "도로명과 건물 번호를 입력한 뒤 검색해 주세요.";
  document.querySelector("#address-search-dialog").showModal();
  document.querySelector("#search-query").focus();
  updateSearchLink();
}

function updateSearchLink() {
  const query = document.querySelector("#search-query").value.trim();
  const link = document.querySelector("#external-search");
  link.hidden = !query;
  link.href = createGoogleSearchUrl(query);
}

function selectSearchResult(point) {
  selectedLocations.set(normalizeAddress(point.address), { ...point, address: normalizeAddress(point.address) });
  if (searchTarget === "start") {
    resetCurrentLocation();
    startInput.value = point.address;
    setFieldError(startInput, "");
  } else {
    customersInput.value = [...parseAddresses(customersInput.value), point.address].join("\n");
    updateAddressCount();
    setFieldError(customersInput, "");
  }
  document.querySelector("#address-search-dialog").close();
  (searchTarget === "start" ? startInput : customersInput).focus();
}

async function submitSearch(event) {
  event.preventDefault();
  const query = normalizeAddress(document.querySelector("#search-query").value);
  const status = document.querySelector("#search-status");
  const resultsList = document.querySelector("#search-results");
  const request = ++searchRequest;
  resultsList.replaceChildren();
  if (!query) { status.textContent = "검색할 주소를 입력해 주세요."; return; }
  if (getGoogleSetupMessage()) { status.textContent = "사이트 내 검색은 Google API 키 설정 후 사용할 수 있어요. 아래 Google 지도에서 검색하기를 눌러 주소를 확인하고 입력란에 붙여 넣어 주세요."; return; }
  status.textContent = "주소를 검색하고 있어요…";
  try {
    const results = await searchGoogleAddresses(query);
    if (request !== searchRequest) return;
    status.textContent = results.length ? "사용할 주소를 선택해 주세요." : "검색 결과가 없어요. 다른 주소를 입력해 주세요.";
    results.forEach(point => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "search-result-button";
      button.textContent = point.address + (point.partialMatch || point.locationType === "APPROXIMATE" ? " (대략적인 위치 · 주소 확인 필요)" : "");
      button.addEventListener("click", () => selectSearchResult(point));
      item.append(button);
      resultsList.append(item);
    });
  } catch (error) {
    if (request === searchRequest) status.textContent = error.message;
  }
}

function setSubmitting(busy) {
  submitting = busy;
  addressForm.setAttribute("aria-busy", String(busy));
  addressForm.querySelectorAll("input, textarea, button").forEach(element => { element.disabled = busy; });
  document.querySelector("#fill-sample").disabled = busy;
  document.querySelector("#submit-addresses").textContent = busy ? "주소를 확인하고 있어요…" : "경로 확인하기 →";
}

async function resolveLiveTrip(start, addresses) {
  let startLocation = currentLocation || selectedLocations.get(start);
  if (!startLocation) {
    setProgress("출발 주소를 확인하고 있어요…");
    try { startLocation = await geocodeAddress(start); }
    catch (error) { setFieldError(startInput, error.message); throw new Error("출발 주소를 확인해 주세요."); }
  }
  const locations = [];
  const cache = new Map(selectedLocations);
  for (const [index, address] of addresses.entries()) {
    setProgress(`고객 주소 확인 중 · ${index + 1} / ${addresses.length}`);
    try {
      if (!cache.has(address)) cache.set(address, await geocodeAddress(address));
      locations.push(cache.get(address));
    } catch (error) {
      setFieldError(customersInput, `${index + 1}번째 주소 (${address}): ${error.message}`);
      throw new Error("확인되지 않은 고객 주소가 있어요. 입력값을 수정한 뒤 다시 시도해 주세요.");
    }
  }
  return { mode: "live", start, addresses, startLocation, locations, usesCurrentLocation: Boolean(currentLocation) };
}

async function submitAddresses(event, overview = false) {
  event.preventDefault();
  if (submitting) return;
  const start = normalizeAddress(startInput.value);
  const addresses = parseAddresses(customersInput.value);
  setFieldError(startInput, start ? "" : "출발 위치를 입력하거나 현재 위치를 선택해 주세요.");
  setFieldError(customersInput, addresses.length ? "" : "고객 주소를 최소 1개 입력해 주세요.");
  document.querySelector("#form-error").textContent = "";
  setProgress("");
  if (!start || !addresses.length) { (start ? customersInput : startInput).focus(); return; }
  const isDemo = !currentLocation && findLocation(start) && addresses.every(address => findLocation(address));
  if (!isDemo && [start, ...addresses].some(address => findLocation(address))) {
    document.querySelector("#form-error").textContent = "샘플 주소와 실제 주소를 함께 사용할 수 없어요. 실제 주소로 변경하거나 샘플 주소 불러오기를 눌러 주세요.";
    return;
  }
  locationRequest++;
  setSubmitting(true);
  try {
    let trip;
    if (isDemo) trip = { mode: "demo", start, addresses };
    else if (getGoogleSetupMessage()) {
      // API 키가 없어도 실제 주소를 Google 지도 길찾기로 전달할 수 있습니다.
      trip = { mode: "address", start, addresses, startLocation: currentLocation, usesCurrentLocation: Boolean(currentLocation) };
    } else trip = await resolveLiveTrip(start, addresses);
    if (!saveTrip(trip)) throw new Error("방문 정보를 전달할 수 없어요. 브라우저의 사이트 저장소 허용 설정을 확인해 주세요.");
    window.location.href = overview ? "route.html?view=all" : "route.html";
  } catch (error) {
    document.querySelector("#form-error").textContent = error.message;
    setProgress("");
  } finally {
    setSubmitting(false);
  }
}

function restoreInputs() {
  const trip = readTrip();
  if (trip) {
    startInput.value = trip.start;
    customersInput.value = trip.addresses.join("\n");
    if (trip.usesCurrentLocation && isValidCoordinate(trip.startLocation)) {
      currentLocation = trip.startLocation;
      document.querySelector("#current-location-status").textContent = "이전에 확인한 위치예요. 이동했다면 현재 위치 버튼을 다시 눌러 주세요.";
    }
    if (trip.mode === "live") {
      [trip.startLocation, ...trip.locations].forEach(point => selectedLocations.set(point.address, point));
    }
  }
  updateAddressCount();
}

function openAdditionalAddresses() {
  document.querySelector("#additional-addresses").value = "";
  document.querySelector("#additional-addresses-error").textContent = "";
  document.querySelector("#add-addresses-dialog").showModal();
  document.querySelector("#additional-addresses").focus();
}

function appendAdditionalAddresses(event) {
  event.preventDefault();
  const input = document.querySelector("#additional-addresses");
  const addresses = parseAddresses(input.value);
  if (!addresses.length) {
    document.querySelector("#additional-addresses-error").textContent = "추가할 주소를 최소 1개 입력해 주세요.";
    input.focus();
    return;
  }
  customersInput.value = [...parseAddresses(customersInput.value), ...addresses].join("\n");
  updateAddressCount();
  setFieldError(customersInput, "");
  document.querySelector("#form-error").textContent = "";
  setProgress(`${addresses.length}개 주소를 추가했어요. 경로 확인하기 또는 한번에 보기를 눌러 반영해 주세요.`);
  document.querySelector("#add-addresses-dialog").close();
  customersInput.focus();
}

renderSampleAddresses();
restoreInputs();
document.querySelector("#connection-notice").textContent = getGoogleSetupMessage();
addressForm.addEventListener("submit", submitAddresses);
document.querySelector("#fill-sample").addEventListener("click", fillSample);
document.querySelector("#use-current-location").addEventListener("click", selectCurrentLocation);
document.querySelector("#search-start").addEventListener("click", () => openAddressSearch("start"));
document.querySelector("#search-customer").addEventListener("click", () => openAddressSearch("customer"));
document.querySelector("#search-form").addEventListener("submit", submitSearch);
document.querySelector("#search-query").addEventListener("input", () => { searchRequest++; updateSearchLink(); });
document.querySelector("#address-search-dialog").addEventListener("close", () => { searchRequest++; });
startInput.addEventListener("input", () => { resetCurrentLocation(); setFieldError(startInput, ""); });
customersInput.addEventListener("input", () => { updateAddressCount(); setFieldError(customersInput, ""); });
window.addEventListener("pageshow", () => { setSubmitting(false); updateAddressCount(); });
document.querySelector("#add-addresses").addEventListener("click", openAdditionalAddresses);
document.querySelector("#add-addresses-form").addEventListener("submit", appendAdditionalAddresses);
document.querySelector("#view-all-input").addEventListener("click", event => submitAddresses(event, true));
if (new URLSearchParams(location.search).get("add") === "1") openAdditionalAddresses();
