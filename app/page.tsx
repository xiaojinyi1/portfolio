import { Nav } from "@/components/Nav";
import { ProjectList } from "@/components/ProjectList";
import { ScrollProgress } from "@/components/ScrollProgress";
import { readProjects } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const projects = await readProjects();
  const published = projects.filter((project) => project.published);

  return (
    <>
      <Nav />
      <ScrollProgress />
      <main className="shell">
        <header className="hero">
          <h1 className="display hero-title">
            把做过的东西
            <br />
            摆在一张桌子上
          </h1>
          <div className="hero-meta">
            <span>{published.length} 个作品</span>
            <span>课堂上现场打开</span>
            <span>2024 — 2026</span>
          </div>
        </header>

        <section className="about" id="about">
          <p className="section-label">About</p>
          <div className="prose">
            <p>
              这里放的是我在课上和课后做的网站。有些是练习，有些是为了解决一个具体的小问题才动手写的。
              我不太会写介绍，所以每一页的说明文字都是先把网站跑起来，再照着它本来的样子写下来的。
            </p>
            <p>
              点开任意一个作品，看到的就是它本身在跑，不是截图。有的需要开一个本地端口，有的直接指向线上地址——
              页面上会标出来。
            </p>
          </div>
        </section>

        <section className="work" id="work">
          <div className="work-head">
            <h2>Work</h2>
            <p className="section-label" style={{ margin: 0 }}>
              {published.length} 件
            </p>
          </div>
          {published.length === 0 ? (
            <p className="empty">
              还没有发布的作品。打开 <a href="/admin">/admin</a> 上传一个，写好介绍再发布。
            </p>
          ) : (
            <ProjectList projects={published} />
          )}
        </section>

        <footer className="footer" id="contact">
          <span>作品集 · 本地运行</span>
          <span className="muted">← → 翻作品 · Esc 回首页 · F 全屏</span>
        </footer>
      </main>
    </>
  );
}
