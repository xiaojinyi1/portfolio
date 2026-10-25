import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { Nav } from "@/components/Nav";
import { isHosted } from "@/lib/store";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "后台 · 作品集",
};

export default function AdminPage() {
  // 线上没有可写磁盘，后台在这里没有意义，直接当作不存在
  if (isHosted()) notFound();

  return (
    <>
      <Nav />
      <main className="shell admin">
        <h1>后台</h1>
        <p className="muted" style={{ fontSize: 13, marginTop: 0, marginBottom: 26 }}>
          导入作品 → 自动生成介绍 → 改一改 → 发布。发布后首页和详情页立即可见。
        </p>
        <AdminShell />
      </main>
    </>
  );
}
