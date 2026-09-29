const addressForm = document.querySelector("#address-form");
const startInput = document.querySelector("#start-address");
const customersInput = document.querySelector("#customer-addresses");

function updateAddressCount() {
  document.querySelector("#address-count").textContent = `${parseAddresses(customersInput.value).length}개 입력됨`;
}

function setFieldError(input, message) {
  const errorId = input === startInput ? "#start-error" : "#customer-error";
  document.querySelector(errorId).textContent = message;
  input.setAttribute("aria-invalid", String(Boolean(message)));
}

function renderSampleAddresses() {
  const list = document.querySelector("#sample-address-list");
  const suggestions = document.querySelector("#sample-addresses");
  [mockStart, ...mockLocations].forEach(location => {
    const item = document.createElement("li");
    item.textContent = location.address;
    list.append(item);
    const option = document.createElement("option");
    option.value = location.address;
    suggestions.append(option);
  });
}

function fillSample() {
  startInput.value = mockStart.address;
  customersInput.value = mockLocations.map(location => location.address).join("\n");
  setFieldError(startInput, "");
  setFieldError(customersInput, "");
  document.querySelector("#form-error").textContent = "";
  updateAddressCount();
}

function submitAddresses(event) {
  event.preventDefault();
  const start = normalizeAddress(startInput.value);
  const addresses = parseAddresses(customersInput.value);
  const unknownAddresses = addresses.filter(address => !findLocation(address));
  const startError = !start ? "출발 위치를 입력해 주세요."
    : !findLocation(start) ? "등록된 샘플 주소를 입력해 주세요. 아래 샘플 주소 목록에서 확인할 수 있어요." : "";
  const customerError = !addresses.length ? "고객 주소를 최소 1개 입력해 주세요."
    : unknownAddresses.length ? `지원하지 않는 주소 ${unknownAddresses.length}개: ${unknownAddresses.join(", ")}. 샘플 주소 목록을 확인해 주세요.` : "";
  setFieldError(startInput, startError);
  setFieldError(customersInput, customerError);
  if (startError || customerError) {
    (startError ? startInput : customersInput).focus();
    return;
  }
  if (!saveTrip({ start, addresses })) {
    document.querySelector("#form-error").textContent = "방문 정보를 전달할 수 없어요. 브라우저의 사이트 저장소 허용 설정을 확인해 주세요.";
    return;
  }
  window.location.href = "route.html";
}

function restoreInputs() {
  const trip = readTrip();
  if (trip) {
    startInput.value = trip.start;
    customersInput.value = trip.addresses.join("\n");
  }
  updateAddressCount();
}

renderSampleAddresses();
restoreInputs();
addressForm.addEventListener("submit", submitAddresses);
document.querySelector("#fill-sample").addEventListener("click", fillSample);
startInput.addEventListener("input", () => setFieldError(startInput, ""));
customersInput.addEventListener("input", () => {
  updateAddressCount();
  setFieldError(customersInput, "");
});
window.addEventListener("pageshow", updateAddressCount);
