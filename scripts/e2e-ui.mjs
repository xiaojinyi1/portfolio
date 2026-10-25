// 用 CDP 驱动无头 Chrome：带 cookie 看后台、检查 reveal 动效是否真的触发、顺手出图
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.E2E_BASE ?? "http://127.0.0.1:3000";
const PORT = 9333;

function envValue(key) {
  const text = readFileSync(join(process.cwd(), ".env.local"), "utf8").replace(/^\uFEFF/, "");
  const line = text.split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
  return line ? line.slice(key.length + 1).trim() : "";
}

const CANDIDATES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
];
const browser = process.env.PORTFOLIO_BROWSER ?? CANDIDATES.find((p) => existsSync(p));
if (!browser) throw new Error("没找到 Chrome / Edge");

const profile = join(tmpdir(), `cdp-${process.pid}`);
mkdirSync(profile, { recursive: true });
const logFd = openSync(join(tmpdir(), `cdp-${process.pid}.log`), "w");

const child = spawn(
  browser,
  [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    "--window-size=1440,1000",
    "about:blank",
  ],
  { stdio: ["ignore", logFd, logFd] },
);

async function waitFor(fn, timeout = 20000, step = 120) {
  const deadline = Date.now() + timeout;
  for (;;) {
    try {
      const value = await fn();
      if (value) return value;
    } catch {
      // 还没起来
    }
    if (Date.now() > deadline) throw new Error("等待超时");
    await new Promise((r) => setTimeout(r, step));
  }
}

const targets = await waitFor(async () => {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  const list = await res.json();
  const page = list.find((t) => t.type === "page");
  return page ? page.webSocketDebuggerUrl : null;
});

const ws = new WebSocket(targets);
await new Promise((resolve, reject) => {
  ws.addEventListener("open", resolve, { once: true });
  ws.addEventListener("error", reject, { once: true });
});

let nextId = 0;
const pending = new Map();
ws.addEventListener("message", (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
  }
});

function send(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

const evaluate = async (expression) => {
  const { result } = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  return result.value;
};

async function shot(path) {
  const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync(path, Buffer.from(data, "base64"));
  console.log("截图", path);
}

async function go(url, waitMs = 1200) {
  await send("Page.navigate", { url });
  await new Promise((r) => setTimeout(r, waitMs));
}

try {
  await send("Page.enable");
  await send("Network.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });

  // 1. 后台：没登录先看到口令门
  await go(`${BASE}/admin`);
  await shot("screenshots/admin-gate.png");

  // 2. 种 cookie，再看后台真实界面
  const password = envValue("ADMIN_PASSWORD");
  const token = createHash("sha256").update(password).digest("hex").slice(0, 32);
  await send("Network.setCookie", {
    name: "pf_admin",
    value: token,
    domain: "127.0.0.1",
    path: "/",
    httpOnly: true,
  });
  await go(`${BASE}/admin`, 2000);
  const adminText = await evaluate("document.body.innerText.slice(0, 400)");
  console.log("后台首屏：", JSON.stringify(adminText));
  await shot("screenshots/admin.png");

  // 3. 详情页：检查 reveal 是否真的从 0 翻到 1
  const listRes = await fetch(`${BASE}/api/admin/projects`, { headers: { cookie: `pf_admin=${token}` } });
  const projects = await listRes.json();
  const first = projects[0];
  console.log("拿到的第一个作品：", first?.slug);
  await go(`${BASE}/work/${encodeURIComponent(first.slug)}`, 1500);
  const before = await evaluate(
    `JSON.stringify([...document.querySelectorAll('.reveal')].map(e => e.dataset.in ?? null))`,
  );
  console.log("刚进页面 reveal 状态：", before);
  await evaluate("window.scrollTo(0, document.body.scrollHeight)");
  await new Promise((r) => setTimeout(r, 1200));
  const after = await evaluate(
    `JSON.stringify([...document.querySelectorAll('.reveal')].map(e => ({
      in: e.dataset.in ?? null,
      opacity: getComputedStyle(e).opacity,
      transform: getComputedStyle(e).transform,
    })))`,
  );
  console.log("滚到底 reveal 状态：", after);
  await evaluate("window.scrollTo(0, 0)");
  await new Promise((r) => setTimeout(r, 800));
  await shot("screenshots/detail-top.png");

  // 4. 首页 floating cover：滚到列表，真的把鼠标移到一行上，看封面出不出现
  await go(`${BASE}/`, 1500);
  await evaluate(`document.querySelector('.work-item')?.scrollIntoView({block:'center'})`);
  await new Promise((r) => setTimeout(r, 600));
  const rect = await evaluate(
    `(() => { const el = document.querySelector('.work-item'); if (!el) return null;
      const r = el.getBoundingClientRect(); return {x: r.x + r.width/2, y: r.y + r.height/2}; })()`,
  );
  console.log("第一行位置：", JSON.stringify(rect));
  if (rect) {
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 600, y: rect.y });
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: rect.x, y: rect.y });
    await new Promise((r) => setTimeout(r, 900));
    const cover = await evaluate(
      `(() => { const c = document.querySelector('.floating-cover');
        if (!c) return 'missing';
        const s = getComputedStyle(c);
        return JSON.stringify({visible: c.dataset.visible ?? null, opacity: s.opacity,
          transform: c.style.transform, img: c.querySelector('img')?.getAttribute('src')}); })()`,
    );
    console.log("floating cover:", cover);
    await shot("screenshots/home-hover.png");
  }
} finally {
  ws.close();
  child.kill();
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {
    // 忽略
  }
}
