# 上线形态：混合部署（作品集上 Vercel，作品各自部署）

## 为什么要改

原来的设计假设「作品集和作品跑在同一台机器上」：详情页 iframe 指 `http://127.0.0.1:<port>/`。
这个假设在课堂上成立（自己电脑演示），一旦上线就不成立——访客浏览器里的 `127.0.0.1`
是他自己的电脑，端口上什么也没有。所以"上线"不是加个构建命令，是换一种交付形态。

用户已经在三个选项里选了 **混合**：作品集部署到 Vercel，每个作品自己部署到
Cloudflare Pages，作品集只负责陈列和外链。

## 形态定稿

| 事情 | 本地（现在的用法） | 线上（Vercel） |
| --- | --- | --- |
| 作品数据 | `content/projects.json` | 同一份文件，随仓库构建 |
| 图片 | `public/media/<slug>/` | 同一批文件，走 Vercel CDN |
| 详情页预览 | iframe 指作品本地端口 | iframe 指作品公网地址 `liveUrl` |
| 后台 `/admin` | 可用（本机写文件） | 404，不对外 |
| 生成介绍 | 本机调 DeepSeek | 不提供（没有后台） |
| 发布动作 | 后台点发布 | `git push`，Vercel 自动重建 |

一句话：**后台是本地写作工具，仓库是唯一的发布通道。**

## 落地的几个决定

1. **内容目录与运行目录分开**。`content/` 进 git（`projects.json`），`data/` 不进（本站副本、
   日志、临时解压）。原因是 Vercel 的构建产物来自 git，运行目录里的东西上线就没了。
2. **图片必须落在 `public/media/`**。Vercel 的静态资源只能从 `public/` 出；原来 `/media/[...path]`
   路由读 `data/sites/`，线上读不到，直接删掉这个路由。导入时把候选图（最多 3 张、单张 ≤ 2MB）
   复制进 `public/media/<slug>/`，`src` 改写成 `/media/<slug>/<name>`。
3. **`liveUrl` 回到数据模型**。之前删掉是因为"端口"能表达一切；现在端口只在本地有意义，
   线上需要一个真实地址，所以加回来，并作为详情页预览的第一优先级。
4. **线上藏掉 admin**。用 `middleware.ts` 在 `VERCEL` 环境下对 `/admin`、`/api/admin` 直接返回 404，
   而不是靠页面里判断——接口是真正会写文件的东西，藏页面不藏接口等于没藏。
5. **本地端口运行时保留**。它是课堂演示的核心体验（"点开就是它在跑"），不因为要上线就删。
   线上代码路径上不调用 `manager.ensure`（`VERCEL` 环境下跳过），避免 serverless 里 spawn 崩掉。
6. **进程型作品线上无解**。Vercel/Pages 都跑不了长驻 node 进程。这类作品线上只放截图 + 外链；
   真要"跑起来"只能回 VPS。写进 README 的已知限制，不假装能解决。

## 作品的部署路径（每个作品）

- 静态产物（`dist/`、`build/`、`out/`、一堆 html）：拖到 Cloudflare Pages，拿到
  `https://<name>.pages.dev`，填进后台的"线上地址"。
- 需要后端：Cloudflare Pages Functions / Workers 能顶一部分；真 node 进程只能自备 VPS，
  在那之前这个作品线上只展示截图。

## 验收

1. `npm run build` 在无 `content/projects.json`、无 `data/` 的干净检出上能过。
2. 设 `VERCEL=1` 时：`/admin` 与 `/api/admin/*` 返回 404；详情页不 spawn 任何进程。
3. 详情页在没有 `liveUrl` 时给出"这件作品的线上地址还没填"的说明，不是白框。
4. 导入作品后，`public/media/<slug>/` 里真的有图片，且不依赖 `data/`。
5. 本地 `npm start` 行为不变（端口预览、后台可用）。
