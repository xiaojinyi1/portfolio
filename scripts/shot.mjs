// 用系统里现成的 Chrome / Edge 无头模式截图，不引入 Playwright（省 100MB+ 下载）
// 用法：node scripts/shot.mjs <url> <out.png> [width] [height]
import { spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
];

export function findBrowser() {
  const fromEnv = process.env.PORTFOLIO_BROWSER;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  return CANDIDATES.find((p) => existsSync(p)) ?? null;
}

export function screenshot(url, outPath, width = 1440, height = 900) {
  const browser = findBrowser();
  if (!browser) return Promise.reject(new Error("没找到 Chrome / Edge，无法截图"));

  mkdirSync(dirname(outPath), { recursive: true });
  const profile = mkdtempSync(join(tmpdir(), "shot-profile-"));

  const args = [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`,
    "--virtual-time-budget=4000",
    // Chrome 对带空格的反斜杠路径处理不稳，统一给正斜杠
    `--screenshot=${outPath.split("\\").join("/")}`,
    url,
  ];

  return new Promise((resolve, reject) => {
    const errLog = `${outPath}.log`;
    const log = openSync(errLog, "w");
    const child = spawn(browser, args, {
      stdio: ["ignore", log, log],
      windowsHide: true,
    });
    closeSync(log);

    // Chrome 的父进程常常在真正写盘之前就退出（实测 120ms 退出、740ms 落盘），
    // 所以不能等 exit 再判，必须轮询文件。
    const deadline = Date.now() + 20_000;
    let exited = false;
    let settled = false;

    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearInterval(poll);
      if (error) reject(error);
      else resolve(outPath);
    };

    const poll = setInterval(() => {
      if (existsSync(outPath)) {
        finish(null);
        return;
      }
      if (Date.now() > deadline) {
        try {
          child.kill("SIGKILL");
        } catch {
          // 进程可能已经退出
        }
        let tail = "";
        try {
          tail = readFileSync(errLog, "utf8").split(/\r?\n/).filter(Boolean).slice(-3).join(" | ");
        } catch {
          // 没有日志
        }
        finish(new Error(`截图超时（20s，浏览器已退出=${exited}）。${tail}`));
      }
    }, 100);

    child.once("error", (error) => finish(error));
    child.once("exit", () => {
      exited = true;
      // 沙箱/权限直接拒掉浏览器时，不必空等 20 秒
      let tail = "";
      try {
        tail = readFileSync(errLog, "utf8");
      } catch {
        // 没有日志
      }
      if (/拒绝访问|Access is denied|0x5|EPERM/.test(tail)) {
        finish(new Error(`浏览器启动被拒：${tail.split(/\r?\n/).filter(Boolean).slice(-2).join(" | ")}`));
      }
    });
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [, , url, out, w, h] = process.argv;
  if (!url || !out) {
    console.error("用法：node scripts/shot.mjs <url> <out.png> [width] [height]");
    process.exit(1);
  }
  await screenshot(url, out, Number(w) || 1440, Number(h) || 900);
  console.log(`已保存 ${out}`);
}
