Fla_petDesktop_V32 — ดาวน์โหลดเป็น ZIP แล้วเจอหน้าแรก
====================================================

Fla_petDesktop_V32-Setup-*.exe  ← ติดตั้งใช้งานเลย (~80 MB)
README.txt                      ← ไฟล์นี้
source/                         ← ซอร์สให้ปรับแต่ง / build เองได้

ไม่ใช้โฟลเดอร์ setup/ แล้ว — Setup อยู่ที่รากเพื่อเปิด zip แล้วเห็นทันที

ติดตั้ง:
  รัน Fla_petDesktop_V32-Setup-*.exe

คนที่อยากแก้โค้ด / build เอง:
  cd source
  npm install
  npm start          # รันทดสอบ
  npm run dist       # สร้าง Setup ใหม่ที่รากโปรเจกต์นี้

ไม่ commit:
  - source/node_modules/
  - win-unpacked/ (~200 MB)
  - *.blockmap, builder-debug.yml, .icon-ico/

หลัง dist เสร็จ ลบ win-unpacked ได้

ควบคุมในแอป:
  ซ้ายคลิกค้างลาก = ย้าย Pet
  ซ้ายคลิกสั้น 7 ครั้ง = Snooze ~3 นาที
  คลิกกลาง = ปิดโปรแกรม
  เมนูถาด (system tray) → ซ่อน/แสดง Pet (ท่อหลัก)
  ซ่อน = opacity 0 + ปิด mouse (ยังอยู่บนสุด ไม่เขย่าแอปอื่น)
  แสดง = opacity 1 + ปลด mouse + cooldown ~450ms
  เมนูถาด → ถอนการติดตั้ง / ออก
