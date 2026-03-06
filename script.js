const STORAGE_KEY = "codeParts_ownedItems_v1";
const container = document.getElementById("container");

let ownedItems = new Set(
  JSON.parse(localStorage.getItem(STORAGE_KEY)) || []
);

const itemMap = new Map();
const groupCache = new Map();

let groupedData;

/* ===== URL読み込み ===== */

function loadFromURL() {

  const params = new URLSearchParams(location.search);
  const data = params.get("data");

  if (!data) return;

  try {

    const decoded = atob(data);
    const ids = decoded.split(",");

    ownedItems = new Set(ids);
    saveOwnedItems();

  } catch {

    console.warn("URLデータ読み込み失敗");

  }

}

/* ===== URL共有 ===== */

function generateShareURL() {

  const ids = [...ownedItems];
  const encoded = btoa(JSON.stringify(ids));

  return `${location.origin}${location.pathname}?data=${encoded}`;

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
    const item = {};

    headers.forEach((header, index) => {

      item[header.trim()] = values[index]?.trim() || "";

    });

    const { id, method, subMethod, detail, color, image } = item;

    if (!method || !subMethod || !detail) continue;

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

/* ===== カウント ===== */

function calculateCounts(methodData) {

  let normalTotal = 0;
  let anotherTotal = 0;

  for (const subMethod in methodData) {

    for (const detail in methodData[subMethod]) {

      methodData[subMethod][detail].forEach(item => {

        if (item.color === "normal") normalTotal++;
        if (item.color === "another") anotherTotal++;

      });

    }

  }

  return { normalTotal, anotherTotal };

}

/* ===== 描画 ===== */

function render(grouped) {

  groupedData = grouped;

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

    titleLeft.append(titleText, groupCount);
    groupTitle.append(titleLeft);

    groupInner.append(groupTitle);

    /* ===== 折り畳み ===== */

const groupStorageKey = "groupState_" + method;

if (localStorage.getItem(groupStorageKey) === "true") {
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

const subStorageKey = "subGroupState_" + method + "_" + subMethod;

if (localStorage.getItem(subStorageKey) === "true") {
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

        const detailTitle = document.createElement("div");
        detailTitle.className = "detail-title";
        detailTitle.textContent = detail;

        const itemsDiv = document.createElement("div");
        itemsDiv.className = "items";

        methodData[subMethod][detail].forEach(item => {

          const div = document.createElement("div");
          div.className = `item color-${item.color}`;
          div.dataset.id = item.id;

          if (ownedItems.has(item.id)) {
            div.classList.add("selected");
          }

          const inner = document.createElement("div");
          inner.className = "item-inner";

          const img = document.createElement("img");

          img.src = item.image;
          img.loading = "lazy";

          img.onerror = () => {
            img.src = "img/noimage.png";
          };

          inner.append(img);
          div.append(inner);

          itemMap.set(item.id, div);

          itemsDiv.append(div);

        });

        detailGroup.append(detailTitle, itemsDiv);
        subInner.append(detailGroup);

      }

      subGroup.append(subInner);
      groupInner.append(subGroup);

    }

    group.append(groupInner);
    fragment.append(group);

  }

  container.append(fragment);

  updateAllCounts();

}

/* ===== カウント更新 ===== */

function updateAllCounts() {

  requestAnimationFrame(() => {

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

        el.innerHTML = `
<span class="color-count normal">□ ${sn}/${st}</span>
<span class="color-count another">（□ ${an}/${at}）</span>
`;

      }

      groupCount.innerHTML = `
<div class="color-count normal">□ ${normalOwned}/${normalTotal}</div>
<div class="color-count another">（□ ${anotherOwned}/${anotherTotal}）</div>
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

  loadFromURL();

  try {

    const res = await fetch("items.csv");

    if (!res.ok) throw new Error("CSV取得失敗");

    const text = await res.text();
    const data = parseCSV(text);

    render(data);

  } catch (err) {

    console.error(err);
    container.textContent = "データ読み込みに失敗しました";

  }

}

init();