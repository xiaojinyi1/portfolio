# 作品集

一个可以在本机跑、也可以部署上线的个人作品集：前台是给课堂投影用的展示页，后台用来导入作品、自动生成一段中文介绍，再发布。

前台视觉参考 [maximeheckel.com](https://maximeheckel.com/)：深色、Instrument Serif 大字、极简导航、右侧滚动进度，图片进视口时轻微放大淡入（圆角 + Apple 风回弹）。

## 两种用法，一条数据

| | 本地（讲课演示） | 线上（Vercel） |
| --- | --- | --- |
| 作品怎么跑 | 每个作品一个本地端口，iframe 直连 | 只嵌作品自己的公网地址 `liveUrl` |
| 后台 `/admin` | 可用 | 404（没有可写磁盘） |
| 发布动作 | 后台点「公开到首页」 | `git push`，Vercel 自动重建 |

数据只有一份：`content/projects.json`（进 git）+ `public/media/<key>/`（图片，进 git）。
本地后台改完直接改这两个东西，`git commit && git push` 就是发布。

## 1. 启动

```powershell
npm install
npm run build
npm start          # http://127.0.0.1:3000
```

开发时用 `npm run dev`（端口 3000）。

## 2. 配置

把 `.env.local.example` 复制成 `.env.local`：

```
DEEPSEEK_API_KEY=sk-...       # 生成介绍用；不填也能用，只是介绍要手写
ADMIN_PASSWORD=你的口令        # /admin 的口令
```

线上不需要这两个变量——线上没有后台。

## 3. 导入一个作品

打开 `http://127.0.0.1:3000/admin`，输口令，然后四选一：

| 来源 | 适合什么 | 说明 |
| --- | --- | --- |
| **zip 包** | 打包好的静态站点 | 解压后自动找 `index.html` / `dist` / `build` / `public` / `out` |
| **文件夹** | 站点目录还在硬盘上 | 浏览器会让你选整个目录，按相对路径上传 |
| **本机路径** | 作品就在这台电脑上 | 填绝对路径。静态站点会拷一份到 `data/sites/`（断网、挪走原目录都不影响）；带后端的项目**不复制**，直接用原目录跑 |
| **静态网址** | 已经部署在线上了 | 勾「镜像到本地」会抓一份下来，断网也能讲 |

导入后会自动：识别运行方式 → 分配本地端口 → 把站点里的候选图（最多 3 张，单张 ≤2MB）复制进 `public/media/<key>/` → 调 DeepSeek 生成两段中文介绍 → 存成**草稿**。

然后点「编辑」：看一遍介绍、改几句、四格（时间/我的角色/用了什么/现状）按需补、图片排序、填「线上地址」、勾「公开到首页」、保存。

作品表里每行还有一个「截图」：把作品跑起来、用系统里的 Chrome/Edge 无头模式拍一张首屏，直接加成封面（只在需要时手动点，不会自己跑）。

## 4. 每个作品一个端口（仅本地）

- 静态作品：站内起一个只读静态监听（4300 起顺延），iframe 直接指过去。作品里的 `/assets/x.png` 这类根路径引用不用改。
- 需要后端的作品：起子进程（`npm start` / `node server.mjs`），健康检查通过才算就绪，日志在 `data/logs/<slug>.log`。
- 线上地址：填了 `liveUrl` 就优先嵌它，本地也会优先用它。

后台顶栏有「全部启动 / 全部停止」，每行有状态灯（未启动 / 启动中 / 已就绪 / 失败）和失败时的日志尾巴；进程型作品在服务启动时会预热。

## 5. 上线（混合部署）

作品集部署到 Vercel，每个作品自己部署到 Cloudflare Pages。

### 5.1 作品集 → Vercel

1. 把仓库推到 GitHub（私有仓库也行）。
2. Vercel → Add New → Project → 选中这个仓库，框架自动识别 Next.js，直接 Deploy。
3. 环境变量**不用**配（线上没有后台、不调 DeepSeek）。
4. 完成后拿到 `https://<项目名>.vercel.app`；有域名就在 Settings → Domains 里绑。

发布流程从此是：本地 `npm run dev` → 后台改内容 → `git commit && git push` → Vercel 自动重建（大约 40 秒）。

### 5.2 每个作品 → Cloudflare Pages

静态产物（`dist/`、`build/`、`out/`、一堆 html）直接用：

```powershell
# 装一次 wrangler，之后用 npx
npx wrangler pages deploy D:\DeepSeek Harness\realtime-food-rank\dist --project-name=shikebang
```

拿到 `https://shikebang.pages.dev` 后，回本地后台 → 编辑该作品 → 「线上地址」填进去 → 保存 → commit → push。
详情页就会把那个地址嵌进来（能嵌的前提是对方没设 `X-Frame-Options: DENY`）。

也可以用 Cloudflare 后台的「直接上传」拖一个目录上去，效果一样。

### 5.3 线上和本地的差别（必须知道）

- 线上**没有** `/admin`，也没有本地端口预览：详情页只嵌 `liveUrl`。没填就显示「线上地址还没填」。
- 线上**跑不了** node 进程型作品。这类作品只能放截图 + 外链，或者自己找一台 VPS。
- `content/projects.json` 里 `runtime.dir` 指向 `data/sites/...`（本地副本，不进 git）。所以**换一台机器 clone 下来后，本地端口预览会失效**，需要重新用「本机路径」导入一次；线上的图片和数据不受影响。

## 6. 讲台上怎么用

- `←` / `→`：上一件 / 下一件
- `Esc`：回首页
- `F`：全屏
- 右上角导航里的 Work / About 是锚点；Admin 只在本地出现

详情页底部就是作品的现场预览（iframe），不是截图。

## 7. 局域网访问（可选）

```powershell
npm start -- -H 0.0.0.0
```

然后用本机局域网 IP 访问（`ipconfig` 看 IPv4）。**注意**：详情页 iframe 指向 `127.0.0.1:<端口>`，在别人设备上会打不开——要给别人看，把作品地址改成局域网 IP，或者只在本机投屏。

## 8. 已知限制

- 浏览器安全策略会拦一部分线上的站点（对方设了 `X-Frame-Options: DENY` 或 CSP `frame-ancestors`）：镜像会失败并退回「直接打开原链接」。
- 自动生成只在上传时跑一次；不满意就点「重新生成介绍」，或在备注里补一句「最费劲的地方是什么」，生成会具体很多。
- `public/media/` 里的图片会进 git：单张限制 2MB，别一次塞十几张，仓库会变大。
- 截图脚本 `scripts/shot.mjs` 用系统里现成的 Chrome / Edge，不依赖 Playwright。

## 9. 测试

```powershell
npm test        # node:test
```

覆盖：slug、存储、入口识别、端口分配、静态服务器、进程运行器、zip 安全解压、图片扫描、生成解析、四来源导入、鉴权与后台接口、四来源验收、线上形态（`VERCEL` 下后台应当消失）。

`npm run build` 需要派生子进程，某些受限环境下会被拒绝（`spawn EPERM`），这时要在能起子进程的终端里跑。
