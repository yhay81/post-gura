import {
  countByYear,
  dateFromSnowflake,
  extractJsonValue,
  filterPosts,
  isSupportedArchiveFile,
  normalizeArchiveValue,
  parseArchiveFiles,
  postsToCsv,
} from "../public/archive-core.js";
import type { ArchivePost } from "../public/archive-core.js";
import { deflateRawSync } from "node:zlib";

const encoder = new TextEncoder();

const u16 = (value: number) => {
  const buffer = new ArrayBuffer(2);
  new DataView(buffer).setUint16(0, value, true);
  return new Uint8Array(buffer);
};

const u32 = (value: number) => {
  const buffer = new ArrayBuffer(4);
  new DataView(buffer).setUint32(0, value, true);
  return new Uint8Array(buffer);
};

const u64 = (value: number) => {
  const buffer = new ArrayBuffer(8);
  new DataView(buffer).setBigUint64(0, BigInt(value), true);
  return new Uint8Array(buffer);
};

const concat = (...arrays: Uint8Array[]) => {
  const result = new Uint8Array(arrays.reduce((sum, value) => sum + value.length, 0));
  let offset = 0;
  for (const array of arrays) {
    result.set(array, offset);
    offset += array.length;
  }
  return result;
};

const storedZip = (files: Array<{ deflated?: boolean; name: string; text: string }>) => {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    const data = encoder.encode(file.text);
    const method = file.deflated ? 8 : 0;
    const compressed = file.deflated ? new Uint8Array(deflateRawSync(data)) : data;
    const local = concat(
      u32(0x04034b50),
      u16(20),
      u16(0x0800),
      u16(method),
      u16(0),
      u16(0),
      u32(0),
      u32(compressed.length),
      u32(data.length),
      u16(name.length),
      u16(0),
      name,
      compressed,
    );
    localParts.push(local);
    centralParts.push(
      concat(
        u32(0x02014b50),
        u16(20),
        u16(20),
        u16(0x0800),
        u16(method),
        u16(0),
        u16(0),
        u32(0),
        u32(compressed.length),
        u32(data.length),
        u16(name.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(localOffset),
        name,
      ),
    );
    localOffset += local.length;
  }
  const localBytes = concat(...localParts);
  const centralBytes = concat(...centralParts);
  const eocd = concat(
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(centralBytes.length),
    u32(localBytes.length),
    u16(0),
  );
  return concat(localBytes, centralBytes, eocd);
};

const zip64StoredZip = (nameText: string, text: string) => {
  const name = encoder.encode(nameText);
  const data = encoder.encode(text);
  const local = concat(
    u32(0x04034b50),
    u16(45),
    u16(0x0800),
    u16(0),
    u16(0),
    u16(0),
    u32(0),
    u32(data.length),
    u32(data.length),
    u16(name.length),
    u16(0),
    name,
    data,
  );
  const zip64Extra = concat(u16(0x0001), u16(24), u64(data.length), u64(data.length), u64(0));
  const central = concat(
    u32(0x02014b50),
    u16(45),
    u16(45),
    u16(0x0800),
    u16(0),
    u16(0),
    u16(0),
    u32(0),
    u32(0xffffffff),
    u32(0xffffffff),
    u16(name.length),
    u16(zip64Extra.length),
    u16(0),
    u16(0),
    u16(0),
    u32(0),
    u32(0xffffffff),
    name,
    zip64Extra,
  );
  const zip64RecordOffset = local.length + central.length;
  const zip64Record = concat(
    u32(0x06064b50),
    u64(44),
    u16(45),
    u16(45),
    u32(0),
    u32(0),
    u64(1),
    u64(1),
    u64(central.length),
    u64(local.length),
  );
  const locator = concat(u32(0x07064b50), u32(0), u64(zip64RecordOffset), u32(1));
  const eocd = concat(
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(0xffff),
    u16(0xffff),
    u32(0xffffffff),
    u32(0xffffffff),
    u16(0),
  );
  return concat(local, central, zip64Record, locator, eocd);
};

describe("X archive parser", () => {
  it("XのJavaScriptラッパーを実行せずJSONだけを読む", () => {
    const value = extractJsonValue(
      'window.YTD.tweets.part0 = [{"tweet":{"id_str":"1","full_text":"本文"}}];',
    );
    expect(value).toEqual([{ tweet: { full_text: "本文", id_str: "1" } }]);
    expect(() => extractJsonValue("window.alert('no json')")).toThrow(/JSON/);
  });

  it("投稿・返信・リポスト・いいね・ブックマーク・長文投稿を正規化する", () => {
    const tweets = normalizeArchiveValue(
      [
        {
          tweet: {
            created_at: "Wed Oct 10 20:19:24 +0000 2018",
            full_text: "通常の投稿",
            id_str: "1050118621198921728",
          },
        },
        {
          tweet: {
            full_text: "返信です",
            id_str: "1050118621198921729",
            in_reply_to_status_id_str: "4",
          },
        },
        {
          tweet: {
            full_text: "RT @someone: 引用",
            id_str: "1050118621198921730",
          },
        },
      ],
      "data/tweets.js",
    );
    const likes = normalizeArchiveValue(
      [{ like: { fullText: "いいねした投稿", tweetId: "1050118621198921731" } }],
      "data/like.js",
    );
    const bookmarks = normalizeArchiveValue(
      [{ bookmark: { fullText: "保存した投稿", tweetId: "1050118621198921732" } }],
      "data/bookmark.js",
    );
    const notes = normalizeArchiveValue(
      [
        {
          noteTweet: {
            core: { text: "長い投稿" },
            createdAt: "2024-06-12T12:00:00.000Z",
            noteTweetId: "note-1",
          },
        },
      ],
      "data/note-tweet.js",
    );
    expect(tweets.map((post: { kind: string }) => post.kind)).toEqual(["post", "reply", "repost"]);
    expect(likes[0]).toMatchObject({ kind: "like", text: "いいねした投稿" });
    expect(bookmarks[0]).toMatchObject({ kind: "bookmark", text: "保存した投稿" });
    expect(notes[0]).toMatchObject({ kind: "note", text: "長い投稿" });
    expect(likes[0]?.createdAt).toBeTruthy();
  });

  it("投稿系ファイルだけを許可する", () => {
    expect(isSupportedArchiveFile("archive/data/tweets-part12.js")).toBe(true);
    expect(isSupportedArchiveFile("data/bookmark.js")).toBe(true);
    expect(isSupportedArchiveFile("data/direct-messages.js")).toBe(false);
    expect(isSupportedArchiveFile("data/account.js")).toBe(false);
    expect(isSupportedArchiveFile("assets/image.jpg")).toBe(false);
  });

  it("ZIPの索引から投稿だけを開き、DMは開かない", async () => {
    const zip = storedZip([
      {
        name: "archive/data/tweets.js",
        text: 'window.YTD.tweets.part0 = [{"tweet":{"id_str":"1050118621198921728","full_text":"蔵で見つける","created_at":"Wed Oct 10 20:19:24 +0000 2018"}}];',
      },
      {
        name: "archive/data/direct-messages.js",
        text: 'window.YTD.direct_messages.part0 = [{"dmConversation":{"secret":"読んではいけない"}}];',
      },
      {
        name: "archive/assets/media.jpg",
        text: "not an image fixture",
      },
    ]);
    const result = await parseArchiveFiles(
      [new File([zip], "twitter-archive.zip", { type: "application/zip" })],
      () => {},
    );
    expect(result.posts).toHaveLength(1);
    expect(result.posts[0]?.text).toBe("蔵で見つける");
    expect(JSON.stringify(result)).not.toContain("読んではいけない");
    expect(result.ignoredEntries).toBe(2);
  });

  it("Deflate圧縮とZIP64の投稿ファイルを開ける", async () => {
    const wrapped =
      'window.YTD.tweets.part0 = [{"tweet":{"id_str":"1050118621198921728","full_text":"圧縮された投稿"}}];';
    const deflated = storedZip([{ deflated: true, name: "data/tweets.js", text: wrapped }]);
    const zip64 = zip64StoredZip("data/tweets.js", wrapped);
    const deflatedResult = await parseArchiveFiles([
      new File([deflated], "deflated.zip", { type: "application/zip" }),
    ]);
    const zip64Result = await parseArchiveFiles([
      new File([zip64], "zip64.zip", { type: "application/zip" }),
    ]);
    expect(deflatedResult.posts[0]?.text).toBe("圧縮された投稿");
    expect(zip64Result.posts[0]?.text).toBe("圧縮された投稿");
  });

  it("語句をAND検索し、種類・日付・年で絞って並べる", () => {
    const posts: ArchivePost[] = [
      {
        createdAt: "2024-06-12T12:00:00.000Z",
        id: "1",
        kind: "post",
        text: "Ｗｅｂ サービス の記録",
      },
      {
        createdAt: "2023-01-01T12:00:00.000Z",
        id: "2",
        kind: "like",
        text: "webの別記録",
      },
      { createdAt: null, id: "3", kind: "bookmark", text: "日付なし web service" },
    ];
    expect(
      filterPosts(posts, { query: "web サービス" }).map((post: { id: string }) => post.id),
    ).toEqual(["1"]);
    expect(filterPosts(posts, { kind: "like" })).toHaveLength(1);
    expect(filterPosts(posts, { year: "2024" })).toHaveLength(1);
    expect(filterPosts(posts, { dateFrom: "2024-01-01" })).toHaveLength(1);
    expect(filterPosts(posts, { sort: "oldest" })[0]?.id).toBe("3");
    expect(countByYear(posts)).toEqual([
      ["2023", 1],
      ["2024", 1],
      ["日付なし", 1],
    ]);
  });

  it("CSVの数式先頭を無効化して引用符と改行を保護する", () => {
    const csv = postsToCsv([
      {
        createdAt: "2024-01-01T00:00:00.000Z",
        id: "1",
        kind: "post",
        text: '=IMPORTXML("https://evil.example")\n次の行',
        url: "",
      },
    ]);
    expect(csv).toContain(`"'=IMPORTXML(""https://evil.example"")\n次の行"`);
    expect(csv.startsWith("\uFEFF")).toBe(true);
  });

  it("Snowflakeから投稿日時を復元し、不正値は無視する", () => {
    expect(dateFromSnowflake("1050118621198921728")).toBe("2018-10-10T20:19:24.211Z");
    expect(dateFromSnowflake("not-id")).toBeNull();
  });
});
