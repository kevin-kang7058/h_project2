const tripStorageKey = "today-route-trip";

function normalizeAddress(address) {
  return address.trim().replace(/\s+/g, " ");
}

function parseAddresses(value) {
  return value.split(/\r?\n/).map(normalizeAddress).filter(Boolean);
}

function findLocation(address) {
  return [mockStart, ...mockLocations].find(location => location.address === normalizeAddress(address));
}

function isValidTrip(trip) {
  const validInput = trip && typeof trip.start === "string" && trip.start.trim() && Array.isArray(trip.addresses)
    && trip.addresses.length > 0 && trip.addresses.every(address => typeof address === "string" && address.trim());
  if (!validInput) return false;
  if (trip.mode === "address") return !trip.startLocation || (isValidCoordinate(trip.startLocation) && trip.startLocation.address === trip.start);
  if (trip.mode !== "live") return !trip.mode || trip.mode === "demo";
  return isValidCoordinate(trip.startLocation) && trip.startLocation.address === trip.start
    && Array.isArray(trip.locations) && trip.locations.length === trip.addresses.length
    && trip.locations.every((point, index) => isValidCoordinate(point) && point.address === trip.addresses[index]);
}

function isValidCoordinate(point) {
  return point && Number.isFinite(point.lat) && Number.isFinite(point.lng)
    && Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180;
}

function saveTrip(trip) {
  const data = JSON.stringify(trip);
  // 파일을 직접 열 때 브라우저마다 다른 sessionStorage 동작을 보완합니다.
  if (location.protocol === "file:") window.name = tripStorageKey + ":" + data;
  try {
    sessionStorage.setItem(tripStorageKey, data);
    return true;
  } catch (error) {
    return location.protocol === "file:";
  }
}

function readTrip() {
  try {
    const prefix = tripStorageKey + ":";
    const data = location.protocol === "file:" && window.name.startsWith(prefix)
      ? window.name.slice(prefix.length) : sessionStorage.getItem(tripStorageKey);
    const trip = JSON.parse(data);
    return isValidTrip(trip) ? trip : null;
  } catch (error) {
    return null;
  }
}
