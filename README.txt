Fla_petDesktop_V32 — โครงสร้าง repo
==================================

Fla_petDesktop_V32-Setup-*.exe  ← ไฟล์ Setup (commit ได้ — โหลดง่ายจาก GitHub)
                                  ~80 MB เท่านั้น ไม่ใช่ตัวแอปที่แตกแล้ว

source/                         ← ซอร์สแอป (รัน/แพ็กจากโฟลเดอร์นี้)

ไม่ commit:
  - source/node_modules/
  - win-unpacked/ (~200 MB ตัวรันหลังแตกจาก Setup)
  - *.blockmap, builder-debug.yml

สร้าง Setup ใหม่:
  cd source
  npm install
  npm run dist
  → ได้ Fla_petDesktop_V32-Setup-*.exe ที่รากโปรเจกต์

หลัง dist เสร็จ ลบ win-unpacked ได้ถ้ามี เพื่อประหยัดพื้นที่

ควบคุมในแอป:
  ซ้ายคลิกค้างลาก = ย้าย Pet
  ซ้ายคลิกสั้น 7 ครั้ง (ภายใน ~2 วินาทีต่อครั้ง) = Snooze ~3 นาที
  คลิกกลาง = ปิดโปรแกรม (kill Run)
  คลิกขวา = ไม่ผูกฟีเจอร์
  เมนูถาด → ซ่อน Pet = opacity 0 + ชั้นล่าง (ไม่ปิด Run, หยุดเดิน/พูด)
  เมนูถาด → แสดง Pet = opacity 1 + ชั้นบน (ทางกลับเดียวกัน)
  ไม่โชว์พรีวิว/ชื่อบนแถบงาน Windows (skipTaskbar + type toolbar)
  ถ้าชี้ Pet แล้วเคอร์เซอร์เปลี่ยนแต่คลิกไม่ได้ = unlockPetInput (ธง isPetVisible/isSnoozed)
  ปลุกจากถาด / snooze 3 นาที / OS แตะ → pet-force-input + resumePet
  เมนูถาด → ถอนการติดตั้ง = ลบตัวที่ติดตั้งแล้ว (ไม่ลบไฟล์ Setup ใน repo)
  เมนูถาด → ออก = ปิด Run
