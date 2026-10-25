/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 打出自包含的运行目录（.next/standalone）：Docker 镜像里只拷这三个目录就能跑，
  // 不用带整个 node_modules。本地 `next start` 不受影响。
  output: "standalone",
  // 内容目录是运行时用 fs 读的，不是 import 进来的：显式告诉打包器把它一起带上，
  // 否则产物里没有 content/projects.json。
  outputFileTracingIncludes: {
    "/**": ["./content/**/*"],
  },
};

export default nextConfig;
