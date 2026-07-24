/* ---------------- state ---------------- */
let state = { articles: [], people: [] };
let currentId = null;
let backendBridge = false;     // localhost backend bridge, scoped to articles/
let dirHandle = null;          // FileSystemDirectoryHandle fallback bridge
let imagesDirHandle = null;
let railOpen = true;   // live publish rail visible (the always-on "what you'll paste" view)
let inspTab = "tips";
let agentTarget = "codex";
let agentTask = "polish";
let editingSkillId = null;
let backendStatus = { checked: false, ok: false, codex: false, claude: false, grok: false, error: "" };
let aiAssistBusy = false;
let aiAssistResult = null;
let filterPlatform = "all";
let searchText = "";
let saveTimer = null;

const LS_KEY = "articleStudio.v1";
const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];
// article <-> Markdown serialization is shared with the backend (shared/frontmatter.js)
const { uid, nowISO, slugify, escYaml, unesc, toFrontmatter, parseFrontmatter } = window.Frontmatter;
function current() { return state.articles.find(a => a.id === currentId); }

/* ---------------- persistence (localStorage) ---------------- */
let lsWarned = false;
function saveLocal() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
    lsWarned = false;
  } catch (e) {
    // quota exceeded etc. — never fail silently, that's how work gets lost
    if (!lsWarned) {
      lsWarned = true;
      toast("⚠ Local storage is full — recent changes may not persist. Connect a folder or export a backup.", "bad");
    }
  }
}
function loadLocal() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) state = JSON.parse(raw);
  } catch (e) {}
  if (!state.articles) state.articles = [];
  if (!state.people) state.people = [];
  if (!state.tagsets) state.tagsets = [];
  if (!state.customSkills) state.customSkills = [];
  if (!state.selectedWritingSkill) state.selectedWritingSkill = "official:none";
  if (typeof state.voice !== "string") state.voice = "";
}

/* ---------------- IndexedDB (image blobs, browser-only fallback) ---------------- */
/* Text stays in localStorage (tiny). Images are blobs — base64 in localStorage
   blows the ~5MB quota fast, so blobs live here instead (no inflation, big quota). */
const IDB_NAME = "articleStudio", IDB_STORE = "images";
let _idb = null;
function idb() {
  if (_idb) return _idb;
  _idb = new Promise((res, rej) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
  return _idb;
}
async function idbPut(key, blob) {
  const db = await idb();
  return new Promise((res, rej) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(blob, key);
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
}
async function idbGet(key) {
  const db = await idb();
  return new Promise((res, rej) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const r = tx.objectStore(IDB_STORE).get(key);
    r.onsuccess = () => res(r.result || null); r.onerror = () => rej(r.error);
  });
}
async function idbDel(key) {
  const db = await idb();
  return new Promise((res) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).delete(key);
    tx.oncomplete = res; tx.onerror = res;
  });
}

/* ---------------- image compression (canvas) ---------------- */
/* Shrinks oversized photos before storing — keeps localStorage/IDB, the folder,
   and the git repo lean. Vector/animated formats pass through untouched. */
async function compressImage(file, maxDim = 1920, quality = 0.82) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;   // leave gif/svg alone
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 400 * 1024) { bmp.close && bmp.close(); return file; } // already small
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    canvas.getContext("2d").drawImage(bmp, 0, 0, w, h);
    bmp.close && bmp.close();
    const outType = file.type === "image/png" ? "image/png" : "image/jpeg";
    const blob = await new Promise(r => canvas.toBlob(r, outType, quality));
    if (blob && blob.size < file.size) {                            // only if it actually helped
      blob.name = file.name.replace(/\.(png|webp)$/i, outType === "image/jpeg" ? ".jpg" : ".png");
      return blob;
    }
    return file;
  } catch (e) { return file; }
}

/* ---------------- object-URL cache (fixes the leak) ---------------- */
const urlCache = new Map();   // key -> objectURL
function cacheKey(im) { return im.path || im.idbKey || null; }
function revokeImageUrl(im) {
  const k = cacheKey(im);
  if (k && urlCache.has(k)) { URL.revokeObjectURL(urlCache.get(k)); urlCache.delete(k); }
}

/* markdown <-> file serialization lives in shared/frontmatter.js (see destructure above).
   parseArticle() wraps the shared parser to normalize unknown platforms for the UI. */
function parseArticle(text, fallbackId) {
  const a = parseFrontmatter(text, fallbackId);
  if (!PLATFORMS[a.platform]) a.platform = "blog";
  return a;
}

