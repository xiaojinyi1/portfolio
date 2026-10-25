/**
 * 生成 URL 用的 slug：保留中文与字母数字，其余折成连字符。
 * "实时美食榜单 Demo" -> "实时美食榜单-demo"
 */
export function toSlug(title: string): string {
  const s = title
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return s || "project";
}

/** 冲突时追加 -2 / -3 ... */
export function uniqueSlug(base: string, taken: string[]): string {
  const set = new Set(taken);
  if (!set.has(base)) return base;
  let n = 2;
  while (set.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}
