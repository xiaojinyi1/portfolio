import { isAuthed } from "./auth";

export function json(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { "content-type": "application/json; charset=utf-8", ...(init?.headers ?? {}) },
  });
}

export function unauthorized(): Response {
  return json({ error: "未授权" }, { status: 401 });
}

/** 除登录外的所有后台接口都先过这一关 */
export function guard(req: Request): Response | null {
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
