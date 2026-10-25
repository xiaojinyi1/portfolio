import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { badRequest, guard, json } from "@/lib/api";
import { dataDir } from "@/lib/store";
import { isSafeEntryName } from "@/lib/zip";
import { importSource } from "@/lib/import";

export const dynamic = "force-dynamic";

/**
 * 浏览器只能给「目录里的所有文件」，给不了目录路径。
 * 这里按相对路径把它们落到 data/tmp/<stamp>/ 下，当成一个文件夹来源导入。
 */
export async function POST(req: Request): Promise<Response> {
  const denied = guard(req);
  if (denied) return denied;

  try {
    const form = await req.formData();
    const title = String(form.get("title") ?? "").trim();
    const date = String(form.get("date") ?? "").trim();
    const note = String(form.get("note") ?? "");
    if (!title) return badRequest("标题不能为空");

    const files = form.getAll("files").filter((item): item is File => item instanceof File);
    if (files.length === 0) return badRequest("没有收到文件");

    for (const file of files) {
      if (!isSafeEntryName(file.name)) return badRequest(`不安全的文件名：${file.name}`);
    }

    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const uploadDir = join(dataDir(), "tmp", stamp);
    await mkdir(uploadDir, { recursive: true });

    for (const file of files) {
      const target = join(uploadDir, file.name);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, Buffer.from(await file.arrayBuffer()));
    }

    const result = await importSource({ kind: "folder", title, date, note, path: uploadDir });
    await rm(uploadDir, { recursive: true, force: true });
    return json(result);
  } catch (error) {
    return json({ error: (error as Error).message }, { status: 500 });
  }
}
