import { authCookieHeader, checkPassword } from "@/lib/auth";
import { badRequest, json, readJson } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  let body: { password?: string };
  try {
    body = await readJson<{ password?: string }>(req);
  } catch {
    return badRequest("请求体不是合法 JSON");
  }

  if (!process.env.ADMIN_PASSWORD) {
    return json({ error: "没有配置 ADMIN_PASSWORD，先在 .env.local 里设一个" }, { status: 500 });
  }
  if (!checkPassword(body.password ?? "")) {
    return json({ error: "口令不对" }, { status: 401 });
  }

  return json({ ok: true }, { headers: { "set-cookie": authCookieHeader() } });
}
