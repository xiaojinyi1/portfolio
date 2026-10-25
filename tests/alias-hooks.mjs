// 把 "@/x" 解析到仓库根下的 x.ts / x/index.ts / x
const root = new URL("../", import.meta.url);

export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    const base = new URL(specifier.slice(2), root);
    const candidates = [base.href + ".ts", base.href + "/index.ts", base.href];
    for (const candidate of candidates) {
      try {
        return await next(candidate, context);
      } catch {
        // 试下一个候选
      }
    }
  }
  return next(specifier, context);
}
