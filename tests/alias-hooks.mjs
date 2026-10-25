// 把 "@/x" 与无扩展名的 "./x" 解析到仓库里的 .ts 文件（node:test 跑 TS 源码用）
const root = new URL("../", import.meta.url);

function withExtensions(base) {
  return [base + ".ts", base + "/index.ts", base + ".tsx", base];
}

export async function resolve(specifier, context, next) {
  let base = null;

  if (specifier.startsWith("@/")) {
    base = new URL(specifier.slice(2), root).href;
  } else if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
    base = new URL(specifier, context.parentURL).href;
  }

  if (base) {
    for (const candidate of withExtensions(base)) {
      try {
        return await next(candidate, context);
      } catch {
        // 试下一个候选
      }
    }
  }
  return next(specifier, context);
}
