(function() {
'use strict';

// Your code here...

(async () => {
// Load JSZip if not already present
if (typeof JSZip === "undefined") {
await new Promise((res, rej) => {
const s = document.createElement("script");
s.src = "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js";
s.onload = res;
s.onerror = rej;
document.head.appendChild(s);
});
}

const STORAGE_KEY = "HD_SCRAPER_URLS";
// NOTE: PROXY is set to a placeholder for demonstration. This needs to be a functional proxy endpoint.
const PROXY = "http://localhost:8080/?url=";

let scraping = false;
let paused = false;
let urls = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
// --- Styles (Material 3 Inspired Green/Light Theme) ---
const style = document.createElement("style");
style.textContent = `
/* M3 Color Palette Approximation (Green Hues) */
:root {
--m3-surface: #002e15; /* Very Light Mint Green */
--m3-on-surface: #dddddd; /* Dark Text */
--m3-primary: #a9d377; /* Primary Green for icons/text */
--m3-primary-container: #4e6424; /* Light Green fill for active elements */
--m3-on-primary-container: #a0c278; /* Dark text on primary container */
}

.hd-chip {
/* Completely hide the tap highlight */
* {
-webkit-tap-highlight-color: transparent;
}
position: fixed;
top: 12px;
right: 12px;
z-index: 999999;
display: flex;
align-items: center;
gap: 8px;
padding: 6px 8px;
border-radius: 48px; /* M3 high curvature */
background: var(--m3-surface);
box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1), 0 0 2px rgba(0, 0, 0, 0.05); /* Subtle M3 Elevation */
font-family: "Inter", "Segoe UI", sans-serif;
color: var(--m3-on-surface);
transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
user-select: none;
min-width: 150px; /* Ensure space for labels */
justify-content: space-between;
}
.hd-chip button {
border: none;
outline: none;
background: transparent;
color: var(--m3-primary);
font-weight: 500;
padding: 8px 14px;
border-radius: 30px;
font-size: 14px;
cursor: pointer;
transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
display: flex;
align-items: center;
justify-content: center;
}
.hd-chip button:hover {
background: rgba(0, 110, 27, 0.08); /* Subtle hover ripple */
}
.hd-chip button:active {
transform: scale(0.98);
background: rgba(0, 110, 27, 0.15);
}
/* Primary action state (Filled Tonal Button inspired) */
.hd-chip button.active {
background: var(--m3-primary-container);
color: var(--m3-on-primary-container);
font-weight: 700;
box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}
.hd-chip .counter {
font-size: 18px;
padding: 0 6px;
color: var(--m3-on-surface);
font-weight: 600;
opacity: 0.85;
min-width: 25px; /* prevent jump */
text-align: center;
}
@media (max-width: 480px) {
.hd-chip {
top: 8px;
right: 8px;
padding: 4px 6px;
gap: 6px;
}
.hd-chip button {
font-size: 13px;
padding: 6px 12px;
}
.hd-chip .counter {
font-size: 13px;
}
}
`;
document.head.appendChild(style);


// --- GM_xmlhttpRequest Wrapper (replaces proxy/fetch) ---
// --- GM_xmlhttpRequest Wrapper (supports large files safely) ---
async function gmFetch(url, type = "text") {
return new Promise((resolve, reject) => {
GM_xmlhttpRequest({
method: "GET",
url,
responseType: type === "blob" ? "arraybuffer": "text",
headers: {
"User-Agent": navigator.userAgent,
"Referer": location.href,
"Accept": "*/*",
},
anonymous: false,
onload: (res) => {
if (res.status >= 200 && res.status < 300) {
if (type === "blob") {
// Determine MIME type from response headers
const mime =
res.responseHeaders.match(/content-type:\s*([^\n\r]+)/i)?.[1] ||
"application/octet-stream";

resolve(new Blob([res.response], { type: mime }));
} else {
resolve(res.responseText);
}
} else {
reject(new Error(`HTTP ${res.status}: ${url}`));
}
},
onerror: reject,
});
});
}



// --- UI ---
const ui = document.createElement("div");
ui.className = "hd-chip";
// Added emojis for M3 style visual clarity
ui.innerHTML = `
<button class="start">▶ Start</button>
<span class="counter">${urls.length}</span>
<button class="download">💾</button>
`;
document.body.appendChild(ui);
// Default spawn position (bottom-right, easy thumb reach)
ui.style.bottom = "25vh";
ui.style.right = "20px";
ui.style.top = "auto"; // disable top positioning

const startBtn = ui.querySelector(".start");
const downloadBtn = ui.querySelector(".download");
const counter = ui.querySelector(".counter");

const updateCounter = () => (counter.textContent = urls.length);

const setStatus = (text, active = false) => {
startBtn.innerHTML = text; // Use innerHTML for emoji/text mixing
startBtn.classList.toggle("active", active);
};

// --- START / PAUSE / RESUME toggle ---
startBtn.onclick = () => {
if (!scraping) {
handleResumeRedirect(); // 🧭 Try resuming to last page if needed
scraping = true;
paused = false;
setStatus("⏸ Pause", true);
interceptThumbnails();
} else if (!paused) {
paused = true;
setStatus("▶ Resume", false);
} else {
paused = false;
setStatus("⏸ Pause", true);
}
};

// --- dblClick RESET ---
startBtn.addEventListener("dblclick", () => {
if (!window.confirm("⚠ Are you sure you want to reset everything? This cannot be undone.")) return;
// Reset all state
scraping = false;
paused = false;
urls = [];
localStorage.removeItem(STORAGE_KEY);
clearLastScrapedLocation();
// Reset UI
updateCounter();
setStatus("▶ Start", false);

// Remove scraped marks & opacity from all thumbnails
document.querySelectorAll("a.scraped").forEach((thumb) => {
thumb.classList.remove("scraped");
thumb.style.filter = "";
});

console.log("[HD-Scraper] All data has been reset.");
});

//---------ADD PROCESSING SHIMMER----------//

function addProcessingShimmer(el) {
// Ensure relative positioning for overlay
el.style.position = "relative";
el.style.overflow = "hidden";

// Create a shimmer overlay that affects only the image area
const shimmer = document.createElement("div");
shimmer.className = "hd-shimmer";
shimmer.style.cssText = `
position: absolute;
inset: 0;
pointer-events: none;
border-radius: inherit;
background: linear-gradient(
120deg,
transparent 0%,
rgba(255, 255, 255, 0.4) 50%,
transparent 100%
);
transform: translateX(-100%);
animation: hdShimmerMove 1.2s ease-in-out infinite;
`;

el.appendChild(shimmer);
}

// Remove shimmer when processing completes
function removeProcessingShimmer(el) {
const shimmer = el.querySelector(".hd-shimmer");
if (shimmer) shimmer.remove();
}

// Define keyframes dynamically (safe if reused multiple times)
if (!document.getElementById("hd-shimmer-style")) {
const style = document.createElement("style");
style.id = "hd-shimmer-style";
style.textContent = `
@keyframes hdShimmerMove {
0% { transform: translateX(-100%); }
100% { transform: translateX(100%); }
}
`;
document.head.appendChild(style);
}


// --- SCRAPE SUCCESS ANIMATION ---
function animateScrapedThumb(thumb) {
// Add a short pulse effect on the thumbnail itself
thumb.style.position = "relative";
thumb.style.transition = "transform 0.3s ease, filter 0.3s ease";
thumb.style.transform = "scale(1.05)";
thumb.style.filter = "opacity(0.3) brightness(1.2)";

setTimeout(() => {
thumb.style.transform = "scale(1)";
},
200);

// Create a floating sparkle effect (tiny green particle burst)
const sparkle = document.createElement("div");
sparkle.className = "hd-sparkle";
sparkle.innerHTML = "✨";
sparkle.style.cssText = `
position: absolute;
top: 50%;
left: 50%;
transform: translate(-50%, -50%) scale(0.5);
font-size: 20px;
pointer-events: none;
opacity: 0.9;
color: var(--m3-primary);
animation: hdSparkleFly 600ms ease-out forwards;
`;
thumb.appendChild(sparkle);

// Clean up after animation
sparkle.addEventListener("animationend",
() => sparkle.remove());
}

// Add keyframes for sparkle animation (only once)
(() => {
if (document.getElementById("hd-sparkle-style")) return;
const sparkleStyle = document.createElement("style");
sparkleStyle.id = "hd-sparkle-style";
sparkleStyle.textContent = `
@keyframes hdSparkleFly {
0% { transform: translate(-50%, -50%) scale(0.5); opacity: 0.9; }
50% { transform: translate(-50%, -120%) scale(1.2); opacity: 1; }
100% { transform: translate(-50%, -200%) scale(0.8); opacity: 0; }
}
`;
document.head.appendChild(sparkleStyle);
})();


// --- AUTO-RESUME FEATURE (triggered on Start button click) ---
const LAST_PAGE_KEY = "HD_SCRAPER_LAST_PAGE";

/**
* Save current page location on every successful scrap.
*/
function saveLastScrapedLocation() {
try {
localStorage.setItem(LAST_PAGE_KEY,
window.location.href);
} catch (err) {
console.warn("[HD-Scraper] Failed to save last page:",
err);
}
}

/**
* Check and conditionally redirect when user presses Start.
* Will NOT redirect if:
* 1. counter = 0 (new session)
* 2. user imported a URL file (import already handled redirection)
* 3. current page shares same tags with saved page (breaked and underwor)
*/
function handleResumeRedirect() {
try {
const savedUrl = localStorage.getItem(LAST_PAGE_KEY);
if (!savedUrl) return; // nothing saved

// #1 Skip redirect if no saved URLs
if (urls.length === 0) {
console.log("[HD-Scraper] Skipping redirect (no URLs — new session).");
return;
}

// #3 Skip redirect if same tags
const getTags = (u) => {
const m = u.match(/[?&]tags=([^&]+)/);
return m ? decodeURIComponent(m[1]): "";
};
const savedTags = getTags(savedUrl);
const currentTags = getTags(window.location.href);

if (savedTags && savedTags === currentTags) {
console.log("[HD-Scraper] Same tags detected, staying on current page.");
return;
}

// Redirect only if page differs (even if no tags in URL)
if (window.location.href !== savedUrl) {
if (!window.confirm(`⚠️ REDIRECT WARNING ⚠️\n\nWould you like to resume from the page where you left:\n${savedUrl}`)) return;
console.log(`[HD-Scraper] Redirecting to last scraped page: ${savedUrl}`);
setStatus("📍 Resuming...", true);
setTimeout(() => {
window.location.href = savedUrl;
}, 800); // small delay for visual feedback
}
} catch (err) {
console.error("[HD-Scraper] Failed to handle resume redirect:", err);
}
}

/**
* Clear saved last page (used on reset or full download)
*/
function clearLastScrapedLocation() {
localStorage.removeItem(LAST_PAGE_KEY);
console.log("[HD-Scraper] Cleared saved last page.");
}


// --- EXPORT / IMPORT Feature on Counter Click ---
counter.addEventListener("click",
async () => {
try {
// If we have URLs saved → EXPORT mode
if (urls.length > 0) {
const data = {
location: window.location.href,
urls,
exported_at: new Date().toISOString()
};

// Extract tags from the current URL
const url = new URL(window.location.href);
const tagsParam = url.searchParams.get("tags");
const tags = tagsParam ? tagsParam.split('+').map(tag => tag.replace(/%3A/g, ':')).join('_'): 'no_tags';

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const filename = `${tags}_${timestamp}.json`;

const blob = new Blob([JSON.stringify(data, null, 2)], {
type: "application/json"
});
const a = document.createElement("a");
a.href = URL.createObjectURL(blob);
a.download = filename;
a.click();
URL.revokeObjectURL(a.href);

console.log(`[HD-Scraper] Exported ${urls.length} URLs to ${filename}`);
setStatus("✅ Exported", false);
setTimeout(() => setStatus("▶ Start", false), 1500);
}

// If no URLs → IMPORT mode
else {
const input = document.createElement("input");
input.type = "file";
input.accept = "application/json";

input.onchange = async (e) => {
const file = e.target.files[0];
if (!file) return;

try {
const text = await file.text();
const data = JSON.parse(text);

if (!Array.isArray(data.urls) || typeof data.location !== "string") {
throw new Error("Invalid file format");
}

// Save to localStorage
urls = data.urls;
localStorage.setItem(STORAGE_KEY, JSON.stringify(urls));

console.log(`[HD-Scraper] Imported ${urls.length} URLs. Redirecting...`);
setStatus("🔄 Importing...", true);

// Redirect to stored location
window.location.href = data.location;
} catch (err) {
console.error("[HD-Scraper] Import failed:", err);
alert("❌ Failed to import: Invalid or corrupt file.");
}
};

input.click();
}
} catch (err) {
console.error("[HD-Scraper] Export/Import error:", err);
}
});

// --- MAKE UI DRAGGABLE (Touch + Mouse) ---
function makeUIDraggable() {
// Create a small drag handle (like "⋮⋮")
const dragHandle = document.createElement("div");
dragHandle.innerHTML = "⋮⋮";
dragHandle.style.cssText = `
cursor: grab;
font-weight: bold;
font-size: 18px;
color: var(--m3-primary);
user-select: none;
padding: 0 6px;
touch-action: none;
`;
ui.appendChild(dragHandle);

let offsetX = 0, offsetY = 0;
let startX = 0, startY = 0;
let dragging = false;

const startDrag = (clientX,
clientY) => {
dragging = true;
ui.style.transition = "none";
startX = clientX;
startY = clientY;
const rect = ui.getBoundingClientRect();
offsetX = startX - rect.left;
offsetY = startY - rect.top;
dragHandle.style.cursor = "grabbing";
};

const moveDrag = (clientX,
clientY) => {
if (!dragging) return;
const x = clientX - offsetX;
const y = clientY - offsetY;
ui.style.left = x + "px";
ui.style.top = y + "px";
ui.style.right = "auto"; // unset right to allow dragging freely
ui.style.bottom = "auto";
ui.style.position = "fixed";
};

const stopDrag = () => {
dragging = false;
dragHandle.style.cursor = "grab";
ui.style.transition = "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)";
};

// Mouse events
dragHandle.addEventListener("mousedown", (e) => {
e.preventDefault();
startDrag(e.clientX, e.clientY);
});
window.addEventListener("mousemove", (e) => moveDrag(e.clientX, e.clientY));
window.addEventListener("mouseup", stopDrag);

// Touch events
dragHandle.addEventListener("touchstart", (e) => {
const t = e.touches[0];
startDrag(t.clientX, t.clientY);
}, {
passive: true
});
window.addEventListener("touchmove", (e) => {
const t = e.touches[0];
moveDrag(t.clientX, t.clientY);
}, {
passive: true
});
window.addEventListener("touchend", stopDrag);
}

// Call it right after UI is created
makeUIDraggable();

// Add this at the top, near other flags
let stopRequested = false; // Used to signal stop request

// --- DOWNLOAD with confirmation ---
// --- DOWNLOAD with chunked video downloader (safe for large files) ---
downloadBtn.onclick = async () => {
    // --- STOP BUTTON HANDLING ---
    if (scraping && !stopRequested) {
        // If already downloading and user clicks, we trigger a stop.
        stopRequested = true;
        setStatus("⏹ Stopping...", true);
        return; // The main loop will see stopRequested and break out
    }

    if (urls.length === 0) {
        console.warn("⚠ No images scraped yet!");
        setStatus("No Images", false);
        setTimeout(() => setStatus("▶ Start", false), 1500);
        return;
    }

    stopRequested = false; // Reset flag for fresh run
    scraping = true;
    paused = false;
    // Change btn to STOP while downloading
    downloadBtn.textContent = "⏹ Stop";

    const FILES_PER_ZIP = 50; // same as before
    const totalChunks = Math.ceil(urls.length / FILES_PER_ZIP);

    if (!window.confirm(
        `Download ${urls.length} files as ${totalChunks} ZIP file(s)?\n\n` +
        `(Chunk-safe mode enabled: supports unlimited file sizes.)`
    )) {
        downloadBtn.textContent = "💾";
        scraping = false;
        return;
    }

    // ---- CHUNKED DOWNLOADER -----
    async function fetchChunk(url, start, end) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "GET",
                url: url,
                headers: { Range: `bytes=${start}-${end}` },
                responseType: "arraybuffer",
                onload: res => resolve(res),
                onerror: reject,
            });
        });
    }

    async function downloadBigFile(url) {
        return new Promise((resolve, reject) => {
            // Head request first
            GM_xmlhttpRequest({
                method: "HEAD",
                url,
                onload: async head => {
                    const total = Number(
                        head.responseHeaders.match(/content-length:\s*([0-9]+)/i)?.[1] || 0
                    );

                    if (!total) return reject("Failed to determine file size.");

                    const CHUNK = 1024 * 1024; // 1MB
                    const chunks = [];
                    let pos = 0, index = 0;

                    while (pos < total) {
                        if (stopRequested) return reject("Download stopped."); // <--- Added
                        const end = Math.min(pos + CHUNK - 1, total - 1);
                        const part = await fetchChunk(url, pos, end);

                        chunks.push(new Uint8Array(part.response));
                        pos += CHUNK;
                        index++;

                        setStatus(`⬇ ${((pos / total) * 100).toFixed(1)}%`, true);
                        await new Promise(r => setTimeout(r, 10));
                    }

                    // Merge
                    const totalLength = chunks.reduce((a, b) => a + b.length, 0);
                    const merged = new Uint8Array(totalLength);
                    let offset = 0;
                    for (const c of chunks) {
                        merged.set(c, offset);
                        offset += c.length;
                    }

                    resolve(new Blob([merged], { type: "video/mp4" }));
                },
                onerror: reject,
            });
        });
    }

    // ----------------------------
    // ZIP CREATION USING CHUNK SAFE DOWNLOADER
    // ----------------------------
    setStatus("⏳ Downloading...", true);
    const failed = [];
    let completedUrls = [];

    outerLoop:
    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        const start = chunkIndex * FILES_PER_ZIP;
        const end = Math.min(start + FILES_PER_ZIP, urls.length);
        const group = urls.slice(start, end);
        const zip = new JSZip();

        for (let i = 0; i < group.length; i++) {
            const url = group[i];
            let filename = url.split("/").pop().split("?")[0] || `file_${start + i}.mp4`;

            if (stopRequested) {
                // Mark all remaining in this group as failed
                failed.push(...group.slice(i));
                // Also mark all URLs in future chunks as failed
                const afterChunksStart = (chunkIndex + 1) * FILES_PER_ZIP;
                failed.push(...urls.slice(afterChunksStart));
                break outerLoop; // save & exit
            }

            try {
                const blob = await downloadBigFile(url);
                zip.file(filename, blob);
                completedUrls.push(url);
            } catch (err) {
                console.error("Chunked download failed:", url, err);
                failed.push(url);
            }

            setStatus(`⏳ File ${start + i + 1}/${urls.length}`);
        }

        // Save completed chunk (partial or full)
        if (zip.files && Object.keys(zip.files).length > 0) { // check ZIP has files
            const zipBlob = await zip.generateAsync({ type: "blob" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(zipBlob);
            a.download = `files_part${chunkIndex + 1}.zip`;
            a.click();
            URL.revokeObjectURL(a.href);
        }
        if (stopRequested) break; // End after partial ZIP save if stopped
    }

    urls = failed;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(urls));
    updateCounter();

    if (urls.length === 0) {
        clearLastScrapedLocation();
        setStatus(stopRequested ? "⏹ Stopped" : "✅ Done", false);
    } else {
        setStatus(stopRequested ? `⏹ Stopped • ${urls.length} failed` : `⚠ ${urls.length} failed`, false);
    }

    downloadBtn.textContent = "💾"; // Restore download button
    scraping = false;
    paused = false;
    stopRequested = false; // Clean up flag
};

// --- SCRAPING LOGIC ---
function interceptThumbnails() {
document.querySelectorAll("a:has(img)").forEach((thumb) => {
if (thumb.dataset.scrapBound) return;
thumb.dataset.scrapBound = true;

thumb.addEventListener("click", async (e) => {
if (!scraping || paused) return;
e.preventDefault();

if (thumb.classList.contains("scraped")) return;

try {
addProcessingShimmer(thumb);
counter.textContent = "⏳";
const html = await gmFetch(thumb.href, "text");

const match = html.match(/<a\s+href="([^"]*\/images\/[^"]+)"/i);
if (match && match[1]) {
const hdUrl = match[1];
if (!urls.includes(hdUrl)) {
urls.push(hdUrl);
}
localStorage.setItem(STORAGE_KEY, JSON.stringify(urls));
saveLastScrapedLocation(); // 💾 always save current page
// Only mark as scraped after successful fetch & URL extraction
thumb.classList.add("scraped");
removeProcessingShimmer(thumb);
animateScrapedThumb(thumb); // ✨ animation
thumb.style.filter = "opacity(30%)";
updateCounter();
} else {
console.warn("[HD-Scraper] No HD URL found for:", thumb.href);
removeProcessingShimmer(thumb);
counter.textContent = "❌";
setTimeout(updateCounter, 1000);
}
} catch (err) {
removeProcessingShimmer(thumb);
console.error("[HD-Scraper] Error fetching:", err);
counter.textContent = "❗";
setTimeout(updateCounter, 1000);
}
});
});
}
// Initial call and check
if (scraping) {
setStatus("⏸ Pause", true);
} else {
setStatus("▶ Start", false);
}
interceptThumbnails();
})();

// Function to automatically click the button once it becomes available
function autoClickButton() {
const observer = new MutationObserver((mutations) => {
const button = document.querySelector('button[onclick="acceptGDPR();"]');
if (button) {
button.click();
observer.disconnect(); // Stop observing once the button is clicked
}
});

// Start observing the document body for child node additions
observer.observe(document.body,
{
childList: true,
subtree: true,
});
}

// Call the function
autoClickButton();



})();
