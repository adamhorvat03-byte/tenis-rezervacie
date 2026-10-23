// Generuje placeholder PNG ikony (zelené pozadie + tenisová loptička). Spustenie: node scripts/make-icons.mjs
import zlib from 'node:zlib';
import fs from 'node:fs';

function crc32(buf) {
  let c, crc = ~0;
  for (const b of buf) { c = (crc ^ b) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; }
  return ~crc >>> 0;
}
const chunk = (type, data) => {
  const t = Buffer.from(type), len = Buffer.alloc(4), crc = Buffer.alloc(4);
  len.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
};
function png(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const c = size / 2, R = size * 0.3;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const o = y * (size * 4 + 1) + 1 + x * 4;
      let px = [27, 107, 58];
      const d = Math.hypot(x - c, y - c);
      if (d < R) px = [215, 243, 107];
      // bela oblúky loptičky
      const a = Math.hypot(x - (c - R * 1.25), y - c), b = Math.hypot(x - (c + R * 1.25), y - c);
      if (d < R && (Math.abs(a - R * 1.1) < size * 0.015 || Math.abs(b - R * 1.1) < size * 0.015)) px = [255, 255, 255];
      raw.set([...px, 255], o);
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
fs.mkdirSync('public/icons', { recursive: true });
fs.writeFileSync('public/icons/icon-192.png', png(192));
fs.writeFileSync('public/icons/icon-512.png', png(512));
fs.writeFileSync('public/icons/apple-touch-icon.png', png(180));
console.log('Ikony vygenerované.');
