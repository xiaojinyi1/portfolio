import { readFile } from "node:fs/promises";
import { join, normalize, sep } from "node:path";
import { dataDir } from "@/lib/store";

export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

/** 作品站点里的图片走这里：data/sites/<slug>/... → /media/<slug>/... */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await ctx.params;
  const segments = (path ?? []).map((part) => decodeURIComponent(part));

  const root = join(dataDir(), "sites");
  const target = normalize(join(root, ...segments));
  if (!target.startsWith(root + sep)) {
    return new Response("不在允许的目录里", { status: 403 });
  }

  try {
    const body = await readFile(target);
    const ext = target.slice(target.lastIndexOf(".")).toLowerCase();
    return new Response(new Uint8Array(body), {
      headers: {
        "content-type": TYPES[ext] ?? "application/octet-stream",
        "cache-control": "public, max-age=300",
      },
    });
  } catch {
    return new Response("没有这个文件", { status: 404 });
  }
}
