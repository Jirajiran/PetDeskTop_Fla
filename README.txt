Fla_petDesktop_V34 — ดาวน์โหลดเป็น ZIP แล้วเจอหน้าแรก
====================================================

Fla_petDesktop_V34-Setup-*.exe  ← ติดตั้งใช้งานเลย (~80 MB)
README.txt                      ← ไฟล์นี้
HANDOFF.md                      ← ส่งต่อคน / agent (สถานะงาน + ความนึก)
.cursor/rules/                  ← กฎถาวรให้ AI ใน Cursor
source/                         ← ซอร์สให้ปรับแต่ง / build เองได้

ไม่ใช้โฟลเดอร์ setup/ แล้ว — Setup อยู่ที่รากเพื่อเปิด zip แล้วเห็นทันที

ติดตั้ง:
  รัน Fla_petDesktop_V34-Setup-*.exe

คนที่อยากแก้โค้ด / build เอง:
  cd source
  npm install
  npm start          # รันทดสอบ
  npm run dist       # สร้าง Setup ใหม่ที่รากโปรเจกต์นี้

ส่งงานต่อ (คนหรือ AI):
  อ่าน HANDOFF.md ก่อน
  กฎถาวร: .cursor/rules/fla-pet-desktop.mdc

ไม่ commit:
  - source/node_modules/
  - win-unpacked/ (~200 MB)
  - *.blockmap, builder-debug.yml, .icon-ico/

หลัง dist เสร็จ ลบ win-unpacked ได้

ควบคุมในแอป:
  ซ้ายคลิกค้างลาก = ย้าย Pet
  ซ้ายคลิกสั้นหลายครั้ง (ตาม Size) = Snooze
  คลิกกลาง = ปิดโปรแกรม
  เมนูถาด (system tray) → ซ่อน/แสดง / Size / ภาษา / ล็อก / เปิดพร้อมระบบ / รีสตาร์ท
  ซ่อน = opacity 0 + ปิด mouse (ยังอยู่บนสุด ไม่เขย่าแอปอื่น)
  แสดง = ท่อ resume + พูด Show ตาม i18n (ระหว่างนั้น shellBusy กันกดรัว / ไม่เปิดเมนูถาด)
  เมนูถาด → ถอนการติดตั้ง / ออก
