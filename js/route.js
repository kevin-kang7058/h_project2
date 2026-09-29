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
  const start = findLocation(trip.start);
  if (!start || trip.addresses.some(address => !findLocation(address))) return null;
  const stops = trip.addresses.map(address => {
    const location = findLocation(address);
    return { ...location, distance: calculateDistance(start, location) };
  }).sort((first, second) => first.distance - second.distance)
    .map((stop, index) => ({ ...stop, order: index + 1 }));
  return { start, stops };
}

function formatDistance(distance) {
  return distance < 1 ? `${Math.round(distance * 1000)} m` : `${distance.toFixed(1)} km`;
}

function openNavigation(stop) {
  // 외부 내비게이션 연결 방식이 결정되면 이 함수를 수정하세요.
  document.querySelector("#navigation-address").textContent = stop.address;
  document.querySelector("#navigation-dialog").showModal();
}

function renderVisitList(stops) {
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
    distance.textContent = `출발지에서 ${formatDistance(stop.distance)}`;
    details.append(address, distance);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "button navigate-button";
    button.textContent = "길찾기 ↗";
    button.setAttribute("aria-label", `${stop.order}번째 방문지 ${stop.address} 길찾기`);
    button.addEventListener("click", () => openNavigation(stop));
    item.append(number, details, button);
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

function initializeRoute() {
  const trip = readTrip();
  if (!trip) return showEmptyState("입력된 방문 정보가 없어요. 고객 주소와 출발 위치를 먼저 입력해 주세요.");
  const route = buildRoute(trip);
  if (!route) return showEmptyState("지원하지 않는 주소가 포함되어 있어요. 입력 화면에서 샘플 주소로 변경해 주세요.");
  document.querySelector("#route-content").hidden = false;
  document.querySelector("#start-label").textContent = route.start.address;
  document.querySelector("#route-count").textContent = route.stops.length;
  renderVisitList(route.stops);
  renderMap(route.start, route.stops);
}

initializeRoute();
