import { AdminShell } from "@/components/admin/AdminShell";
import { Nav } from "@/components/Nav";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "后台 · 作品集",
};

export default function AdminPage() {
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
