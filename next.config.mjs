/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 内容目录是运行时用 fs 读的，不是 import 进来的：显式告诉 Vercel 把它一起打包，
  // 否则部署产物里没有 content/projects.json。
  outputFileTracingIncludes: {
    "/**": ["./content/**/*"],
  },
};

export default nextConfig;
