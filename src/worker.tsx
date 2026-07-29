import { Hono } from "hono";
import type { Context } from "hono";
import { requestId } from "hono/request-id";

import { securityHeaders } from "./middleware/security";
import { GuidePage, HomePage, NotFoundPage, PrivacyPage } from "./ui/pages";

export type Bindings = {
  ASSETS: Fetcher;
  DB: D1Database;
};

type AppContext = Context<{ Bindings: Bindings; Variables: { requestId: string } }>;

class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: 400 | 403 | 413 | 415,
  ) {
    super(code);
  }
}

const app = new Hono<{ Bindings: Bindings; Variables: { requestId: string } }>();
const browserSessionPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const telemetryNames = new Set([
  "visited",
  "archive_opened",
  "search_used",
  "exported",
  "saved_locally",
  "local_copy_opened",
  "cleared",
  "returned",
]);

const jstDay = () => new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

const enforceSameOrigin = (c: AppContext) => {
  const fetchSite = c.req.header("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin") throw new ApiError("cross_site_request", 403);
  const origin = c.req.header("origin");
  if (origin && origin !== new URL(c.req.url).origin) {
    throw new ApiError("cross_site_request", 403);
  }
};

const parseJson = async (c: AppContext, maximumBytes: number) => {
  const contentType = c.req.header("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new ApiError("unsupported_media_type", 415);
  }
  const contentLength = Number(c.req.header("content-length") ?? "0");
  if (contentLength > maximumBytes) throw new ApiError("payload_too_large", 413);
  const rawBody = await c.req.text();
  if (new TextEncoder().encode(rawBody).byteLength > maximumBytes) {
    throw new ApiError("payload_too_large", 413);
  }
  try {
    return JSON.parse(rawBody) as unknown;
  } catch {
    throw new ApiError("invalid_json", 400);
  }
};

const isAutomatedQa = (c: AppContext) => {
  if (c.req.header("x-automated-qa") === "1") return true;
  if (new URL(c.req.url).searchParams.get("qa") === "1") return true;
  const referer = c.req.header("referer");
  if (!referer) return false;
  try {
    return new URL(referer).searchParams.get("qa") === "1";
  } catch {
    return false;
  }
};

const cleanup = (db: D1Database) =>
  db.prepare("DELETE FROM product_events WHERE created_at < unixepoch() - (45 * 86400)").run();

const recordEvent = async (db: D1Database, sessionId: string, name: string) => {
  await db.batch([
    db
      .prepare(
        `INSERT OR IGNORE INTO product_events
         (session_id, name, occurred_on, created_at)
         VALUES (?, ?, ?, unixepoch())`,
      )
      .bind(sessionId, name, jstDay()),
    db.prepare("DELETE FROM product_events WHERE created_at < unixepoch() - (45 * 86400)"),
  ]);
};

app.use("*", requestId());
app.use("*", securityHeaders);
app.use("/api/*", async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  await next();
});

app.get("/", (c) => {
  c.header("Cache-Control", "public, max-age=300, s-maxage=86400");
  return c.html(<HomePage />);
});
app.get("/guide", (c) => {
  c.header("Cache-Control", "public, max-age=300, s-maxage=86400");
  return c.html(<GuidePage />);
});
app.get("/privacy", (c) => {
  c.header("Cache-Control", "public, max-age=300, s-maxage=86400");
  return c.html(<PrivacyPage />);
});

app.post("/api/telemetry", async (c) => {
  enforceSameOrigin(c);
  if (isAutomatedQa(c)) return c.body(null, 204);
  const payload = await parseJson(c, 512);
  if (!payload || typeof payload !== "object") throw new ApiError("invalid_telemetry", 400);
  const source = payload as Record<string, unknown>;
  const sessionId = typeof source.sessionId === "string" ? source.sessionId : "";
  const name = typeof source.name === "string" ? source.name : "";
  if (!browserSessionPattern.test(sessionId) || !telemetryNames.has(name)) {
    throw new ApiError("invalid_telemetry", 400);
  }
  await recordEvent(c.env.DB, sessionId, name);
  return c.body(null, 204);
});

app.get("/healthz", (c) =>
  c.json({ healthy: true, service: "post-gura", time: new Date().toISOString() }),
);

app.notFound((c) => {
  if (c.req.method === "GET" && !c.req.path.startsWith("/api/")) {
    return c.html(<NotFoundPage />, 404);
  }
  return c.json({ error: "not_found", requestId: c.get("requestId") }, 404);
});

app.onError((error, c) => {
  if (error instanceof ApiError) {
    return c.json({ error: error.code, requestId: c.get("requestId") }, error.status);
  }
  console.error(
    JSON.stringify({
      event: "request_failed",
      message: error.message,
      requestId: c.get("requestId"),
    }),
  );
  return c.json({ error: "internal_error", requestId: c.get("requestId") }, 500);
});

export { app };
export default {
  fetch: app.fetch,
  scheduled(_controller: ScheduledController, env: Bindings, context: ExecutionContext) {
    context.waitUntil(cleanup(env.DB));
  },
};
