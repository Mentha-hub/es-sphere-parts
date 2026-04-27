const STORAGE_KEY = "codeParts_ownedItems_v1";
const container = document.getElementById("container");
const summary = document.getElementById("summary-count");

let ownedItems;
try {
  ownedItems = new Set(JSON.parse(localStorage.getItem(STORAGE_KEY)) || []);
} catch {
  ownedItems = new Set();
}

const groupCache = new Map();
const groupSubCache = new Map();
const itemMetaMap = new Map();

const counterState = {
  summary: { normalOwned: 0, normalTotal: 0, anotherOwned: 0, anotherTotal: 0 },
  groups: new Map()
};

let allItemIds = [];
const toast = document.getElementById("toast");
let imageObserver;
const NO_IMAGE_SRC = "img/noimage.png";

/* ===== 共通ユーティリティ ===== */
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2000);
}

function getIcon(owned, total) {
  return total && owned === total ? "■" : "□";
}

function saveOwnedItems() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...ownedItems]));
}

/* ===== CSVパース ===== */
function parseLine(line) {
  const result = [];
  let current = "", insideQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (insideQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else insideQuotes = !insideQuotes;
    } else if (char === "," && !insideQuotes) {
      result.push(current); current = "";
    } else current += char;
  }
  result.push(current);
  return result;
}

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = parseLine(lines[0]);
  const grouped = {};

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const values = parseLine(lines[i]);
    if (values.length !== headers.length) continue;

    const item = {};
    headers.forEach((header, idx) => item[header.trim()] = values[idx]?.trim() || "");

    const { id, method, subMethod, detail, color, image } = item;
    if (!id || !method || !subMethod || !detail) continue;
    if (color !== "normal" && color !== "another") continue;

    grouped[method] ??= {};
    grouped[method][subMethod] ??= {};
    grouped[method][subMethod][detail] ??= [];

    const safeImage = image && !image.startsWith("javascript:") ? image : NO_IMAGE_SRC;
    grouped[method][subMethod][detail].push({ id, color, image: safeImage });
  }

  return grouped;
}

/* ===== 描画ユーティリティ ===== */
function setupLazyImages() {
  if (imageObserver) imageObserver.disconnect();
  imageObserver = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const img = entry.target;
      img.src = img.dataset.src;
      obs.unobserve(img);
    });
  }, { root: null, rootMargin: "400px" });

  container.querySelectorAll(".lazy-img").forEach(img => imageObserver.observe(img));
}

/* ===== DOM作成関数 ===== */
function createDetailGroupElement(detail, items, method, subMethod) {
  const detailGroup = document.createElement("div");
  detailGroup.className = "detail-group";

  if (detail !== subMethod) {
    const detailTitle = document.createElement("div");
    detailTitle.className = "detail-title";
    detailTitle.textContent = detail;
    detailGroup.append(detailTitle);
  }

  const itemsDiv = document.createElement("div");
  itemsDiv.className = "items";

  items.forEach(item => {
    itemMetaMap.set(item.id, { method, subMethod, color: item.color });

    const groupState = counterState.groups.get(method);
    const subState = groupState.subs.get(subMethod);

    if (item.color === "normal") { subState.normalTotal++; groupState.normalTotal++; counterState.summary.normalTotal++; }
    if (item.color === "another") { subState.anotherTotal++; groupState.anotherTotal++; counterState.summary.anotherTotal++; }

    if (ownedItems.has(item.id)) {
      if (item.color === "normal") { subState.normalOwned++; groupState.normalOwned++; counterState.summary.normalOwned++; }
      if (item.color === "another") { subState.anotherOwned++; groupState.anotherOwned++; counterState.summary.anotherOwned++; }
    }

    allItemIds.push(item.id);

    const div = document.createElement("div");
    div.className = `item color-${item.color}`;
    div.dataset.id = item.id;
    if (ownedItems.has(item.id)) div.classList.add("selected");

    const inner = document.createElement("div");
    inner.className = "item-inner";

    const img = document.createElement("img");
    img.dataset.src = item.image;
    img.classList.add("lazy-img");
    img.onerror = () => { img.onerror = null; img.src = NO_IMAGE_SRC; };

    inner.append(img);
    div.append(inner);
    itemsDiv.append(div);
  });

  detailGroup.append(itemsDiv);
  return detailGroup;
}

function getSummarySpans() {
  let spans = summary.querySelectorAll("span.color-count");
  if (spans.length < 2) {
    summary.innerHTML = `<span class="color-count"></span><span class="color-count"></span>`;
    spans = summary.querySelectorAll("span.color-count");
  }
  return spans;
}

function createSubGroupElement(subMethod, details, method) {
  const subGroup = document.createElement("div");
  subGroup.className = "sub-group";
  subGroup.dataset.subMethod = subMethod;

  const subTitle = document.createElement("div");
  subTitle.className = "sub-group-title";

  const subText = document.createElement("span");
  subText.textContent = subMethod;

  const subCount = document.createElement("span");
  subCount.className = "group-count sub-count";

  const subNormal = document.createElement("span"); subNormal.className = "color-count";
  const subAnother = document.createElement("span"); subAnother.className = "color-count";
  subCount.append(subNormal, subAnother);
  subTitle.append(subText, subCount);

  const subStorageKey = `subGroupState_${encodeURIComponent(method)}_${encodeURIComponent(subMethod)}`;
  const savedSubState = localStorage.getItem(subStorageKey);
  if (savedSubState === null || savedSubState === "true") subGroup.classList.add("collapsed");

  subTitle.addEventListener("click", () => {
    const before = subGroup.getBoundingClientRect().top;
    subGroup.classList.toggle("collapsed");
    requestAnimationFrame(() => {
      const after = subGroup.getBoundingClientRect().top;
      window.scrollBy(0, after - before);
      const group = subGroup.closest(".group");
      const toggleBtn = group.querySelector(".toggle-all");
      const subs = groupSubCache.get(method);
      toggleBtn.textContent = [...subs].some(sub => !sub.classList.contains("collapsed")) ? "▲ すべて閉じる" : "▼ すべて開く";
    });
    localStorage.setItem(subStorageKey, subGroup.classList.contains("collapsed"));
  });

  const subInner = document.createElement("div");
  subInner.className = "sub-group-inner";

  counterState.groups.get(method).subs.set(subMethod, { normalOwned: 0, normalTotal: 0, anotherOwned: 0, anotherTotal: 0 });
  groupCache.get(method).subCountMap.set(subMethod, { normal: subNormal, another: subAnother });

  for (const detail in details) {
    const detailGroup = createDetailGroupElement(detail, details[detail], method, subMethod);
    subInner.append(detailGroup);
  }

  subGroup.append(subTitle, subInner);
  return subGroup;
}

function createGroupElement(method, methodData) {
  const group = document.createElement("div");
  group.className = "group";
  group.dataset.method = method;

  const groupInner = document.createElement("div");
  groupInner.className = "group-inner";

  const groupTitle = document.createElement("div");
  groupTitle.className = "group-title";

  const titleLeft = document.createElement("div");
  titleLeft.className = "group-title-left";

  const titleText = document.createElement("span");
  titleText.className = "group-name";
  titleText.textContent = method;

  const groupCount = document.createElement("div"); groupCount.className = "group-count";
  const groupNormal = document.createElement("span"); groupNormal.className = "color-count";
  const groupAnother = document.createElement("span"); groupAnother.className = "color-count";
  groupCount.append(groupNormal, groupAnother);

  titleLeft.append(titleText); groupTitle.append(titleLeft, groupCount);
  groupInner.append(groupTitle);

  const groupStorageKey = `groupState_${encodeURIComponent(method)}`;
  const savedState = localStorage.getItem(groupStorageKey);
  if (savedState === null || savedState === "true") group.classList.add("collapsed");

  groupTitle.addEventListener("click", () => {
    const before = group.getBoundingClientRect().top;
    group.classList.toggle("collapsed");
    requestAnimationFrame(() => {
      const after = group.getBoundingClientRect().top;
      window.scrollBy(0, after - before);
    });
    localStorage.setItem(groupStorageKey, group.classList.contains("collapsed"));
  });

  const subCountMap = new Map();
  counterState.groups.set(method, { normalOwned: 0, normalTotal: 0, anotherOwned: 0, anotherTotal: 0, subs: new Map() });
  groupCache.set(method, { groupNormal, groupAnother, subCountMap });

  for (const subMethod in methodData) {
    const subGroup = createSubGroupElement(subMethod, methodData[subMethod], method);
    groupInner.append(subGroup);
  }

  const footer = document.createElement("div"); footer.className = "group-footer";
  const toggleBtn = document.createElement("button"); toggleBtn.className = "toggle-all"; toggleBtn.textContent = "▼ すべて開く";
  footer.append(toggleBtn); groupInner.append(footer); group.append(groupInner);

  const subs = group.querySelectorAll(".sub-group");
  groupSubCache.set(method, subs);
  toggleBtn.textContent = [...subs].some(sub => !sub.classList.contains("collapsed")) ? "▲ すべて閉じる" : "▼ すべて開く";

  return group;
}

/* ===== render ===== */
function render(grouped) {
  allItemIds = [];
  groupCache.clear(); groupSubCache.clear(); itemMetaMap.clear(); counterState.groups.clear();

  const fragment = document.createDocumentFragment();
  for (const [method, methodData] of Object.entries(grouped)) {
    const group = createGroupElement(method, methodData);
    fragment.append(group);
  }

  container.textContent = "";
  container.append(fragment);

  setupLazyImages();
}

/* ===== カウント更新 ===== */
function updateCountsForItem(id, isAdd) {
  const meta = itemMetaMap.get(id);
  if (!meta) return;

  const { method, subMethod, color } = meta;
  const groupState = counterState.groups.get(method);
  const subState = groupState.subs.get(subMethod);
  const delta = isAdd ? 1 : -1;

  if (color === "normal") { subState.normalOwned += delta; groupState.normalOwned += delta; counterState.summary.normalOwned += delta; }
  if (color === "another") { subState.anotherOwned += delta; groupState.anotherOwned += delta; counterState.summary.anotherOwned += delta; }

  const subCache = groupCache.get(method).subCountMap.get(subMethod);
  subCache.normal.textContent = `${getIcon(subState.normalOwned, subState.normalTotal)} ${subState.normalOwned}/${subState.normalTotal}`;
  subCache.another.textContent = `（${getIcon(subState.anotherOwned, subState.anotherTotal)} ${subState.anotherOwned}/${subState.anotherTotal}）`;

  const gCache = groupCache.get(method);
  gCache.groupNormal.textContent = `${getIcon(groupState.normalOwned, groupState.normalTotal)} ${groupState.normalOwned}/${groupState.normalTotal}`;
  gCache.groupAnother.textContent = `（${getIcon(groupState.anotherOwned, groupState.anotherTotal)} ${groupState.anotherOwned}/${groupState.anotherTotal}）`;

  const s = counterState.summary;

  const owned = s.normalOwned + s.anotherOwned;
  const total = s.normalTotal + s.anotherTotal;
  const rate = total ? Math.floor((owned / total) * 100) : 0;

  summary.children[0].textContent =
    `全体 ${owned}/${total} (${rate}%)`;

  summary.children[1].textContent =
    `[ノーマルカラー ${s.normalOwned}/${s.normalTotal} , ` +
    `アナザー ${s.anotherOwned}/${s.anotherTotal}]`;
}

function renderCounts() {
  groupCache.forEach((cache, method) => {
    const state = counterState.groups.get(method);
    cache.groupNormal.textContent = `${getIcon(state.normalOwned, state.normalTotal)} ${state.normalOwned}/${state.normalTotal}`;
    cache.groupAnother.textContent = `（${getIcon(state.anotherOwned, state.anotherTotal)} ${state.anotherOwned}/${state.anotherTotal}）`;

    state.subs.forEach((subState, subMethod) => {
      const el = cache.subCountMap.get(subMethod);
      el.normal.textContent = `${getIcon(subState.normalOwned, subState.normalTotal)} ${subState.normalOwned}/${subState.normalTotal}`;
      el.another.textContent = `（${getIcon(subState.anotherOwned, subState.anotherTotal)} ${subState.anotherOwned}/${subState.anotherTotal}）`;
    });
  });

  const s = counterState.summary;

  const owned = s.normalOwned + s.anotherOwned;
  const total = s.normalTotal + s.anotherTotal;
  const rate = total ? Math.floor((owned / total) * 100) : 0;

  summary.children[0].textContent =
    `全体 ${owned}/${total} (${rate}%)`;

  summary.children[1].textContent =
    `[ノーマルカラー ${s.normalOwned}/${s.normalTotal} , ` +
    `アナザー ${s.anotherOwned}/${s.anotherTotal}]`;
}

/* ===== URL読み込み・共有 ===== */
function loadFromURL() {
  const params = new URLSearchParams(location.search);
  const compressed = params.get("s");
  if (!compressed || compressed.length > 2000) return;

  try {
    const newOwned = new Set();
    const decoded = LZString.decompressFromEncodedURIComponent(compressed);
    if (!decoded) return;
    const binary = atob(decoded);
    let bitIndex = 0;
    for (let i = 0; i < binary.length; i++) {
      const byte = binary.charCodeAt(i);
      for (let b = 7; b >= 0; b--) {
        if (bitIndex >= allItemIds.length) break;
        if ((byte >> b) & 1) newOwned.add(allItemIds[bitIndex]);
        bitIndex++;
      }
    }

    ownedItems = newOwned;
    saveOwnedItems();

    container.querySelectorAll(".item").forEach(el => el.classList.toggle("selected", ownedItems.has(el.dataset.id)));

    counterState.summary.normalOwned = 0;
    counterState.summary.anotherOwned = 0;

    counterState.groups.forEach(group => {
      group.normalOwned = 0;
      group.anotherOwned = 0;
      group.subs.forEach(sub => {
        sub.normalOwned = 0;
        sub.anotherOwned = 0;
      });
    });

    ownedItems.forEach(id => {
      const meta = itemMetaMap.get(id);
      if (!meta) return;
      const { method, subMethod, color } = meta;
      const group = counterState.groups.get(method);
      const sub = group.subs.get(subMethod);
      if (color === "normal") { sub.normalOwned++; group.normalOwned++; counterState.summary.normalOwned++; }
      if (color === "another") { sub.anotherOwned++; group.anotherOwned++; counterState.summary.anotherOwned++; }
    });

    renderCounts();
  } catch {
    console.warn("URLデータ読み込み失敗");
  }
}

function generateShareURL() {
  let binary = "";
  for (let i = 0; i < allItemIds.length; i += 8) {
    let byte = 0;
    for (let b = 0; b < 8; b++) {
      if (i + b >= allItemIds.length) break;
      if (ownedItems.has(allItemIds[i + b])) byte |= 1 << (7 - b);
    }
    binary += String.fromCharCode(byte);
  }
  const base64 = btoa(binary);
  return `${location.origin}${location.pathname}?s=${LZString.compressToEncodedURIComponent(base64)}`;
}

document.getElementById("shareBtn").addEventListener("click", () => {
  const url = generateShareURL();
  const s = counterState.summary;

  const owned = s.normalOwned + s.anotherOwned;
  const total = s.normalTotal + s.anotherTotal;
  const rate = total ? Math.floor((owned / total) * 100) : 0;

  const text =
    `コーデパーツ所持状況\n ` +
    `全体 ${owned}/${total} (${rate}%) \n` +
    `[ノーマルカラー ${s.normalOwned}/${s.normalTotal} , ` +
    `アナザーカラー ${s.anotherOwned}/${s.anotherTotal}]`;

  const shareUrl =
    "https://x.com/intent/tweet?text=" +
    encodeURIComponent(text + " " + url);

  window.open(shareUrl, "_blank");
});

/* ===== 初期化 ===== */
async function init() {
  try {
    const res = await fetch("items.csv", { cache: "no-store" });
    if (!res.ok) throw new Error("CSV取得失敗");
    const text = await res.text();
    const data = parseCSV(text);
    render(data);
  } catch (err) {
    console.error(err);
    container.textContent = "データ読み込みに失敗しました";
  }

  getSummarySpans();
  loadFromURL();
  renderCounts();
}

/* ===== イベント委任 ===== */
container.addEventListener("click", e => {
  const toggleBtn = e.target.closest(".toggle-all");
  if (toggleBtn) {
    const group = toggleBtn.closest(".group");
    const method = group.dataset.method;
    const subs = groupSubCache.get(method);
    const anyOpen = [...subs].some(sub => !sub.classList.contains("collapsed"));

    subs.forEach(sub => {
      sub.classList.toggle("collapsed", anyOpen);
      const key = `subGroupState_${encodeURIComponent(method)}_${encodeURIComponent(sub.dataset.subMethod)}`;
      localStorage.setItem(key, anyOpen.toString());
    });

    toggleBtn.textContent = anyOpen ? "▼ すべて開く" : "▲ すべて閉じる";
    return;
  }

  const item = e.target.closest(".item");
  if (!item) return;
  const id = item.dataset.id;
  item.classList.toggle("selected");

  if (item.classList.contains("selected")) ownedItems.add(id);
  else ownedItems.delete(id);

  saveOwnedItems();
  updateCountsForItem(id, item.classList.contains("selected"));
});

init();