import { spawn, type ChildProcess } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync } from "node:fs";
import type { Server } from "node:http";
import { dirname, join } from "node:path";
import type { Project } from "../types";
import { dataDir } from "../store";
import { allocatePort, isPortFree } from "./ports";
import { startStaticServer } from "./static-server";

export type RunStatus = "stopped" | "starting" | "ready" | "failed";

interface Running {
  port: number;
  status: RunStatus;
  child?: ChildProcess;
  server?: Server;
  logPath?: string;
  error?: string;
}

/**
 * 命令 + 工作目录 + 环境变量 + 日志文件 → 子进程。测试里注入假的实现。
 * 子进程输出写文件而不是走管道：沙箱下 `spawn` 用 piped stdio 会 EPERM，
 * 用 `stdio:"ignore"` 更糟——子进程直接 0xC0000142 起不来。
 */
export type ChildSpawner = (
  command: string,
  cwd: string,
  env: NodeJS.ProcessEnv,
  logPath: string,
) => ChildProcess;

const BASE_PORT = 4300;
const HEALTH_TIMEOUT_MS = Number(process.env.PORTFOLIO_HEALTH_TIMEOUT_MS ?? 25_000);
const LOG_TAIL_LINES = 40;
const NUL = "\\\\.\\NUL";

/** Windows 下的空设备句柄（`stdio:"ignore"` 在沙箱里会让子进程起不来） */
export function devNull(): number {
  return openSync(process.platform === "win32" ? NUL : "/dev/null", "w");
}

/**
 * 把 `start` 字符串变成一条"不经 shell"的启动计划，尽量避开 cmd.exe 这层包裹：
 * cmd.exe 会变成子进程本身，真正的服务是孙进程，Windows 上杀不干净。
 */
export function buildSpawnPlan(start: string): { command: string; args: string[]; shell: boolean } {
  const trimmed = start.trim();

  const quoted = trimmed.match(/^"([^"]+)"\s*(.*)$/);
  if (quoted) {
    const [, exe, rest] = quoted;
    return { command: exe, args: rest ? rest.split(/\s+/).filter(Boolean) : [], shell: false };
  }

  if (/^npm\s/.test(trimmed)) {
    const script = trimmed.replace(/^npm\s+(run\s+)?/, "").split(/\s+/)[0];
    const npmCli = join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
    const localCli = join(dirname(process.execPath), "..", "lib", "node_modules", "npm", "bin", "npm-cli.js");
    const cli = existsSync(npmCli) ? npmCli : existsSync(localCli) ? localCli : null;
    if (cli) {
      return { command: process.execPath, args: [cli, "run", script], shell: false };
    }
  }

  if (/^node\s/.test(trimmed)) {
    return {
      command: process.execPath,
      args: trimmed.slice(4).split(/\s+/).filter(Boolean),
      shell: false,
    };
  }

  return { command: trimmed, args: [], shell: true };
}

/** 杀子进程；带 shell 的那条路要靠 taskkill 才杀得到孙进程，失败时退回直接 kill */
export function killChild(child: ChildProcess, usesShell: boolean): void {
  if (!child.pid) return;
  if (!usesShell) {
    try {
      child.kill("SIGKILL");
    } catch {
      // 已经退出了
    }
    return;
  }

  const nul = devNull();
  const killer = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
    stdio: ["ignore", nul, nul],
    windowsHide: true,
  });
  closeSync(nul);
  killer.once("exit", (code) => {
    if (code !== 0) {
      try {
        child.kill("SIGKILL");
      } catch {
        // 已经退出了
      }
    }
  });
  killer.once("error", () => {
    try {
      child.kill("SIGKILL");
    } catch {
      // 已经退出了
    }
  });
}

export function logTail(logPath: string, lines = LOG_TAIL_LINES): string[] {
  try {
    const raw = readFileSync(logPath, "utf8");
    return raw.split(/\r?\n/).filter(Boolean).slice(-lines);
  } catch {
    return [];
  }
}

async function waitHealthy(port: number, isAlive: () => boolean): Promise<boolean> {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (!isAlive()) return false;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`, {
        signal: AbortSignal.timeout(2000),
        redirect: "manual",
      });
      if (res.status < 500) return true;
    } catch {
      // 还没起来
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

export class Manager {
  private running = new Map<string, Running>();

  private spawner: ChildSpawner = (command, cwd, env, logPath) => {
    const plan = buildSpawnPlan(command);
    mkdirSync(dirname(logPath), { recursive: true });
    const fd = devNull();
    const out = openSync(logPath, "w");
    const child = spawn(plan.command, plan.args, {
      cwd,
      env,
      shell: plan.shell,
      stdio: [fd, out, out],
      windowsHide: true,
    });
    closeSync(fd);
    closeSync(out);
    (child as ChildProcess & { usesShell?: boolean }).usesShell = plan.shell;
    return child;
  };

  setChildSpawner(spawner: ChildSpawner): void {
    this.spawner = spawner;
  }

  status(slug: string): RunStatus {
    return this.running.get(slug)?.status ?? "stopped";
  }

  logs(slug: string): string[] {
    const entry = this.running.get(slug);
    return entry?.logPath ? logTail(entry.logPath) : [];
  }

  port(slug: string): number | undefined {
    return this.running.get(slug)?.port;
  }

  async ensure(project: Project): Promise<number | undefined> {
    if (project.runtime.kind === "remote") return undefined;

    const existing = this.running.get(project.slug);
    if (existing && existing.status === "ready") {
      project.port = existing.port;
      return existing.port;
    }

    const taken = new Set<number>();
    for (const [slug, entry] of this.running) if (slug !== project.slug) taken.add(entry.port);

    const preferred = project.port ?? BASE_PORT;
    const port =
      !taken.has(preferred) && (await isPortFree(preferred))
        ? preferred
        : await allocatePort(BASE_PORT, taken);

    const entry: Running = { port, status: "starting" };
    this.running.set(project.slug, entry);
    project.port = port;

    try {
      if (project.runtime.kind === "static") {
        entry.server = await startStaticServer(project.runtime.dir, port);
        entry.status = "ready";
        return port;
      }

      const logPath = join(dataDir(), "logs", `${project.slug}.log`);
      entry.logPath = logPath;
      const child = this.spawner(
        project.runtime.start,
        project.runtime.cwd,
        {
          ...process.env,
          PORT: String(port),
          HOST: "127.0.0.1",
          NODE_ENV: "development",
          BROWSER: "none",
        },
        logPath,
      );
      entry.child = child;
      child.once("exit", (code) => {
        if (entry.status === "starting") {
          entry.status = "failed";
          entry.error = `进程提前退出（code ${code}）`;
        }
      });

      const alive = () => child.exitCode === null && !child.killed;
      const ok = await waitHealthy(port, alive);
      if (!ok) {
        entry.error = child.exitCode !== null ? `进程退出（code ${child.exitCode}）` : "启动超时";
        killChild(child, Boolean((child as ChildProcess & { usesShell?: boolean }).usesShell));
        const tail = logTail(logPath, 6).join(" | ");
        throw new Error(`${entry.error}。日志：${tail || "（无输出）"}`);
      }
      entry.status = "ready";
      return port;
    } catch (error) {
      entry.status = "failed";
      entry.error = (error as Error).message;
      throw error;
    }
  }

  stop(project: Project | string): void {
    const slug = typeof project === "string" ? project : project.slug;
    const entry = this.running.get(slug);
    if (!entry) return;
    entry.server?.close();
    if (entry.child) {
      killChild(entry.child, Boolean((entry.child as ChildProcess & { usesShell?: boolean }).usesShell));
    }
    entry.status = "stopped";
    this.running.delete(slug);
  }

  stopAll(): void {
    for (const slug of [...this.running.keys()]) this.stop(slug);
  }

  /** 启动时预热所有需要子进程的作品；单个失败不影响其它 */
  async prewarm(projects: Project[]): Promise<void> {
    for (const project of projects) {
      if (project.runtime.kind !== "process") continue;
      try {
        await this.ensure(project);
      } catch {
        // 失败原因存在 entry 里，后台会显示
      }
    }
  }
}

export const manager = new Manager();
