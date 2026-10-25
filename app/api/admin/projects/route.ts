import { badRequest, guard, json } from "@/lib/api";
import { importSource, type ImportInput } from "@/lib/import";
import { readProjects } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const denied = guard(req);
  if (denied) return denied;
  return json(await readProjects());
}

export async function POST(req: Request): Promise<Response> {
  const denied = guard(req);
  if (denied) return denied;

  const contentType = req.headers.get("content-type") ?? "";

  try {
    let input: ImportInput;

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const title = String(form.get("title") ?? "").trim();
      const date = String(form.get("date") ?? "").trim();
      const note = String(form.get("note") ?? "");
      const kind = String(form.get("kind") ?? "zip");
      if (!title) return badRequest("标题不能为空");

      if (kind === "zip") {
        const file = form.get("file");
        if (!(file instanceof Blob)) return badRequest("没有收到 zip 文件");
        input = { kind: "zip", title, date, note, buf: Buffer.from(await file.arrayBuffer()) };
      } else if (kind === "folder" || kind === "path") {
        const path = String(form.get("path") ?? "").trim();
        if (!path) return badRequest("本机路径不能为空");
        input = { kind, title, date, note, path };
      } else {
        return badRequest(`不认识的导入方式：${kind}`);
      }
    } else {
      const body = (await req.json()) as Record<string, unknown>;
      const title = String(body.title ?? "").trim();
      const date = String(body.date ?? "").trim();
      const note = String(body.note ?? "");
      const kind = String(body.kind ?? "remote");
      if (!title) return badRequest("标题不能为空");

      if (kind === "folder" || kind === "path") {
        const path = String(body.path ?? "").trim();
        if (!path) return badRequest("本机路径不能为空");
        input = { kind, title, date, note, path };
      } else if (kind === "remote") {
        const url = String(body.url ?? "").trim();
        if (!/^https?:\/\//i.test(url)) return badRequest("网址要以 http:// 或 https:// 开头");
        input = { kind: "remote", title, date, note, url, mirror: Boolean(body.mirror) };
      } else {
        return badRequest(`不认识的导入方式：${kind}`);
      }
    }

    const result = await importSource(input);
    return json(result);
  } catch (error) {
    return json({ error: (error as Error).message }, { status: 500 });
  }
}
