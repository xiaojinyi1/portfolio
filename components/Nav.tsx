import Link from "next/link";

export function Nav() {
  return (
    <nav className="nav">
      <Link className="nav-mark" href="/">
        作品集
      </Link>
      <div className="nav-links">
        <a href="#work">Work</a>
        <a href="#about">About</a>
        <a href="/admin">Admin</a>
      </div>
    </nav>
  );
}
