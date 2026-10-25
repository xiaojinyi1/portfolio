import { isAuthed } from "./auth";
import { isHosted } from "./store";

export function json(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { "content-type": "application/json; charset=utf-8", ...(init?.headers ?? {}) },
  });
}

export function unauthorized(): Response {
  return json({ error: "未授权" }, { status: 401 });
}

/** 线上没有可写磁盘：整个后台链路在部署形态下直接不存在 */
export function offlineInHosted(): Response | null {
  if (!isHosted()) return null;
  return new Response("后台只在本地可用：跑 npm run dev，打开 http://127.0.0.1:3000/admin", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

/** 除登录外的所有后台接口都先过这一关 */
export function guard(req: Request): Response | null {
  const offline = offlineInHosted();
  if (offline) return offline;
  return isAuthed(req) ? null : unauthorized();
}

export function badRequest(message: string): Response {
  return json({ error: message }, { status: 400 });
}

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new Error("请求体不是合法 JSON");
  }
}
