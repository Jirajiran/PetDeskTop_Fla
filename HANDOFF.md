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

**ล่าสุดที่ทำแล้ว (V34 — Setup ship + other-pet + Hide polish)**
- Soft awareness `other-pet`: heuristic หน้าต่างเล็ก/topmost; Look ~30s ไม่เดิน; debounce ~3 นาที
- Hide ≈ Snooze settle + leave 1.5s + despawn; เสียงซ่อนเริ่มตอน tween; Show/Hide exclusive ก่อน prepare
- Setup อัปเดต: `Fla_petDesktop_V34-Setup-34.0.0.exe`

**ยังเปิดอยู่ (รอบถัดไปได้)**
- ทดสอบ other-pet + Hide soft pipe บนเครื่องติดตั้ง Setup
- ไม่ต้องถาม Setup/commit สำหรับรอบนี้ (เพิ่ง ship)

---

## ความนึกหลัก (สั้นๆ)

1. **Loading / shellBusy สำคัญสุด** สำหรับ show/hide  
2. **Size/ภาษา = save + relaunch + exit** — ไม่ soft  
3. **แสดง/ซ่อน = ท่อ soft** Hybrid ตาม Stage  
4. **i18n JSON** — เรียงหมวด; Show ไม่รวมหมวดท้าย; Awareness รวมท้าย = ลา; tray Hide ใช้ leave 1 บรรทัด  
5. **Awareness** พูดครบคิวแบบ force  
6. **AOT boot-only**  
7. **relaunch อย่างเดียวไม่พอ** — ต้อง exit ด้วย

รายละเอียดกฎเต็ม → `.cursor/rules/fla-pet-desktop.mdc`

---

## ไฟล์ที่แตะบ่อย

| เรื่อง | ไฟล์ |
|--------|------|
| Tray, soft-hide, shellBusy | `source/main.js` |
| Pet, drag, Show speak, rebootstrap | `source/pet.js` |
| App awareness | `source/awareness.js` |
| Locale packs | `source/i18n.js`, `source/i18n/*.json` |
| IPC bridge | `source/preload.js` |
| Pet / bubble CSS | `source/style.css` |

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
