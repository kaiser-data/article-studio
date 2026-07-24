/* ---------------- CRUD ---------------- */
function newArticle(tpl) {
  const platform = (tpl && tpl.platform) || (filterPlatform !== "all" ? filterPlatform : "linkedin");
  const a = {
    id: uid(), title: (tpl && tpl.title) || "", platform,
    status: "idea", tags: (tpl && tpl.tags) ? tpl.tags.slice() : [], summary: "", publishDate: "", group: "",
    images: [], body: (tpl && tpl.body) || "",
    created: nowISO(), updated: nowISO()
  };
  state.articles.unshift(a);
  currentId = a.id;
  saveLocal();
  renderAll();
  openEditor();
  $("#edTitle").focus();
  scheduleSave();
}

/* ---------------- templates ---------------- */
const TEMPLATES = [
  { id: "blank", label: "Blank", platform: null, desc: "Empty draft", body: "" },
  {
    id: "li-story", label: "LinkedIn · Hook–Story–CTA", platform: "linkedin",
    desc: "Personal story that lands a lesson", tags: ["toastmasters"],
    body: "[One-line hook: a result, a tension, or a bold claim — this shows before 'see more']\n\n[Set the scene in 2–3 short lines. What happened?]\n\n[The turn — what changed / what you learned.]\n\nHere's what stuck with me:\n▸ [Lesson one]\n▸ [Lesson two]\n▸ [Lesson three]\n\n[One-line takeaway.]\n\n[Question to the reader to spark comments?]\n\n#Toastmasters #PublicSpeaking #IT"
  },
  {
    id: "li-howto", label: "LinkedIn · IT how-to", platform: "linkedin",
    desc: "Practical tip your peers can use", tags: ["it"],
    body: "[Problem in one line — the pain your reader feels.]\n\nMost people [common mistake]. Here's the approach that works:\n\n▸ [Step / principle 1]\n▸ [Step / principle 2]\n▸ [Step / principle 3]\n\n[Why it matters / the payoff.]\n\n[What would you add?]\n\n#IT #DevOps #Engineering"
  },
  {
    id: "medium", label: "Medium · Long-form", platform: "medium",
    desc: "~7-min structured article", tags: [],
    body: "# [Title: clear + benefit-driven]\n\n> [Kicker / subtitle — one sentence that earns the read.]\n\n[Open with a concrete scene or claim. Not 'In this article I will…'.]\n\n## [The problem]\n\n[Set up the tension.]\n\n## [What I did / the idea]\n\n[Body. Subhead every 200–300 words.]\n\n## Takeaways\n\n- [Point 1]\n- [Point 2]\n- [Point 3]\n\n[Soft CTA: follow / subscribe.]"
  },
  {
    id: "luma", label: "Luma · Event page", platform: "luma",
    desc: "Event description + agenda", tags: [],
    body: "[Event title = what + value, e.g. 'Hands-on Kubernetes Night — ship your first deploy']\n\n[One line: who it's for and what they'll leave with.]\n\n## What you'll get\n\n- [Benefit 1]\n- [Benefit 2]\n- [Benefit 3]\n\n## Agenda\n\n- 18:00 — [Arrive & network]\n- 19:00 — [Main session]\n- 20:00 — [Wrap-up]\n\n## Hosts\n\n- [Name — one-line credibility]\n\n📍 [Location]  ·  📅 [Date]  ·  🕕 [Time]\n[RSVP call to action]"
  },
  {
    id: "tm", label: "Toastmasters · Newsletter", platform: "toastmasters",
    desc: "Encouraging member piece", tags: ["toastmasters"],
    body: "[Open with a club moment or personal story.]\n\n[The body — what happened, what it taught you. Warm, member-to-member.]\n\n3 things to try at the next meeting:\n1. [Takeaway 1]\n2. [Takeaway 2]\n3. [Takeaway 3]\n\n[Tie back to Pathways / a role / an upcoming contest.]\n\n[Invitation: come to a meeting, take a role, bring a guest.]"
  }
];
function openTemplateModal() { $("#tplModal").classList.add("show"); renderTemplates(); }
function closeTemplateModal() { $("#tplModal").classList.remove("show"); }
function renderTemplates() {
  $("#tplGrid").innerHTML = TEMPLATES.map(t => {
    const p = t.platform ? (PLATFORMS[t.platform] || PLATFORMS.blog) : null;
    return `<button class="tpl-card" data-tpl="${t.id}">
      <div class="tpl-label">${esc(t.label)}</div>
      <div class="tpl-desc">${esc(t.desc)}</div>
      ${p ? `<span class="pill" style="border-color:${p.color};color:${p.color}">${p.label}</span>` : `<span class="pill" style="border-color:var(--line-2);color:var(--text-dim2)">Empty</span>`}
    </button>`;
  }).join("");
  $$("#tplGrid .tpl-card").forEach(c => c.onclick = () => {
    const t = TEMPLATES.find(x => x.id === c.dataset.tpl);
    closeTemplateModal();
    newArticle(t && t.id === "blank" ? null : t);
  });
}

/* ---------------- repurpose (linked cross-platform variants) ---------------- */
function articleGroup(a) { return a && a.group ? state.articles.filter(x => x.group === a.group) : (a ? [a] : []); }
function openRepurpose() {
  const a = current();
  if (!a) return toast("Open an article first.", "bad");
  $("#repurposeGrid").innerHTML = Object.entries(PLATFORMS).map(([k, p]) =>
    `<button class="tpl-card" data-rp="${k}" ${k === a.platform ? 'style="opacity:.55"' : ""}>
      <div class="tpl-label">${p.label}</div>
      <span class="pill" style="border-color:${p.color};color:${p.color}">${k === a.platform ? "current" : "make variant"}</span>
    </button>`).join("");
  $$("#repurposeGrid .tpl-card").forEach(c => c.onclick = () => { closeRepurpose(); repurposeTo(c.dataset.rp); });
  $("#repurposeModal").classList.add("show");
}
function closeRepurpose() { $("#repurposeModal").classList.remove("show"); }
async function repurposeTo(platform) {
  const src = current(); if (!src) return;
  if (!src.group) src.group = "g" + uid();           // start (or reuse) the variant set
  const copy = {
    id: uid(), title: src.title, platform, status: "drafting",
    tags: (src.tags || []).slice(), summary: src.summary || "", publishDate: "",
    group: src.group, images: [], body: src.body || "",
    created: nowISO(), updated: nowISO()
  };
  state.articles.unshift(copy);
  currentId = copy.id;
  saveLocal();
  if (bridgeConnected()) { await writeArticleFile(src); await writeArticleFile(copy); }  // persist source's new group + the copy
  renderAll();
  openEditor();
  toast(`Created a ${(PLATFORMS[platform] || PLATFORMS.blog).label} variant — adapt it here.`, "good");
}

function deleteCurrent() {
  const a = current();
  if (!a) return;
  if (!confirm(`Delete "${a.title || "Untitled"}"? This also removes its .md file from the folder.`)) return;
  deleteArticleFile(a);
  state.articles = state.articles.filter(x => x.id !== a.id);
  currentId = null;
  saveLocal();
  renderAll();
  closeEditor();
  toast("Deleted.");
}

function markSaved(saved) {
  const el = $("#saveState");
  if (saved) {
    if (bridgeConnected()) {
      el.textContent = "saved";
      el.title = backendBridge ? "Saved to backend (articles/)" : "Saved to folder";
    } else {
      el.textContent = "saved (local only)";
      el.title = "Saved in this browser. Connect a folder to share with agents.";
    }
    el.classList.add("saved");
  } else {
    el.textContent = "editing…";
    el.classList.remove("saved");
    el.title = "";
  }
}

function scheduleSave() {
  const a = current();
  if (a) a._dirty = true;
  markSaved(false);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(commitSave, 900);
}

async function commitSave(opts = {}) {
  const a = current();
  if (!a) return;
  a.updated = nowISO();
  saveLocal();              // text is always safe locally first
  if (bridgeConnected()) {
    const r = await writeArticleFile(a, opts);
    if (r === "conflict") { markSaved(true); return; }   // banner shown; edits kept locally
    if (r === true) a._dirty = false;
  } else {
    a._dirty = false;
  }
  markSaved(true);
  renderLanes();
}

/* ---------------- conflict banner ---------------- */
function renderConflict() {
  const a = current();
  const bar = $("#conflictBar");
  if (!bar) return;
  if (a && a._conflict) {
    bar.style.display = "flex";
  } else {
    bar.style.display = "none";
  }
}
async function resolveConflict(mode) {
  const a = current(); if (!a) return;
  if (mode === "mine") {
    await writeArticleFile(a, { force: true });
    a._dirty = false;
    toast(`Saved your version to the ${backendBridge ? "backend" : "folder"}.`, "good");
  } else {  // theirs
    try {
      let fresh, mtime;
      if (backendBridge) {
        const data = await apiJson(`/api/articles/${encodeURIComponent(a._file)}`, { cache: "no-store" });
        fresh = parseArticle(data.text, a.id);
        mtime = data.mtime;
      } else {
        const fh = await dirHandle.getFileHandle(a._file);
        const file = await fh.getFile();
        fresh = parseArticle(await file.text(), a.id);
        mtime = file.lastModified;
      }
      Object.assign(a, fresh, { _file: a._file, _mtime: mtime, _conflict: false, _dirty: false });
      toast("Loaded the file's version.", "good");
    } catch (e) { toast("Couldn't read file: " + e.message, "bad"); }
  }
  a._conflict = false;
  renderConflict();
  openEditor();
}

