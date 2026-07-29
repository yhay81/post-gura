import { app, type Bindings } from "../src/worker";

type DbCall = {
  arguments: unknown[];
  sql: string;
};

const makeBindings = () => {
  const calls: DbCall[] = [];
  const database = {
    batch: async (statements: Array<{ call: DbCall }>) => {
      calls.push(...statements.map((statement) => statement.call));
      return statements.map(() => ({ success: true }));
    },
    prepare: (sql: string) => {
      const call: DbCall = { arguments: [], sql };
      const statement = {
        bind: (...args: unknown[]) => {
          call.arguments = args;
          return statement;
        },
        call,
        run: async () => {
          calls.push(call);
          return { success: true };
        },
      };
      return statement;
    },
  };
  return {
    bindings: {
      ASSETS: { fetch: async () => new Response("asset") } as unknown as Fetcher,
      DB: database as unknown as D1Database,
    } satisfies Bindings,
    calls,
  };
};

const sessionId = "a2d0e2f2-66fd-4fd4-8e87-b0ef67ad194a";
const jsonHeaders = {
  "content-type": "application/json",
  origin: "http://localhost",
};

describe("post-gura worker", () => {
  it.each([
    ["/", 'class="archive-stage"', "https://post-gura.yhay81.com"],
    ["/guide", 'class="guide-steps"', "https://post-gura.yhay81.com/guide"],
    ["/privacy", "IndexedDB", "https://post-gura.yhay81.com/privacy"],
  ])("%sを公開ページとして返す", async (path, marker, canonical) => {
    const response = await app.request(path, undefined, makeBindings().bindings);
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("s-maxage=86400");
    expect(response.headers.get("content-security-policy")).toContain("connect-src 'self'");
    expect(html).toContain(marker);
    expect(html).toContain(`rel="canonical"`);
    expect(html).toContain(`href="${canonical}"`);
    expect(html).toContain(path === "/" ? 'src="/app.js?v=1"' : "ポスト蔵");
  });

  it("文字主体のヒーローや調査メタコピーを製品面に出さない", async () => {
    const html = await (await app.request("/", undefined, makeBindings().bindings)).text();
    expect(html).not.toContain('class="hero"');
    expect(html).not.toMatch(/成功条件|検証仮説|市場スコア|移行候補/);
    expect(html).toContain('class="archive-crate"');
    expect(html).toContain('class="year-cabinet"');
    expect(html).toContain('class="result-slips"');
  });

  it("正常な操作イベントだけを日次で保存し45日で削除する", async () => {
    const { bindings, calls } = makeBindings();
    const response = await app.request(
      "/api/telemetry",
      {
        body: JSON.stringify({ name: "search_used", sessionId }),
        headers: jsonHeaders,
        method: "POST",
      },
      bindings,
    );
    expect(response.status).toBe(204);
    expect(calls.some((call) => call.sql.includes("INSERT OR IGNORE INTO product_events"))).toBe(
      true,
    );
    expect(calls.some((call) => call.sql.includes("45 * 86400"))).toBe(true);
    expect(JSON.stringify(calls)).not.toMatch(/query|content|filename/i);
  });

  it("自動QAを製品イベントに含めない", async () => {
    const { bindings, calls } = makeBindings();
    const response = await app.request(
      "/api/telemetry?qa=1",
      {
        body: JSON.stringify({ name: "archive_opened", sessionId }),
        headers: jsonHeaders,
        method: "POST",
      },
      bindings,
    );
    expect(response.status).toBe(204);
    expect(calls).toHaveLength(0);
  });

  it("越境、未知のイベント、不正なセッションを拒否する", async () => {
    const invalid = [
      {
        body: { name: "archive_opened", sessionId },
        headers: { ...jsonHeaders, origin: "https://evil.example" },
      },
      { body: { name: "archive_text", sessionId }, headers: jsonHeaders },
      { body: { name: "archive_opened", sessionId: "not-a-uuid" }, headers: jsonHeaders },
    ];
    const expectedStatuses = [403, 400, 400];
    for (const [index, request] of invalid.entries()) {
      const response = await app.request(
        "/api/telemetry",
        {
          body: JSON.stringify(request.body),
          headers: request.headers,
          method: "POST",
        },
        makeBindings().bindings,
      );
      expect(response.status).toBe(expectedStatuses[index]);
    }
  });

  it("ヘルスと未定義APIをJSONで返す", async () => {
    const bindings = makeBindings().bindings;
    const health = await app.request("/healthz", undefined, bindings);
    expect(await health.json()).toMatchObject({ healthy: true, service: "post-gura" });
    const missing = await app.request("/api/missing", undefined, bindings);
    const body = await missing.json<{ error: string; requestId: string }>();
    expect(missing.status).toBe(404);
    expect(body.error).toBe("not_found");
    expect(body.requestId).toBeTruthy();
  });
});
