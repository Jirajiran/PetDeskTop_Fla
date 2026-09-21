const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DEST = path.join(ROOT, 'release', 'source');

const FILES = [
  'main.js',
  'preload.js',
  'pet.js',
  'index.html',
  'style.css',
  'package.json',
];

const DIRS = ['PetPicture', 'Sound'];

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyDir(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const src = path.join(srcDir, entry.name);
    const dest = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyDir(src, dest);
    } else {
      copyFile(src, dest);
    }
  }
}

function cleanDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  fs.mkdirSync(dir, { recursive: true });
}

cleanDir(DEST);

for (const file of FILES) {
  copyFile(path.join(ROOT, file), path.join(DEST, file));
}

for (const dir of DIRS) {
  copyDir(path.join(ROOT, dir), path.join(DEST, dir));
}

copyFile(path.join(ROOT, 'build', 'icon.png'), path.join(DEST, 'icon.png'));

const readme = `OCPet v${require(path.join(ROOT, 'package.json')).version} — ไฟล์ที่จำเป็นสำหรับรัน/แพ็ก

โฟลเดอร์นี้สร้างอัตโนมัติจาก scripts/sync-release-source.js
ใช้สำหรับ backup, ตรวจสอบ, หรือแพ็กแบบ portable

รันจากโฟลเดอร์โปรเจกต์หลัก:
  npm install
  npm start

ติดตั้งแบบ .exe:
  ดูไฟล์ใน release/installer/
`;

fs.writeFileSync(path.join(DEST, 'README.txt'), readme, 'utf8');
console.log(`Synced release source -> ${DEST}`);
