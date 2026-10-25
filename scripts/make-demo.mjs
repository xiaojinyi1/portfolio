// 生成三条演示数据 + 几张渐变封面，只用于本地看设计效果
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import zlib from "node:zlib";

const DATA = join(process.cwd(), "data");

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let i = 0; i < 256; i += 1) {
      let c = i;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[i] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i += 1) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(width, height, pixel) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const raw = Buffer.alloc((width * 3 + 1) * height);
  let offset = 0;
  for (let y = 0; y < height; y += 1) {
    raw[offset] = 0;
    offset += 1;
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = pixel(x / width, y / height);
      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
      offset += 3;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const demos = [
  {
    slug: "food-rank",
    title: "校门口美食榜单",
    date: "2025.06",
    top: [34, 44, 58],
    bottom: [16, 18, 24],
    img: "assets/cover.png",
  },
  {
    slug: "photo-wall",
    title: "照片墙",
    date: "2024.11",
    top: [58, 46, 34],
    bottom: [22, 18, 16],
    img: "img/wall.png",
  },
  {
    slug: "reading-notes",
    title: "读书笔记",
    date: "2024.03",
    top: [36, 52, 46],
    bottom: [14, 20, 20],
    img: "static/cover.png",
  },
];

for (const demo of demos) {
  const dir = join(DATA, "sites", demo.slug);
  mkdirSync(join(dir, demo.img, ".."), { recursive: true });
  const image = png(1200, 800, (u, v) => {
    const t = Math.min(1, Math.max(0, (u * 0.35 + v * 0.65)));
    return [
      Math.round(demo.top[0] * (1 - t) + demo.bottom[0] * t),
      Math.round(demo.top[1] * (1 - t) + demo.bottom[1] * t),
      Math.round(demo.top[2] * (1 - t) + demo.bottom[2] * t),
    ];
  });
  writeFileSync(join(dir, demo.img), image);
}

const projects = demos.map((demo, index) => ({
  slug: demo.slug,
  title: demo.title,
  date: demo.date,
  intro: [
    `这是我做的${demo.title}。打开来就是一屏列表，点任意一条能看见详情，数据都是我自己一条条录进去的。`,
    "最费劲的地方是列表滚动的时候总有一点点卡，后来把每条的阴影去掉、只在自己悬停的那条上加，才顺了。",
  ],
  facts: { time: demo.date, role: "一个人做的前端和样式", stack: "HTML、CSS、少量 JavaScript", status: "还在改" },
  images: [{ src: `/media/${demo.slug}/${demo.img}`, caption: "", alt: demo.title }],
  runtime: { kind: "static", dir: join(DATA, "sites", demo.slug) },
  sourceLabel: "演示数据",
  published: true,
  createdAt: new Date().toISOString(),
  order: index,
}));

writeFileSync(join(DATA, "projects.json"), JSON.stringify(projects, null, 2));
console.log("演示数据已写入 data/projects.json，共", projects.length, "条");
