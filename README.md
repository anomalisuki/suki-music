# Suki Music — yt-dlp edition

Versi ini mengganti resolver Downr dengan **yt-dlp**. Frontend tetap memakai endpoint:

- `GET /api/search?q=...&limit=20`
- `GET /api/download?url=...`

## Cara deploy

1. Upload seluruh isi folder ini ke repository GitHub.
2. Import repository tersebut ke Vercel.
3. Gunakan framework/preset yang sesuai dengan project Node.js/Vercel.
4. Deploy tanpa Cloudflare Worker.

## Resolver audio

`api/download.js` menjalankan yt-dlp dengan mode metadata saja (`--dump-single-json --skip-download`).

Audio dipilih dari format audio-only. Jika tersedia M4A, M4A diprioritaskan, kemudian bitrate yang paling dekat dengan 128 kbps dipilih.

Project memakai `youtube-dl-exec`, yang memasang binary yt-dlp saat proses npm install/build. Dokumentasi package menyebut wrapper ini menjalankan yt-dlp dan mengunduh binary saat build. Untuk dukungan YouTube terbaru, yt-dlp juga menggunakan EJS dan JavaScript runtime; kode mengaktifkan Node sebagai runtime dan meminta EJS dari GitHub.

## Contoh test

`/api/download?url=https%3A%2F%2Fmusic.youtube.com%2Fwatch%3Fv%3DaMqOtlVwQYM`

Jika YouTube/yt-dlp menolak request dari IP Vercel, respons akan menunjukkan error yt-dlp pada `stage: "yt-dlp"`.
