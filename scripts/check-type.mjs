// 量一下台上看得清不清：把关键文字的实际字号打印出来
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, openSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = "http://127.0.0.1:3000";
const CANDIDATES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
];
const browser = CANDIDATES.find((p) => existsSync(p));
const profile = mkdtempSync(join(tmpdir(), "cdp-"));
const child = spawn(
  browser,
  ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--remote-debugging-port=9334", `--user-data-dir=${profile}`, "--window-size=1440,1000", "about:blank"],
  { stdio: ["ignore", openSync(join(tmpdir(), "cdp2.log"), "w"), openSync(join(tmpdir(), "cdp2.log"), "w")] },
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let wsUrl;
for (let i = 0; i < 60 && !wsUrl; i += 1) {
  try {
    const list = await (await fetch("http://127.0.0.1:9334/json/list")).json();
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
await send("Page.navigate", { url: `${BASE}/work/${encodeURIComponent("校门口美食实时榜单")}` });
await sleep(2500);

const { result } = await send("Runtime.evaluate", {
  returnByValue: true,
  expression: `(() => {
    const pick = (sel) => { const el = document.querySelector(sel); if (!el) return null;
      const s = getComputedStyle(el); return { size: s.fontSize, line: s.lineHeight }; };
    return JSON.stringify({
      title: pick('.detail-title'),
      prose: pick('.prose p'),
      factsValue: pick('.facts-value'),
      factsLabel: pick('.facts-label'),
      nav: pick('.nav-links a'),
      hint: pick('.kbd-hint'),
    });
  })()`,
});
console.log("详情页字号：", result.value);

await send("Page.navigate", { url: `${BASE}/` });
await sleep(2000);
const home = await send("Runtime.evaluate", {
  returnByValue: true,
  expression: `(() => {
    const pick = (sel) => { const el = document.querySelector(sel); if (!el) return null;
      const s = getComputedStyle(el); return { size: s.fontSize, line: s.lineHeight }; };
    return JSON.stringify({
      hero: pick('.hero-title'),
      about: pick('.about p'),
      workTitle: pick('.work-title'),
      meta: pick('.hero-meta'),
    });
  })()`,
});
console.log("首页字号：", home.result.value);

ws.close();
child.kill();
