# Suki Music — Vercel

Website ini menggunakan:

- `index.html` sebagai frontend.
- `/api/search.js` sebagai proxy/serverless function untuk YouTube Music Search.
- `/api/download.js` sebagai proxy/serverless function untuk Downr.
- `package.json` untuk dependency Node.js.
- `vercel.json` untuk konfigurasi function.

## Deploy ke Vercel

1. Upload/import folder ini sebagai project Vercel.
2. Tambahkan Environment Variable:

   `YouTube Music API key is already embedded in `api/search.js`` = API key YouTube Music yang digunakan script search.

3. Deploy.
4. Buka domain Vercel.

## Alur

Browser → `/api/search` → YouTube Music

Browser → `/api/download` → Downr → response `medias[]`

Backend memilih media `type=audio`, mengutamakan `m4a`, kemudian memilih bitrate yang paling dekat dengan 128 kbps.

URL media akhir tetap merupakan URL dari provider sehingga frontend tidak perlu melakukan `fetch()` cross-origin terhadap Downr.
