/* ---------------- folder bridge (File System Access API) ---------------- */
const fsSupported = "showDirectoryPicker" in window;

async function connectFolder() {
  if (!backendStatus.checked || backendStatus.ok) {
    await connectBackendBridge(true);
    if (!backendBridge && !fsSupported) return;
    if (backendBridge) return;
  }
  if (!fsSupported) {
    toast("Backend is not running, and this browser can't open folders directly. Start serve.command or use Chrome/Edge.", "bad");
    return;
  }
  try {
    dirHandle = await window.showDirectoryPicker({ id: "articleStudio", mode: "readwrite" });
    imagesDirHandle = await dirHandle.getDirectoryHandle("images", { create: true });
    backendBridge = false;
    setFolderState(dirHandle.name);
    await importFromFolder();
    toast("Connected to articles/. Agents can read & edit the same files.", "good");
  } catch (e) {
    if (e.name !== "AbortError") toast("Couldn't connect folder: " + e.message, "bad");
  }
}

function setFolderState(name) {
  const el = $("#folderState");
  if (name) {
    el.classList.add("on");
    $("#folderLabel").textContent = name + "/";
    el.title = "Connected. Click to reload from disk (pulls in agent edits).";
  }
  else {
    el.classList.remove("on");
    $("#folderLabel").textContent = fsSupported ? "Connect articles folder" : "Connect (Chrome/Edge)";
    el.title = "Click to connect so agents can read & edit the same Markdown files.";
  }
}

function bridgeConnected() { return backendBridge || !!dirHandle; }
function bridgeName() { return backendBridge ? "backend: articles" : (dirHandle ? dirHandle.name : ""); }

async function apiJson(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function connectBackendBridge(showToast = true) {
  try {
    const data = await apiJson("/api/articles", { cache: "no-store" });
    backendBridge = true;
    dirHandle = null;
    imagesDirHandle = null;
    setFolderState("backend: articles");
    await importFromBackendData(data, { force: false, silent: !showToast });
    if (showToast) toast("Backend connected to articles/. Agents share the same files.", "good");
  } catch (e) {
    backendBridge = false;
    if (showToast) toast("Backend folder bridge unavailable: " + e.message, "bad");
  }
}

/* people directory mirrored to articles/people.json so agents can read who you tag */
async function writePeopleFile() {
  if (backendBridge) {
    try { await apiJson("/api/meta/people.json", { method: "PUT", body: JSON.stringify({ value: state.people || [] }) }); }
    catch (e) { toast("Save people failed: " + e.message, "bad"); }
    return;
  }
  if (!dirHandle) return;
  try {
    const fh = await dirHandle.getFileHandle("people.json", { create: true });
    const w = await fh.createWritable();
    await w.write(JSON.stringify(state.people || [], null, 2));
    await w.close();
  } catch (e) { /* non-fatal */ }
}
async function loadPeopleFile() {
  if (backendBridge) return importFromBackend({ silent: true });
  if (!dirHandle) return;
  try {
    const fh = await dirHandle.getFileHandle("people.json");
    const arr = JSON.parse(await (await fh.getFile()).text());
    if (Array.isArray(arr)) state.people = arr;
  } catch (e) { /* no file yet */ }
}
function savePeople() { saveLocal(); writePeopleFile(); }

/* hashtag sets mirrored to articles/tagsets.json so agents can reuse your tag bundles */
async function writeTagsetsFile() {
  if (backendBridge) {
    try { await apiJson("/api/meta/tagsets.json", { method: "PUT", body: JSON.stringify({ value: state.tagsets || [] }) }); }
    catch (e) { toast("Save tag sets failed: " + e.message, "bad"); }
    return;
  }
  if (!dirHandle) return;
  try {
    const fh = await dirHandle.getFileHandle("tagsets.json", { create: true });
    const w = await fh.createWritable();
    await w.write(JSON.stringify(state.tagsets || [], null, 2));
    await w.close();
  } catch (e) { /* non-fatal */ }
}
async function loadTagsetsFile() {
  if (backendBridge) return importFromBackend({ silent: true });
  if (!dirHandle) return;
  try {
    const fh = await dirHandle.getFileHandle("tagsets.json");
    const arr = JSON.parse(await (await fh.getFile()).text());
    if (Array.isArray(arr)) state.tagsets = arr;
  } catch (e) { /* no file yet */ }
}
function saveTagsets() { saveLocal(); writeTagsetsFile(); }

/* custom writing skills mirrored to articles/writing-skills.json */
async function writeSkillsFile() {
  if (backendBridge) {
    try { await apiJson("/api/meta/writing-skills.json", { method: "PUT", body: JSON.stringify({ value: state.customSkills || [] }) }); }
    catch (e) { toast("Save writing skills failed: " + e.message, "bad"); }
    return;
  }
  if (!dirHandle) return;
  try {
    const fh = await dirHandle.getFileHandle("writing-skills.json", { create: true });
    const w = await fh.createWritable();
    await w.write(JSON.stringify(state.customSkills || [], null, 2));
    await w.close();
  } catch (e) { /* non-fatal */ }
}
async function loadSkillsFile() {
  if (backendBridge) return importFromBackend({ silent: true });
  if (!dirHandle) return;
  try {
    const fh = await dirHandle.getFileHandle("writing-skills.json");
    const arr = JSON.parse(await (await fh.getFile()).text());
    if (Array.isArray(arr)) state.customSkills = arr.filter(s => s && s.id && s.name);
  } catch (e) { /* no file yet */ }
}
function saveSkills() { saveLocal(); writeSkillsFile(); }

/* voice guide — mirrored to articles/voice.md so the agents always read your style */
async function writeVoiceFile() {
  if (backendBridge) {
    try { await apiJson("/api/meta/voice.md", { method: "PUT", body: JSON.stringify({ text: state.voice || "" }) }); }
    catch (e) { toast("Save voice guide failed: " + e.message, "bad"); }
    return;
  }
  if (!dirHandle) return;
  try {
    const fh = await dirHandle.getFileHandle("voice.md", { create: true });
    const w = await fh.createWritable();
    await w.write(state.voice || "");
    await w.close();
  } catch (e) { /* non-fatal */ }
}
async function loadVoiceFile() {
  if (backendBridge) return importFromBackend({ silent: true });
  if (!dirHandle) return;
  try {
    const fh = await dirHandle.getFileHandle("voice.md");
    state.voice = await (await fh.getFile()).text();
  } catch (e) { /* no file yet */ }
}
function saveVoice() { saveLocal(); writeVoiceFile(); }

async function importFromFolder(opts = {}) {
  if (!dirHandle) return;
  await loadPeopleFile();
  await loadTagsetsFile();
  await loadSkillsFile();
  await loadVoiceFile();
  // collect handles, then read all files in parallel (fast even with hundreds of files)
  const handles = [];
  for await (const [name, handle] of dirHandle.entries()) {
    const lower = name.toLowerCase();
    if (handle.kind === "file" && name.endsWith(".md") && lower !== "readme.md" && lower !== "voice.md") handles.push([name, handle]);
  }
  const found = (await Promise.all(handles.map(async ([name, handle]) => {
    try {
      const file = await handle.getFile();
      const a = parseArticle(await file.text(), uid());
      a._file = name;
      a._mtime = file.lastModified;
      return a;
    } catch (e) { return null; }
  }))).filter(Boolean);

  mergeImportedArticles(found, opts, "folder");
}

async function importFromBackend(opts = {}) {
  const data = await apiJson("/api/articles", { cache: "no-store" });
  await importFromBackendData(data, opts);
}

async function importFromBackendData(data, opts = {}) {
  if (Array.isArray(data.people)) state.people = data.people;
  if (Array.isArray(data.tagsets)) state.tagsets = data.tagsets;
  if (Array.isArray(data.customSkills)) state.customSkills = data.customSkills.filter(s => s && s.id && s.name);
  if (typeof data.voice === "string") state.voice = data.voice;
  const found = (data.articles || []).map(item => {
    const a = parseArticle(item.text || "", uid());
    a._file = item.file;
    a._mtime = item.mtime;
    return a;
  });
  mergeImportedArticles(found, opts, "backend");
}

function mergeImportedArticles(found, opts = {}, sourceLabel = "folder") {
  // merge: folder is source of truth, EXCEPT don't silently wipe unsaved in-app edits
  const byId = new Map(state.articles.map(a => [a.id, a]));
  let skipped = 0, loaded = 0;
  for (const fa of found) {
    const local = byId.get(fa.id);
    if (local) {
      if (local._dirty && !opts.force) { skipped++; continue; }   // protect your unsaved work
      Object.assign(local, fa);
      local._dirty = false; local._conflict = false;
      loaded++;
    } else {
      state.articles.push(fa);
      loaded++;
    }
  }
  saveLocal();
  renderAll();
  if (currentId) openEditor();
  if (loaded && !opts.silent) toast(`Loaded ${loaded} article${loaded!==1?"s":""} from ${sourceLabel}.`, "good");
  if (skipped) toast(`Kept unsaved edits on ${skipped} article${skipped!==1?"s":""} (Force-reload to override).`, "bad");
}

async function writeArticleFile(a, { force = false } = {}) {
  const fname = a._file || (slugify(a.title) + ".md");
  a._file = fname;
  if (backendBridge) {
    try {
      const data = await apiJson(`/api/articles/${encodeURIComponent(fname)}`, {
        method: "PUT",
        body: JSON.stringify({ text: toFrontmatter(a), mtime: a._mtime || 0, force })
      });
      a._file = data.file || fname;
      a._mtime = data.mtime;
      a._conflict = false;
      return true;
    } catch (e) {
      if (e.status === 409 && e.data && e.data.conflict) {
        a._conflict = true;
        a._mtime = e.data.mtime || a._mtime;
        renderConflict();
        return "conflict";
      }
      toast("Save to backend failed: " + e.message, "bad");
      return false;
    }
  }
  if (!dirHandle) return false;
  try {
    const fh = await dirHandle.getFileHandle(fname, { create: true });
    // Conflict guard: did something outside the app edit this file since we last synced?
    if (!force && a._mtime) {
      try {
        const onDisk = await fh.getFile();
        if (onDisk.lastModified > a._mtime + 500) {
          a._conflict = true;
          renderConflict();
          return "conflict";   // keep our edits in memory + localStorage, don't clobber
        }
      } catch (e) {}
    }
    const w = await fh.createWritable();
    await w.write(toFrontmatter(a));
    await w.close();
    const written = await fh.getFile();
    a._mtime = written.lastModified;   // baseline for the next conflict check
    a._conflict = false;
    return true;
  } catch (e) { toast("Save to folder failed: " + e.message, "bad"); return false; }
}

async function deleteArticleFile(a) {
  if (backendBridge && a._file) {
    try { await apiJson(`/api/articles/${encodeURIComponent(a._file)}`, { method: "DELETE" }); } catch (e) {}
    return;
  }
  if (!dirHandle || !a._file) return;
  try { await dirHandle.removeEntry(a._file); } catch (e) {}
}

async function writeImageFile(slug, blob, name) {
  if (backendBridge) {
    try {
      const res = await fetch(`/api/images?slug=${encodeURIComponent(slug)}&name=${encodeURIComponent(name || "image")}`, {
        method: "POST",
        headers: { "Content-Type": blob.type || "application/octet-stream" },
        body: blob
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Image upload failed");
      return data.path;
    } catch (e) { toast("Image save failed: " + e.message, "bad"); return null; }
  }
  if (!imagesDirHandle) return null;
  const safe = slug + "-" + Date.now().toString(36) + "-" + (name || "image").replace(/[^\w.\-]/g, "_");
  try {
    const fh = await imagesDirHandle.getFileHandle(safe, { create: true });
    const w = await fh.createWritable();
    await w.write(blob);
    await w.close();
    return "images/" + safe;
  } catch (e) { toast("Image save failed: " + e.message, "bad"); return null; }
}

async function resolveImageSrc(im) {
  if (im.dataUrl) return im.dataUrl;                 // legacy inline images
  const key = cacheKey(im);
  if (key && urlCache.has(key)) return urlCache.get(key);   // reuse — no leak
  let blob = null;
  if (im.path && backendBridge) {
    return "articles/" + im.path;
  } else if (im.path && imagesDirHandle) {
    try {
      const fh = await imagesDirHandle.getFileHandle(im.path.split("/").pop());
      blob = await fh.getFile();
    } catch (e) { return null; }
  } else if (im.idbKey) {
    blob = await idbGet(im.idbKey);
  }
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  if (key) urlCache.set(key, url);
  return url;
}

