// 모든 거리는 '직전 방문지'가 아니라 명세에 정의된 '출발 위치' 기준입니다.
function calculateDistance(start, destination) {
  const radians = degrees => degrees * Math.PI / 180;
  const latitudeDifference = radians(destination.lat - start.lat);
  const longitudeDifference = radians(destination.lng - start.lng);
  const value = Math.sin(latitudeDifference / 2) ** 2
    + Math.cos(radians(start.lat)) * Math.cos(radians(destination.lat))
    * Math.sin(longitudeDifference / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, value)));
}

function buildRoute(trip) {
  if (trip.mode === "address") return {
    start: trip.startLocation || { address: trip.start },
    stops: trip.addresses.map((address, index) => ({ address, order: index + 1 }))
  };
  const start = trip.mode === "live" ? trip.startLocation : findLocation(trip.start);
  const locations = trip.mode === "live" ? trip.locations : trip.addresses.map(findLocation);
  if (!start || locations.some(point => !point)) return null;
  const stops = locations.map(location => {
    return { ...location, distance: calculateDistance(start, location) };
  }).sort((first, second) => first.distance - second.distance)
    .map((stop, index) => ({ ...stop, order: index + 1 }));
  return { start, stops };
}

function formatDistance(distance) {
  return distance < 1 ? `${Math.round(distance * 1000)} m` : `${distance.toFixed(1)} km`;
}

function openNavigation(stop) {
  // 가상 주소를 실제 목적지로 잘못 안내하지 않습니다.
  document.querySelector("#navigation-address").textContent = stop.address;
  document.querySelector("#navigation-dialog").showModal();
}

function renderVisitList(stops, start, mode) {
  const list = document.querySelector("#visit-list");
  list.replaceChildren();
  stops.forEach(stop => {
    const item = document.createElement("li");
    const number = document.createElement("span");
    number.className = "visit-number";
    number.textContent = stop.order;
    const details = document.createElement("div");
    details.className = "visit-details";
    const address = document.createElement("p");
    address.className = "visit-address";
    address.textContent = stop.address;
    const distance = document.createElement("p");
    distance.className = "visit-distance";
    distance.textContent = mode === "address" ? "입력 순서 · 거리 미확인" : `출발지에서 직선 ${formatDistance(stop.distance)}`;
    details.append(address, distance);
    const actions = document.createElement("div");
    actions.className = "visit-actions";
    const button = document.createElement(mode === "demo" ? "button" : "a");
    button.className = "button navigate-button";
    button.textContent = mode === "demo" ? "샘플 안내" : "길찾기 ↗";
    button.setAttribute("aria-label", `${stop.order}번째 방문지 ${stop.address} 길찾기`);
    if (mode === "demo") {
      button.type = "button";
      button.addEventListener("click", () => openNavigation(stop));
    } else {
      button.href = createNavigationUrl(start, stop);
      button.target = "_blank";
      button.rel = "noopener noreferrer";
      const currentLink = document.createElement("a");
      currentLink.className = "current-directions";
      currentLink.textContent = "현위치에서 출발 ↗";
      currentLink.setAttribute("aria-label", `현재 위치에서 ${stop.address} 길찾기`);
      currentLink.href = createNavigationUrl(start, stop, true);
      currentLink.target = "_blank";
      currentLink.rel = "noopener noreferrer";
      actions.append(currentLink);
    }
    actions.prepend(button);
    item.append(number, details, actions);
    list.append(item);
  });
}

function createSvgElement(tag, attributes, text) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
  if (text !== undefined) element.textContent = text;
  return element;
}

function getMapPoints(start, stops) {
  const locations = [start, ...stops];
  const longitudeScale = Math.cos(start.lat * Math.PI / 180);
  const coordinates = locations.map(location => ({ x: location.lng * longitudeScale, y: -location.lat }));
  const minX = Math.min(...coordinates.map(point => point.x));
  const maxX = Math.max(...coordinates.map(point => point.x));
  const minY = Math.min(...coordinates.map(point => point.y));
  const maxY = Math.max(...coordinates.map(point => point.y));
  const scale = Math.min(500 / (maxX - minX || 0.01), 280 / (maxY - minY || 0.01));
  return coordinates.map(point => ({ x: 340 + (point.x - (minX + maxX) / 2) * scale, y: 245 + (point.y - (minY + maxY) / 2) * scale }));
}

function renderMap(start, stops) {
  const layer = document.querySelector("#map-markers");
  layer.replaceChildren();
  const points = getMapPoints(start, stops);
  const usedPositions = new Map();
  [start, ...stops].forEach((location, index) => {
    const point = points[index];
    // 같은 주소가 여러 번 입력되어도 각 고객 번호를 확인할 수 있도록 펼칩니다.
    const key = `${location.lat},${location.lng}`;
    const overlap = usedPositions.get(key) || 0;
    usedPositions.set(key, overlap + 1);
    const angle = overlap * 2.4;
    const radius = overlap ? 30 + Math.sqrt(overlap) * 10 : 0;
    const x = Math.max(30, Math.min(650, point.x + Math.cos(angle) * radius));
    const y = Math.max(70, Math.min(425, point.y + Math.sin(angle) * radius));
    const group = createSvgElement("g", { transform: `translate(${x} ${y})`, class: index ? "map-stop" : "map-start" });
    group.append(createSvgElement("title", {}, `${index ? `${index}번째 방문` : "출발"}: ${location.address}`));
    group.append(createSvgElement("circle", { r: index ? 19 : 23, fill: index ? "#276653" : "#fff", stroke: index ? "#fff" : "#276653", "stroke-width": 3 }));
    group.append(createSvgElement("text", { "text-anchor": "middle", dy: "0.35em", fill: index ? "#fff" : "#276653", "font-size": index ? 15 : 12, "font-weight": 700 }, index || "출발"));
    layer.append(group);
  });
}

function showEmptyState(message) {
  document.querySelector("#empty-state").hidden = false;
  document.querySelector("#empty-message").textContent = message;
  document.querySelector(".route-intro h1").textContent = "방문 정보를 확인해 주세요.";
  document.querySelector(".route-intro .page-intro > p:last-child").textContent = "주소를 입력하면 추천 방문 순서를 확인할 수 있어요.";
}

async function initializeRoute() {
  const trip = readTrip();
  if (!trip) return showEmptyState("입력된 방문 정보가 없어요. 고객 주소와 출발 위치를 먼저 입력해 주세요.");
  const route = buildRoute(trip);
  if (!route) return showEmptyState("방문 정보를 확인할 수 없어요. 입력 화면에서 주소를 다시 확인해 주세요.");
  const mode = trip.mode || "demo";
  document.querySelector("#route-content").hidden = false;
  document.querySelector("#start-label").textContent = route.start.address;
  document.querySelector("#route-count").textContent = route.stops.length;
  renderVisitList(route.stops, route.start, mode);
  if (mode === "demo") {
    document.querySelector("#mock-map").hidden = false;
    document.querySelector("#map-mode").textContent = "SAMPLE MAP";
    document.querySelector("#route-notice-text").textContent = "샘플 좌표로 계산한 출발지 기준 직선거리예요. 실제 길찾기는 주소 입력 화면에서 실제 고객 주소를 입력해 이용해 주세요.";
    renderMap(route.start, route.stops);
  } else if (mode === "address") {
    document.querySelector(".route-intro h1").textContent = "방문할 주소를 확인하세요.";
    document.querySelector(".route-intro .page-intro > p:last-child").textContent = "각 주소의 길찾기를 눌러 Google 지도에서 경로를 확인하세요.";
    document.querySelector("#visit-title").textContent = "방문 주소 목록";
    document.querySelector("#visit-subtitle").textContent = "입력한 순서 · 거리순 정렬 전";
    document.querySelector("#map-mode").textContent = "GOOGLE MAPS";
    document.querySelector("#map-unavailable").hidden = false;
    document.querySelector("#map-legend").hidden = true;
    document.querySelector("#route-notice-text").textContent = "좌표를 확인하지 않은 입력 순서예요. 사이트 내 지도와 거리순 정렬은 Google API 키 설정 후 사용할 수 있어요. 길찾기는 Google 지도로 연결되며, 현위치에서 출발은 Google 지도의 위치 권한이 필요할 수 있어요.";
  } else {
    document.querySelector("#map-mode").textContent = "GOOGLE MAPS";
    document.querySelector("#map-legend-caption").textContent = "Google 지도";
    document.querySelector("#google-map").hidden = false;
    document.querySelector("#route-notice-text").textContent = "출발지 기준 직선거리로 정렬했어요. 실제 이동 경로와 지원되는 교통수단은 Google 지도에서 확인해 주세요. 이동했다면 현위치에서 출발을 눌러 주세요.";
    try { await renderGoogleMap(route.start, route.stops); }
    catch (error) {
      document.querySelector("#google-map").hidden = true;
      document.querySelector("#map-error").hidden = false;
      document.querySelector("#map-error").textContent = error.message + " 방문 목록의 Google 지도 길찾기는 계속 사용할 수 있어요.";
    }
  }
  if (new URLSearchParams(location.search).get("view") === "all") openAllAddresses();
}

document.querySelector("#view-all-addresses").addEventListener("click", () => openAllAddresses());
initializeRoute();
