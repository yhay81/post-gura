import { countByYear, filterPosts, parseArchiveFiles, postsToCsv } from "./archive-core.js";

const byId = (id) => document.getElementById(id);
const fileInput = byId("archive-files");
const fileDrop = byId("file-drop");
const importPanel = byId("import-panel");
const importStatus = byId("import-status");
const workspace = byId("search-workspace");
const queryInput = byId("search-query");
const kindFilter = byId("kind-filter");
const dateFrom = byId("date-from");
const dateTo = byId("date-to");
const sortOrder = byId("sort-order");
const yearBars = byId("year-bars");
const resultList = byId("result-list");
const resultCount = byId("result-count");
const loadMoreButton = byId("load-more");
const workspaceStatus = byId("workspace-status");
const openSavedButton = byId("open-saved");
const savedSummary = byId("saved-summary");

const state = {
  archiveName: "",
  filtered: [],
  posts: [],
  selectedYear: "",
  visible: 50,
};

const kindLabels = {
  bookmark: "ブックマーク",
  like: "いいね",
  note: "長文投稿",
  post: "投稿",
  reply: "返信",
  repost: "リポスト",
};

const telemetryKey = "post-gura.telemetry-session";
const visitKey = "post-gura.last-visit";
const databaseName = "post-gura";
const databaseStore = "archives";
const savedArchiveKey = "current";

const currentJstDay = () =>
  new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Tokyo",
    year: "numeric",
  }).format(new Date());

const telemetrySession = () => {
  try {
    const stored = localStorage.getItem(telemetryKey);
    if (stored) return stored;
    const created = crypto.randomUUID();
    localStorage.setItem(telemetryKey, created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
};

const sessionId = telemetrySession();

const sendTelemetry = (name) => {
  const automated = navigator.webdriver || new URL(location.href).searchParams.get("qa") === "1";
  void fetch("/api/telemetry", {
    body: JSON.stringify({ name, sessionId }),
    headers: {
      "content-type": "application/json",
      ...(automated ? { "x-automated-qa": "1" } : {}),
    },
    keepalive: true,
    method: "POST",
  }).catch(() => {});
};

const recordVisit = () => {
  const today = currentJstDay();
  try {
    const previous = localStorage.getItem(visitKey);
    sendTelemetry("visited");
    if (previous && previous !== today) sendTelemetry("returned");
    localStorage.setItem(visitKey, today);
  } catch {
    sendTelemetry("visited");
  }
};

const openDatabase = () =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(databaseStore)) {
        request.result.createObjectStore(databaseStore);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("local_database_failed"));
  });

const withStore = async (mode, run) => {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(databaseStore, mode);
      const store = transaction.objectStore(databaseStore);
      const request = run(store);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("local_store_failed"));
    });
  } finally {
    database.close();
  }
};

const getSavedArchive = () => withStore("readonly", (store) => store.get(savedArchiveKey));
const saveArchive = (value) => withStore("readwrite", (store) => store.put(value, savedArchiveKey));
const deleteArchive = () => withStore("readwrite", (store) => store.delete(savedArchiveKey));

const formatDate = (iso) => {
  if (!iso) return "日付なし";
  return new Intl.DateTimeFormat("ja-JP", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Tokyo",
    year: "numeric",
  }).format(new Date(iso));
};

const archiveRange = (posts) => {
  const dated = posts
    .map((post) => post.createdAt)
    .filter(Boolean)
    .sort();
  if (dated.length === 0) return "日付情報のない項目";
  const earliest = new Intl.DateTimeFormat("ja-JP", {
    month: "short",
    year: "numeric",
  }).format(new Date(dated[0]));
  const latest = new Intl.DateTimeFormat("ja-JP", {
    month: "short",
    year: "numeric",
  }).format(new Date(dated.at(-1)));
  return `${earliest} — ${latest}`;
};

const setText = (id, value) => {
  const node = byId(id);
  if (node) node.textContent = String(value);
};

const countKinds = (posts) => {
  const counters = { bookmark: 0, like: 0, post: 0 };
  for (const post of posts) {
    if (post.kind === "like") counters.like += 1;
    else if (post.kind === "bookmark") counters.bookmark += 1;
    else counters.post += 1;
  }
  return counters;
};

const queryWords = () =>
  String(queryInput.value).normalize("NFKC").trim().split(/\s+/).filter(Boolean);

const appendHighlighted = (container, text, words) => {
  if (words.length === 0) {
    container.textContent = text;
    return;
  }
  const normalized = text.normalize("NFKC").toLocaleLowerCase("ja-JP");
  const ranges = [];
  for (const word of words) {
    const needle = word.normalize("NFKC").toLocaleLowerCase("ja-JP");
    if (!needle) continue;
    let start = 0;
    while (start < normalized.length) {
      const index = normalized.indexOf(needle, start);
      if (index < 0) break;
      ranges.push([index, index + needle.length]);
      start = index + Math.max(needle.length, 1);
    }
  }
  ranges.sort((left, right) => left[0] - right[0]);
  const merged = [];
  for (const range of ranges) {
    const previous = merged.at(-1);
    if (previous && range[0] <= previous[1]) previous[1] = Math.max(previous[1], range[1]);
    else merged.push([...range]);
  }
  let cursor = 0;
  for (const [start, end] of merged) {
    if (start > cursor) container.append(document.createTextNode(text.slice(cursor, start)));
    const mark = document.createElement("mark");
    mark.textContent = text.slice(start, end);
    container.append(mark);
    cursor = end;
  }
  if (cursor < text.length) container.append(document.createTextNode(text.slice(cursor)));
};

const renderResults = () => {
  resultList.replaceChildren();
  const visible = state.filtered.slice(0, state.visible);
  const words = queryWords();
  if (visible.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-results";
    const icon = document.createElement("span");
    icon.setAttribute("aria-hidden", "true");
    const strong = document.createElement("strong");
    strong.textContent = "該当する札がありません";
    const paragraph = document.createElement("p");
    paragraph.textContent = "語句を減らすか、日付と種類の条件を戻してみてください。";
    empty.append(icon, strong, paragraph);
    resultList.append(empty);
  }
  for (const post of visible) {
    const article = document.createElement("article");
    article.className = `result-card kind-${post.kind}`;
    const head = document.createElement("header");
    const kind = document.createElement("span");
    kind.className = "kind-chip";
    kind.textContent = kindLabels[post.kind] ?? post.kind;
    const time = document.createElement("time");
    time.dateTime = post.createdAt ?? "";
    time.textContent = formatDate(post.createdAt);
    head.append(kind, time);
    const text = document.createElement("p");
    appendHighlighted(text, post.text, words);
    article.append(head, text);
    if (post.url) {
      const link = document.createElement("a");
      link.href = post.url;
      link.rel = "noopener noreferrer";
      link.target = "_blank";
      link.textContent = "Xで開く";
      article.append(link);
    }
    resultList.append(article);
  }
  resultCount.textContent = state.filtered.length.toLocaleString("ja-JP");
  loadMoreButton.hidden = state.visible >= state.filtered.length;
};

const renderYears = () => {
  yearBars.replaceChildren();
  const counts = countByYear(state.posts);
  const maximum = Math.max(...counts.map(([, count]) => count), 1);
  for (const [year, count] of counts) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.year = year === "日付なし" ? "" : year;
    if (state.selectedYear === button.dataset.year && state.selectedYear) {
      button.classList.add("active");
    }
    button.setAttribute(
      "aria-pressed",
      String(Boolean(state.selectedYear === button.dataset.year)),
    );
    button.style.setProperty("--bar", `${Math.max(8, Math.round((count / maximum) * 100))}%`);
    const bar = document.createElement("i");
    const label = document.createElement("span");
    label.textContent = year;
    const value = document.createElement("b");
    value.textContent = count.toLocaleString("ja-JP");
    button.append(bar, label, value);
    yearBars.append(button);
  }
};

let searchTelemetryTimer;
const applyFilters = (recordSearch = false) => {
  state.filtered = filterPosts(state.posts, {
    dateFrom: dateFrom.value,
    dateTo: dateTo.value,
    kind: kindFilter.value,
    query: queryInput.value,
    sort: sortOrder.value,
    year: state.selectedYear,
  });
  state.visible = 50;
  renderResults();
  renderYears();
  if (
    recordSearch &&
    (queryInput.value.trim() ||
      kindFilter.value !== "all" ||
      dateFrom.value ||
      dateTo.value ||
      state.selectedYear)
  ) {
    clearTimeout(searchTelemetryTimer);
    searchTelemetryTimer = setTimeout(() => sendTelemetry("search_used"), 600);
  }
};

const setArchive = (payload, archiveName, source) => {
  state.posts = payload.posts;
  state.archiveName = archiveName;
  state.selectedYear = "";
  queryInput.value = "";
  kindFilter.value = "all";
  dateFrom.value = "";
  dateTo.value = "";
  sortOrder.value = "newest";
  const counts = countKinds(payload.posts);
  setText("archive-name", archiveName);
  setText("archive-range", archiveRange(payload.posts));
  setText("post-count", counts.post.toLocaleString("ja-JP"));
  setText("like-count", counts.like.toLocaleString("ja-JP"));
  setText("bookmark-count", counts.bookmark.toLocaleString("ja-JP"));
  workspace.hidden = false;
  importPanel.classList.add("compact");
  importPanel.querySelector("header").hidden = true;
  fileDrop.querySelector("strong").textContent = "別のアーカイブを選ぶ";
  applyFilters();
  workspace.scrollIntoView({ behavior: "smooth", block: "start" });
  if (source === "saved") sendTelemetry("local_copy_opened");
  else sendTelemetry("archive_opened");
};

const handleFiles = async (files) => {
  const selected = [...files];
  if (selected.length === 0) return;
  fileDrop.classList.add("busy");
  fileInput.disabled = true;
  importStatus.className = "action-status";
  importStatus.textContent = "ZIPの索引を確認しています…";
  try {
    const parsed = await parseArchiveFiles(selected, (message) => {
      importStatus.textContent = message;
    });
    const archiveName =
      selected.length === 1
        ? selected[0].name.replace(/\.(zip|js|json)$/i, "")
        : "選択したファイル";
    setArchive(parsed, archiveName, "file");
    const warning =
      parsed.warnings.length > 0 ? ` ${parsed.warnings.length}件は読み飛ばしました。` : "";
    const ignored =
      parsed.ignoredEntries > 0
        ? ` 対象外の${parsed.ignoredEntries.toLocaleString("ja-JP")}ファイルは開いていません。`
        : "";
    importStatus.textContent = `${parsed.posts.length.toLocaleString("ja-JP")}件を開きました。${ignored}${warning}`;
    importStatus.classList.add("success");
  } catch (error) {
    importStatus.textContent =
      error instanceof Error ? error.message : "アーカイブを開けませんでした。";
    importStatus.classList.add("error");
  } finally {
    fileDrop.classList.remove("busy");
    fileInput.disabled = false;
    fileInput.value = "";
  }
};

const download = (contents, type, filename) => {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

fileInput.addEventListener("change", () => void handleFiles(fileInput.files ?? []));
for (const eventName of ["dragenter", "dragover"]) {
  fileDrop.addEventListener(eventName, (event) => {
    event.preventDefault();
    fileDrop.classList.add("dragging");
  });
}
for (const eventName of ["dragleave", "drop"]) {
  fileDrop.addEventListener(eventName, (event) => {
    event.preventDefault();
    fileDrop.classList.remove("dragging");
  });
}
fileDrop.addEventListener("drop", (event) => {
  if (event.dataTransfer?.files) void handleFiles(event.dataTransfer.files);
});

for (const control of [queryInput, kindFilter, dateFrom, dateTo, sortOrder]) {
  control.addEventListener(control === queryInput ? "input" : "change", () => applyFilters(true));
}

yearBars.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-year]");
  if (!button) return;
  state.selectedYear = state.selectedYear === button.dataset.year ? "" : button.dataset.year;
  applyFilters(true);
});

byId("clear-filters").addEventListener("click", () => {
  queryInput.value = "";
  kindFilter.value = "all";
  dateFrom.value = "";
  dateTo.value = "";
  sortOrder.value = "newest";
  state.selectedYear = "";
  applyFilters();
  queryInput.focus();
});

loadMoreButton.addEventListener("click", () => {
  state.visible += 50;
  renderResults();
});

document.querySelector(".export-actions").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-export]");
  if (!button || state.filtered.length === 0) return;
  const date = currentJstDay().replaceAll("-", "");
  if (button.dataset.export === "csv") {
    download(postsToCsv(state.filtered), "text/csv;charset=utf-8", `post-gura-${date}.csv`);
  } else if (button.dataset.export === "json") {
    download(
      JSON.stringify(state.filtered, null, 2),
      "application/json;charset=utf-8",
      `post-gura-${date}.json`,
    );
  } else {
    window.print();
  }
  sendTelemetry("exported");
});

byId("save-local").addEventListener("click", async () => {
  workspaceStatus.className = "action-status";
  workspaceStatus.textContent = "この端末へ保存しています…";
  try {
    await saveArchive({
      archiveName: state.archiveName,
      posts: state.posts,
      savedAt: new Date().toISOString(),
      version: 1,
    });
    workspaceStatus.textContent = "このブラウザへ保存しました。";
    workspaceStatus.classList.add("success");
    sendTelemetry("saved_locally");
    await refreshSavedCopy();
  } catch {
    workspaceStatus.textContent =
      "端末へ保存できませんでした。空き容量やブラウザ設定を確認してください。";
    workspaceStatus.classList.add("error");
  }
});

byId("clear-archive").addEventListener("click", async () => {
  const confirmed = window.confirm(
    "開いているアーカイブと、この端末に保存した作業用コピーを消しますか？元のZIPは消えません。",
  );
  if (!confirmed) return;
  try {
    await deleteArchive();
  } catch {
    // The in-memory workspace can still be cleared.
  }
  state.posts = [];
  state.filtered = [];
  state.selectedYear = "";
  workspace.hidden = true;
  importPanel.classList.remove("compact");
  importPanel.querySelector("header").hidden = false;
  fileDrop.querySelector("strong").textContent = "アーカイブを選ぶ";
  importStatus.textContent = "作業用コピーを消しました。元のZIPは変更していません。";
  importStatus.className = "action-status success";
  sendTelemetry("cleared");
  await refreshSavedCopy();
  importPanel.scrollIntoView({ behavior: "smooth", block: "center" });
});

openSavedButton.addEventListener("click", async () => {
  openSavedButton.disabled = true;
  importStatus.textContent = "この端末の保存分を開いています…";
  try {
    const saved = await getSavedArchive();
    if (!saved?.posts?.length) throw new Error("saved_archive_missing");
    setArchive(saved, saved.archiveName || "この端末の保存分", "saved");
    importStatus.textContent = `${saved.posts.length.toLocaleString("ja-JP")}件を開きました。`;
    importStatus.className = "action-status success";
  } catch {
    importStatus.textContent = "保存分を開けませんでした。";
    importStatus.className = "action-status error";
  } finally {
    openSavedButton.disabled = false;
  }
});

const refreshSavedCopy = async () => {
  try {
    const saved = await getSavedArchive();
    const valid = Boolean(saved?.posts?.length);
    openSavedButton.hidden = !valid;
    if (valid) {
      const date = new Intl.DateTimeFormat("ja-JP", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(new Date(saved.savedAt));
      savedSummary.textContent = `${saved.posts.length.toLocaleString("ja-JP")}件・${date}保存`;
    }
  } catch {
    openSavedButton.hidden = true;
  }
};

document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k" && !workspace.hidden) {
    event.preventDefault();
    queryInput.focus();
  }
});

recordVisit();
void refreshSavedCopy();
