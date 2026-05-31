# Uzum Dashboard — qanday ishga tushirish

## Tezkor boshlash (har safar)

**Faqat shu bitta narsa:** `start.bat` faylini ikki marta bosing.

Yoki cmd terminalida:
```cmd
cd C:\Users\alfatech.uz\Documents\uzumDashboard
start.bat
```

Bu 2 ta yangi cmd oyna ochadi:
- **Uzum Auth (port 3001)** — backend
- **Uzum Web (port 3002)** — frontend

Brauzer ochib **http://localhost:3002** ga kiring.

> **Muhim:** Ochilgan 2 ta cmd oynani **yopmang** — yopilsa servis ham to'xtaydi.
> Asosiy `start.bat` oynani yopsangiz muammo yo'q.

---

## Boshqaruv

| Skript | Vazifa |
|---|---|
| `start.bat`   | Ikki servisni ishga tushiradi |
| `stop.bat`    | Hammasini to'xtatadi (port 3001 + 3002) |
| `restart.bat` | To'xtatib qaytadan ishga tushiradi |
| `status.bat`  | Servislar ishlayaptimi tekshiradi |

---

## Tez-tez uchraydigan muammolar

### "SMS yuborishda xato. Qayta urinib ko'ring." chiqsa
Backend o'chirilgan. **Yechim:** `start.bat` ni ikki marta bosing.

### Port band ekan ("Port 3001 in use")
Eski jarayon qolib ketgan. **Yechim:** `stop.bat`, keyin `start.bat`.

### Cmd oyna o'z-o'zidan yopiladi
Backend yoki frontend xatosi bor. **Tekshirish:**
1. Tegishli cmd oynasidagi xatoni o'qing
2. `services/auth` yoki `web` papkasida `npm install` qiling
3. Yana `start.bat`

---

## Kompyuter qayta yuklansa avtomatik ishga tushish (ixtiyoriy)

`start.bat` faylining **yorlig'ini** Windows Startup papkaga qo'ying:

1. `Win + R` bosing
2. `shell:startup` yozib Enter bosing
3. Ochilgan papkaga `start.bat` ning yorlig'ini (right-click → Create shortcut) tashlang

Endi kompyuter yoqilganda ikki servis avtomatik ishga tushadi.

---

## Texnik (ishlash mexanikasi)

**Sodda usul (joriy):** Har bir servis o'z cmd oynasida ishlaydi:
- Cmd oynasi ochiq tursa, ichidagi `npm run start:dev` / `npm run dev` doimiy ishlaydi
- VS Code yoki boshqa narsalarni yopsangiz ta'sir qilmaydi
- Faqat cmd oynani yopsangiz yoki kompyuter o'chsa to'xtaydi

**Backend** (`services/auth/`):
- NestJS + Prisma + TypeScript
- `npm run start:dev` — TypeScript watch mode (kod o'zgarsa auto-reload)
- Listen: `http://localhost:3001`

**Frontend** (`web/`):
- Next.js 15 + TypeScript
- `npm run dev` (port 3002 ga `package.json` da `-p 3002` flagi)
- Listen: `http://localhost:3002`

**Tashqi xizmatlar** (Windows Service sifatida, doim ishlaydi):
- PostgreSQL — port 5432
- Redis — port 6379

---

## Yangilash (kod o'zgarsa)

Kod kutubxonalari yangilansa:
```cmd
cd services\auth
npm install

cd ..\..\web
npm install

cd ..
restart.bat
```
