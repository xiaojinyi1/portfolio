import Link from "next/link";
import { notFound } from "next/navigation";
import { Facts } from "@/components/Facts";
import { KeyboardNav } from "@/components/KeyboardNav";
import { Nav } from "@/components/Nav";
import { PreviewFrame } from "@/components/PreviewFrame";
import { RevealImage } from "@/components/RevealImage";
import { manager } from "@/lib/runtime/manager";
import { getProject, isHosted, readProjects } from "@/lib/store";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function WorkPage({ params }: PageProps) {
  const { slug } = await params;
  const project = await getProject(decodeURIComponent(slug));

  if (!project || !project.published) notFound();

  // 线上没有可写磁盘、也没有长驻进程：只认作品自己的公网地址。
  // 本地演示才去拉端口——那是"点开就是它在跑"的来源。
  const hosted = isHosted();
  let port: number | undefined;
  if (!hosted && !project.liveUrl && project.runtime.kind !== "remote") {
    try {
      port = await manager.ensure(project);
    } catch {
      port = undefined;
    }
  }

  const all = (await readProjects())
    .filter((item) => item.published)
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "", "zh") || a.order - b.order);

  const index = all.findIndex((item) => item.slug === project.slug);
  const prev = index > 0 ? all[index - 1] : null;
  const next = index >= 0 && index < all.length - 1 ? all[index + 1] : null;

  const externalUrl =
    project.liveUrl ?? (project.runtime.kind === "remote" ? project.runtime.url : undefined);
  // 本地演示时按钮要去本地端口，线上才去 liveUrl
  const openUrl = externalUrl ?? (port ? `http://127.0.0.1:${port}/` : undefined);

  return (
    <>
      <Nav />
      <main className="shell detail">
        <Link className="back" href="/">
          ← 全部作品
        </Link>

        <h1 className="display detail-title">{project.title}</h1>
        <p className="detail-date">{project.date}</p>

        <Facts facts={project.facts} />

        {project.intro.length > 0 ? (
          <div className="prose">
            {project.intro.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>
        ) : (
          <p className="empty">
            这件作品的介绍还没写。打开 <a href="/admin">/admin</a> 补一段，再发布。
          </p>
        )}

        {project.images.length > 0 ? (
          <div className="detail-figures reveal-group">
            {project.images.map((image, index) => (
              <RevealImage
                key={image.src}
                src={image.src}
                alt={image.alt || project.title}
                caption={image.caption || undefined}
                priority={index === 0}
              />
            ))}
          </div>
        ) : null}

        <div className="btn-row" style={{ margin: "32px 0 8px" }}>
          {openUrl ? (
            <a className="btn" href={openUrl} target="_blank" rel="noreferrer">
              打开网站 ↗
            </a>
          ) : (
            <span className="btn btn-ghost" aria-disabled="true">
              线上地址还没填
            </span>
          )}
          <span className="muted" style={{ fontSize: 13 }}>
            {project.liveUrl
              ? "作品部署在它自己的地址上，这里直接嵌进来"
              : hosted
                ? "这件作品还没部署，页面上只有介绍和截图"
                : project.runtime.kind === "static"
                  ? "静态托管在本地端口"
                  : project.runtime.kind === "process"
                    ? `本地进程：${project.runtime.start}`
                    : project.runtime.mirrored
                      ? "线上站点（已镜像到本地）"
                      : "线上站点（直接嵌入）"}
          </span>
        </div>

        <div id="preview">
          <PreviewFrame slug={project.slug} port={port} externalUrl={externalUrl} />
        </div>

        <div className="btn-row" style={{ marginTop: 28 }}>
          {prev ? <Link className="btn btn-ghost" href={`/work/${prev.slug}`}>← {prev.title}</Link> : null}
          {next ? <Link className="btn btn-ghost" href={`/work/${next.slug}`}>{next.title} →</Link> : null}
        </div>
      </main>

      <KeyboardNav
        prevHref={prev ? `/work/${prev.slug}` : null}
        nextHref={next ? `/work/${next.slug}` : null}
        homeHref="/"
      />
    </>
  );
}
