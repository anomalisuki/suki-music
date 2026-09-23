# Suki Music — Vercel backend

Frontend mengikuti tampilan referensi `suki-music-vercel-fixed-downr(2).zip`.

## Endpoint

Search:
`/api/search?q=What%20If%20I%20Call&limit=20`

Download resolver:
`/api/download?url=https%3A%2F%2Fmusic.youtube.com%2Fwatch%3Fv%3DVIDEO_ID`

## YouTube Music key

API key tetap menggunakan key yang sudah ada di script asli, di `api/search.js`.
Tidak perlu Environment Variable untuk key tersebut.

## Audio selection

`/api/download` meminta response Downr, mengambil `medias[]` dengan `type=audio`, memprioritaskan `m4a`, lalu memilih bitrate yang paling dekat dengan 128 kbps. Jika Downr tidak memberikan `medias[]` tetapi memberikan `url`, URL tersebut digunakan sebagai fallback.

## Deploy

Import repository ke Vercel. Tidak membutuhkan build command khusus.
