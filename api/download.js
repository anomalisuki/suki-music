const axios = require('axios');

const CONFIG = {
  baseUrl: 'https://downr.org',
  mintEndpoint: '/.netlify/functions/analytics',
  downloadEndpoint: '/.netlify/functions/bbc',
  userAgent: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36'
};

function bodyText(data) {
  if (typeof data === 'string') return data;
  try { return JSON.stringify(data ?? {}); } catch { return String(data ?? ''); }
}

function cookieHeader(setCookie) {
  if (!Array.isArray(setCookie)) return '';
  return setCookie.map(v => String(v).split(';', 1)[0]).filter(Boolean).join('; ');
}

function mergeCookies(oldCookie, setCookie) {
  const map = new Map();
  for (const part of String(oldCookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) map.set(part.slice(0, i).trim(), part.slice(i + 1).trim());
  }
  for (const part of String(setCookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) map.set(part.slice(0, i).trim(), part.slice(i + 1).trim());
  }
  return [...map].map(([k, v]) => `${k}=${v}`).join('; ');
}

async function request(method, url, options = {}) {
  return axios({
    method,
    url,
    timeout: options.timeout || 60000,
    data: options.data,
    headers: options.headers || {},
    validateStatus: () => true,
    transformResponse: [data => data]
  });
}

async function getDownrData(targetUrl) {
  let lastError = null;
  const userAgents = [CONFIG.userAgent, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36'];

  for (const ua of userAgents) {
    let cookies = '';
    try {
      const home = await request('GET', CONFIG.baseUrl + '/', {
        timeout: 30000,
        headers: {
          'User-Agent': ua,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Upgrade-Insecure-Requests': '1'
        }
      });
      cookies = mergeCookies(cookies, cookieHeader(home.headers['set-cookie']));

      const mint = await request('GET', CONFIG.baseUrl + CONFIG.mintEndpoint, {
        timeout: 30000,
        headers: {
          'User-Agent': ua,
          'Accept': '*/*',
          'Referer': CONFIG.baseUrl + '/',
          ...(cookies ? { Cookie: cookies } : {})
        }
      });
      cookies = mergeCookies(cookies, cookieHeader(mint.headers['set-cookie']));

      // /analytics is a session-mint endpoint. Some server-side requests can
      // receive 403 even though the Downr page/session is usable, so it is not
      // treated as fatal by itself.
      const response = await request('POST', CONFIG.baseUrl + CONFIG.downloadEndpoint, {
        timeout: 60000,
        data: { url: targetUrl },
        headers: {
          'User-Agent': ua,
          'Accept': '*/*',
          'Content-Type': 'application/json',
          'Origin': CONFIG.baseUrl,
          'Referer': CONFIG.baseUrl + '/',
          ...(cookies ? { Cookie: cookies } : {})
        }
      });

      let data = response.data;
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch {}
      }

      if (response.status >= 200 && response.status < 300 && data) {
        return { data, status: response.status };
      }

      lastError = new Error(`Downr /bbc HTTP ${response.status}: ${bodyText(data).slice(0, 500)}`);
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error('Gagal mendapatkan response dari Downr.');
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function selectAudio(data) {
  const medias = Array.isArray(data?.medias) ? data.medias : [];
  const audio = medias.filter(m => String(m?.type || '').toLowerCase() === 'audio' && m?.url);

  if (!audio.length) {
    if (data?.url) return { url: data.url, type: 'audio', ext: data.ext || null, bitrate: data.bitrate || null };
    return null;
  }

  // Prefer M4A, then choose the bitrate closest to the standard 128 kbps.
  const m4a = audio.filter(m => String(m?.ext || m?.extension || '').toLowerCase() === 'm4a');
  const pool = m4a.length ? m4a : audio;
  const target = 128000;

  return [...pool].sort((a, b) => {
    const ab = toNumber(a.bitrate) ?? Infinity;
    const bb = toNumber(b.bitrate) ?? Infinity;
    return Math.abs(ab - target) - Math.abs(bb - target);
  })[0];
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method !== 'GET') {
    return res.status(405).json({ author: 'xvlovers', status: false, message: 'Method Not Allowed' });
  }

  const targetUrl = String(req.query?.url || '').trim();
  if (!targetUrl) {
    return res.status(400).json({ author: 'xvlovers', status: false, message: 'Parameter url wajib diisi.' });
  }

  try {
    const parsed = new URL(targetUrl);
    if (!['youtube.com', 'www.youtube.com', 'music.youtube.com', 'm.youtube.com', 'youtu.be'].includes(parsed.hostname)) {
      return res.status(400).json({ author: 'xvlovers', status: false, message: 'URL harus berasal dari YouTube/YouTube Music.' });
    }
  } catch {
    return res.status(400).json({ author: 'xvlovers', status: false, message: 'URL tidak valid.' });
  }

  try {
    const downr = await getDownrData(targetUrl);
    const selected = selectAudio(downr.data);

    if (!selected?.url) {
      return res.status(502).json({
        author: 'xvlovers',
        status: false,
        stage: 'select-audio',
        message: 'Downr merespons tetapi tidak menemukan media audio.',
        downr: downr.data
      });
    }

    return res.status(200).json({
      author: 'xvlovers',
      status: true,
      data: {
        url: selected.url,
        type: selected.type || 'audio',
        ext: selected.ext || selected.extension || null,
        bitrate: selected.bitrate || null,
        quality: selected.quality || null,
        title: downr.data?.title || null,
        thumbnail: downr.data?.thumbnail || null,
        sourceUrl: targetUrl
      },
      downr: downr.data
    });
  } catch (error) {
    console.error('[download]', error);
    return res.status(502).json({
      author: 'xvlovers',
      status: false,
      stage: 'downr',
      message: error?.message || 'Gagal mengambil link audio dari Downr.'
    });
  }
};
