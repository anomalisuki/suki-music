const axios = require("axios");

const BASE = "https://music.youtube.com";
const API_KEY = "AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30";
const CLIENT_VERSION =
  process.env.YOUTUBE_CLIENT_VERSION || "1.20260915.14.00";

const UA =
  "Mozilla/5.0 (Linux; Android 13; SM-A536E) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36";

const PARAMS = {
  all: "EgWKAQIIAWoKEAkQBRAKEAMQBA%3D%3D",
  songs: "EgWKAQIIAWoKEAkQBRAKEAMQBA%3D%3D",
  videos: "EgWKAQIYAWoKEAkQChAFEAMQBA%3D%3D",
  albums: "EgWKAQIoAWoKEAkQChAFEAMQBA%3D%3D",
  playlists: "EgWKAQIgAWoKEAkQChAFEAMQBA%3D%3D",
  artists: "EgWKAQJQAWoKEAkQChAFEAMQBA%3D%3D"
};

const client = axios.create({
  timeout: 25000,
  headers: {
    "User-Agent": UA,
    "Content-Type": "application/json",
    "Accept": "application/json",
    "Accept-Language": "id-ID,id;q=0.9,en;q=0.8",
    "Origin": BASE,
    "Referer": BASE + "/"
  },
  validateStatus: status => status < 600,
  transformResponse: [data => data]
});

function getThumbnail(item) {
  const thumbs =
    item?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails;

  if (!Array.isArray(thumbs) || !thumbs.length) return null;

  return thumbs[thumbs.length - 1]?.url || thumbs[0]?.url || null;
}

function isVideoId(id) {
  return typeof id === "string" && /^[A-Za-z0-9_-]{11}$/.test(id);
}

function pickMusicItem(renderer) {
  if (!renderer) return null;

  const item = renderer.musicResponsiveListItemRenderer;
  if (!item) return null;

  const videoId =
    item?.playlistItemData?.videoId ||
    item?.overlay?.musicItemThumbnailOverlayRenderer?.content
      ?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint
      ?.videoId ||
    item?.navigationEndpoint?.watchEndpoint?.videoId ||
    null;

  const browseId =
    item?.navigationEndpoint?.browseEndpoint?.browseId || null;

  const pageType =
    item?.navigationEndpoint?.browseEndpoint
      ?.browseEndpointContextSupportedConfigs
      ?.browseEndpointContextMusicConfig?.pageType || null;

  const flexTexts = [];

  if (Array.isArray(item.flexColumns)) {
    for (const column of item.flexColumns) {
      const runs =
        column?.musicResponsiveListItemFlexColumnRenderer?.text?.runs;

      if (Array.isArray(runs)) {
        const text = runs
          .map(run => run?.text || "")
          .join("")
          .trim();

        if (text) flexTexts.push(text);
      }
    }
  }

  const title = flexTexts[0] || null;
  const subtitle = flexTexts[1] || null;
  const third = flexTexts[2] || null;

  let artists = [];
  let album = null;
  let duration = null;
  let plays = null;

  if (subtitle) {
    const parts = subtitle
      .split("•")
      .map(value => value.trim())
      .filter(Boolean);

    const durationIndex = parts.findIndex(
      value => /^\d+:\d+(?::\d+)?$/.test(value)
    );

    if (durationIndex >= 0) {
      duration = parts[durationIndex];
      plays = parts[durationIndex + 1] || null;

      const beforeDuration = parts.slice(0, durationIndex);

      if (beforeDuration.length >= 2) {
        artists = [beforeDuration[0]];
        album = beforeDuration.slice(1).join(" • ");
      } else if (beforeDuration.length === 1) {
        artists = beforeDuration;
      }
    } else if (parts.length >= 2) {
      artists = [parts[0]];
      album = parts.slice(1).join(" • ");
    } else {
      artists = parts;
    }
  }

  const badges = [];

  for (const badge of item?.badges || []) {
    const text =
      badge?.musicInlineBadgeRenderer?.accessibilityData
        ?.accessibilityData?.label ||
      badge?.musicInlineBadgeRenderer?.icon?.iconType;

    if (text) badges.push(text);
  }

  const watchUrl = isVideoId(videoId)
    ? `${BASE}/watch?v=${videoId}`
    : null;

  let type = "browse";

  if (pageType === "MUSIC_PAGE_TYPE_TRACK") {
    type = "song";
  } else if (isVideoId(videoId)) {
    type = "song";
  } else if (pageType) {
    type = pageType;
  }

  return {
    type,
    videoId,
    watchUrl,
    browseId,
    title,
    artists,
    album,
    duration,
    plays,
    thumbnail: getThumbnail(item),
    badges,
    raw: { flexTexts, third }
  };
}

async function callSearch(query, params, continuation = null) {
  if (!API_KEY) {
    throw new Error("YOUTUBE_API_KEY belum diset di Vercel Environment Variables.");
  }

  const body = {
    context: {
      client: {
        clientName: "WEB_REMIX",
        clientVersion: CLIENT_VERSION,
        hl: "id",
        gl: "ID"
      }
    },
    query,
    params
  };

  if (continuation) body.continuation = continuation;

  const url =
    `${BASE}/youtubei/v1/search` +
    `?key=${encodeURIComponent(API_KEY)}` +
    `&prettyPrint=false`;

  const response = await client.post(url, body);

  if (response.status >= 400) {
    const error =
      typeof response.data === "string"
        ? response.data
        : JSON.stringify(response.data);

    throw new Error(
      `YouTube Music HTTP ${response.status}: ${error.slice(0, 300)}`
    );
  }

  let data = response.data;

  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      throw new Error("Response YouTube Music bukan JSON valid.");
    }
  }

  return data;
}

function collectFromResponse(data, filterType = "songs") {
  const output = [];

  const tabs =
    data?.contents?.tabbedSearchResultsRenderer?.tabs || [];

  for (const tab of tabs) {
    const sections =
      tab?.tabRenderer?.content?.sectionListRenderer?.contents || [];

    for (const section of sections) {
      const shelf =
        section?.musicShelfRenderer ||
        section?.musicCardShelfRenderer;

      if (!shelf) continue;

      for (const item of shelf.contents || []) {
        const picked = pickMusicItem(item);
        if (!picked) continue;

        if (
          filterType === "songs" &&
          !isVideoId(picked.videoId)
        ) {
          continue;
        }

        output.push(picked);
      }
    }
  }

  return output;
}

function findContinuation(data) {
  const tabs =
    data?.contents?.tabbedSearchResultsRenderer?.tabs || [];

  for (const tab of tabs) {
    const contents =
      tab?.tabRenderer?.content?.sectionListRenderer?.contents || [];

    for (const section of contents) {
      const continuation =
        section?.musicShelfRenderer?.continuations?.[0]
          ?.nextContinuationData?.continuation ||
        section?.continuationItemRenderer?.continuationEndpoint
          ?.continuationCommand?.token;

      if (continuation) return continuation;
    }
  }

  return null;
}

async function search(query, type = "songs", limit = 20) {
  if (!query || !query.trim()) {
    throw new Error("Query kosong.");
  }

  limit = Number(limit);

  if (!Number.isFinite(limit) || limit <= 0) limit = 20;
  limit = Math.min(Math.floor(limit), 100);

  const paramKey = PARAMS[type] ? type : "songs";
  const params = PARAMS[paramKey];

  const allItems = [];
  let continuation = null;

  for (let page = 0; page < 5; page++) {
    const data = await callSearch(query, params, continuation);
    const items = collectFromResponse(data, paramKey);

    allItems.push(...items);

    if (allItems.length >= limit) break;

    continuation = findContinuation(data);
    if (!continuation) break;

    await new Promise(resolve => setTimeout(resolve, 800));
  }

  return {
    mode: "search",
    query,
    type: paramKey,
    count: Math.min(allItems.length, limit),
    items: allItems.slice(0, limit)
  };
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  try {
    const query = String(req.query?.q || "").trim();
    const type = String(req.query?.type || "songs").trim();
    const limit = req.query?.limit || 20;

    const data = await search(query, type, limit);

    return res.status(200).json({
      author: "xvlovers",
      status: true,
      data
    });
  } catch (error) {
    return res.status(500).json({
      author: "xvlovers",
      status: false,
      message: error?.message || "Search error"
    });
  }
};