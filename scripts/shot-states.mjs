// 截图几个状态：详情页图片悬停、预览框圆角
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, openSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SLUG = encodeURIComponent("校门口美食实时榜单");
const CANDIDATES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
];
const browser = CANDIDATES.find((p) => existsSync(p));
const profile = mkdtempSync(join(tmpdir(), "cdp4-"));
const log = openSync(join(tmpdir(), "cdp4.log"), "w");
const child = spawn(
  browser,
  [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--remote-debugging-port=9338",
    `--user-data-dir=${profile}`,
    "--window-size=1440,1000",
    "about:blank",
  ],
  { stdio: ["ignore", log, log] },
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let wsUrl;
for (let i = 0; i < 60 && !wsUrl; i += 1) {
  try {
    const list = await (await fetch("http://127.0.0.1:9338/json/list")).json();
    wsUrl = list.find((t) => t.type === "page")?.webSocketDebuggerUrl;
  } catch {
    await sleep(200);
  }
}

const ws = new WebSocket(wsUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let id = 0;
const pending = new Map();
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m.result);
    pending.delete(m.id);
  }
});
const send = (method, params = {}) =>
  new Promise((r) => {
    pending.set(++id, r);
    ws.send(JSON.stringify({ id, method, params }));
  });

const shoot = async (file) => {
  const shot = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(file, Buffer.from(shot.data, "base64"));
  console.log("截图", file);
};

await send("Page.enable");
await send("Page.navigate", { url: `http://127.0.0.1:3000/work/${SLUG}` });
await sleep(2600);
// 关掉平滑滚动，否则会拍到滚动中途
await send("Runtime.evaluate", { expression: "document.documentElement.style.scrollBehavior = 'auto'" });

// 滚到首屏图顶部留 120px，再把鼠标放在图中间
await send("Runtime.evaluate", {
  expression:
    "window.scrollTo(0, document.querySelector('.reveal').getBoundingClientRect().top + window.scrollY - 120)",
});
await sleep(800);
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 720, y: 520 });
await sleep(900);
await shoot("screenshots/detail-figure-hover.png");

// 预览框（圆角 + 阴影）
await send("Runtime.evaluate", {
  expression:
    "window.scrollTo(0, document.querySelector('.preview').getBoundingClientRect().top + window.scrollY - 120)",
});
await sleep(1400);
await shoot("screenshots/detail-preview.png");

ws.close();
child.kill();
