const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const iconDir = path.join(__dirname, 'apps', 'desktop-ui', 'src-tauri', 'icons');

if (!fs.existsSync(iconDir)) {
  fs.mkdirSync(iconDir, { recursive: true });
}

// Create a minimal valid PNG (1x1 pixel, then we'll use ImageMagick or just create valid minimal PNGs)
// Actually, let's create proper minimal PNGs using raw bytes

function createMinimalPNG(size, color) {
  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  
  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0); // width
  ihdrData.writeUInt32BE(size, 4); // height
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 2; // color type (RGB)
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  
  const ihdr = createChunk('IHDR', ihdrData);
  
  // IDAT chunk (image data)
  const rowSize = 1 + size * 3; // filter byte + RGB per pixel
  const rawData = Buffer.alloc(rowSize * size);
  for (let y = 0; y < size; y++) {
    rawData[y * rowSize] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const offset = y * rowSize + 1 + x * 3;
      rawData[offset] = color[0]; // R
      rawData[offset + 1] = color[1]; // G
      rawData[offset + 2] = color[2]; // B
    }
  }
  
  const zlib = require('zlib');
  const compressed = zlib.deflateSync(rawData);
  const idat = createChunk('IDAT', compressed);
  
  // IEND chunk
  const iend = createChunk('IEND', Buffer.alloc(0));
  
  return Buffer.concat([signature, ihdr, idat, iend]);
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  
  const typeBuffer = Buffer.from(type, 'ascii');
  
  const crcData = Buffer.concat([typeBuffer, data]);
  let crc = crc32(crcData);
  crc = crc >>> 0; // Convert to unsigned
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc, 0);
  
  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  const table = makeCRCTable();
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xFF];
  }
  return crc ^ 0xFFFFFFFF;
}

function makeCRCTable() {
  const table = [];
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
}

// Colors
const indigo = [79, 70, 229];
const white = [255, 255, 255];

// Create PNG icons
const png32 = createMinimalPNG(32, indigo);
const png128 = createMinimalPNG(128, indigo);
const png256 = createMinimalPNG(256, indigo);

fs.writeFileSync(path.join(iconDir, '32x32.png'), png32);
fs.writeFileSync(path.join(iconDir, '128x128.png'), png128);
fs.writeFileSync(path.join(iconDir, '128x128@2x.png'), png256);
fs.writeFileSync(path.join(iconDir, 'icon.png'), png256);

// For ICO, we need a proper ICO file format
// Create a simple ICO with 256x256 PNG inside
function createICO(pngData) {
  // ICO header (6 bytes)
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: 1 = ICO
  header.writeUInt16LE(1, 4); // number of images
  
  // ICO directory entry (16 bytes)
  const dir = Buffer.alloc(16);
  dir[0] = 0; // width (0 = 256)
  dir[1] = 0; // height (0 = 256)
  dir[2] = 0; // color palette
  dir[3] = 0; // reserved
  dir.writeUInt16LE(1, 4); // color planes
  dir.writeUInt16LE(32, 6); // bits per pixel
  dir.writeUInt32LE(pngData.length, 8); // size of image data
  dir.writeUInt32LE(22, 12); // offset to image data (6 + 16 = 22)
  
  return Buffer.concat([header, dir, pngData]);
}

const ico = createICO(png256);
fs.writeFileSync(path.join(iconDir, 'icon.ico'), ico);

console.log('Icons created successfully!');
console.log('Files:', fs.readdirSync(iconDir));
