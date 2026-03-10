const STORAGE_KEY = "codeParts_ownedItems_v1";
const container = document.getElementById("container");

let ownedItems;

try {
  ownedItems = new Set(
    JSON.parse(localStorage.getItem(STORAGE_KEY)) || []
  );
} catch {
  ownedItems = new Set();
}

const groupCache = new Map();

let allItemIds = [];
let idSet = new Set();

/* ===== URL読み込み ===== */

function loadFromURL() {

  const params = new URLSearchParams(location.search);
  const compressed = params.get("s");

  if (!compressed || compressed.length > 5000) return;

  try {

    const base64 = LZString.decompressFromEncodedURIComponent(compressed);
    if (!base64) return;

    const binary = atob(base64);

    const ids = allItemIds;
    const newOwned = new Set();

    let bitIndex = 0;

    outer:
    for (let i = 0; i < binary.length; i++) {

      const byte = binary.charCodeAt(i);

      for (let b = 7; b >= 0; b--) {

        if (bitIndex >= ids.length) break outer;

        if ((byte >> b) & 1) {
          newOwned.add(ids[bitIndex]);
        }

        bitIndex++;

      }

    }

    ownedItems = newOwned;
    saveOwnedItems();

    document.querySelectorAll(".item").forEach(el => {
      const id = el.dataset.id;
      el.classList.toggle("selected", ownedItems.has(id));
    });

    updateAllCounts();

  } catch {
    console.warn("URLデータ読み込み失敗");
  }

}

/* ===== URL共有 ===== */

function generateShareURL() {

  let binary = "";

  for (let i = 0; i < allItemIds.length; i += 8) {

    let byte = 0;

    for (let b = 0; b < 8; b++) {

      const id = allItemIds[i + b];
      if (!id) break;

      if (ownedItems.has(id)) {
        byte |= 1 << (7 - b);
      }

    }

    binary += String.fromCharCode(byte);

  }

  const base64 = btoa(binary);

  const compressed = LZString.compressToEncodedURIComponent(base64);

  return `${location.origin}${location.pathname}?s=${compressed}`;

}

document.getElementById("shareBtn").addEventListener("click", async () => {

  const url = generateShareURL();

  try {

    await navigator.clipboard.writeText(url);
    alert("共有URLをコピーしました");

  } catch {

    prompt("URLをコピーしてください", url);

  }

});

/* ===== 保存 ===== */

function saveOwnedItems() {

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify([...ownedItems])
  );

}

/* ===== CSVパース ===== */

function parseLine(line) {

  const result = [];
  let current = "";
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {

    const char = line[i];

    if (char === '"') {

      if (insideQuotes && line[i + 1] === '"') {

        current += '"';
        i++;

      } else {

        insideQuotes = !insideQuotes;

      }

    } else if (char === "," && !insideQuotes) {

      result.push(current);
      current = "";

    } else {

      current += char;

    }

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

    headers.forEach((header, index) => {

      item[header.trim()] = values[index]?.trim() || "";

    });

    const { id, method, subMethod, detail, color, image } = item;

    if (!id || !method || !subMethod || !detail) continue;

    if (color !== "normal" && color !== "another") continue;

    grouped[method] ??= {};
    grouped[method][subMethod] ??= {};
    grouped[method][subMethod][detail] ??= [];

    grouped[method][subMethod][detail].push({
      id,
      color,
      image
    });

  }

  return grouped;

}


/* ===== 描画 ===== */

function render(grouped) {

  allItemIds = [];
  idSet.clear();
  groupCache.clear();

  const fragment = document.createDocumentFragment();

  for (const [method, methodData] of Object.entries(grouped)) {

    const group = document.createElement("div");
    group.className = "group";

    const groupInner = document.createElement("div");
    groupInner.className = "group-inner";

    const groupTitle = document.createElement("div");
    groupTitle.className = "group-title";

    const titleLeft = document.createElement("div");
    titleLeft.className = "group-title-left";

    const titleText = document.createElement("span");
    titleText.className = "group-name";
    titleText.textContent = method;

    const groupCount = document.createElement("div");
    groupCount.className = "group-count";

    titleLeft.append(titleText);
    groupTitle.append(titleLeft, groupCount);

    groupInner.append(groupTitle);

    /* ===== 折り畳み ===== */

    const groupStorageKey = `groupState_${encodeURIComponent(method)}`;

    const savedState = localStorage.getItem(groupStorageKey);

    if (savedState === null || savedState === "true") {
      group.classList.add("collapsed");
    }

    groupTitle.addEventListener("click", () => {

      const before = group.getBoundingClientRect().top;

      group.classList.toggle("collapsed");

      requestAnimationFrame(() => {

        const after = group.getBoundingClientRect().top;
        window.scrollBy(0, after - before);

      });

      localStorage.setItem(
        groupStorageKey,
        group.classList.contains("collapsed")
      );

    });

    const subCountMap = new Map();

    groupCache.set(method, {
      methodData,
      groupCount,
      subCountMap
    });

    for (const subMethod in methodData) {

      const subGroup = document.createElement("div");
      subGroup.className = "sub-group";

      const subTitle = document.createElement("div");
      subTitle.className = "sub-group-title";

      const subText = document.createElement("span");
      subText.textContent = subMethod;

      const subCount = document.createElement("span");
      subCount.className = "group-count sub-count";

      subTitle.append(subText, subCount);

      /* ===== 中グループ折り畳み ===== */

      const subStorageKey =
        "subGroupState_" +
        encodeURIComponent(method) +
        "_" +
        encodeURIComponent(subMethod);

      const savedSubState = localStorage.getItem(subStorageKey);

      if (savedSubState === null || savedSubState === "true") {
        subGroup.classList.add("collapsed");
      }

      subTitle.addEventListener("click", () => {

        const before = subGroup.getBoundingClientRect().top;

        subGroup.classList.toggle("collapsed");

        requestAnimationFrame(() => {

          const after = subGroup.getBoundingClientRect().top;
          window.scrollBy(0, after - before);

        });

        localStorage.setItem(
          subStorageKey,
          subGroup.classList.contains("collapsed")
        );

      });

      subCountMap.set(subMethod, subCount);

      const subInner = document.createElement("div");
      subInner.className = "sub-group-inner";

      subGroup.append(subTitle);

      for (const detail in methodData[subMethod]) {

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

        methodData[subMethod][detail].forEach(item => {

          if (!idSet.has(item.id)) {
            idSet.add(item.id);
            allItemIds.push(item.id);
          }

          const div = document.createElement("div");
          div.className = `item color-${item.color}`;
          div.dataset.id = item.id;

          if (ownedItems.has(item.id)) {
            div.classList.add("selected");
          }

          const inner = document.createElement("div");
          inner.className = "item-inner";

          const img = document.createElement("img");

          img.dataset.src = item.image || "img/noimage.png";
          img.classList.add("lazy-img");

          img.onerror = () => {
            img.src = "img/noimage.png";
          };

          inner.append(img);
          div.append(inner);

          itemsDiv.append(div);

        });

        detailGroup.append(itemsDiv);
        subInner.append(detailGroup);

      }

      subGroup.append(subInner);
      groupInner.append(subGroup);

    }

    group.append(groupInner);
    fragment.append(group);

  }

  container.textContent = "";
  container.append(fragment);

  setupLazyImages();

}

let imageObserver;

function setupLazyImages() {

  if (imageObserver) imageObserver.disconnect();

  imageObserver = new IntersectionObserver((entries, obs) => {

    entries.forEach(entry => {

      if (!entry.isIntersecting) return;

      const img = entry.target;

      if (img.dataset.src) {
        img.src = img.dataset.src;
      } else {
        img.src = "img/noimage.png";
      }

      obs.unobserve(img);

    });

  }, { root: null, rootMargin: "400px" });

  document.querySelectorAll(".lazy-img")
    .forEach(img => imageObserver.observe(img));
}

/* ===== カウント更新 ===== */

let updateScheduled = false;

function updateAllCounts() {

  if (updateScheduled) return;
  updateScheduled = true;

  requestAnimationFrame(() => {

    updateScheduled = false;

    groupCache.forEach((cache, method) => {

      const { methodData, groupCount, subCountMap } = cache;

      let normalOwned = 0;
      let normalTotal = 0;
      let anotherOwned = 0;
      let anotherTotal = 0;

      for (const subMethod in methodData) {

        let sn = 0;
        let st = 0;
        let an = 0;
        let at = 0;

        for (const detail in methodData[subMethod]) {

          methodData[subMethod][detail].forEach(item => {

            if (item.color === "normal") {

              st++;
              normalTotal++;

              if (ownedItems.has(item.id)) {
                sn++;
                normalOwned++;
              }

            }

            if (item.color === "another") {

              at++;
              anotherTotal++;

              if (ownedItems.has(item.id)) {
                an++;
                anotherOwned++;
              }

            }

          });

        }

        const el = subCountMap.get(subMethod);

        const normalIcon = sn === st && st !== 0 ? "■" : "□";
        const anotherIcon = an === at && at !== 0 ? "■" : "□";

        el.innerHTML = `
<span class="color-count">${normalIcon} ${sn}/${st}</span>
<span class="color-count">（${anotherIcon} ${an}/${at}）</span>
`;

      }

      const groupNormalIcon =
        normalOwned === normalTotal && normalTotal !== 0 ? "■" : "□";

      const groupAnotherIcon =
        anotherOwned === anotherTotal && anotherTotal !== 0 ? "■" : "□";

      groupCount.innerHTML = `
<div class="color-count">${groupNormalIcon} ${normalOwned}/${normalTotal}</div>
<div class="color-count">（${groupAnotherIcon} ${anotherOwned}/${anotherTotal}）</div>
`;

    });

  });

}

/* ===== イベント委任 ===== */

container.addEventListener("click", e => {

  const item = e.target.closest(".item");
  if (!item) return;

  const id = item.dataset.id;

  item.classList.toggle("selected");

  if (item.classList.contains("selected")) {
    ownedItems.add(id);
  } else {
    ownedItems.delete(id);
  }

  saveOwnedItems();
  updateAllCounts();

});

/* ===== 初期化 ===== */

async function init() {

  try {

    const res = await fetch("items.csv", { cache: "no-store" })

    if (!res.ok) throw new Error("CSV取得失敗");

    const text = await res.text();
    const data = parseCSV(text);

    render(data);

  } catch (err) {

    console.error(err);
    container.textContent = "データ読み込みに失敗しました";

  }

  loadFromURL();
  updateAllCounts();

}

init();