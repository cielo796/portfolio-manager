import fs from 'node:fs/promises';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';

const root = new URL('../', import.meta.url);
const master = await fs.readFile(new URL('public/app-icon.svg', root));
const small = await fs.readFile(new URL('public/app-icon-small.svg', root));
const sizes = [16, 24, 32, 48, 64, 128, 256, 512];
const images = new Map();

// 小サイズはヒゲを省いた専用SVGから直接描画する。
for (const size of sizes) {
  const source = size <= 32 ? small : master;
  images.set(size, await sharp(source).resize(size, size).png().toBuffer());
}

const favicon = await pngToIco([16, 32, 48].map((size) => images.get(size)));
const desktopIcon = await pngToIco([16, 24, 32, 48, 64, 128, 256].map((size) => images.get(size)));

await fs.mkdir(new URL('build/', root), { recursive: true });
await fs.writeFile(new URL('public/brand-mark.svg', root), small);
await fs.writeFile(new URL('public/app-icon.png', root), images.get(512));
await fs.writeFile(new URL('src/app/favicon.ico', root), favicon);
await fs.writeFile(new URL('build/icon.ico', root), desktopIcon);
await fs.writeFile(new URL('build/icon.png', root), images.get(512));

console.info('Generated brand-mark.svg, 512px PNGs, favicon.ico (16/32/48), and icon.ico (16/24/32/48/64/128/256).');
