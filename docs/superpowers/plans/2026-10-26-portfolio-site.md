# 个人作品集网站 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建一个本地运行的个人作品集网站：把做过的网站（zip / 文件夹 / 静态网址 / 本机目录）导入后各起一个本地端口真跑起来，上传时自动生成中文项目介绍，前台是 maximeheckel 风格的深色衬线排版。

**Architecture:** Next.js 15 App Router 单体应用，前端是 Server Component 读 `data/projects.json`，后台 `/admin` 是 Client Component + Route Handler。作品不塞进 `public/` 子路径，而是由 Node 进程内的运行时注册表为每个作品分配一个 127.0.0.1 端口（静态监听或子进程），详情页 iframe 指向该端口。生成走 DeepSeek Chat Completions，只在导入时调用一次，结果进编辑框等人工改。

**Tech Stack:** Next.js 15 (App Router), TypeScript strict, 手写 CSS, vitest, adm-zip, playwright(chromium, 仅用于截图自检), Node 24。

**Spec:** `docs/superpowers/specs/2026-10-25-portfolio-site-design.md`

## Global Constraints

- 项目根：`D:\DeepSeek Harness\portfolio`（下文所有路径相对此根）。Node v24。Windows + PowerShell。
- 不引入 Tailwind、不引入数据库、不引入 WebContainer。数据只有 `data/projects.json`，作品文件落 `data/sites/<slug>/`。`data/` 与 `.env.local` 进 `.gitignore`。
- 色彩值逐字取自 spec：bg `oklch(0.1292 0.005 262.04)`、surface `oklch(0.1468 0.01 262.04)`、surfaceRaised `oklch(0.2484 0.018 262.04)`、textMuted `oklch(0.7716 0.028 262.04)`、textPrimary `oklch(0.9366 0.027 262.04)`。无强调色、无浅色模式、无圆角、不用渐变。
- 动效：初始 `scale(0.96) opacity 0`，进场 780–900ms `cubic-bezier(0.22,1,0.36,1)`，同组错开 90ms；hover `scale(1.015)`；`IntersectionObserver` threshold 0.15 且进场后 unobserve；只动 transform/opacity；`@media (prefers-reduced-motion: reduce)` 下直接显示。
- 任何标题字号 ≥ 20px；正文行高 ≥ 1.6；单个文本块 ≤ 68ch。
- 生成：`POST https://api.deepseek.com/chat/completions`，`model: "deepseek-chat"`，key 读 `process.env.DEEPSEEK_API_KEY`，超时 30000ms，解析失败重试 1 次，再失败返回空介绍。提示词禁词：赋能、打造、一站式、深度融合、助力、闭环、生态。
- 端口从 4300 起顺延；进程启动超时 60000ms；`npm install` 单独一步、上限 300000ms；停止子进程一律 `taskkill /pid <pid> /T /F`（非 Windows 用 `process.kill(-pid)`）。
- iframe 固定 `sandbox="allow-scripts allow-same-origin allow-forms allow-popups"`，外面必须有加载中/失败状态，禁止白框。
- 镜像扫描上限：同源、60 页、20MB、深度 2、单请求 5000ms；遇 `X-Frame-Options` 或 CSP `frame-ancestors 'none'` 直接返回 blocked。
- 所有 Route Handler 必须 `export const runtime = "nodejs"`（注册表是进程内单例，edge 会丢状态）。
- 所有用户可见文案中文；后台口令来自 `process.env.ADMIN_PASSWORD`，缺省 `dev`。

## Review Focus

1. **zip 里带 `../` 或绝对路径或符号链接**（导入时必须拒绝并清理，绝不能写到 `data/sites/<slug>/` 之外）→ Task 8 测 `../evil.txt`、`/abs.txt`、`a/../../x`。
2. **目录里没有入口、但有 `start` 脚本**（必须走进程模式；两者都没有时必须报"没有可运行的入口"并附文件树，不能起一个白页端口）→ Task 3 测三种目录形态。
3. **端口被上次残留进程占着**（必须换下一个端口，且详情页 iframe 用新端口，不能 500 或嵌错站）→ Task 4 测占用端口被跳过、Task 7 测 ensureRunning 两次拿到同一端口。
4. **模型把 JSON 包在 ```json 代码块里、或前后带解释文字**（必须能解析出来，失败才重试，重试也失败才降级）→ Task 10 测三种返回形态。
5. **标题/目录名含中文与空格**（slug 与文件路径、iframe src 必须正确编码，`data/sites/<slug>/` 下中文名图片能加载）→ Task 2 测 slug 保留 CJK、Task 9 测中文文件名候选。

---

### Task 1: 脚手架 + 测试跑通

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `.gitignore`, `.env.local.example`, `app/layout.tsx`, `app/page.tsx`, `tests/smoke.test.ts`

**Interfaces:**
- Produces: `npm test`（vitest run）、`npm run dev`、`npm run build`、`npm start` 四个命令；`tsconfig` strict + `@/*` 指到根。

- [ ] **Step 1: 初始化仓库与依赖**

```bash
cd "D:\DeepSeek Harness\portfolio"
git init
npm init -y
npm i next@15 react@19 react-dom@19 adm-zip
npm i -D typescript @types/node @types/react @types/react-dom vitest
```

- [ ] **Step 2: 写配置**

`package.json` scripts：`dev: next dev -p 3000`、`build: next build`、`start: next start -p 3000`、`test: vitest run`、`shot: node scripts/shot.mjs`。
`tsconfig.json`：`"strict": true`、`"paths": { "@/*": ["./*"] }`、include `["**/*.ts","**/*.tsx",".next/types/**/*.ts"]`。
`vitest.config.ts`：`test: { environment: "node", include: ["tests/**/*.test.ts"] }`。
`.gitignore`：`node_modules`、`.next`、`data/`、`.env.local`、`screenshots/`。

- [ ] **Step 3: 写失败测试**

```ts
// tests/smoke.test.ts
import { expect, test } from "vitest";
import { toSlug } from "@/lib/slug";

test("toSlug 保留中文并压掉空格", () => {
  expect(toSlug("实时美食榜单 Demo")).toBe("实时美食榜单-demo");
});
```

- [ ] **Step 4: 运行确认失败**

Run: `npx vitest run tests/smoke.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/slug"`

- [ ] **Step 5: 最小实现 `lib/slug.ts`**

```ts
export function toSlug(title: string): string {
  const s = title.trim().toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return s || "project";
}
```

- [ ] **Step 6: 占位首页与布局**

`app/layout.tsx` 设 `<html lang="zh-CN">`、`<body>` 引入 `./globals.css`；`app/page.tsx` 先返回 `<main>作品集</main>`；`app/globals.css` 写入 Global Constraints 的五个色彩变量到 `:root` 并 `background: var(--bg)`。

- [ ] **Step 7: 跑测试与构建**

Run: `npx vitest run` → 1 passed。Run: `npm run build` → 成功。

- [ ] **Step 8: 提交**

```bash
git add -A && git commit -m "chore: scaffold next15 + vitest"
```

---

### Task 2: 类型、存储、slug 去重

**Files:**
- Create: `lib/types.ts`, `lib/store.ts`, `lib/slug.ts`(改), `tests/slug.test.ts`, `tests/store.test.ts`

**Interfaces:**
- Produces:
  - `lib/types.ts`: `type Runtime = { kind:"static"; dir:string } | { kind:"process"; cwd:string; start:string; healthPath?:string } | { kind:"remote"; url:string; mirrored:boolean }`；`type FactKey = "time"|"role"|"stack"|"status"`；`interface Project { slug:string; title:string; date:string; intro:string[]; facts:Record<FactKey,string>; images:{src:string;caption:string;alt:string}[]; note?:string; runtime:Runtime; port?:number; sourceLabel:string; published:boolean; createdAt:string; order:number }`；`interface Draft { intro:string[]; facts:Record<FactKey,string> }`
  - `lib/slug.ts`: `toSlug(title: string): string`、`uniqueSlug(base: string, taken: string[]): string`（冲突追加 `-2`、`-3`）
  - `lib/store.ts`: `dataDir(): string`（返回 `<root>/data`）、`readProjects(): Promise<Project[]>`、`writeProjects(list: Project[]): Promise<void>`（写临时文件再 rename）、`getProject(slug: string): Promise<Project | undefined>`、`upsertProject(p: Project): Promise<void>`、`removeProject(slug: string): Promise<void>`、`siteDir(slug: string): string`（`<root>/data/sites/<slug>`）
  - 测试可用环境变量 `PORTFOLIO_DATA_DIR` 指到临时目录，`dataDir()` 优先读它。

- [ ] **Step 1: 写失败测试**

```ts
// tests/slug.test.ts
import { test, expect } from "vitest";
import { toSlug, uniqueSlug } from "@/lib/slug";
test("uniqueSlug 冲突追加序号", () => {
  expect(uniqueSlug("work", ["work"])).toBe("work-2");
  expect(uniqueSlug("work", ["work","work-2"])).toBe("work-3");
});
test("toSlug 去掉标点、压缩连字符", () => {
  expect(toSlug("  Campus   Heat!! ")).toBe("campus-heat");
});
```

```ts
// tests/store.test.ts
import { test, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
beforeEach(() => { process.env.PORTFOLIO_DATA_DIR = mkdtempSync(join(tmpdir(), "pf-")); });
test("读写往返并保持顺序", async () => {
  const { readProjects, writeProjects, upsertProject, getProject } = await import("@/lib/store");
  expect(await readProjects()).toEqual([]);
  const p = { slug:"a", title:"A", date:"2025.06", intro:[], facts:{time:"",role:"",stack:"",status:""}, images:[], runtime:{kind:"remote",url:"https://x.test",mirrored:false}, sourceLabel:"静态网址", published:false, createdAt:new Date().toISOString(), order:1 };
  await upsertProject(p);
  expect((await getProject("a"))?.title).toBe("A");
  await writeProjects([]);
  expect(await readProjects()).toEqual([]);
});
```

- [ ] **Step 2: 运行确认失败** — `npx vitest run tests/slug.test.ts tests/store.test.ts` → 模块不存在。

- [ ] **Step 3: 实现**

`writeProjects` 用 `await writeFile(tmp, json)` + `await rename(tmp, file)`；`readProjects` 文件不存在返回 `[]`，解析失败抛 `Error("projects.json 损坏，请检查：" + file)`。`uniqueSlug` 循环 `-n` 直到不冲突。

- [ ] **Step 4: 跑通** — `npx vitest run` 全绿。

- [ ] **Step 5: 提交** — `git add -A && git commit -m "feat: project model and json store"`

---

### Task 3: 入口识别与运行模式判定

**Files:**
- Create: `lib/detect.ts`, `tests/detect.test.ts`

**Interfaces:**
- Produces:
  - `detectEntry(root: string): Promise<EntryDetection>`
  - `interface EntryDetection { mode:"static"|"process"|"none"; dir:string; start?:string; tree:string[] }`
  - `findStaticEntry(root: string): Promise<string|null>`（顺序：`index.html`、`dist/index.html`、`build/index.html`、`public/index.html`、`out/index.html`，返回其目录绝对路径）
  - `readStartScript(root: string): Promise<string|null>`（读 `package.json` 的 `scripts.start`，没有再看 `scripts.dev`，都没有返回 null）
  - `listTree(root: string, max = 40): Promise<string[]>`

- [ ] **Step 1: 写失败测试**

```ts
// tests/detect.test.ts
import { test, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectEntry, listTree } from "@/lib/detect";
const mk = () => mkdtempSync(join(tmpdir(), "det-"));

test("根目录有 index.html → static", async () => {
  const d = mk(); writeFileSync(join(d, "index.html"), "<h1>hi</h1>");
  expect((await detectEntry(d)).mode).toBe("static");
});
test("只有 dist/index.html → static 且 dir 指到 dist", async () => {
  const d = mk(); mkdirSync(join(d, "dist")); writeFileSync(join(d, "dist/index.html"), "x");
  const r = await detectEntry(d); expect(r.mode).toBe("static"); expect(r.dir).toBe(join(d, "dist"));
});
test("有 start 脚本无 index → process 且带 start", async () => {
  const d = mk(); writeFileSync(join(d, "package.json"), JSON.stringify({ scripts: { start: "node server.mjs" } }));
  const r = await detectEntry(d); expect(r.mode).toBe("process"); expect(r.start).toBe("node server.mjs");
});
test("两者都没有 → none 且 tree 非空", async () => {
  const d = mk(); writeFileSync(join(d, "readme.md"), "x");
  const r = await detectEntry(d); expect(r.mode).toBe("none"); expect(r.tree.length).toBeGreaterThan(0);
});
test("listTree 跳过 node_modules 且限制条数", async () => {
  const d = mk(); mkdirSync(join(d, "node_modules/a"), { recursive: true }); writeFileSync(join(d, "node_modules/a/x.js"), "");
  mkdirSync(join(d, "src")); writeFileSync(join(d, "src/a.ts"), "");
  const t = await listTree(d, 10);
  expect(t.some(p => p.includes("node_modules"))).toBe(false);
});
```

- [ ] **Step 2: 运行确认失败**

- [ ] **Step 3: 实现** — `listTree` 递归 `readdir(withFileTypes)`，跳过 `node_modules`、`.git`，最多 `max` 条，返回相对路径。

- [ ] **Step 4: 跑通**

- [ ] **Step 5: 提交** — `git commit -m "feat: detect entry and runtime mode"`

---

### Task 4: 端口分配

**Files:**
- Create: `lib/runtime/ports.ts`, `tests/ports.test.ts`

**Interfaces:**
- Produces: `isPortFree(port: number): Promise<boolean>`（`createServer().listen` 试绑 127.0.0.1）、`allocatePort(from = 4300, taken: Set<number> = new Set()): Promise<number>`（在 `[from, from+200)` 里找第一个既未被占用也不在 `taken` 的端口，全占用抛错）。

- [ ] **Step 1: 写失败测试** — 占住 4300 → `allocatePort(4300)` 必须返回 4301；`allocatePort(4300, new Set([4300]))` 返回 ≥4301；连续两次 `allocatePort(4300)` 返回不同端口（第二个靠 `taken` 或仍空闲，但第一次分配的端口在被占用前仍空闲——所以这里测 `isPortFree(4300)===false` 后分配 ≠ 4300）。

- [ ] **Step 2: 确认失败** — `npx vitest run tests/ports.test.ts`

- [ ] **Step 3: 实现** — 用 `net.createServer()`，`listen(port,"127.0.0.1")`，`error` 事件 resolve false，`listening` 事件 close 后 resolve true。

- [ ] **Step 4: 跑通**

- [ ] **Step 5: 提交**

---

### Task 5: 只读静态服务器

**Files:**
- Create: `lib/runtime/static-server.ts`, `tests/static-server.test.ts`

**Interfaces:**
- Produces: `startStaticServer(dir: string, port: number): Promise<{ port:number; url:string; close(): Promise<void> }>`。行为：`/` → `index.html`；目录请求补 `index.html`；扩展名映射 mime（html/css/js/json/png/jpg/webp/svg/woff2/mp4/md/txt）；路径含 `..` 或解析后不在 `dir` 内 → 403；不存在 → 404 文本；无缓存头，加 `Cache-Control: no-store`。

- [ ] **Step 1: 写失败测试** — 临时目录放 `index.html`（内容 `hello`）与 `assets/a.css`；起服务后用 `fetch` 断言 `/` 返回 200 含 `hello`、`/assets/a.css` 200 且 `content-type` 含 `text/css`、`/../package.json` 返回 403 或 404、`/nope` 404。`afterEach` 调 `close()`。

- [ ] **Step 2: 确认失败**

- [ ] **Step 3: 实现** — `node:http` + `fs.createReadStream` + `path.resolve` 前缀校验。

- [ ] **Step 4: 跑通**

- [ ] **Step 5: 提交**

---

### Task 6: 进程型运行器

**Files:**
- Create: `lib/runtime/process-runner.ts`, `tests/process-runner.test.ts`

**Interfaces:**
- Produces: `startProcess(cfg: { cwd:string; start:string; port:number; healthPath?:string; timeoutMs?:number; onLog?(line:string):void }): Promise<{ stop():Promise<void>; pid:number } >`。行为：`spawn(start, { cwd, shell:true, env: { ...process.env, PORT:String(port) } })`；stdout/stderr 逐行 `onLog`；轮询 `http://127.0.0.1:<port><healthPath ?? "/">` 每 500ms，2xx/3xx/404 都算 ready（404 说明服务在跑）；`timeoutMs` 默认 60000 超时则 stop 并抛 `Error("启动超时（60 秒）")`；`stop()` 在 win32 上 `taskkill /pid <pid> /T /F`，否则 `process.kill(-pid,"SIGTERM")`，并在 3 秒内轮询端口释放。

- [ ] **Step 1: 写失败测试** — 夹具：在临时目录写 `server.mjs`，内容为读 `process.env.PORT` 起 http 服务返回 `ok`。断言 `startProcess` resolve 后 `fetch(127.0.0.1:port)` 得到 `ok`，`stop()` 后 `isPortFree(port)` 为 true（用 Task 4 的 `isPortFree`）。第二个测试：`start` 为 `node -e "setTimeout(()=>{},60000)"` + `timeoutMs: 1500` → 抛超时错误。

- [ ] **Step 2: 确认失败**

- [ ] **Step 3: 实现**（注意：`shell: true` 在 Windows 下拿到的 pid 可能是 cmd 壳，`taskkill /T` 能连子进程一起杀，这正是要 `/T` 的原因）

- [ ] **Step 4: 跑通**（该测试需要真实起进程，超时设为 15s：`test("...", async () => {...}, 15000)`）

- [ ] **Step 5: 提交**

---

### Task 7: 运行时注册表

**Files:**
- Create: `lib/runtime/index.ts`, `tests/runtime.test.ts`

**Interfaces:**
- Consumes: `startStaticServer`(Task 5)、`startProcess`(Task 6)、`allocatePort`(Task 4)、`Project`(Task 2)
- Produces:
  - `type RuntimeStatus = "stopped"|"starting"|"ready"|"failed"`
  - `interface StatusEntry { slug:string; port:number; status:RuntimeStatus; error?:string; log:string[] }`
  - `ensureRunning(p: Project): Promise<StatusEntry>`（幂等：已 ready 直接返回；失败重试一次；`remote` 且 `mirrored` 走静态，`remote` 未镜像则返回 `status:"ready"` 且 `port:0`，让页面直接用外链）
  - `stopProject(slug: string): Promise<void>`、`stopAll(): Promise<void>`、`statuses(): StatusEntry[]`、`portOf(slug:string): number|undefined`
  - 注册表是模块级 `Map<string, Entry>`；`log` 保留最后 50 行。

- [ ] **Step 1: 写失败测试** — 两个 static 项目（各自临时目录 + index.html）→ `ensureRunning` 各得到不同端口且都能 fetch 到内容；再 `ensureRunning` 同一项目 → 端口不变；`stopAll()` 后 `statuses()` 为空且端口都释放。

- [ ] **Step 2: 确认失败**

- [ ] **Step 3: 实现** — 分配端口时把 `Map` 里已登记的端口放进 `allocatePort` 的 `taken`。

- [ ] **Step 4: 跑通**

- [ ] **Step 5: 提交**

---

### Task 8: zip 解压（含 zip-slip 防护）

**Files:**
- Create: `lib/zip.ts`, `tests/zip.test.ts`

**Interfaces:**
- Produces: `type ZipResult = { files: number; bytes: number }`；`extractZip(buf: Buffer, destDir: string): Promise<ZipResult>`；`isSafeEntryName(name: string): boolean`（拒绝绝对路径、盘符、含 `..` 段、空名）；遇不安全条目抛 `Error("压缩包里有不安全路径：" + name)` 且**不写任何文件**（先全量校验再解压）。

- [ ] **Step 1: 写失败测试** — 用 `adm-zip` 在测试里现造 zip：正常 zip（`index.html` + `assets/a.png`）解压后文件存在、内容一致；恶意 zip（`../evil.txt`）→ rejects 且 `data/../evil.txt` 不存在；`/abs.txt` → rejects；中文名 `图片/封面.png` 正常解出。

- [ ] **Step 2: 确认失败**

- [ ] **Step 3: 实现** — `new AdmZip(buf).getEntries()` → 过滤目录 → 先 `every(e => isSafeEntryName(e.entryName))`，再 `zip.extractAllTo(destDir, true)`；返回累计字节。

- [ ] **Step 4: 跑通**

- [ ] **Step 5: 提交**

---

### Task 9: 候选图片扫描

**Files:**
- Create: `lib/images.ts`, `tests/images.test.ts`

**Interfaces:**
- Produces: `interface ImageCandidate { src:string; bytes:number }`、`scanImages(root: string, limit = 12): Promise<ImageCandidate[]>`。`src` 是相对 `root` 的 posix 路径（如 `assets/cover.png`）；扩展名白名单 `.png .jpg .jpeg .webp .avif .gif`；跳过 `node_modules`、`.git`、深度 > 6；按 `bytes` 降序取前 `limit`；解码失败不抛。

- [ ] **Step 1: 写失败测试** — 目录里放 `assets/cover.png`(100B)、`assets/small.png`(10B)、`图片/截图.png`(50B)、`src/app.ts` → 结果 3 条、按体积降序、含中文路径条目；`limit=1` 只返回最大的。

- [ ] **Step 2: 确认失败**

- [ ] **Step 3: 实现**

- [ ] **Step 4: 跑通**

- [ ] **Step 5: 提交**

---

### Task 10: 提示词与 DeepSeek 生成

**Files:**
- Create: `lib/prompts.ts`, `lib/generate.ts`, `tests/prompts.test.ts`, `tests/generate.test.ts`

**Interfaces:**
- Produces:
  - `interface GenerateInput { title:string; date:string; note?:string; assets:string; fileList:string[] }`
  - `buildMessages(input: GenerateInput): { role:"system"|"user"; content:string }[]`
  - `SYSTEM_PROMPT: string`（含禁词表、"不编造技术栈"、"不提 AI"、"输出严格 JSON"）
  - `parseModelJson(raw: string): Draft | null`（先直接 `JSON.parse`；失败则剥 ```json 围栏；再失败则取第一个 `{` 到最后一个 `}`；仍失败 null；校验 `intro` 非空字符串数组且 `facts` 四键齐全）
  - `generateDraft(input: GenerateInput, fetchImpl: typeof fetch = fetch): Promise<{ ok:true; draft:Draft } | { ok:false; error:string }>`（`AbortSignal.timeout(30000)`，只重试一次；两次都失败返回 `{ok:false,error}`）

- [ ] **Step 1: 写失败测试**

```ts
// tests/prompts.test.ts
test("提示词含禁词表与 note", () => {
  const msgs = buildMessages({ title:"实时美食榜单", date:"2025.06", note:"最难的是榜单更新时不要闪", assets:"校门口煎饼、面馆", fileList:["server.mjs"] });
  const user = msgs.find(m => m.role === "user")!.content;
  expect(user).toContain("实时美食榜单");
  expect(user).toContain("不要闪");
  expect(user).toContain("校门口煎饼");
  expect(SYSTEM_PROMPT).toContain("赋能");
  expect(SYSTEM_PROMPT).toContain("JSON");
});
```

```ts
// tests/generate.test.ts
test("裸 JSON 可解析", () => expect(parseModelJson('{"intro":["a"],"facts":{"time":"1","role":"2","stack":"3","status":"4"}}')).not.toBeNull());
test("```json 围栏可解析", () => expect(parseModelJson('```json\n{"intro":["a"],"facts":{"time":"1","role":"2","stack":"3","status":"4"}}\n```')).not.toBeNull());
test("前后带解释文字可解析", () => expect(parseModelJson('好的： {"intro":["a"],"facts":{"time":"1","role":"2","stack":"3","status":"4"}} 以上')).not.toBeNull());
test("坏 JSON 返回 null", () => expect(parseModelJson("抱歉我无法完成")).toBeNull());
test("第一次坏第二次好 → 成功且调用两次", async () => { let n = 0; const fake = (async () => { n++; const body = n === 1 ? "garbage" : JSON.stringify({ choices:[{ message:{ content:'{"intro":["a"],"facts":{"time":"1","role":"2","stack":"3","status":"4"}}' } }] }); return new Response(body, { status: 200 }); }) as unknown as typeof fetch; const r = await generateDraft({ title:"t", date:"2025", assets:"", fileList:[] }, fake); expect(r.ok).toBe(true); expect(n).toBe(2); });
test("两次都坏 → ok:false", async () => { const fake = (async () => new Response("garbage", { status: 200 })) as unknown as typeof fetch; const r = await generateDraft({ title:"t", date:"2025", assets:"", fileList:[] }, fake); expect(r.ok).toBe(false); });
```

- [ ] **Step 2: 确认失败**

- [ ] **Step 3: 实现** — 请求体 `{ model:"deepseek-chat", messages, response_format:{ type:"json_object" }, temperature:0.7 }`；读 `json.choices[0].message.content`；非 2xx 或超时算失败。

- [ ] **Step 4: 跑通**

- [ ] **Step 5: 提交**

---

### Task 11: 线上站点镜像

**Files:**
- Create: `lib/mirror.ts`, `tests/mirror.test.ts`

**Interfaces:**
- Produces: `interface MirrorResult { ok:boolean; pages:number; bytes:number; blocked?:boolean; error?:string }`、`mirrorSite(startUrl: string, destDir: string): Promise<MirrorResult>`。规则：只跟同源（同 host）；跳过 `mailto:`/`tel:`/`#`；深度 ≤2；页数 ≤60；总字节 ≤20MB；单请求 5000ms；重写 HTML 里的同源绝对路径（`href="/x"` `src="/x"` `url(/x)`）为相对路径；遇 `x-frame-options` 或 CSP 含 `frame-ancestors 'none'` → 立即返回 `blocked:true` 且不再抓取；入口页写为 `index.html`。

- [ ] **Step 1: 写失败测试** — 起一个本地 http 夹具站（`/` 链到 `/about`，`/about` 有 `<img src="/img/a.png">`），`mirrorSite` 后 `destDir/index.html` 存在、`destDir/about/index.html` 存在、`/img/a.png` 已落盘、`about` 页里 `src` 变成相对路径；夹具返回 `X-Frame-Options: DENY` 时 `blocked` 为 true 且 `pages === 0`。

- [ ] **Step 2: 确认失败**

- [ ] **Step 3: 实现** — 用 `fetch` + `new Set()` 去重 URL；路径映射 `new URL(u).pathname` → 本地文件（`/` → `index.html`，`/about` → `about/index.html`，带扩展名保持原样）。

- [ ] **Step 4: 跑通**

- [ ] **Step 5: 提交**

---

### Task 12: 口令与后台路由鉴权

**Files:**
- Create: `lib/auth.ts`, `tests/auth.test.ts`

**Interfaces:**
- Produces: `ADMIN_COOKIE = "pf_admin"`、`checkPassword(pw: string): boolean`、`signToken(): string`（`ADMIN_PASSWORD` 的 sha256 前 32 位）、`isAuthed(req: Request): boolean`（读 cookie 比对 `signToken()`）、`authCookieHeader(): string`（`pf_admin=<token>; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`）。

- [ ] **Step 1: 写失败测试** — 错口令 false、对口令 true；带正确 cookie 的 `new Request("http://x/admin", { headers: { cookie: authCookieHeader() } })` → `isAuthed` true；无 cookie false。

- [ ] **Step 2: 确认失败 → Step 3 实现 → Step 4 跑通 → Step 5 提交**

---

### Task 13: 后台 API

**Files:**
- Create: `app/api/admin/login/route.ts`, `app/api/admin/projects/route.ts`, `app/api/admin/projects/[slug]/route.ts`, `app/api/admin/import/route.ts`, `app/api/admin/generate/route.ts`, `app/api/admin/runtime/route.ts`, `lib/import.ts`, `tests/api.test.ts`

**Interfaces:**
- Consumes: Task 2 store、Task 3 detect、Task 7 runtime、Task 8 zip、Task 9 images、Task 10 generate、Task 11 mirror、Task 12 auth
- Produces:
  - `lib/import.ts`: `importSource(input: ImportInput): Promise<{ project: Project; warnings: string[] }>`，`type ImportInput = { kind:"zip"; title:string; date:string; note?:string; buf:Buffer } | { kind:"folder"|"path"; title:string; date:string; note?:string; path:string } | { kind:"remote"; title:string; date:string; note?:string; url:string; mirror:boolean }`。流程：定 slug → 落文件到 `siteDir` → `detectEntry` → 定 `runtime` → `scanImages` 取前三张作 `images`（caption 空、alt 用 title）→ 调 `generateDraft`（无 key 则 `intro: []` 且 warnings 加"未配置 DEEPSEEK_API_KEY，介绍需手写"）→ 存项目（`published:false`）。
  - 路由：
    - `POST /api/admin/login` body `{password}` → 200 + Set-Cookie 或 401
    - `GET /api/admin/projects` → `Project[]`；`POST` body `ImportInput`（zip 走 `multipart/form-data` 字段 `file`，其余走 JSON）→ `{ project, warnings }`
    - `PATCH /api/admin/projects/[slug]` body 部分字段（title/date/intro/facts/images/published/note）→ 更新后的 `Project`；`DELETE` → `{ok:true}`
    - `POST /api/admin/generate` body `{ slug }` → `{ ok, draft? , error? }`（重新生成，不覆盖已有文本直到前端点保存）
    - `GET /api/admin/runtime` → `StatusEntry[]`；`POST` body `{ action:"start"|"stop"|"all-start"|"all-stop", slug? }` → `StatusEntry[]`
  - 除 login 外全部先 `isAuthed`，未授权返回 401 `{error:"未授权"}`。

- [ ] **Step 1: 写失败测试** — 直接 `import { POST } from "@/app/api/admin/projects/route"` 调 `POST(req)`：无 cookie → 401；带 cookie + 一个真实 zip（含 index.html 与一张 png）→ 200，`project.runtime.kind === "static"`，`project.images.length === 1`，`data/sites/<slug>/index.html` 存在；再用 `PATCH` 改 `published: true` 并断言 store 里读到 true。
- [ ] **Step 2: 确认失败 → Step 3 实现 → Step 4 跑通 → Step 5 提交**

---

### Task 14: 设计系统与首页

**Files:**
- Create: `app/globals.css`(扩写), `components/RevealImage.tsx`, `components/FloatingCover.tsx`, `components/ScrollProgress.tsx`, `components/ProjectList.tsx`, `components/Nav.tsx`, `scripts/shot.mjs`
- Modify: `app/layout.tsx`, `app/page.tsx`

**Interfaces:**
- Consumes: `readProjects()`（Task 2）
- Produces:
  - `RevealImage({ src, alt, caption?, className?, priority? })`：client component，`useRef` + IntersectionObserver(threshold 0.15)，命中后加 `data-in="true"` 并 unobserve；`prefers-reduced-motion` 时直接 `data-in`
  - `FloatingCover({ src, alt })`：列表悬停跟随鼠标的封面，`translate3d` + `scale(1.04)`，`pointer-events-none`
  - `ScrollProgress()`：右侧竖向 `0.00–1.00`，`scroll` 监听 + `requestAnimationFrame`
  - `ProjectList({ projects })`：年份分组、每项 `View`/标题/日期，悬停浮起封面
  - `scripts/shot.mjs`：`node scripts/shot.mjs <url> <out.png> <width>`，用 playwright chromium 截图

- [ ] **Step 1: 安装字体与截图依赖**

```bash
npm i -D playwright && npx playwright install chromium
npm i @fontsource/ia-writer-quattro
```
（若 `@fontsource/ia-writer-quattro` 不存在，跳过，长文用 `Georgia, "Iowan Old Style", serif` 栈，并在 README 记一行）

- [ ] **Step 2: 写 CSS**

`:root` 五个色值 + `--font-display`(Instrument Serif, 用 `next/font/google` 在 layout 注入 variable) + `--font-ui`(Inter) + `--font-read`(iA Writer Quattro)。定义 `.reveal{opacity:0;transform:scale(.96);transition:opacity .82s cubic-bezier(.22,1,.36,1),transform .82s cubic-bezier(.22,1,.36,1)} .reveal[data-in="true"]{opacity:1;transform:none}`，同组错开用 `:nth-child(n)` 90ms 步进（写 6 条），`@media (prefers-reduced-motion: reduce){.reveal{opacity:1;transform:none;transition:none}}`。

- [ ] **Step 3: 写组件与首页**

首页结构：`Nav`（Index/About/Work/Contact，全站锚点）→ hero（两行大字，`--font-display`，clamp 到 96px）→ About 三段 → Work 列表（`ProjectList` 只渲染 `published` 且按 `order`）→ footer 联系。首页 `export const dynamic = "force-dynamic"`。

- [ ] **Step 4: 造三条假数据看效果**

在 `data/projects.json` 手写 3 条（可用外链占位）→ `npm run dev` → `node scripts/shot.mjs http://127.0.0.1:3000 screenshots/home.png 1440` → 打开截图检查：背景是深色、标题是衬线大字、列表有留白、右侧进度数字在。

- [ ] **Step 5: 提交**

---

### Task 15: 详情页

**Files:**
- Create: `app/work/[slug]/page.tsx`, `components/PreviewFrame.tsx`, `components/Facts.tsx`, `components/KeyboardNav.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `getProject`(Task 2)、`ensureRunning`/`portOf`(Task 7)、`RevealImage`(Task 14)
- Produces: `PreviewFrame({ slug, port, externalUrl? })`：client component，`iframe src={port ? \`http://127.0.0.1:${port}/\` : externalUrl}`，`onError`/8 秒未 `onLoad` 显示"端口未就绪，点重试"，`sandbox` 按 Global Constraints，高度 `72vh`；`KeyboardNav({ prevHref, nextHref, homeHref })`：client component，监听 `keydown`，`ArrowLeft`→`prevHref`、`ArrowRight`→`nextHref`、`Escape`→`homeHref`、`f`→`document.documentElement.requestFullscreen()`；焦点在 input/textarea 时不拦截。

- [ ] **Step 1: 写页面** — 返回 `notFound()` 于未发布/不存在；结构：返回链接 → 标题（`--font-display`，≥20px）→ 日期 → 四格 facts（两列，标签小写 muted、值 primary）→ 两段 intro（`--font-read`，≤68ch）→ 图片流（全部 `RevealImage`，带 caption）→ `打开网站 ↗` + `PreviewFrame` + `KeyboardNav`（上一件/下一件取自同年份已发布项目的相邻两条）。
- [ ] **Step 2: 自查** — `npm run dev`，用 Task 14 的 3 条假数据（其中一条 `runtime.kind:"remote"`）打开详情页截图；确认 facts 不挤、图片下留白足够、iframe 有状态位。
- [ ] **Step 3: 提交**

---

### Task 16: 后台界面

**Files:**
- Create: `app/admin/page.tsx`, `components/admin/LoginGate.tsx`, `components/admin/ImportWizard.tsx`, `components/admin/ProjectEditor.tsx`, `components/admin/RuntimePanel.tsx`, `components/admin/AdminShell.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: Task 13 路由（fetch 调 `/api/admin/*`）、Task 12 cookie
- Produces: `/admin` 单页：口令门 → 项目表格（标题/日期/状态灯/端口/编辑/删除）→ 顶部"全部启动/全部停止"→ `ImportWizard` 四选一（zip 拖放、文件夹多选、静态网址+镜像开关、本机路径输入）→ `ProjectEditor` 表单（标题/日期/介绍多行/四格/图片勾选排序/公开开关）→ `RuntimePanel` 每项目状态灯与日志尾巴（轮询 `/api/admin/runtime` 每 3 秒）。

- [ ] **Step 1: 写界面（client component，`fetch` + `useState`，不引入状态库）**
- [ ] **Step 2: 端到端跑一遍** — 准备一个真作品目录（含 index.html）走"本机路径"导入 → 预览能开 → 介绍生成 → 改一句 → 发布 → 首页与详情页出现。
- [ ] **Step 3: 提交**

---

### Task 17: 收尾与验收

**Files:**
- Create: `README.md`, `tests/acceptance.test.ts`
- Modify: `app/admin/page.tsx`（无 key 提示）、`lib/runtime/index.ts`（启动时预热）

**Interfaces:**
- Produces: README 六节：启动、配 key、导入作品、讲台操作（`←/→/Esc/F`）、局域网访问（`npm start -- -H 0.0.0.0` + 防火墙 + 预览要换局域网 IP）、已知限制。

- [ ] **Step 1: 写验收测试**（映射 spec 验收 6 条里可自动化的部分）——四来源的 `importSource` 各一条（zip/文件夹/本机路径/静态网址，网址用本地夹具）→ 都能得到带 `runtime` 的 Project；进程型项目 `ensureRunning` 后 ready 且端口可 fetch。
- [ ] **Step 2: 跑通全部测试** — `npx vitest run` 全绿，记录数量。
- [ ] **Step 3: 手动验收** — 逐条对 spec 验收标准走一遍，重启 `npm run dev` 两次确认端口不冲突、无残留进程（`Get-NetTCPConnection -LocalPort 4300..4310` 应为空）。
- [ ] **Step 4: 写 README 并提交** — `git commit -m "docs: readme and acceptance"`

---

## 交付前自检（执行者按此顺序过一遍）

1. `npx vitest run` 全绿；`npm run build` 无 TS 错误。
2. 首页/详情页各一张 1440 宽截图，与 spec 的设计描述逐条对照（深色、衬线、无圆角、无强调色、右进度）。
3. 四来源各导入一次，均能开预览。
4. 关掉再启动，端口从 4300 重新开始且旧端口已释放。
5. `.env.local` 缺 key 时，后台导入仍成功、生成处显示手写提示。
