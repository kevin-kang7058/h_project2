// 기존 입력·방문 화면을 유지하면서 전체 지도만 별도 창에 표시합니다.
function createOverviewUrl(start, stops, mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "")) {
  const maximum = mobile ? 4 : 10; // 마지막 방문지는 목적지, 나머지는 경유지입니다.
  if (!stops.length) throw new Error("입력된 방문 주소가 없어요.");
  if (stops.length > maximum) throw new Error(`현재 Google 지도 링크에서는 고객 주소 ${maximum}개까지 함께 전달할 수 있어요. ${stops.length}개 주소 전체를 사이트 안의 한 지도에 표시하려면 Google API 키를 설정해 주세요. 주소는 아래에 모두 유지했어요.`);
  const describe = point => isValidCoordinate(point) ? `${point.lat},${point.lng}` : point.address;
  // 구분자가 주소 일부에 포함되면 Google이 다른 경유지로 해석할 수 있습니다.
  if ([start, ...stops].some(point => describe(point).includes("|"))) throw new Error("주소에 포함된 | 문자를 제거한 뒤 다시 시도해 주세요.");
  const destination = stops[stops.length - 1];
  const url = new URL(createNavigationUrl(start, destination));
  if (stops.length > 1) url.searchParams.set("waypoints", stops.slice(0, -1).map(describe).join("|"));
  if (url.href.length > 2048) throw new Error("주소가 길어 Google 지도 링크에 모두 담을 수 없어요. 주소를 간결하게 수정하거나 Google API 키를 설정해 전체 지도를 이용해 주세요.");
  return url.href;
}

function copySampleMap(container) {
  const copy = document.querySelector("#mock-map").cloneNode(true);
  copy.hidden = false;
  copy.removeAttribute("id");
  // 원본 지도와 ID가 겹치지 않도록 복사한 SVG의 참조도 함께 바꿉니다.
  copy.querySelectorAll("[id]").forEach(element => { element.id = "overview-" + element.id; });
  copy.querySelector("svg").setAttribute("aria-labelledby", "overview-map-svg-title overview-map-svg-description");
  copy.querySelectorAll('[fill="url(#map-grid)"]').forEach(element => element.setAttribute("fill", "url(#overview-map-grid)"));
  container.replaceChildren(copy);
}

async function openAllAddresses() {
  const trip = readTrip();
  if (!trip) return;
  const route = buildRoute(trip);
  if (!route) return;
  const dialog = document.querySelector("#overview-dialog");
  const container = document.querySelector("#overview-map");
  const status = document.querySelector("#overview-status");
  const link = document.querySelector("#overview-google-link");
  const list = document.querySelector("#overview-addresses");
  container.replaceChildren();
  list.replaceChildren();
  container.hidden = true;
  link.hidden = true;
  link.removeAttribute("href");
  route.stops.forEach(stop => {
    const item = document.createElement("li");
    item.textContent = stop.address;
    list.append(item);
  });
  status.textContent = `출발지: ${route.start.address} · 방문 주소 ${route.stops.length}개`;
  dialog.showModal();
  if (!trip.mode || trip.mode === "demo") {
    container.hidden = false;
    copySampleMap(container);
    status.textContent += " · 체험용 지도";
  } else if (trip.mode === "live") {
    container.hidden = false;
    try { await renderGoogleMap(route.start, route.stops, container); }
    catch (error) { container.hidden = true; status.textContent = error.message; }
  } else {
    try {
      link.href = createOverviewUrl(route.start, route.stops);
      link.hidden = false;
      status.textContent += " · Google 지도에서 출발지·경유지·목적지로 함께 열어요. 현재는 입력 순서이며, 열리는 Google 지도 제품의 경유지 지원에 따라 표시가 달라질 수 있어요. 외부 Google 지도의 마커는 숫자로 지정할 수 없어요. 목록과 같은 숫자 마커는 API 키 설정 후 사이트 내부 지도에서 표시돼요.";
    } catch (error) { status.textContent = error.message; }
  }
}
