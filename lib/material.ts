import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import type { SiteMaterial } from "./generate";
import { listTree } from "./detect";

const SKIP_EXT = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".ico", ".svg",
  ".woff", ".woff2", ".ttf", ".otf", ".mp4", ".webm", ".mp3",
  ".map", ".lock", ".log",
]);

const README_NAMES = ["README.md", "readme.md", "Readme.md", "README.txt", "README"];

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function extractHeadings(html: string): string[] {
  const found: string[] = [];
  const re = /<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const text = stripTags(match[2]);
    if (text && text.length <= 40) found.push(text);
  }
  return [...new Set(found)];
}

/** 从站点入口 HTML 和目录里抽取喂给模型的结构化材料 */
export async function collectMaterial(dir: string, entryFile?: string): Promise<SiteMaterial> {
  let html = "";
  const entry = entryFile ?? join(dir, "index.html");
  try {
    html = await readFile(entry, "utf8");
  } catch {
    html = "";
  }

  const headings = extractHeadings(html);
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const docTitle = titleMatch ? stripTags(titleMatch[1]) : "";
  const bodyText = stripTags(html).slice(0, 4000);

  let readme = "";
  for (const name of README_NAMES) {
    try {
      readme = await readFile(join(dir, name), "utf8");
      break;
    } catch {
      // 继续找下一个
    }
  }

  const tree = await listTree(dir, 200);
  const files = tree.filter((p) => !p.endsWith("/") && !SKIP_EXT.has(extname(p).toLowerCase()));

  return {
    headings: docTitle ? [docTitle, ...headings.filter((h) => h !== docTitle)] : headings,
    text: bodyText,
    files,
    readme,
  };
}
