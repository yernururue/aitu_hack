// Node-only server boundary: these credentials never enter client props or logs.
import { createHash, timingSafeEqual } from "node:crypto";
import type { RecommendRequest } from "../contracts/request";
import type { RecommendResponse } from "../contracts/response";
import { runBeforeDeadline } from "../search/intent";

type Context = { now: Date; deadlineAt: number; signal: AbortSignal };
type RemoteRecommend = (request: RecommendRequest, context: Context) => Promise<RecommendResponse>;
const tokenHeader = "x-aituhack-backend-token";
const validToken = (value: string | undefined): value is string => Boolean(value && /^[a-f0-9]{64}$/.test(value));

export function createRemoteRecommend(env: Record<string, string | undefined> = process.env, fetcher: typeof fetch = fetch): RemoteRecommend | null {
  const origin = env.RECOMMEND_REMOTE_ORIGIN;
  const token = env.RECOMMEND_REMOTE_TOKEN;
  if (!origin && !token) {
    if (env.VERCEL && env.APP_AI_MODE === "live") throw new Error("REMOTE_RECOMMEND_REQUIRED");
    return null;
  }
  if (!origin || !validToken(token) || env.RECOMMEND_REQUIRED_TOKEN) throw new Error("INVALID_REMOTE_RECOMMEND_CONFIGURATION");
  const url = new URL(origin);
  // Only an explicitly configured Cloudflare backend is accepted, never the
  // Vercel frontend, arbitrary request URLs, credentials, paths or query data.
  if (url.protocol !== "https:" || !/^[a-z0-9]+(?:-[a-z0-9]+)*\.trycloudflare\.com$/.test(url.hostname) || url.port || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("INVALID_REMOTE_RECOMMEND_ORIGIN");
  url.pathname = "/api/recommend";
  return async (request, context) => {
    const deadlineAt = Math.min(context.deadlineAt, Date.now() + 25_000);
    if (context.signal.aborted || Date.now() >= deadlineAt) throw new Error("REQUEST_INTERRUPTED");
    const controller = new AbortController();
    const abort = () => controller.abort();
    context.signal.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(abort, Math.max(0, deadlineAt - Date.now()));
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let complete = false;
    try {
      const response = await runBeforeDeadline(() => fetcher(url, {
        method: "POST", headers: { "Content-Type": "application/json", [tokenHeader]: token },
        body: JSON.stringify(request), signal: controller.signal, cache: "no-store", redirect: "error",
      }), deadlineAt, controller.signal);
      if (response.status !== 200 || response.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw new Error("REMOTE_RECOMMEND_UNAVAILABLE");
      reader = response.body?.getReader();
      if (!reader) throw new Error("REMOTE_RECOMMEND_UNAVAILABLE");
      const chunks: Uint8Array[] = []; let size = 0;
      for (;;) {
        const { done, value } = await runBeforeDeadline(() => reader!.read(), deadlineAt, controller.signal);
        if (done) { complete = true; break; }
        size += value.byteLength;
        if (size > 1024 * 1024) throw new Error("REMOTE_RECOMMEND_UNAVAILABLE");
        chunks.push(value);
      }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      // createRecommendHandler validates the full response contract before it
      // can reach a browser; no upstream headers, cookies or errors are exposed.
      return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as RecommendResponse;
    } finally {
      controller.abort();
      if (reader && !complete) void reader.cancel().catch(() => {});
      try { reader?.releaseLock(); } catch { /* Pending cancelled read releases later. */ }
      clearTimeout(timer); context.signal.removeEventListener("abort", abort);
    }
  };
}

export function withRequiredRecommendToken(handler: (request: Request) => Promise<Response>, env: Record<string, string | undefined> = process.env): (request: Request) => Promise<Response> {
  return async (request) => {
    const expected = env.RECOMMEND_REQUIRED_TOKEN;
    if (expected !== undefined) {
      const supplied = request.headers.get(tokenHeader) ?? "";
      const digest = (value: string) => createHash("sha256").update(value).digest();
      if (!validToken(expected) || !timingSafeEqual(digest(expected), digest(supplied))) return Response.json({ message: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
    }
    return handler(request);
  };
}
