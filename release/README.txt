OCPet — Release folder (local only)
===================================

installer/
  OCPet-Setup-*.exe   ← ไฟล์นี้สำหรับอัปโหลด GitHub Releases
                      (อย่า commit ทั้งโฟลเดอร์โปรเจกต์ขึ้น git)

source/               ← สร้างใหม่ได้ด้วย npm run sync-release (ไม่จำเป็น)

สร้าง Setup ใหม่:
  npm install
  npm run dist

หลัง dist เสร็จ ลบ win-unpacked ได้ เพื่อประหยัดพื้นที่
  (ไฟล์ Setup .exe ยังใช้ติดตั้งได้ตามปกติ)

Repo บน GitHub ควรมีแค่ซอร์ส — ไม่ใส่ node_modules / win-unpacked
Setup .exe ใส่ที่หน้า Releases เท่านั้น
