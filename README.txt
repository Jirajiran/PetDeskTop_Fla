OCPet — โครงสร้าง repo
======================

OCPet-Setup-*.exe   ← ไฟล์ Setup สำหรับติดตั้ง (commit ได้ — โหลดง่ายจาก GitHub)
                      ~80 MB เท่านั้น ไม่ใช่ตัวแอปที่แตกแล้ว

source/             ← ซอร์สแอป (รัน/แพ็กจากโฟลเดอร์นี้)

ไม่ commit:
  - source/node_modules/
  - win-unpacked/ (~200 MB ตัวรันหลังแตกจาก Setup)
  - *.blockmap, builder-debug.yml

สร้าง Setup ใหม่:
  cd source
  npm install
  npm run dist
  → ได้ OCPet-Setup-*.exe ที่รากโปรเจกต์ (โฟลเดอร์นี้)

หลัง dist เสร็จ ลบ win-unpacked ได้ถ้ามี เพื่อประหยัดพื้นที่
  (ไฟล์ Setup .exe ยังใช้ติดตั้ง/commit ได้ตามปกติ)

อัปเดตในแอป (ภายหลัง): ใช้ GitHub Releases ของ repo เดียวกันก็ได้
  Setup ใน repo = โหลดติดตั้งมือ | Release = ให้แอปเช็คเวอร์ชันอัตโนมัติ
