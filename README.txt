OCPet — Installer (โฟลเดอร์แรก)
================================

OCPet-Setup-*.exe   ← ไฟล์ติดตั้งสำหรับอัปโหลด GitHub Releases
                    (อย่า commit .exe ขึ้น git)

ซอร์สแอปอยู่ที่โฟลเดอร์ ../source/

สร้าง Setup ใหม่:
  cd ../source
  npm install
  npm run dist

หลัง dist เสร็จ ลบ win-unpacked ในโฟลเดอร์นี้ได้ เพื่อประหยัดพื้นที่
  (ไฟล์ Setup .exe ยังใช้ติดตั้งได้ตามปกติ)

Repo บน GitHub ควรมีแค่ซอร์ส — ไม่ใส่ node_modules / win-unpacked
Setup .exe ใส่ที่หน้า Releases เท่านั้น
