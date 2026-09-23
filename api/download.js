const axios = require('axios');
const { CookieJar } = require('tough-cookie');
const { wrapper } = require('axios-cookiejar-support');

const CONFIG = {
  baseUrl: 'https://downr.org',
  mintEndpoint: '/.netlify/functions/analytics',
  downloadEndpoint: '/.netlify/functions/bbc',
  userAgent: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36'
};

function createClient() {
  const jar = new CookieJar();
  return wrapper(axios.create({
    jar,
    withCredentials: true,
    headers: {
      'User-Agent': CONFIG.userAgent,
      'Accept': '*/*'
    }
  }));
}

function chooseAudio(medias) {
  const audios = (Array.isArray(medias) ? medias : []).filter(media =>
    String(media?.type || '').toLowerCase() === 'audio' && media?.url
  );
  if (!audios.length) return null;

  // Utamakan M4A, lalu pilih bitrate paling dekat dengan 128 kbps.
  const m4a = audios.filter(media => String(media?.extension || '').toLowerCase() === 'm4a');
  const pool = m4a.length ? m4a : audios;
  return pool.slice().sort((a, b) =>
    Math.abs(Number(a?.bitrate || 0) - 128000) -
    Math.abs(Number(b?.bitrate || 0) - 128000)
  )[0];
}

async function downloadVideo(targetUrl) {
  const client = createClient();

  const mintRes = await client.get(`${CONFIG.baseUrl}${CONFIG.mintEndpoint}`, {
    timeout: 15000
  });

  if (mintRes.status !== 200) {
    throw new Error(`Gagal minting sesi. Status: ${mintRes.status}`);
  }

  const res = await client.post(
    `${CONFIG.baseUrl}${CONFIG.downloadEndpoint}`,
    { url: targetUrl },
    {
      headers: {
        'Content-Type': 'application/json',
        'Origin': CONFIG.baseUrl,
        'Referer': `${CONFIG.baseUrl}/`
      },
      timeout: 60000,
      validateStatus: status => status < 600
    }
  );

  if (res.status === 403 && res.data === 'user_retry_required') {
    throw new Error('Downr mengembalikan user_retry_required. Session/cookie tidak diterima.');
  }

  if (res.status >= 400) {
    const message = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    throw new Error(`Downr HTTP ${res.status}: ${message.slice(0, 300)}`);
  }

  if (!res.data || (!res.data.url && !Array.isArray(res.data.medias))) {
    throw new Error('Data media tidak ditemukan dalam respons Downr.');
  }

  return res.data;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ status: false, message: 'Method not allowed' });

  try {
    const targetUrl = String(req.query?.url || '').trim();
    if (!targetUrl) return res.status(400).json({ status: false, message: 'Parameter url kosong.' });

    let parsed;
    try { parsed = new URL(targetUrl); }
    catch { return res.status(400).json({ status: false, message: 'URL tidak valid.' }); }

    if (!['https:', 'http:'].includes(parsed.protocol)) {
      return res.status(400).json({ status: false, message: 'Protocol URL tidak didukung.' });
    }

    const data = await downloadVideo(targetUrl);
    const audio = chooseAudio(data.medias);

    if (!audio) {
      return res.status(404).json({
        status: false,
        message: 'Audio tidak ditemukan dalam response Downr.',
        data
      });
    }

    return res.status(200).json({
      status: true,
      data: {
        source: data.source || targetUrl,
        title: data.title || null,
        thumbnail: data.thumbnail || null,
        audio: {
          url: audio.url,
          extension: audio.extension || null,
          type: audio.type || 'audio',
          bitrate: Number(audio.bitrate || 0),
          bitrateKbps: Number(audio.bitrate || 0) ? Math.round(Number(audio.bitrate) / 1000) : null,
          size: audio.formattedSize || audio.size || null,
          quality: audio.quality || null
        }
      }
    });
  } catch (error) {
    const status = /user_retry_required/i.test(error.message) ? 502 : 500;
    return res.status(status).json({ status: false, message: error.message });
  }
};
