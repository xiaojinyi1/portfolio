/**
 * 检查两种形态是否各就各位：
 *   node scripts/check-deploy.mjs       → 本地形态（端口预览、后台可用）
 *   node scripts/check-deploy.mjs --hosted  → 线上形态（后台 404、只认 liveUrl）
 */
const base = process.env.BASE ?? "http://127.0.0.1:3000";
const hosted = process.argv.includes("--hosted");
const slug = encodeURIComponent("校门口美食实时榜单");

const get = async (path, init) => {
  const res = await fetch(base + path, init);
  return { status: res.status, text: await res.text() };
};

const detail = await get(`/work/${slug}`);
const port = detail.text.match(/127\.0\.0\.1:(\d+)/);
const liveUrl = detail.text.includes("https://demo.pages.dev");

console.log(`[detail] ${detail.status}`);
console.log(`  端口预览: ${port ? port[0] : "没有"}`);
console.log(`  嵌 liveUrl: ${liveUrl}`);
console.log(`  显示「线上地址还没填」: ${detail.text.includes("线上地址还没填")}`);
console.log(`  有 Admin 入口: ${detail.text.includes('href="/admin"')}`);

const admin = await get("/admin");
console.log(`[admin] ${admin.status}`);

const login = await get("/api/admin/login", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ password: process.env.ADMIN_PASSWORD ?? "portfolio" }),
});
console.log(`[login] ${login.status}`);

const home = await get("/");
console.log(`[home] ${home.status} 有作品: ${home.text.includes("校门口美食实时榜单")}`);

if (port) {
  const live = await fetch(`http://127.0.0.1:${port[1]}/`);
  console.log(`[port ${port[1]}] ${live.status}`);
}

const problems = [];
if (hosted) {
  if (admin.status !== 404) problems.push("线上 /admin 应当 404");
  if (login.status !== 404) problems.push("线上 /api/admin/login 应当 404");
  if (port) problems.push("线上不该嵌本地端口");
  if (detail.text.includes('href="/admin"')) problems.push("线上不该出现 Admin 入口");
} else {
  if (admin.status !== 200) problems.push("本地 /admin 应当 200");
  if (!port) problems.push("本地应当嵌本地端口");
}

console.log(problems.length ? `\n不通过：\n- ${problems.join("\n- ")}` : "\n全部符合预期");
// 不用 process.exit()：Windows 上还有 keep-alive 连接时会触发 libuv 断言
process.exitCode = problems.length ? 1 : 0;
