'use strict';
// Gera os ícones da extensão (16/48/128 px) sem dependências: carteira branca sobre fundo azul-marinho.
// Uso: node store/make-icons.js
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const NAVY = [4, 8, 35];
const WHITE = [255, 255, 255];

// ---- formas em coordenadas de 24x24 (mesmo desenho do ícone do modal) ----
const inRR = (x, y, x0, y0, x1, y1, rtl, rtr, rbr, rbl) => { // retângulo com raios por canto
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const corner = (cx, cy, r, sx, sy) => { // dentro do canto arredondado?
    if (r <= 0) return true;
    const dx = (x - cx) * sx, dy = (y - cy) * sy;
    return !(dx > 0 && dy > 0 && Math.hypot(dx, dy) > r);
  };
  return corner(x0 + rtl, y0 + rtl, rtl, -1, -1) && corner(x1 - rtr, y0 + rtr, rtr, 1, -1) &&
    corner(x1 - rbr, y1 - rbr, rbr, 1, 1) && corner(x0 + rbl, y1 - rbl, rbl, -1, 1);
};
function wallet(x, y) {
  const body = inRR(x, y, 3, 4, 18, 21, 3, 0, 0, 3) || inRR(x, y, 3, 7, 21, 21, 3, 1, 3, 3);
  const hole = (x >= 6 && x <= 15 && y >= 6 && y <= 8) || Math.hypot(x - 6, y - 7) <= 1;
  return body && !hole;
}
const dot = (x, y) => Math.hypot(x - 17, y - 14.5) <= 1.6;

function render(n) {
  const SS = 4, px = Buffer.alloc(n * n * 4);
  const s = (n * 0.62) / 24, off = (n - 24 * s) / 2, rad = n * 0.22;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    let aBg = 0, aFg = 0;
    for (let sj = 0; sj < SS; sj++) for (let si = 0; si < SS; si++) {
      const X = i + (si + 0.5) / SS, Y = j + (sj + 0.5) / SS;
      if (inRR(X, Y, 0, 0, n, n, rad, rad, rad, rad)) {
        aBg++;
        const gx = (X - off) / s, gy = (Y - off) / s;
        if (wallet(gx, gy) && !dot(gx, gy)) aFg++;
      }
    }
    const tot = SS * SS, o = (j * n + i) * 4, f = aFg / tot, a = aBg / tot;
    px[o] = Math.round(NAVY[0] * (1 - f) + WHITE[0] * f);
    px[o + 1] = Math.round(NAVY[1] * (1 - f) + WHITE[1] * f);
    px[o + 2] = Math.round(NAVY[2] * (1 - f) + WHITE[2] * f);
    px[o + 3] = Math.round(255 * a);
  }
  return px;
}

// ---- codificador PNG mínimo (RGBA, 8 bits) ----
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(n, rgba) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(n, 0); ihdr.writeUInt32BE(n, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((n * 4 + 1) * n);
  for (let y = 0; y < n; y++) { raw[y * (n * 4 + 1)] = 0; rgba.copy(raw, y * (n * 4 + 1) + 1, y * n * 4, (y + 1) * n * 4); }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const outDir = path.join(__dirname, '..', 'extension', 'icons');
fs.mkdirSync(outDir, { recursive: true });
for (const n of [16, 48, 128]) {
  const file = path.join(outDir, `icon${n}.png`);
  fs.writeFileSync(file, png(n, render(n)));
  console.log('gerado', path.relative(process.cwd(), file), fs.statSync(file).size, 'bytes');
}
