const textDecoder = new TextDecoder("utf-8");
const MAX_CENTRAL_DIRECTORY_BYTES = 64 * 1024 * 1024;
const MAX_SELECTED_TEXT_BYTES = 256 * 1024 * 1024;
const MAX_ENTRY_COUNT = 250_000;
const ZIP_EOCD_SIGNATURE = 0x06054b50;
const ZIP64_EOCD_SIGNATURE = 0x06064b50;
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50;
const CENTRAL_ENTRY_SIGNATURE = 0x02014b50;
const LOCAL_ENTRY_SIGNATURE = 0x04034b50;

const supportedNamePattern =
  /(?:^|\/)(?:data\/)?(?:tweets?(?:-part\d+)?|deleted-tweets?(?:-part\d+)?|likes?|bookmarks?|note-tweets?)\.(?:js|json)$/i;

const asSafeNumber = (value, label) => {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${label}が大きすぎるため、このブラウザでは開けません。`);
  }
  return Number(value);
};

const getUint64 = (view, offset) => {
  const low = BigInt(view.getUint32(offset, true));
  const high = BigInt(view.getUint32(offset + 4, true));
  return (high << 32n) | low;
};

const normalizeFileName = (name) => name.replaceAll("\\", "/").replace(/^\.?\//, "");

export const isSupportedArchiveFile = (name) => supportedNamePattern.test(normalizeFileName(name));

export const isZipFile = (file) =>
  file.type === "application/zip" || file.name.toLowerCase().endsWith(".zip");

const findSignatureBackwards = (view, signature, from = view.byteLength - 4) => {
  for (let offset = from; offset >= 0; offset -= 1) {
    if (view.getUint32(offset, true) === signature) return offset;
  }
  return -1;
};

const readZip64DirectoryInfo = async (blob, eocdAbsoluteOffset) => {
  if (eocdAbsoluteOffset < 20) throw new Error("ZIP64の索引情報が見つかりません。");
  const locatorBuffer = await blob.slice(eocdAbsoluteOffset - 20, eocdAbsoluteOffset).arrayBuffer();
  const locator = new DataView(locatorBuffer);
  if (locator.getUint32(0, true) !== ZIP64_LOCATOR_SIGNATURE) {
    throw new Error("ZIP64の索引情報が見つかりません。");
  }
  const recordOffset = asSafeNumber(getUint64(locator, 8), "ZIP64の位置");
  const recordBuffer = await blob.slice(recordOffset, recordOffset + 56).arrayBuffer();
  if (recordBuffer.byteLength < 56) throw new Error("ZIP64の索引情報が途中で切れています。");
  const record = new DataView(recordBuffer);
  if (record.getUint32(0, true) !== ZIP64_EOCD_SIGNATURE) {
    throw new Error("ZIP64の索引情報を確認できません。");
  }
  return {
    centralDirectoryOffset: asSafeNumber(getUint64(record, 48), "ZIP64の索引位置"),
    centralDirectorySize: asSafeNumber(getUint64(record, 40), "ZIP64の索引サイズ"),
    entryCount: asSafeNumber(getUint64(record, 32), "ZIP64のファイル数"),
  };
};

const readDirectoryInfo = async (blob) => {
  if (blob.size < 22) throw new Error("ZIPファイルが途中で切れています。");
  const tailSize = Math.min(blob.size, 65_557);
  const tailStart = blob.size - tailSize;
  const tailBuffer = await blob.slice(tailStart).arrayBuffer();
  const tail = new DataView(tailBuffer);
  const eocdOffset = findSignatureBackwards(tail, ZIP_EOCD_SIGNATURE);
  if (eocdOffset < 0 || eocdOffset + 22 > tail.byteLength) {
    throw new Error("ZIPの索引を確認できません。");
  }
  const standard = {
    centralDirectoryOffset: tail.getUint32(eocdOffset + 16, true),
    centralDirectorySize: tail.getUint32(eocdOffset + 12, true),
    entryCount: tail.getUint16(eocdOffset + 10, true),
  };
  const needsZip64 =
    standard.entryCount === 0xffff ||
    standard.centralDirectoryOffset === 0xffffffff ||
    standard.centralDirectorySize === 0xffffffff;
  return needsZip64 ? readZip64DirectoryInfo(blob, tailStart + eocdOffset) : standard;
};

const readZip64EntryValues = (extraBytes, requested) => {
  const extra = new DataView(extraBytes.buffer, extraBytes.byteOffset, extraBytes.byteLength);
  let cursor = 0;
  while (cursor + 4 <= extra.byteLength) {
    const type = extra.getUint16(cursor, true);
    const size = extra.getUint16(cursor + 2, true);
    const valueStart = cursor + 4;
    if (valueStart + size > extra.byteLength) break;
    if (type === 0x0001) {
      let valueOffset = valueStart;
      const values = {};
      for (const key of requested) {
        if (valueOffset + 8 > valueStart + size) {
          throw new Error("ZIP64のファイル情報が途中で切れています。");
        }
        values[key] = asSafeNumber(getUint64(extra, valueOffset), `ZIP64の${key}`);
        valueOffset += 8;
      }
      return values;
    }
    cursor = valueStart + size;
  }
  throw new Error("ZIP64のファイル情報を確認できません。");
};

const readCentralEntries = async (blob) => {
  const info = await readDirectoryInfo(blob);
  if (info.entryCount > MAX_ENTRY_COUNT) {
    throw new Error("ZIP内のファイル数が多すぎます。");
  }
  if (info.centralDirectorySize > MAX_CENTRAL_DIRECTORY_BYTES) {
    throw new Error("ZIPの索引が大きすぎます。");
  }
  if (
    info.centralDirectoryOffset < 0 ||
    info.centralDirectorySize < 0 ||
    info.centralDirectoryOffset + info.centralDirectorySize > blob.size
  ) {
    throw new Error("ZIPの索引位置が正しくありません。");
  }
  const buffer = await blob
    .slice(info.centralDirectoryOffset, info.centralDirectoryOffset + info.centralDirectorySize)
    .arrayBuffer();
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const entries = [];
  let cursor = 0;
  for (let index = 0; index < info.entryCount; index += 1) {
    if (cursor + 46 > view.byteLength || view.getUint32(cursor, true) !== CENTRAL_ENTRY_SIGNATURE) {
      throw new Error("ZIPのファイル索引が途中で切れています。");
    }
    const flags = view.getUint16(cursor + 8, true);
    const method = view.getUint16(cursor + 10, true);
    let compressedSize = view.getUint32(cursor + 20, true);
    let uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    let localOffset = view.getUint32(cursor + 42, true);
    const end = cursor + 46 + nameLength + extraLength + commentLength;
    if (end > view.byteLength) throw new Error("ZIPのファイル名が途中で切れています。");
    const nameBytes = bytes.subarray(cursor + 46, cursor + 46 + nameLength);
    const name = normalizeFileName(textDecoder.decode(nameBytes));
    const extraBytes = bytes.subarray(
      cursor + 46 + nameLength,
      cursor + 46 + nameLength + extraLength,
    );
    const requested = [];
    if (uncompressedSize === 0xffffffff) requested.push("uncompressedSize");
    if (compressedSize === 0xffffffff) requested.push("compressedSize");
    if (localOffset === 0xffffffff) requested.push("localOffset");
    if (requested.length > 0) {
      const values = readZip64EntryValues(extraBytes, requested);
      uncompressedSize = values.uncompressedSize ?? uncompressedSize;
      compressedSize = values.compressedSize ?? compressedSize;
      localOffset = values.localOffset ?? localOffset;
    }
    if (isSupportedArchiveFile(name)) {
      entries.push({
        compressedSize,
        encrypted: (flags & 0x0001) !== 0,
        localOffset,
        method,
        name,
        uncompressedSize,
      });
    }
    cursor = end;
  }
  return { entries, totalEntries: info.entryCount };
};

const inflateEntry = async (blob, entry) => {
  if (entry.encrypted) throw new Error(`${entry.name} は暗号化されているため開けません。`);
  if (entry.method !== 0 && entry.method !== 8) {
    throw new Error(`${entry.name} の圧縮方式には対応していません。`);
  }
  if (entry.uncompressedSize > MAX_SELECTED_TEXT_BYTES) {
    throw new Error(`${entry.name} が大きすぎます。`);
  }
  const localHeaderBuffer = await blob
    .slice(entry.localOffset, entry.localOffset + 30)
    .arrayBuffer();
  if (localHeaderBuffer.byteLength < 30) {
    throw new Error(`${entry.name} のデータ位置を確認できません。`);
  }
  const localHeader = new DataView(localHeaderBuffer);
  if (localHeader.getUint32(0, true) !== LOCAL_ENTRY_SIGNATURE) {
    throw new Error(`${entry.name} のデータ位置が正しくありません。`);
  }
  const nameLength = localHeader.getUint16(26, true);
  const extraLength = localHeader.getUint16(28, true);
  const dataStart = entry.localOffset + 30 + nameLength + extraLength;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataStart < 0 || dataEnd > blob.size) {
    throw new Error(`${entry.name} のデータが途中で切れています。`);
  }
  const compressed = blob.slice(dataStart, dataEnd);
  if (entry.method === 0) return compressed.arrayBuffer();
  if (typeof DecompressionStream === "undefined") {
    throw new Error(
      "このブラウザはZIPの展開に対応していません。ZIPを展開してJSファイルを選んでください。",
    );
  }
  try {
    const stream = compressed.stream().pipeThrough(new DecompressionStream("deflate-raw"));
    const buffer = await new Response(stream).arrayBuffer();
    if (buffer.byteLength > MAX_SELECTED_TEXT_BYTES) throw new Error("expanded_too_large");
    return buffer;
  } catch {
    throw new Error(
      `${entry.name} を展開できません。ZIPを展開し、tweets.js などを直接選んでください。`,
    );
  }
};

export const extractJsonValue = (text) => {
  const firstArray = text.indexOf("[");
  const firstObject = text.indexOf("{");
  const start =
    firstArray < 0 ? firstObject : firstObject < 0 ? firstArray : Math.min(firstArray, firstObject);
  if (start < 0) throw new Error("JSONデータの開始位置が見つかりません。");
  const candidate = text.slice(start).trim().replace(/;\s*$/, "");
  try {
    return JSON.parse(candidate);
  } catch {
    throw new Error("アーカイブ内のJSONを読み取れません。");
  }
};

const cleanText = (value) => {
  if (typeof value !== "string") return "";
  return value.normalize("NFC").replaceAll("\u0000", "").replace(/\r\n?/g, "\n").trim();
};

export const dateFromSnowflake = (id) => {
  if (typeof id !== "string" || !/^\d{15,22}$/.test(id)) return null;
  try {
    const timestamp = Number((BigInt(id) >> 22n) + 1_288_834_974_657n);
    const date = new Date(timestamp);
    return Number.isNaN(date.valueOf()) ? null : date.toISOString();
  } catch {
    return null;
  }
};

const safeDate = (value, fallbackId = "") => {
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.valueOf())) return parsed.toISOString();
  }
  return dateFromSnowflake(fallbackId);
};

const statusUrl = (id) => (/^\d+$/.test(id) ? `https://x.com/i/web/status/${id}` : "");

const normalizeTweet = (record) => {
  const tweet = record?.tweet ?? record;
  if (!tweet || typeof tweet !== "object") return null;
  const id = String(tweet.id_str ?? tweet.id ?? "").trim();
  const text = cleanText(tweet.full_text ?? tweet.text);
  if (!id || !text) return null;
  const kind =
    tweet.retweeted_status || /^RT\s+@/i.test(text)
      ? "repost"
      : tweet.in_reply_to_status_id_str || tweet.in_reply_to_user_id_str
        ? "reply"
        : "post";
  return {
    createdAt: safeDate(tweet.created_at, id),
    id,
    kind,
    source: "post",
    text,
    url: statusUrl(id),
  };
};

const normalizeLike = (record) => {
  const like = record?.like ?? record;
  if (!like || typeof like !== "object") return null;
  const id = String(like.tweetId ?? like.tweet_id ?? like.id ?? "").trim();
  const text = cleanText(like.fullText ?? like.full_text ?? like.text);
  if (!id || !text) return null;
  const expandedUrl = typeof like.expandedUrl === "string" ? like.expandedUrl : "";
  return {
    createdAt: safeDate(like.createdAt ?? like.created_at, id),
    id,
    kind: "like",
    source: "like",
    text,
    url: expandedUrl.startsWith("https://") ? expandedUrl : statusUrl(id),
  };
};

const normalizeBookmark = (record) => {
  const bookmark = record?.bookmark ?? record;
  if (!bookmark || typeof bookmark !== "object") return null;
  const id = String(
    bookmark.tweetId ?? bookmark.tweet_id ?? bookmark.id_str ?? bookmark.id ?? "",
  ).trim();
  const text = cleanText(bookmark.fullText ?? bookmark.full_text ?? bookmark.text);
  if (!id || !text) return null;
  return {
    createdAt: safeDate(bookmark.createdAt ?? bookmark.created_at, id),
    id,
    kind: "bookmark",
    source: "bookmark",
    text,
    url: statusUrl(id),
  };
};

const normalizeNote = (record) => {
  const note = record?.noteTweet ?? record?.note_tweet ?? record;
  if (!note || typeof note !== "object") return null;
  const id = String(note.noteTweetId ?? note.note_tweet_id ?? note.id ?? "").trim();
  const core = note.core && typeof note.core === "object" ? note.core : {};
  const text = cleanText(core.text ?? note.fullText ?? note.text);
  if (!id || !text) return null;
  return {
    createdAt: safeDate(note.createdAt ?? note.created_at, id),
    id,
    kind: "note",
    source: "note",
    text,
    url: "",
  };
};

const sourceKind = (name) => {
  const base = normalizeFileName(name).toLowerCase().split("/").at(-1) ?? "";
  if (base.startsWith("like")) return "like";
  if (base.startsWith("bookmark")) return "bookmark";
  if (base.startsWith("note-tweet")) return "note";
  return "post";
};

export const normalizeArchiveValue = (value, name) => {
  const records = Array.isArray(value) ? value : [value];
  const kind = sourceKind(name);
  const normalize =
    kind === "like"
      ? normalizeLike
      : kind === "bookmark"
        ? normalizeBookmark
        : kind === "note"
          ? normalizeNote
          : normalizeTweet;
  return records.map(normalize).filter(Boolean);
};

const parseSupportedText = (text, name) =>
  normalizeArchiveValue(extractJsonValue(text.replace(/^\uFEFF/, "")), name);

const dedupePosts = (posts) => {
  const unique = new Map();
  for (const post of posts) {
    const key = `${post.kind}:${post.id}`;
    if (!unique.has(key)) unique.set(key, post);
  }
  return [...unique.values()];
};

const readZip = async (file, onProgress) => {
  const { entries, totalEntries } = await readCentralEntries(file);
  if (entries.length === 0) {
    throw new Error(
      "投稿データが見つかりません。Xの公式アーカイブ一式か tweets.js を選んでください。",
    );
  }
  const totalSelectedBytes = entries.reduce((sum, entry) => sum + entry.uncompressedSize, 0);
  if (totalSelectedBytes > MAX_SELECTED_TEXT_BYTES) {
    throw new Error("投稿データの合計が大きすぎます。展開後、年やパートごとに選んでください。");
  }
  const posts = [];
  const warnings = [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    onProgress?.(`${entry.name} を読んでいます（${index + 1}/${entries.length}）`);
    try {
      const buffer = await inflateEntry(file, entry);
      posts.push(...parseSupportedText(textDecoder.decode(buffer), entry.name));
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : `${entry.name} を読めませんでした。`);
    }
  }
  const normalized = dedupePosts(posts);
  if (normalized.length === 0) {
    throw new Error(warnings[0] ?? "読み取れる投稿がありませんでした。");
  }
  return {
    ignoredEntries: totalEntries - entries.length,
    posts: normalized,
    selectedFiles: entries.map((entry) => entry.name),
    warnings,
  };
};

const readLooseFiles = async (files, onProgress) => {
  const supported = files.filter((file) => isSupportedArchiveFile(file.name));
  if (supported.length === 0) {
    throw new Error("tweets.js、like.js、bookmark.js などの投稿データを選んでください。");
  }
  let totalBytes = 0;
  const posts = [];
  const warnings = [];
  for (let index = 0; index < supported.length; index += 1) {
    const file = supported[index];
    totalBytes += file.size;
    if (totalBytes > MAX_SELECTED_TEXT_BYTES) {
      throw new Error("選んだ投稿データの合計が大きすぎます。");
    }
    onProgress?.(`${file.name} を読んでいます（${index + 1}/${supported.length}）`);
    try {
      posts.push(...parseSupportedText(await file.text(), file.name));
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : `${file.name} を読めませんでした。`);
    }
  }
  const normalized = dedupePosts(posts);
  if (normalized.length === 0) {
    throw new Error(warnings[0] ?? "読み取れる投稿がありませんでした。");
  }
  return {
    ignoredEntries: files.length - supported.length,
    posts: normalized,
    selectedFiles: supported.map((file) => file.name),
    warnings,
  };
};

export const parseArchiveFiles = async (files, onProgress) => {
  const selected = [...files];
  if (selected.length === 0) throw new Error("ファイルを選んでください。");
  const zipFiles = selected.filter(isZipFile);
  if (zipFiles.length > 1 || (zipFiles.length === 1 && selected.length > 1)) {
    throw new Error("ZIPは一つだけ選んでください。展開済みファイルは複数まとめて選べます。");
  }
  return zipFiles.length === 1
    ? readZip(zipFiles[0], onProgress)
    : readLooseFiles(selected, onProgress);
};

const normalizedSearchText = (value) =>
  String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("ja-JP")
    .replaceAll(/\s+/g, " ")
    .trim();

const jstYear = (iso) =>
  new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
  }).format(new Date(iso));

export const filterPosts = (
  posts,
  { dateFrom = "", dateTo = "", kind = "all", query = "", sort = "newest", year = "" } = {},
) => {
  const words = normalizedSearchText(query).split(" ").filter(Boolean);
  const fromTime = dateFrom ? Date.parse(`${dateFrom}T00:00:00+09:00`) : null;
  const toTime = dateTo ? Date.parse(`${dateTo}T23:59:59.999+09:00`) : null;
  const filtered = posts.filter((post) => {
    if (kind !== "all" && post.kind !== kind) return false;
    const timestamp = post.createdAt ? Date.parse(post.createdAt) : null;
    if (year && (!post.createdAt || jstYear(post.createdAt) !== String(year))) return false;
    if (fromTime !== null && (timestamp === null || timestamp < fromTime)) return false;
    if (toTime !== null && (timestamp === null || timestamp > toTime)) return false;
    if (words.length > 0) {
      const haystack = normalizedSearchText(post.text);
      if (!words.every((word) => haystack.includes(word))) return false;
    }
    return true;
  });
  return filtered.sort((left, right) => {
    const leftTime = left.createdAt ? Date.parse(left.createdAt) : 0;
    const rightTime = right.createdAt ? Date.parse(right.createdAt) : 0;
    return sort === "oldest" ? leftTime - rightTime : rightTime - leftTime;
  });
};

export const countByYear = (posts) => {
  const counts = new Map();
  for (const post of posts) {
    const year = post.createdAt ? jstYear(post.createdAt) : "日付なし";
    counts.set(year, (counts.get(year) ?? 0) + 1);
  }
  return [...counts.entries()].sort(([left], [right]) => {
    if (left === "日付なし") return 1;
    if (right === "日付なし") return -1;
    return Number(left) - Number(right);
  });
};

const csvCell = (value) => {
  let text = String(value ?? "").replaceAll('"', '""');
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text}"`;
};

export const postsToCsv = (posts) => {
  const rows = [["date", "type", "text", "url"]];
  for (const post of posts) {
    rows.push([post.createdAt ?? "", post.kind, post.text, post.url ?? ""]);
  }
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
};
