// Google 지도 연동, 주소 좌표 변환, 현위치, 길찾기 URL을 관리합니다.
let googleMapsPromise;

function hasGoogleMapsKey() {
  return Boolean(window.appConfig?.googleMapsApiKey?.trim());
}

function getGoogleSetupMessage() {
  if (location.protocol === "file:") return "파일로 열었어요. 사이트 안의 지도·주소 검색은 start.bat 실행 후 http://localhost:8080에서 사용할 수 있어요. Google 지도 길찾기는 바로 연결됩니다.";
  if (!hasGoogleMapsKey()) return "Google 지도 연결 설정 전이에요. 주소 입력과 Google 지도 길찾기는 사용할 수 있고, 사이트 안의 지도·주소 검색·거리순 정렬은 API 키 설정 후 사용할 수 있어요.";
  return "";
}

function loadGoogleMaps() {
  if (getGoogleSetupMessage()) return Promise.reject(new Error(getGoogleSetupMessage()));
  if (googleMapsPromise) return googleMapsPromise;
  googleMapsPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    let settled = false;
    const timer = setTimeout(() => fail("Google 지도 연결 시간이 초과됐어요. 새로고침한 뒤 다시 시도해 주세요."), 15000);
    function fail(message) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(message));
    }
    window.gm_authFailure = () => {
      fail("Google 지도 인증에 실패했어요. API 키, 허용 사이트 주소, API 활성화와 결제 계정을 확인해 주세요.");
      const notice = document.querySelector("#map-error") || document.querySelector("#connection-notice");
      if (notice) { notice.hidden = false; notice.textContent = "Google 지도 인증에 실패했어요. API 키와 Google Cloud 설정을 확인해 주세요."; }
    };
    window.initGoogleMaps = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    const parameters = new URLSearchParams({ key: window.appConfig.googleMapsApiKey.trim(), callback: "initGoogleMaps", loading: "async", v: "weekly", language: "ko", region: "KR", libraries: "marker" });
    script.src = `https://maps.googleapis.com/maps/api/js?${parameters}`;
    script.async = true;
    script.onerror = () => fail("Google 지도를 불러오지 못했어요. 인터넷 연결을 확인하고 새로고침해 주세요.");
    document.head.append(script);
  });
  return googleMapsPromise;
}

async function searchGoogleAddresses(address) {
  await loadGoogleMaps();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("주소 검색 시간이 초과됐어요. 다시 시도해 주세요.")), 12000);
    new google.maps.Geocoder().geocode({ address, region: "kr" }, (results, status) => {
      clearTimeout(timer);
      if (status === "ZERO_RESULTS") return reject(new Error("주소를 찾을 수 없어요. 도로명과 건물 번호를 확인해 주세요."));
      if (status !== "OK" || !results?.length) return reject(new Error("주소 검색 요청에 실패했어요. Google Cloud의 Geocoding API, 키 제한, 사용량과 결제 설정을 확인해 주세요."));
      resolve(results.map(result => ({
        address: result.formatted_address,
        lat: result.geometry.location.lat(),
        lng: result.geometry.location.lng(),
        placeId: result.place_id,
        partialMatch: Boolean(result.partial_match),
        locationType: result.geometry.location_type
      })).filter(isValidCoordinate));
    });
  });
}

async function geocodeAddress(address) {
  const results = await searchGoogleAddresses(address);
  if (results.length !== 1 || results[0].partialMatch || results[0].locationType === "APPROXIMATE") {
    throw new Error("정확한 위치를 확인해 주세요. 주소 검색에서 결과를 선택하거나 건물 번호까지 입력해 주세요.");
  }
  return { ...results[0], address };
}

function getCurrentLocation() {
  return new Promise((resolve, reject) => {
    if (!window.isSecureContext || location.protocol === "file:") return reject(new Error("현재 위치는 HTTPS 주소 또는 http://localhost:8080에서 사용할 수 있어요. 주소를 직접 입력할 수도 있어요."));
    if (!navigator.geolocation) return reject(new Error("이 브라우저는 현재 위치를 지원하지 않아요. 출발 주소를 직접 입력해 주세요."));
    navigator.geolocation.getCurrentPosition(position => {
      const point = { address: "현재 위치", lat: position.coords.latitude, lng: position.coords.longitude };
      if (!isValidCoordinate(point)) return reject(new Error("현재 위치 좌표를 확인할 수 없어요. 다시 시도해 주세요."));
      resolve(point);
    }, error => {
      const messages = { 1: "위치 권한이 거부됐어요. 브라우저에서 위치 권한을 허용하거나 출발 주소를 입력해 주세요.", 2: "현재 위치를 확인할 수 없어요. 출발 주소를 직접 입력해 주세요.", 3: "위치 확인 시간이 초과됐어요. 다시 시도하거나 출발 주소를 입력해 주세요." };
      reject(new Error(messages[error.code] || "현재 위치를 확인하지 못했어요."));
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 });
  });
}

function createGoogleSearchUrl(address) {
  return `https://www.google.com/maps/search/?${new URLSearchParams({ api: "1", query: address })}`;
}

function createNavigationUrl(start, destination, fromCurrentLocation = false) {
  const describe = point => isValidCoordinate(point) ? `${point.lat},${point.lng}` : point.address;
  const parameters = new URLSearchParams({ api: "1", destination: describe(destination) });
  if (destination.placeId) parameters.set("destination_place_id", destination.placeId);
  // 이동 수단을 강제하지 않아 Google 지도가 해당 지역에서 지원하는 경로를 선택합니다.
  if (fromCurrentLocation) parameters.set("dir_action", "navigate");
  else {
    parameters.set("origin", describe(start));
    if (start.placeId) parameters.set("origin_place_id", start.placeId);
  }
  return `https://www.google.com/maps/dir/?${parameters}`;
}

async function renderGoogleMap(start, stops) {
  await loadGoogleMaps();
  const { Map: GoogleMap } = await google.maps.importLibrary("maps");
  const { AdvancedMarkerElement } = await google.maps.importLibrary("marker");
  const map = new GoogleMap(document.querySelector("#google-map"), {
    center: { lat: start.lat, lng: start.lng }, zoom: 14,
    mapId: window.appConfig.googleMapId || "DEMO_MAP_ID",
    streetViewControl: false, mapTypeControl: false
  });
  const bounds = new google.maps.LatLngBounds();
  const groups = new Map();
  [start, ...stops].forEach((point, index) => {
    const key = `${point.lat},${point.lng}`;
    if (!groups.has(key)) groups.set(key, { point, labels: [], addresses: [] });
    groups.get(key).labels.push(index ? String(index) : "출발");
    groups.get(key).addresses.push(point.address);
  });
  groups.forEach(({ point, labels, addresses }) => {
    const position = { lat: point.lat, lng: point.lng };
    const marker = new AdvancedMarkerElement({ map, position, title: addresses.join("\n") });
    const content = document.createElement("div");
    content.className = "google-marker";
    content.textContent = labels.join(" · ");
    marker.append(content);
    bounds.extend(position);
  });
  if (groups.size > 1) map.fitBounds(bounds, 50);
}
