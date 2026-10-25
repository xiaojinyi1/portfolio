# 作品集线上镜像。三位一体：构建 → 只带运行必需文件 → 用 node 跑 standalone 产物。
FROM node:22-alpine AS deps
WORKDIR /app
# 国内构建机上走镜像源，省得卡在 registry.npmjs.org
RUN npm config set registry https://registry.npmmirror.com
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
RUN npm config set registry https://registry.npmmirror.com
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# standalone 自带精简后的 node_modules 和 server.js；static 与 public 要手动拷到位
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# 内容文件在 standalone 里可能被 tracing 成符号链接或漏拷，显式再放一份
COPY --from=build /app/content ./content
EXPOSE 3000
CMD ["node", "server.js"]
