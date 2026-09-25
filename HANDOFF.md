# HANDOFF — Fla_petDesktop_V34

เอกสารส่งต่อให้ **คนถัดไป** หรือ **agent / AI รอบใหม่**  
อ่านไฟล์นี้ก่อนลงมือ → รู้ว่าคิดอะไร ค้างตรงไหน กฎอยู่ที่ไหน

คู่กับกฎถาวร (คติประจำใจ AI): `.cursor/rules/fla-pet-desktop.mdc`

---

## โปรเจกต์คืออะไร

Electron desktop pet (Fla) บน Windows  
- ไอคอนถาด (system tray) ควบคุมซ่อน/แสดง, ขนาด, ภาษา, ล็อกที่, เปิดพร้อมระบบ, รีสตาร์ท  
- Soft-hide (ไม่ปิดหน้าต่างจริง) · SVG poses · พูดบับเบิล · App Awareness (จับแอป / โหลด / โป๊)

รันทดสอบ:

```text
cd source
npm install
npm start
```

Build Setup → รากโปรเจกต์: `npm run dist`  
→ `Fla_petDesktop_V34-Setup-34.0.0.exe`

---

## สถานะงานตอนส่งต่อ (อัปเดตเมื่อส่งต่อ)

**ล่าสุดที่ทำแล้ว (V34 ship)**
- Tray ไม่ว่าง → ไม่เปิดเมนู; เปิดเมนูได้ครั้งเดียว (`trayMenuOpen` + `popUpContextMenu`)
- Size / ภาษา = soft pipe; รีสตาร์ท = ปุ่ม Tray ด้วยมือเท่านั้น
- Lock ≠ ซ่อนคลิกเดียว (multi-tap เหมือนปลดล็อก)
- System load quit: เกณฑ์ 90 + ค้างต่อเนื่อง 15s (หลุดลง = รีเซ็ตตัวนับ)
- กันแถบชื่อบนหน้าต่าง pet (`thickFrame: false`, `page-title-updated`, caption burst หลัง Tray)

**ยังเปิดอยู่ (รอบถัดไปได้)**
- Awareness ครอบคลุม sleep / warp ตอน own stage หรือยัง
- แถบชื่อบนหน้าต่าง pet หลัง Tray — ทดสอบต่อถ้ายังโผล่
- อย่า commit `node_modules`, `win-unpacked`, `.blockmap` โดยไม่ถาม
- Push GitHub = ผู้ใช้ทำเอง

---

## ความนึกหลัก (สั้นๆ)

1. **Loading / shellBusy สำคัญสุด** — คำสั่งซ้อน = บัค; busy = ไม่เปิดเมนูถาด  
2. **ท่อเดียว** — ซ่อนแสดง · Size · ภาษา = pause → apply → resume → พูด Show  
3. **i18n JSON** — เรียงหมวด; Show ไม่รวมหมวดท้าย; Awareness รวมท้าย = ลา  
4. **Awareness** พูดครบคิวแบบ force แม้ซ่อน/ลาก/เดิน  
5. **AOT boot-only** — ห้ามสลับ always-on-top ตอน show/hide  
6. **Relaunch** = ทางหนีสุดท้ายจาก Tray เท่านั้น

รายละเอียดกฎเต็ม → `.cursor/rules/fla-pet-desktop.mdc`

---

## ไฟล์ที่แตะบ่อย

| เรื่อง | ไฟล์ |
|--------|------|
| Tray, soft-hide, shellBusy | `source/main.js` |
| Pet, drag, Show speak, rebootstrap | `source/pet.js` |
| Awareness poll / ban | `source/awareness.js` |
| Locale packs | `source/i18n.js`, `source/i18n/*.json` |
| IPC bridge | `source/preload.js` |

ข้อมูลทดสอบบนเครื่องผู้ใช้:
- Ban awareness: `%APPDATA%\fla-pet-desktop\awareness-ban.json` (ลบเพื่อรีเซ็ตทดสอบ)
- Locale ที่จำ: `%APPDATA%\fla-pet-desktop\pet-locale.json`
- Size ที่จำ: `%APPDATA%\fla-pet-desktop\pet-size.json`

---

## เช็คลิสต์ก่อนส่งต่อรอบถัดไป

- [x] อัปเดตบล็อก «สถานะงานตอนส่งต่อ» ด้านบนให้ตรงความจริง  
- [x] บอกรอบถัดไปว่ากำลังไล่บัคไหน / ทดสอบอะไรแล้ว  
- [x] ถ้าเปลี่ยนกฎถาวร → แก้ `.cursor/rules/fla-pet-desktop.mdc` ด้วย  

ข้อความแรกสำหรับ agent ใหม่ (คัดลอกได้):

```text
อ่าน HANDOFF.md และ .cursor/rules/fla-pet-desktop.mdc ก่อน
แล้วทำตามที่ระบุในสถานะงาน / คำสั่งล่าสุดของผู้ใช้
```
