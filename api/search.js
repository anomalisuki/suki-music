const axios = require('axios');

const BASE = 'https://music.youtube.com';
const API_KEY = "AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30";
const CLIENT_VERSION = '1.20260915.14.00';

const PARAMS = {
  songs: 'EgWKAQIIAWoKEAkQBRAKEAMQBA%3D%3D'
};

function getThumbnail(item) {
  const thumbs = item?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails;
  if (!Array.isArray(thumbs) || !thumbs.length) return null;
  return thumbs[thumbs.length - 1]?.url || thumbs[0]?.url || null;
}

function isVideoId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{11}$/.test(id);
}

function pickMusicItem(renderer) {
  const item = renderer?.musicResponsiveListItemRenderer;
  if (!item) return null;

  const videoId =
    item?.playlistItemData?.videoId ||
    item?.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.videoId ||
    item?.navigationEndpoint?.watchEndpoint?.videoId ||
    null;

  const browseId = item?.navigationEndpoint?.browseEndpoint?.browseId || null;
  const pageType = item?.navigationEndpoint?.browseEndpoint
    ?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType || null;

  const flexTexts = [];
  for (const column of item.flexColumns || []) {
    const runs = column?.musicResponsiveListItemFlexColumnRenderer?.text?.runs;
    if (Array.isArray(runs)) {
      const text = runs.map(run => run?.text || '').join('').trim();
      if (text) flexTexts.push(text);
    }
  }

  const title = flexTexts[0] || null;
  const subtitle = flexTexts[1] || null;

  let artists = [];
  let album = null;
  let duration = null;
  let plays = null;

  if (subtitle) {
    const parts = subtitle.split('•').map(v => v.trim()).filter(Boolean);
    const durationIndex = parts.findIndex(v => /^\d+:\d+(?::\d+)?$/.test(v));

    if (durationIndex >= 0) {
      duration = parts[durationIndex];
      plays = parts[durationIndex + 1] || null;
      const before = parts.slice(0, durationIndex);
      if (before.length >= 2) {
        artists = [before[0]];
        album = before.slice(1).join(' • ');
      } else if (before.length === 1) {
        artists = before;
      }
    } else if (parts.length >= 2) {
      artists = [parts[0]];
      album = parts.slice(1).join(' • ');
    } else {
      artists = parts;
    }
  }

  let type = 'browse';
  if (pageType === 'MUSIC_PAGE_TYPE_TRACK' || isVideoId(videoId)) type = 'song';
  else if (pageType) type = pageType;

  return {
    type,
    videoId,
    watchUrl: isVideoId(videoId) ? `${BASE}/watch?v=${videoId}` : null,
    browseId,
    title,
    artists,
    album,
    duration,
    plays,
    thumbnail: getThumbnail(item)
  };
}

function collectSongs(data) {
  const output = [];
  const tabs = data?.contents?.tabbedSearchResultsRenderer?.tabs || [];

  for (const tab of tabs) {
    const sections = tab?.tabRenderer?.content?.sectionListRenderer?.contents || [];
    for (const section of sections) {
      const shelf = section?.musicShelfRenderer || section?.musicCardShelfRenderer;
      if (!shelf) continue;

      for (const item of shelf.contents || []) {
        const picked = pickMusicItem(item);
        if (picked && isVideoId(picked.videoId)) output.push(picked);
      }
    }
  }

  return output;
}

function findContinuation(data) {
  const tabs = data?.contents?.tabbedSearchResultsRenderer?.tabs || [];
  for (const tab of tabs) {
    const contents = tab?.tabRenderer?.content?.sectionListRenderer?.contents || [];
    for (const section of contents) {
      const token =
        section?.musicShelfRenderer?.continuations?.[0]?.nextContinuationData?.continuation ||
        section?.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token;
      if (token) return token;
    }
  }
  return null;
}

async function callSearch(query, continuation = null) {
  if (!API_KEY) throw new Error('YTMUSIC_API_KEY belum diset di Vercel Environment Variables.');

  const body = {
    context: {
      client: {
        clientName: 'WEB_REMIX',
        clientVersion: CLIENT_VERSION,
        hl: 'id',
        gl: 'ID'
      }
    },
    query,
    params: PARAMS.songs
  };

  if (continuation) body.continuation = continuation;

  const response = await axios.post(
    `${BASE}/youtubei/v1/search?key=${encodeURIComponent(API_KEY)}&prettyPrint=false`,
    body,
    {
      timeout: 25000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 13; SM-A536E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8',
        'Origin': BASE,
        'Referer': `${BASE}/`
      },
      validateStatus: status => status < 600,
      transformResponse: [data => data]
    }
  );

  if (response.status >= 400) {
    const error = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
    throw new Error(`YouTube Music HTTP ${response.status}: ${error.slice(0, 300)}`);
  }

  let data = response.data;
  if (typeof data === 'string') {
    try { data = JSON.parse(data); }
    catch { throw new Error('Respons YouTube Music bukan JSON valid.'); }
  }
  return data;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ status: false, message: 'Method not allowed' });

  try {
    const query = String(req.query?.q || '').trim();
    const limit = Math.min(Math.max(Number(req.query?.limit) || 20, 1), 50);
    if (!query) return res.status(400).json({ status: false, message: 'Query kosong.' });

    const allItems = [];
    let continuation = null;

    for (let page = 0; page < 5 && allItems.length < limit; page++) {
      const data = await callSearch(query, continuation);
      allItems.push(...collectSongs(data));
      continuation = findContinuation(data);
      if (!continuation) break;
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    const items = allItems.slice(0, limit);
    return res.status(200).json({
      author: 'xvlovers',
      status: true,
      data: { mode: 'search', query, type: 'songs', count: items.length, items }
    });
  } catch (error) {
    return res.status(500).json({ author: 'xvlovers', status: false, message: error.message });
  }
};
