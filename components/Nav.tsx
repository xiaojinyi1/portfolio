import Link from "next/link";
import { isHosted } from "@/lib/store";

export function Nav() {
  // 线上没有后台，别在公开站上放一个点了就 404 的入口
  const hosted = isHosted();

  return (
    <nav className="nav">
      <Link className="nav-mark" href="/">
        作品集
      </Link>
      <div className="nav-links">
        <Link href="/#work">Work</Link>
        <Link href="/#about">About</Link>
        {hosted ? null : <Link href="/admin">Admin</Link>}
      </div>
    </nav>
  );
}
