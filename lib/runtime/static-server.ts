import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

/** 在 root 下解析请求路径，阻止 ../ 越界 */
function safeResolve(root: string, urlPath: string): string {
  const decoded = decodeURIComponent(urlPath.split("?")[0].split("#")[0]);
  const rel = normalize(decoded).replace(/^([/\\])+/, "");
  const full = resolve(root, rel);
  if (!full.startsWith(resolve(root))) return resolve(root);
  return full;
}

async function tryFile(root: string, path: string): Promise<string | null> {
  try {
    const info = await stat(path);
    if (info.isDirectory()) {
      const index = join(path, "index.html");
      const idx = await stat(index);
      return idx.isFile() ? index : null;
    }
    return info.isFile() ? path : null;
  } catch {
    return null;
  }
}

/** 只读静态监听：给一个目录 + 端口，像独立站点一样对外服务 */
export function startStaticServer(root: string, port: number): Promise<Server> {
  const server = createServer(async (req, res) => {
    const urlPath = req.url ?? "/";
    let file = await tryFile(root, safeResolve(root, urlPath));

    // 无扩展名的路径回落到 index.html（前端路由）
    if (!file && !extname(urlPath)) {
      file = await tryFile(root, join(root, "index.html"));
    }

    if (!file) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("404");
      return;
    }

    res.writeHead(200, {
      "content-type": MIME[extname(file).toLowerCase()] ?? "application/octet-stream",
      "cache-control": "no-cache",
    });
    createReadStream(file).pipe(res);
  });

  return new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolvePromise(server));
  });
}
