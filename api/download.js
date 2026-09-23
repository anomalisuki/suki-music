const youtubedl = require('youtube-dl-exec');

const USER_AGENT =
  'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36';

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.json(body);
}

function isYoutubeUrl(value) {
  try {
    const u = new URL(value);
    return [
      'youtube.com',
      'www.youtube.com',
      'music.youtube.com',
      'm.youtube.com',
      'youtu.be'
    ].includes(u.hostname);
  } catch {
    return false;
  }
}

function bitrate(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function pickAudio(formats) {
  const audio = (Array.isArray(formats) ? formats : []).filter((f) => {
    if (!f?.url) return false;
    if (f.vcodec && f.vcodec !== 'none') return false;
    return f.acodec && f.acodec !== 'none';
  });

  if (!audio.length) return null;

  // Prefer M4A, then choose the bitrate closest to 128 kbps.
  const m4a = audio.filter((f) =>
    String(f.ext || '').toLowerCase() === 'm4a'
  );
  const pool = m4a.length ? m4a : audio;
  const target = 128000;

  return [...pool].sort((a, b) => {
    const aBitrate = bitrate(a.tbr ? Number(a.tbr) * 1000 : a.abr ? Number(a.abr) * 1000 : null);
    const bBitrate = bitrate(b.tbr ? Number(b.tbr) * 1000 : b.abr ? Number(b.abr) * 1000 : null);
    const da = aBitrate == null ? Infinity : Math.abs(aBitrate - target);
    const db = bBitrate == null ? Infinity : Math.abs(bBitrate - target);
    return da - db;
  })[0];
}

async function extract(url) {
  return youtubedl(url, {
    dumpSingleJson: true,
    skipDownload: true,
    noPlaylist: true,
    noWarnings: true,
    noCheckCertificates: true,
    format: 'bestaudio/best',
    userAgent: USER_AGENT,
    referer: 'https://www.youtube.com/',
    jsRuntimes: 'node',
    remoteComponents: 'ejs:github',
    socketTimeout: 30000,
    retries: 2,
    extractorRetries: 2
  }, {
    timeout: 60000,
    maxBuffer: 20 * 1024 * 1024
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return json(res, 405, {
      author: 'xvlovers',
      status: false,
      message: 'Method Not Allowed'
    });
  }

  const targetUrl = String(req.query?.url || '').trim();

  if (!targetUrl) {
    return json(res, 400, {
      author: 'xvlovers',
      status: false,
      message: 'Parameter url wajib diisi.'
    });
  }

  if (!isYoutubeUrl(targetUrl)) {
    return json(res, 400, {
      author: 'xvlovers',
      status: false,
      message: 'URL harus berasal dari YouTube atau YouTube Music.'
    });
  }

  try {
    const info = await extract(targetUrl);
    const selected = pickAudio(info.formats);

    // Fallback: yt-dlp can return the selected format URL at info.url.
    const selectedUrl = selected?.url || info.url;

    if (!selectedUrl) {
      return json(res, 502, {
        author: 'xvlovers',
        status: false,
        stage: 'select-audio',
        message: 'yt-dlp tidak mengembalikan URL audio.',
        title: info.title || null
      });
    }

    const selectedBitrate = selected
      ? (selected.tbr || selected.abr || null)
      : (info.tbr || info.abr || null);

    return json(res, 200, {
      author: 'xvlovers',
      status: true,
      engine: 'yt-dlp',
      data: {
        url: selectedUrl,
        type: 'audio',
        ext: selected?.ext || info.ext || null,
        bitrate: selectedBitrate,
        quality: selected?.format_note || selected?.format || null,
        title: info.title || null,
        thumbnail: info.thumbnail || null,
        sourceUrl: targetUrl,
        videoId: info.id || null,
        uploader: info.uploader || null,
        duration: info.duration || null
      }
    });
  } catch (error) {
    const stderr = error?.stderr || error?.shortMessage || error?.message || String(error);
    console.error('[yt-dlp]', stderr);

    return json(res, 502, {
      author: 'xvlovers',
      status: false,
      stage: 'yt-dlp',
      message: String(stderr).slice(0, 1800)
    });
  }
};
