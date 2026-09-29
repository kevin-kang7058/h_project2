// 엑셀 파일은 브라우저에서만 읽습니다. Supabase 또는 지도 API로 전송하지 않습니다.
let excelLibraryPromise;
let excelWorkbook = null;
let excelRows = [];
let excelLoading = false;
const excelMaxRows = 20000;

function loadExcelLibrary() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (excelLibraryPromise) return excelLibraryPromise;
  excelLibraryPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const timer = setTimeout(fail, 15000);
    function fail() {
      clearTimeout(timer);
      script.remove();
      reject(new Error("엑셀 읽기 기능을 불러오지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요."));
    }
    script.src = "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";
    script.onload = () => { clearTimeout(timer); window.XLSX ? resolve(window.XLSX) : fail(); };
    script.onerror = fail;
    document.head.append(script);
  });
  excelLibraryPromise.catch(() => { excelLibraryPromise = null; });
  return excelLibraryPromise;
}

function excelCellText(value) {
  return value == null ? "" : String(value).replace(/\s+/g, " ").trim();
}

function isAddressHeader(value) {
  const text = excelCellText(value).toLowerCase().replace(/[\s_()\-]/g, "");
  return !/상세|detail|우편|zip|email|이메일/.test(text)
    && /^(주소|주소지|고객주소|방문주소|배송주소|배달주소|도로명주소|지번주소|기본주소|소재지|사업장주소|address|streetaddress|customeraddress|shippingaddress)$/.test(text);
}

function detectExcelAddressColumn(rows) {
  for (let row = 0; row < Math.min(rows.length, 30); row++) {
    const columns = rows[row].map((value, index) => isAddressHeader(value) ? index : -1).filter(index => index >= 0);
    if (columns.length) return { column: columns[0], startRow: row + 2, headerRow: row, certain: columns.length === 1 };
  }
  // 헤더가 없는 파일은 주소 형태의 값이 가장 많은 열을 제안합니다.
  const scores = [];
  rows.slice(0, 100).forEach(row => row.forEach((value, column) => {
    if (/[가-힣]+(?:시|도|구|군|로|길|동|읍|면)\s*.*\d/.test(excelCellText(value))) scores[column] = (scores[column] || 0) + 1;
  }));
  const best = Math.max(0, ...scores.filter(Number.isFinite));
  return { column: best ? scores.indexOf(best) : 0, startRow: 1, headerRow: -1, certain: false };
}

function readExcelRows(sheet) {
  if (!sheet?.["!ref"]) return [];
  const range = XLSX.utils.decode_range(sheet["!fullref"] || sheet["!ref"]);
  if (range.e.r >= excelMaxRows || range.e.c >= 256) throw new Error("시트가 너무 커요. 20,000행·256열 이내로 나누어 불러와 주세요.");
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", blankrows: true, raw: false, range: 0 });
}

function collectExcelAddresses(rows, column, startRow, detailColumn = -1) {
  if (!Number.isInteger(startRow) || startRow < 1 || startRow > rows.length) return [];
  return rows.slice(startRow - 1).map(row => {
    const address = excelCellText(row[column]);
    if (!address || isAddressHeader(address) || /^(합계|총계)$/.test(address)) return "";
    const detail = detailColumn >= 0 && detailColumn !== column ? excelCellText(row[detailColumn]) : "";
    return [address, detail].filter(Boolean).join(" ");
  }).filter(Boolean);
}

function selectedExcelAddresses() {
  return collectExcelAddresses(excelRows, Number(document.querySelector("#excel-column").value), Number(document.querySelector("#excel-start-row").value), Number(document.querySelector("#excel-detail-column").value));
}

function updateExcelPreview() {
  const addresses = selectedExcelAddresses();
  const preview = document.querySelector("#excel-preview");
  preview.replaceChildren();
  addresses.slice(0, 5).forEach(address => {
    const item = document.createElement("li");
    item.textContent = address;
    preview.append(item);
  });
  document.querySelector("#excel-preview-count").textContent = `${addresses.length}개 주소 · ${Math.min(5, addresses.length)}개 미리보기`;
  document.querySelector("#excel-preview-error").textContent = addresses.length ? "" : "가져올 주소가 없어요. 시트, 주소 열과 시작 행을 확인해 주세요.";
  document.querySelector("#confirm-excel").disabled = !addresses.length;
}

function selectExcelSheet() {
  try {
    excelRows = readExcelRows(excelWorkbook.Sheets[document.querySelector("#excel-sheet").value]);
    const detected = detectExcelAddressColumn(excelRows);
    const columnSelect = document.querySelector("#excel-column");
    const detailSelect = document.querySelector("#excel-detail-column");
    columnSelect.replaceChildren();
    detailSelect.replaceChildren(new Option("사용하지 않음", "-1"));
    const width = excelRows.reduce((max, row) => Math.max(max, row.length), 0);
    let detailColumn = -1;
    for (let column = 0; column < width; column++) {
      const header = detected.headerRow >= 0 ? excelCellText(excelRows[detected.headerRow][column]) : "";
      const sample = header || excelRows.map(row => excelCellText(row[column])).find(Boolean) || "빈 열";
      const label = `${XLSX.utils.encode_col(column)}열 · ${sample.slice(0, 55)}`;
      columnSelect.append(new Option(label, String(column)));
      detailSelect.append(new Option(label, String(column)));
      if (/^(상세주소|상세 주소|address2|address line 2)$/i.test(header)) detailColumn = column;
    }
    columnSelect.value = String(detected.column);
    detailSelect.value = String(detailColumn);
    document.querySelector("#excel-start-row").value = detected.startRow;
    document.querySelector("#excel-start-row").max = Math.max(1, excelRows.length);
    updateExcelPreview();
  } catch (error) {
    excelRows = [];
    document.querySelector("#excel-preview").replaceChildren();
    document.querySelector("#excel-preview-count").textContent = "";
    document.querySelector("#excel-preview-error").textContent = error.message;
    document.querySelector("#confirm-excel").disabled = true;
  }
}

async function importExcelFile(file) {
  if (!file || excelLoading) return;
  const status = document.querySelector("#excel-status");
  const errorBox = document.querySelector("#excel-error");
  errorBox.textContent = "";
  status.textContent = "";
  if (!/\.(xlsx|xls)$/i.test(file.name)) { errorBox.textContent = ".xlsx 또는 .xls 엑셀 파일을 선택해 주세요."; return; }
  if (file.size > 10 * 1024 * 1024) { errorBox.textContent = "10MB 이하의 엑셀 파일을 선택해 주세요."; return; }
  excelLoading = true;
  document.querySelector("#import-excel").disabled = true;
  status.textContent = "엑셀 파일에서 주소 열을 찾고 있어요…";
  try {
    await loadExcelLibrary();
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
    const isBinary = bytes[0] === 0xd0 && bytes[1] === 0xcf;
    if (!isZip && !isBinary) throw new Error("일반 Excel 형식으로 다시 저장해 주세요.");
    excelWorkbook = XLSX.read(buffer, { type: "array", sheetRows: excelMaxRows + 1, cellHTML: false, cellFormula: false });
    const names = excelWorkbook.SheetNames;
    if (!names.length) throw new Error("시트가 없습니다.");
    if (document.body.dataset.authState !== "authenticated") return;
    const sheetSelect = document.querySelector("#excel-sheet");
    sheetSelect.replaceChildren();
    names.forEach(name => sheetSelect.append(new Option(name, name)));
    // 표지 시트가 있으면 주소 헤더가 있는 시트를 먼저 제안합니다.
    const bestSheet = names.find(name => {
      try { return detectExcelAddressColumn(readExcelRows(excelWorkbook.Sheets[name])).headerRow >= 0; } catch { return false; }
    });
    sheetSelect.value = bestSheet || names[0];
    document.querySelector("#excel-file-name").textContent = file.name;
    selectExcelSheet();
    document.querySelector("#excel-dialog").showModal();
    status.textContent = "미리보기에서 주소를 확인한 뒤 추가해 주세요.";
  } catch (error) {
    excelWorkbook = null;
    errorBox.textContent = error.message.includes("인터넷") ? error.message : "파일을 읽지 못했어요. 암호가 없는 정상적인 .xlsx 또는 .xls 파일인지 확인해 주세요.";
    status.textContent = "";
  } finally {
    excelLoading = false;
    document.querySelector("#import-excel").disabled = false;
    document.querySelector("#excel-file").value = "";
  }
}

function appendExcelAddresses() {
  const addresses = selectedExcelAddresses();
  if (!addresses.length) return;
  customersInput.value = [...parseAddresses(customersInput.value), ...addresses].join("\n");
  updateAddressCount();
  setFieldError(customersInput, "");
  document.querySelector("#form-error").textContent = "";
  document.querySelector("#excel-status").textContent = `엑셀에서 ${addresses.length}개 주소를 추가했어요. 기존 주소와 중복된 주소도 유지했어요.`;
  setProgress("경로 확인하기 또는 한번에 보기를 눌러 주세요.");
  document.querySelector("#excel-dialog").close();
  customersInput.focus();
}

function initializeExcelImport() {
  document.querySelector("#import-excel").addEventListener("click", () => {
    if (!excelLoading) { document.querySelector("#excel-file").value = ""; document.querySelector("#excel-file").click(); }
  });
  document.querySelector("#excel-file").addEventListener("change", event => importExcelFile(event.target.files[0]));
  document.querySelector("#excel-sheet").addEventListener("change", selectExcelSheet);
  ["#excel-column", "#excel-detail-column", "#excel-start-row"].forEach(selector => document.querySelector(selector).addEventListener("input", updateExcelPreview));
  document.querySelector("#confirm-excel").addEventListener("click", appendExcelAddresses);
  document.querySelector("#excel-dialog").addEventListener("close", () => { excelWorkbook = null; excelRows = []; });
}
if (window.authReady) window.authReady.then(session => { if (session) initializeExcelImport(); });
