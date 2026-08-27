# AI Teacher Agent

O'qituvchining pedagogik ishlarini avtomatlashtiruvchi tizim — jadval, test yaratish, baholash, uy vazifasi, material tayyorlash, hisobot va o'quvchilar bilimini tahlil qilish.

## Imkoniyatlar

- **Haftalik jadval bo'yicha avtomatik ishlash** — dars mavzusini aniqlash, dars rejasi, konspekt, mini-test, uy vazifasi tayyorlash
- **Avtomatik test tizimi** — mavzu/haftalik/oylik/choraklik/diagnostik/yakuniy testlar
- **Qiyinlik nisbati** — oson 30% / o'rta 50% / qiyin 20% (o'qituvchi o'zgartira oladi)
- **Savol turlari** — sana topish, shaxsni aniqlash, xronologiya, taqqoslash va boshqalar
- **Savollar takrorlanmasligi** — oldingi testlarni eslab qoladi
- **Test variantlari** — A/B/C variantlar (ko'chirishni kamaytirish uchun)
- **Word (.docx) va PDF generator** — chop etishga tayyor hujjatlar + javoblar kaliti
- **O'quvchilar bazasi** — profil, natijalar, xatolar, kuchli/zaif mavzular
- **Adaptiv test** — natijaga qarab keyingi test qiyinligini o'zgartiradi
- **Xatolar tahlili** — qaysi mavzuda, nima uchun xato, qanday takrorlash kerak
- **Haftalik va oylik hisobotlar** — Word/PDF eksport
- **O'quvchi rivojlanishi** — faqat ball emas, o'sish dinamikasi
- **Ertalabki briefing** — har kuni avtomatik dars rejasi xabari
- **Eslatmalar** — test, dars, uy vazifasi haqida avtomatik xabarlar
- **Telegram bot** — test/hisobotlarni Telegram orqali olish (ixtiyoriy)
- **AI xarajatlari nazorati** — token va narx hisobi
- **Admin panel** — o'qituvchilar, sinflar, statistikalar

## Texnologiyalar

- **Backend:** Node.js + Express + SQLite (better-sqlite3)
- **Frontend:** React + Vite + Tailwind CSS
- **AI:** OpenAI-mos API (`USER_LLM_*` env orqali)
- **Hujjatlar:** docx (Word), PDFKit (PDF)
- **Scheduler:** node-cron
- **Telegram:** node-telegram-bot-api

## Ishga tushirish

### Backend

```bash
cd server
npm install
cp .env.example .env
# .env faylida USER_LLM_API_KEY ni kiriting (ixtiyoriy, bo'lmasa lokal test generator ishlaydi)
npm start
```

Server `http://localhost:3001` da ishlaydi.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend `http://localhost:5173` da ishlaydi va `/api` so'rovlarini backend'ga proxy qiladi.

### Production build

```bash
cd frontend && npm run build
```

Build natijasida `frontend/dist` yaratiladi va backend uni avtomatik serve qiladi.

## Sozlash

`.env` fayli (`server/.env`):

| O'zgaruvchi | Tavsif |
|-------------|--------|
| `PORT` | Server porti (default: 3001) |
| `JWT_SECRET` | Token maxfiy kaliti |
| `USER_LLM_API_KEY` | AI API kaliti (o'zingizniki) |
| `USER_LLM_BASE_URL` | AI API manzili |
| `USER_LLM_MODEL` | Asosiy model |
| `USER_LLM_CHEAP_MODEL` | Oddiy vazifalar uchun arzon model |
| `USER_LLM_STRONG_MODEL` | Murakkab tahlil uchun kuchli model |
| `TELEGRAM_BOT_TOKEN` | Telegram bot tokeni (ixtiyoriy) |

> **Muhim:** AI kaliti foydalanuvchi tomonidan taqdim etiladi. Bo'lmasa, tizim testlarni lokal shablonlar bilan yaratadi.

## Loyiha tuzilishi

```
server/
  src/
    db/index.js          — SQLite sxema
    routes/              — API yo'nalishlari
    services/
      ai.js              — AI xizmati, xarajat hisobi
      testGenerator.js   — test yaratish, baholash, adaptiv
      docxGenerator.js   — Word hujjatlar
      pdfGenerator.js    — PDF hujjatlar
      lessonService.js   — dars rejasi, konspekt, uy vazifasi
      reportService.js   — haftalik/oylik hisobotlar
      scheduler.js       — avtomatik jadval (cron)
      telegram.js        — Telegram bot
frontend/
  src/
    pages/               — UI sahifalar
    components/          — umumiy komponentlar
    context/             — auth kontekst
```
