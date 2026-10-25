/**
 * Next 启动时预热进程型作品：课上翻到那一页时端口已经就绪，不用等冷启动。
 * 构建阶段不预热（NEXT_PHASE 是 build 时跳过），也不在 edge runtime 里跑。
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.PORTFOLIO_NO_PREWARM) return;

  try {
    const [{ readProjects }, { manager }] = await Promise.all([
      import("./lib/store"),
      import("./lib/runtime/manager"),
    ]);
    const projects = await readProjects();
    await manager.prewarm(projects.filter((project) => project.published));
  } catch (error) {
    console.error("[portfolio] 预热失败：", error);
  }
}
