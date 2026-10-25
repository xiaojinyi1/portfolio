// 端到端自查：登录 → 导入本机路径 → 发布 → 首页/详情页可见 → 端口能访问
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.E2E_BASE ?? "http://127.0.0.1:3000";
const PASS = process.env.ADMIN_PASSWORD ?? "portfolio";

const siteDir = join(process.cwd(), "data", "tmp", "e2e-site");
mkdirSync(siteDir, { recursive: true });
writeFileSync(
  join(siteDir, "index.html"),
  `<!doctype html><meta charset="utf-8"><title>自习室占座表</title>
   <body style="background:#101014;color:#eee;font-family:system-ui;padding:40px">
   <h1>今天谁在自习</h1><p>一个记录教室里哪个座位有人的小页面，刷新会更新。</p>
   <h2>怎么用</h2><p>点座位切换状态，卡住的座位长按两秒清空。</p>
   </body>`,
);

function cookieFrom(res) {
  const raw = res.headers.get("set-cookie") ?? "";
  return raw.split(";")[0];
}

const login = await fetch(`${BASE}/api/admin/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ password: PASS }),
});
console.log("login:", login.status);
const cookie = cookieFrom(login);

const imported = await fetch(`${BASE}/api/admin/projects`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie },
  body: JSON.stringify({
    kind: "path",
    title: "自习室占座表",
    date: "2025.09",
    note: "最难的是两个人同时点同一个座位，后来用一次性 lock 才不打架",
    path: siteDir,
  }),
});
const payload = await imported.json();
console.log("import:", imported.status, JSON.stringify(payload).slice(0, 400));

if (!imported.ok) process.exit(1);
const slug = payload.project.slug;

const patched = await fetch(`${BASE}/api/admin/projects/${encodeURIComponent(slug)}`, {
  method: "PATCH",
  headers: { "content-type": "application/json", cookie },
  body: JSON.stringify({ published: true }),
});
console.log("publish:", patched.status);

const home = await fetch(`${BASE}/`);
const homeHtml = await home.text();
console.log("home contains title:", homeHtml.includes("自习室占座表"));

const detail = await fetch(`${BASE}/work/${encodeURIComponent(slug)}`);
const detailHtml = await detail.text();
console.log("detail:", detail.status, "has intro:", /今天谁在自习|个记录/.test(detailHtml));
console.log("detail has iframe:", detailHtml.includes("iframe"), "port:", /127\.0\.0\.1:(\d+)/.exec(detailHtml)?.[1]);

const port = Number(/127\.0\.0\.1:(\d+)/.exec(detailHtml)?.[1] ?? 0);
if (port) {
  const site = await fetch(`http://127.0.0.1:${port}/`);
  const html = await site.text();
  console.log("site served:", site.status, html.includes("今天谁在自习"));
}

const runtime = await fetch(`${BASE}/api/admin/runtime`, { headers: { cookie } });
console.log("runtime:", JSON.stringify(await runtime.json()).slice(0, 300));
