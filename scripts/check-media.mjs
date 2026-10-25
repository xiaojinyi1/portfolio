// 量图片实际盒子，确认有没有被缩窄
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, openSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CANDIDATES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
];
const browser = CANDIDATES.find((p) => existsSync(p));
const profile = mkdtempSync(join(tmpdir(), "cdp3-"));
const log = openSync(join(tmpdir(), "cdp3.log"), "w");
const child = spawn(
  browser,
  ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--remote-debugging-port=9336", `--user-data-dir=${profile}`, "--window-size=1440,1000", "about:blank"],
  { stdio: ["ignore", log, log] },
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let wsUrl;
for (let i = 0; i < 60 && !wsUrl; i += 1) {
  try {
    const list = await (await fetch("http://127.0.0.1:9336/json/list")).json();
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

await send("Page.enable");
await send("Page.navigate", { url: `http://127.0.0.1:3000/work/${encodeURIComponent("校门口美食实时榜单")}` });
await sleep(2500);
await send("Runtime.evaluate", { expression: "window.scrollTo(0, 900)" });
await sleep(1200);

const { result } = await send("Runtime.evaluate", {
  returnByValue: true,
  expression: `(() => {
    const box = (el) => el ? { x: Math.round(el.getBoundingClientRect().x), w: Math.round(el.getBoundingClientRect().width), h: Math.round(el.getBoundingClientRect().height) } : null;
    const wrap = document.querySelector('.detail-figures');
    const rev = document.querySelector('.reveal');
    const img = document.querySelector('.reveal img');
    return JSON.stringify({
      figures: box(wrap),
      reveal: box(rev),
      img: box(img),
      natural: img ? [img.naturalWidth, img.naturalHeight] : null,
      radius: rev ? getComputedStyle(rev).borderRadius : null,
      innerTransform: img ? getComputedStyle(img).transform : null,
    });
  })()`,
});
console.log("尺寸：", result.value);

const prev = await send("Runtime.evaluate", {
  returnByValue: true,
  expression: `(() => {
    const el = document.querySelector('.preview');
    if (!el) return 'none';
    el.scrollIntoView();
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return JSON.stringify({ radius: s.borderRadius, overflow: s.overflow, w: Math.round(r.width), shadow: s.boxShadow.slice(0, 40) });
  })()`,
});
console.log("预览框：", prev.result.value);

ws.close();
child.kill();
