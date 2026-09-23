setup/ — distribution Setup only
================================

ใส่ Fla_petDesktop_V32-Setup-*.exe ที่นี่ (commit ได้)

สร้างใหม่จาก source/:
  cd ../source
  npm run dist

หลัง dist ลบ win-unpacked / *.blockmap ในโฟลเดอร์นี้ได้
(ไม่ต้องเก็บ — ประหยัดพื้นที่ ~200MB+)
