import { createServer } from "node:net";

/** 端口能否在本机 127.0.0.1 上监听（true = 空闲） */
export function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

/** 从 from 开始找空闲端口，跳过 taken；slots 限定最多试多少个 */
export async function allocatePort(
  from = 4300,
  taken: Set<number> = new Set(),
  slots = 200,
): Promise<number> {
  for (let i = 0; i < slots; i += 1) {
    const port = from + i;
    if (taken.has(port)) continue;
    if (await isPortFree(port)) return port;
  }
  throw new Error(`端口 ${from}..${from + slots - 1} 都被占用，找不到可用端口`);
}
