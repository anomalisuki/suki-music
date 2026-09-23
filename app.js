const form = document.getElementById("searchForm");
const queryInput = document.getElementById("query");
const searchButton = document.getElementById("searchButton");
const statusBox = document.getElementById("status");
const results = document.getElementById("results");
const empty = document.getElementById("empty");

const playerBar = document.getElementById("playerBar");
const playerThumb = document.getElementById("playerThumb");
const playerTitle = document.getElementById("playerTitle");
const playerArtist = document.getElementById("playerArtist");
const audioPlayer = document.getElementById("audioPlayer");
const closePlayer = document.getElementById("closePlayer");

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function artistText(item) {
  if (Array.isArray(item.artists) && item.artists.length) {
    return item.artists.join(", ");
  }
  return "Unknown artist";
}

function showStatus(message, isError = false) {
  statusBox.textContent = message;
  statusBox.classList.remove("hidden", "error");
  if (isError) statusBox.classList.add("error");
}

function hideStatus() {
  statusBox.classList.add("hidden");
}

function renderResults(items) {
  results.innerHTML = "";
  empty.classList.toggle("hidden", items.length > 0);

  for (const item of items) {
    const article = document.createElement("article");
    article.className = "song";

    const thumbnail = item.thumbnail || "";
    const title = item.title || "Tanpa judul";
    const artist = artistText(item);
    const album = item.album ? ` • ${item.album}` : "";
    const duration = item.duration || "";
    const plays = item.plays ? ` • ${item.plays}` : "";

    article.innerHTML = `
      <img
        class="thumb"
        src="${escapeHtml(thumbnail)}"
        alt=""
        loading="lazy"
        onerror="this.style.visibility='hidden'"
      >
      <div class="song-info">
        <h3 class="song-title">${escapeHtml(title)}</h3>
        <p class="song-meta">${escapeHtml(artist + album)}</p>
        <div class="song-extra">${escapeHtml(duration + plays)}</div>
      </div>
      <button class="play-btn" type="button" aria-label="Putar">▶</button>
    `;

    const playButton = article.querySelector(".play-btn");
    playButton.addEventListener("click", () => playItem(item, playButton));

    results.appendChild(article);
  }
}

async function searchSongs(query) {
  searchButton.disabled = true;
  showStatus("Mencari...");
  results.innerHTML = "";
  empty.classList.add("hidden");

  try {
    const response = await fetch(`/api/search?q=${encodeURIComponent(query)}&limit=20`, {
      headers: { "Accept": "application/json" }
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.status) {
      throw new Error(data.message || `Search gagal (${response.status})`);
    }

    const items = data.data?.items || [];

    if (!items.length) {
      renderResults([]);
      showStatus("Tidak ada hasil.");
      return;
    }

    hideStatus();
    renderResults(items);
  } catch (error) {
    renderResults([]);
    showStatus(error.message || "Terjadi kesalahan.", true);
  } finally {
    searchButton.disabled = false;
  }
}

async function playItem(item, button) {
  if (!item.videoId) {
    showStatus("Lagu ini tidak mempunyai videoId yang bisa diputar.", true);
    return;
  }

  button.disabled = true;
  button.classList.add("loading");
  button.textContent = "…";
  showStatus(`Menyiapkan audio: ${item.title || "lagu"}...`);

  try {
    const response = await fetch(`/api/download?url=${encodeURIComponent(`https://music.youtube.com/watch?v=${item.videoId}`)}`, {
      headers: { "Accept": "application/json" }
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.status || !data.data?.url) {
      throw new Error(data.message || `Download gagal (${response.status})`);
    }

    playerTitle.textContent = item.title || "Tanpa judul";
    playerArtist.textContent = artistText(item);
    playerThumb.src = item.thumbnail || "";
    playerBar.classList.remove("hidden");

    // Jangan memakai crossOrigin di sini.
    // URL googlevideo bersifat sementara dan diputar langsung sebagai media.
    audioPlayer.src = data.data.url;
    audioPlayer.load();

    await audioPlayer.play();

    hideStatus();
    playerBar.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (error) {
    showStatus(error.message || "Gagal mengambil audio.", true);
  } finally {
    button.disabled = false;
    button.classList.remove("loading");
    button.textContent = "▶";
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const query = queryInput.value.trim();
  if (!query) return;

  searchSongs(query);
});

closePlayer.addEventListener("click", () => {
  audioPlayer.pause();
  audioPlayer.removeAttribute("src");
  audioPlayer.load();
  playerBar.classList.add("hidden");
});

audioPlayer.addEventListener("error", () => {
  if (!playerBar.classList.contains("hidden")) {
    showStatus("Stream tidak dapat diputar atau URL stream sudah kedaluwarsa. Coba tekan Play lagi.", true);
  }
});