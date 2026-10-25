// 服务端截图：后台点「给这个作品截一张图」时用，和 scripts/shot.mjs 同一套参数
import { spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
];

export function findBrowser(): string | null {
  const fromEnv = process.env.PORTFOLIO_BROWSER;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  return CANDIDATES.find((candidate) => existsSync(candidate)) ?? null;
}

export function screenshot(url: string, outPath: string, width = 1440, height = 900): Promise<string> {
  const browser = findBrowser();
  if (!browser) return Promise.reject(new Error("没找到 Chrome / Edge，无法截图"));

  const target = resolve(outPath);
  mkdirSync(dirname(target), { recursive: true });
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
    `--screenshot=${target.split("\\").join("/")}`,
    url,
  ];

  return new Promise((done, fail) => {
    const errLog = `${target}.log`;
    const log = openSync(errLog, "w");
    const child = spawn(browser, args, { stdio: ["ignore", log, log], windowsHide: true });
    closeSync(log);

    const deadline = Date.now() + 20_000;
    let settled = false;

    const finish = (error: Error | null) => {
      if (settled) return;
      settled = true;
      clearInterval(poll);
      if (error) {
        fail(error);
        return;
      }
      try {
        rmSync(errLog, { force: true });
      } catch {
        // 日志删不掉不影响结果
      }
      done(target);
    };

    // 父进程常常先退出、文件后落盘，这里只能轮询
    const poll = setInterval(() => {
      if (existsSync(target)) {
        finish(null);
        return;
      }
      if (Date.now() > deadline) {
        child.kill("SIGKILL");
        finish(new Error("截图超时（20 秒）"));
      }
    }, 100);

    child.once("error", (error) => finish(error as Error));
    child.once("exit", () => {
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
