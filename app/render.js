/* ---------------- rendering ---------------- */
function renderAll() { renderPlatformFilters(); renderLanes(); renderInspector(); }

function renderPlatformFilters() {
  const wrap = $("#platformFilters");
  const items = [["all", "All"]].concat(Object.entries(PLATFORMS).map(([k, v]) => [k, v.label]));
  wrap.innerHTML = items.map(([k, lbl]) =>
    `<button class="chip ${filterPlatform===k?"active":""}" data-pf="${k}">${lbl}</button>`).join("");
  $$("#platformFilters .chip").forEach(c => c.onclick = () => { filterPlatform = c.dataset.pf; renderAll(); });
}

function visibleArticles() {
  return state.articles.filter(a => {
    if (filterPlatform !== "all" && a.platform !== filterPlatform) return false;
    if (searchText) {
      const hay = (a.title + " " + a.body + " " + (a.tags||[]).join(" ")).toLowerCase();
      if (!hay.includes(searchText)) return false;
    }
    return true;
  });
}

function renderLanes() {
  const lanes = $("#lanes");
  const arts = visibleArticles();
  let html = "";
  for (const st of STATUSES) {
    const inLane = arts.filter(a => a.status === st.key);
    html += `<div class="lane-head"><span class="swatch" style="background:${st.color}"></span>${st.label}<span class="count">${inLane.length}</span></div>`;
    for (const a of inLane) {
      const p = PLATFORMS[a.platform] || PLATFORMS.blog;
      const sch = scheduleChip(a);
      html += `<div class="card ${a.id===currentId?"sel":""}" data-id="${a.id}">
        <div class="c-title">${esc(a.title) || '<span style="color:var(--text-dim2)">Untitled</span>'}</div>
        <div class="c-meta">
          <span class="pill" style="border-color:${p.color};color:${p.color}">${p.label}</span>
          <span>${wordCount(a.body)} words</span>
          ${a._file ? '<span title="synced to folder">💾</span>' : ''}
          ${sch ? `<span class="sch-chip ${sch.cls}">${sch.label}</span>` : ''}
        </div>
      </div>`;
    }
  }
  if (!arts.length) {
    html += `<div class="empty-hint">No articles yet.<br/>Hit <b>+ New article</b> to start your pipeline.</div>`;
  }
  lanes.innerHTML = html;
  $$("#lanes .card").forEach(c => c.onclick = () => { currentId = c.dataset.id; renderLanes(); openEditor(); });
}

/* ---------------- editor ---------------- */
function openEditor() {
  const a = current();
  if (!a) return closeEditor();
  $("#placeholder").style.display = "none";
  $("#edPane").style.display = "flex";
  $("#edTitle").value = a.title;
  $("#mdInput").value = a.body;
  buildPlatformSelect();
  $("#edPlatform").value = a.platform;
  $("#edStatus").value = a.status;
  markSaved(true);
  updateCounter();
  renderInspector();
  renderConflict();
  applyRail();

  // Optimize: only enable agent button when backend is available
  const askBtn = $("#askAgentBtn");
  if (askBtn) {
    const enabled = backendStatus.ok;
    askBtn.disabled = !enabled;
    askBtn.title = enabled
      ? "Polish or rewrite with Codex / Claude / Grok"
      : "Start the local backend (serve.command) to use agents";
  }
}
function closeEditor() {
  $("#placeholder").style.display = "flex";
  $("#edPane").style.display = "none";
}
function buildPlatformSelect() {
  $("#edPlatform").innerHTML = Object.entries(PLATFORMS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join("");
}

function applyRail() {
  const main = $("#edMain");
  if (main) main.classList.toggle("rail-off", !railOpen);
  const t = $("#focusToggle");
  if (t) t.classList.toggle("active", railOpen);
  if (railOpen) renderRail();
}

function updateCounter() {
  const a = current(); if (!a) return;
  const body = $("#mdInput").value;
  const chars = body.length, words = wordCount(body);
  const p = PLATFORMS[a.platform];
  const c = $("#counter");
  let extra = "";
  let cls = "counter";
  if (a.platform === "linkedin") {
    const hook = body.replace(/^#.*$/m, "").trim().slice(0, 210);
    const limit = 3000;
    if (chars > limit) cls += " over"; else if (chars > 2200) cls += " warn";
    extra = ` · <b>${chars}</b>/3000 chars · hook uses <b>${Math.min(chars,210)}</b>/210`;
  } else if (a.platform === "medium" || a.platform === "blog") {
    const mins = Math.max(1, Math.round(words / 220));
    extra = ` · <b>${mins}</b> min read`;
  } else if (a.platform === "toastmasters") {
    if (words > 850) cls += " warn";
    extra = ` · target 500–800`;
  }
  c.className = cls;
  c.innerHTML = `<b>${words}</b> words${extra}`;
}

/* ---------------- inspector ---------------- */
function renderInspector() {
  $$("#inspTabs button").forEach(b => b.classList.toggle("active", b.dataset.tab === inspTab));
  const body = $("#inspBody");
  const a = current();
  if (inspTab === "tips") body.innerHTML = renderTips(a);
  else if (inspTab === "images") renderImages(body, a);
  else if (inspTab === "meta") body.innerHTML = renderMeta(a);
  else if (inspTab === "people") body.innerHTML = renderPeople(a);
  else body.innerHTML = renderAgents(a);
  if (inspTab === "tips") wireChecklist();
  if (inspTab === "meta") wireMeta();
  if (inspTab === "images") wireImages();
  if (inspTab === "people") wirePeople();
  if (inspTab === "agents") wireAgents();
}

/* ---------------- pre-publish checklist ---------------- */
function firstLine(body) { return ((body || "").split("\n").find(l => l.trim()) || "").trim(); }
const CHECKLISTS = {
  linkedin: [
    { id: "hook", label: "Hook fits before ‘see more’ (first line ≤ 210 chars)", auto: a => { const l = firstLine(a.body).length; return l > 0 && l <= 210; } },
    { id: "hashtags", label: "3–5 hashtags", auto: a => { const n = ((a.body || "").match(/#[\p{L}\w]+/gu) || []).length; return n >= 3 && n <= 5; } },
    { id: "len", label: "Under 3000 characters", auto: a => (a.body || "").length > 0 && (a.body || "").length <= 3000 },
    { id: "links", label: "Links moved to the first comment (none in body)", auto: a => !/\bhttps?:\/\//.test(a.body || "") },
    { id: "mention", label: "Tagged relevant people / added @mentions" },
    { id: "cta", label: "Ends with a clear question or CTA" }
  ],
  medium: [
    { id: "subheads", label: "Has subheadings (## …)", auto: a => /^##\s/m.test(a.body || "") },
    { id: "len", label: "Substantial (≥ 800 words)", auto: a => wordCount(a.body) >= 800 },
    { id: "cover", label: "Cover image added", auto: a => (a.images || []).length >= 1 },
    { id: "tags", label: "1–5 tags set", auto: a => (a.tags || []).length >= 1 && (a.tags || []).length <= 5 },
    { id: "quote", label: "Pull quote or takeaways added" }
  ],
  toastmasters: [
    { id: "len", label: "500–800 words", auto: a => { const w = wordCount(a.body); return w >= 500 && w <= 800; } },
    { id: "cta", label: "Ends with an invitation / call to action" },
    { id: "pathways", label: "Ties back to Pathways / roles" }
  ],
  luma: [
    { id: "date", label: "Event / publish date set", auto: a => !!a.publishDate },
    { id: "cover", label: "Cover image (16:9) added", auto: a => (a.images || []).length >= 1 },
    { id: "agenda", label: "Agenda / timeline included" },
    { id: "logistics", label: "Date, time, location & RSVP clear" }
  ],
  blog: [
    { id: "heads", label: "Clear heading structure (## …)", auto: a => /^##\s/m.test(a.body || "") },
    { id: "meta", label: "Meta description set (Summary)", auto: a => !!(a.summary || "").trim() },
    { id: "links", label: "Links checked" }
  ]
};
const CHECK_UNIVERSAL = [
  { id: "alt", label: "All images have alt text", fix: "alttext", auto: a => { const imgs = [...(a.body || "").matchAll(/!\[([^\]]*)\]\([^)]+\)/g)]; return imgs.length === 0 || imgs.every(m => m[1].trim().length > 0); } }
];
function checklistItems(a) { return (CHECKLISTS[a.platform] || CHECKLISTS.blog).concat(CHECK_UNIVERSAL); }
function renderChecklist(a) {
  const items = checklistItems(a);
  a.checklist = a.checklist || {};
  let done = 0;
  const rows = items.map(it => {
    let checked, locked = false, tag = "";
    if (it.auto) { checked = !!it.auto(a); locked = true; tag = `<em class="chk-auto ${checked ? "ok" : "no"}">${checked ? "auto ✓" : "needs work"}</em>`; }
    else checked = !!a.checklist[it.id];
    if (checked) done++;
    // Failing auto-items with a matching agent task get a one-click jump to it.
    const fix = it.fix && locked && !checked ? `<button class="chk-fix" data-chk-fix="${it.fix}">✨ agent</button>` : "";
    return `<label class="chk ${checked ? "on" : ""}">
      <input type="checkbox" ${checked ? "checked" : ""} ${locked ? "disabled" : ""} data-chk="${it.id}"/>
      <span>${it.label} ${tag} ${fix}</span>
    </label>`;
  }).join("");
  const pct = Math.round(done / items.length * 100);
  const ready = done === items.length;
  return `<div class="chk-panel">
    <div class="chk-head">
      <span>Pre-publish checklist</span>
      <span class="chk-count ${ready ? "ready" : ""}">${done}/${items.length}</span>
    </div>
    <div class="chk-bar"><div class="chk-fill ${ready ? "ready" : ""}" style="width:${pct}%"></div></div>
    <div class="chk-list">${rows}</div>
  </div>`;
}
function wireChecklist() {
  const a = current(); if (!a) return;
  $$("#inspBody [data-chk]:not([disabled])").forEach(cb => cb.onchange = () => {
    a.checklist = a.checklist || {};
    a.checklist[cb.dataset.chk] = cb.checked;
    scheduleSave();
    renderInspector();
  });
  $$("#inspBody [data-chk-fix]").forEach(btn => btn.onclick = e => {
    e.preventDefault();                       // don't toggle the surrounding label's checkbox
    agentTask = btn.dataset.chkFix;
    aiAssistResult = null;
    inspTab = "agents";
    renderInspector();
  });
}

function renderTips(a) {
  const pk = a ? a.platform : "linkedin";
  const p = PLATFORMS[pk];
  let html = "";
  if (a) html += renderChecklist(a);
  html += `<div class="tip-platform"><span class="swatch" style="width:9px;height:9px;border-radius:3px;background:${p.color}"></span>${p.label} guidance</div>`;
  html += `<dl class="spec-grid">`;
  for (const [k, v] of Object.entries(p.specs)) html += `<dt>${k}</dt><dd>${v}</dd>`;
  html += `</dl>`;
  for (const [section, list] of Object.entries(p.tips)) {
    html += `<div class="tip-block"><h4>${section}</h4><ul class="tip-list">`;
    for (const li of list) html += `<li>${li}</li>`;
    html += `</ul></div>`;
  }
  if (!a) html += `<div class="empty-hint">Open an article to tailor tips to its platform.</div>`;
  return html;
}

function renderMeta(a) {
  if (!a) return `<div class="empty-hint">No article open.</div>`;
  return `
    <div class="meta-field">
      <label>Summary / meta description</label>
      <textarea id="metaSummary" rows="3" placeholder="One-line teaser used for SEO, Luma blurb, LinkedIn hook…">${esc(a.summary||"")}</textarea>
    </div>
    <div class="meta-field">
      <label>Publish date <span style="text-transform:none;color:var(--text-dim2)">(when to post)</span></label>
      <div style="display:flex;gap:6px">
        <input id="metaPublishDate" type="date" value="${esc(a.publishDate||"")}" style="flex:1" />
        <button class="btn ghost sm" id="metaDateToday" title="Set to today">Today</button>
        <button class="btn ghost sm" id="metaDateClear" title="Clear">✕</button>
      </div>
    </div>
    <div class="meta-field">
      <label>Tags <span style="text-transform:none;color:var(--text-dim2)">(comma separated)</span></label>
      <input id="metaTags" value="${esc((a.tags||[]).join(", "))}" placeholder="toastmasters, leadership, devops" />
      <div class="tags-row" style="margin-top:8px">${(a.tags||[]).map(t=>`<span class="tag">${esc(t)}</span>`).join("")}</div>
    </div>
    ${renderTagsets(a)}
    ${renderVariants(a)}
    <div class="meta-field">
      <label>File</label>
      <input value="${esc(a._file || (slugify(a.title)+'.md (on save)'))}" readonly style="color:var(--text-dim)" />
    </div>
    <div class="meta-field">
      <label>Timeline</label>
      <div style="font-size:12px;color:var(--text-dim)">Created ${fmtDate(a.created)}<br/>Updated ${fmtDate(a.updated)}</div>
    </div>`;
}
function renderTagsets(a) {
  const sets = (state.tagsets || []).slice().sort((x, y) => (x.name||"").localeCompare(y.name||""));
  const rows = sets.map(ts => `<div class="tagset-row" data-tsid="${ts.id}">
      <div class="tagset-main">
        <div class="tagset-name">${esc(ts.name) || "Unnamed"}</div>
        <div class="tags-row">${(ts.tags||[]).map(t=>`<span class="tag">${esc(t)}</span>`).join("")}</div>
      </div>
      <div class="tagset-acts">
        <button class="btn sm" data-act="apply" title="Add these tags to the article">＋</button>
        <button class="btn ghost sm" data-act="edit" title="Edit set">✎</button>
        <button class="btn ghost sm danger" data-act="del" title="Delete set">✕</button>
      </div>
    </div>`).join("");
  return `<div class="meta-field">
    <label>Hashtag sets <span style="text-transform:none;color:var(--text-dim2)">(reusable bundles)</span></label>
    ${rows ? `<div class="tagset-list">${rows}</div>` : `<div class="empty-hint" style="padding:6px 0">No sets yet. Tag this article, then save the bundle for reuse.</div>`}
    <button class="btn ghost sm" id="tagsetSave" style="margin-top:6px;width:100%" ${(a.tags||[]).length ? "" : "disabled"}>💾 Save current tags as set</button>
  </div>`;
}
function wireTagsets(a) {
  const save = $("#tagsetSave");
  if (save) save.onclick = () => {
    const name = prompt("Set name (e.g. Toastmasters, DevOps, AI):");
    if (name === null) return;
    if (!name.trim()) return toast("Enter a name.", "bad");
    state.tagsets.push({ id: uid(), name: name.trim(), tags: (a.tags || []).slice() });
    saveTagsets(); renderInspector();
    toast("Hashtag set saved.", "good");
  };
  $$(".tagset-row").forEach(row => {
    const ts = (state.tagsets || []).find(x => x.id === row.dataset.tsid);
    if (!ts) return;
    row.querySelectorAll("[data-act]").forEach(btn => btn.onclick = () => {
      const act = btn.dataset.act;
      if (act === "apply") {
        const before = (a.tags || []).length;
        a.tags = [...new Set([...(a.tags || []), ...(ts.tags || [])])];
        scheduleSave(); renderInspector();
        toast(a.tags.length > before ? `Added ${a.tags.length - before} tag(s) from “${ts.name}”.` : "All tags already on the article.", "good");
      } else if (act === "edit") {
        const name = prompt("Set name:", ts.name); if (name === null) return;
        const tags = prompt("Tags (comma separated):", (ts.tags || []).join(", "));
        ts.name = name.trim() || ts.name;
        if (tags !== null) ts.tags = tags.split(",").map(x => x.trim()).filter(Boolean);
        saveTagsets(); renderInspector();
      } else if (act === "del") {
        if (!confirm(`Delete set “${ts.name}”?`)) return;
        state.tagsets = state.tagsets.filter(x => x.id !== ts.id);
        saveTagsets(); renderInspector();
      }
    });
  });
}
function renderVariants(a) {
  const set = articleGroup(a);
  const hasVariants = set.length >= 2;

  let html = `<div class="meta-field">
    <label>Variants <span style="text-transform:none;color:var(--text-dim2)">(repurpose for other platforms)</span></label>`;

  if (hasVariants) {
    const rows = set.map(v => {
      const p = PLATFORMS[v.platform] || PLATFORMS.blog;
      const me = v.id === a.id;
      return `<div class="variant-row ${me ? "me" : ""}" ${me ? "" : `data-variant-id="${v.id}"`}>
        <span class="pill" style="border-color:${p.color};color:${p.color}">${p.label}</span>
        <span class="variant-title">${esc(v.title) || "Untitled"}</span>
        ${me ? '<span class="variant-here">this one</span>' : ""}
      </div>`;
    }).join("");
    html += `<div class="variant-list">${rows}</div>`;
  }

  html += `<button class="btn ghost sm" id="createVariantBtn" style="margin-top:6px;width:100%">⤳ Create variant for another platform</button>`;
  html += `</div>`;
  return html;
}
function wireMeta() {
  const a = current(); if (!a) return;
  wireTagsets(a);
  const s = $("#metaSummary"), t = $("#metaTags");
  if (s) s.oninput = () => { a.summary = s.value; scheduleSave(); };
  if (t) t.onchange = () => {
    a.tags = t.value.split(",").map(x => x.trim()).filter(Boolean);
    scheduleSave(); renderInspector();
  };
  const pd = $("#metaPublishDate");
  if (pd) pd.onchange = () => { a.publishDate = pd.value; scheduleSave(); renderLanes(); };
  const td = $("#metaDateToday");
  if (td) td.onclick = () => { a.publishDate = todayKey(); scheduleSave(); renderInspector(); renderLanes(); };
  const dc = $("#metaDateClear");
  if (dc) dc.onclick = () => { a.publishDate = ""; scheduleSave(); renderInspector(); renderLanes(); };
  $$("[data-variant-id]").forEach(row => row.onclick = () => { currentId = row.dataset.variantId; renderLanes(); openEditor(); });

  const createVar = $("#createVariantBtn");
  if (createVar) createVar.onclick = () => { openRepurpose(); };
}

/* ---------------- People directory (mentions + photo tags) ---------------- */
let peopleSearch = "";
function visiblePeople() {
  const q = peopleSearch.toLowerCase();
  return (state.people || []).filter(p =>
    !q || (p.name + " " + (p.handle||"") + " " + (p.note||"")).toLowerCase().includes(q)
  ).sort((a, b) => (a.name||"").localeCompare(b.name||""));
}
function renderPeople(a) {
  const people = visiblePeople();
  const platOpts = Object.entries(PLATFORMS).map(([k,v]) => `<option value="${k}">${v.label}</option>`).join("");
  const rows = people.map(p => {
    const pf = PLATFORMS[p.platform] || PLATFORMS.blog;
    return `<div class="person" data-pid="${p.id}">
      <div class="person-main">
        <div class="person-name">${esc(p.name) || "Unnamed"} <span class="pill" style="border-color:${pf.color};color:${pf.color}">${pf.label}</span></div>
        ${p.handle ? `<div class="person-handle">${esc(p.handle)}</div>` : ""}
        ${p.note ? `<div class="person-note">${esc(p.note)}</div>` : ""}
      </div>
      <div class="person-acts">
        <button class="btn sm" data-act="mention" ${a?"":"disabled"} title="Insert @mention into the draft">@</button>
        <button class="btn ghost sm" data-act="copy" title="Copy handle/URL">⧉</button>
        <button class="btn ghost sm" data-act="edit" title="Edit">✎</button>
        <button class="btn ghost sm danger" data-act="del" title="Delete">✕</button>
      </div>
    </div>`;
  }).join("");
  return `
    <div class="people-panel">
      <div class="tip-platform"><span class="swatch" style="width:9px;height:9px;border-radius:3px;background:var(--accent)"></span>People to tag</div>
      <input class="sb-search" id="peopleSearch" placeholder="Search people…" value="${esc(peopleSearch)}" />
      <div class="people-list">${rows || '<div class="empty-hint">No people yet. Add someone below — they\'ll be reusable across every article and taggable on photos.</div>'}</div>
      <div class="person-form">
        <h4 style="margin:14px 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--text-dim2)">Add person</h4>
        <input id="npName" placeholder="Name (e.g. Jane Doe)" />
        <div style="display:flex;gap:6px;margin-top:6px">
          <select id="npPlatform" style="flex:0 0 110px">${platOpts}</select>
          <input id="npHandle" placeholder="@handle or profile URL" style="flex:1" />
        </div>
        <input id="npNote" placeholder="Note — why/when to tag (topics, role)" style="margin-top:6px" />
        <button class="btn primary" id="npAdd" style="margin-top:8px;width:100%">+ Add person</button>
      </div>
      <div class="agent-note" style="margin-top:12px">Saved to <code>articles/people.json</code> when a folder is connected — so Codex/Claude/Grok can suggest who to @mention. Tag people on photos in the <b>Images</b> tab.</div>
    </div>`;
}
function wirePeople() {
  const search = $("#peopleSearch");
  if (search) search.oninput = () => {
    peopleSearch = search.value;
    renderInspector();
    const s = $("#peopleSearch");
    if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
  };
  wirePersonRows();
  const add = $("#npAdd");
  if (add) add.onclick = () => {
    const name = $("#npName").value.trim();
    if (!name) return toast("Enter a name.", "bad");
    state.people.push({ id: uid(), name, platform: $("#npPlatform").value, handle: $("#npHandle").value.trim(), note: $("#npNote").value.trim() });
    savePeople();
    renderInspector();
    toast("Person added.", "good");
  };
}
function wirePersonRows() {
  $$(".person").forEach(row => {
    const p = state.people.find(x => x.id === row.dataset.pid);
    if (!p) return;
    row.querySelectorAll("[data-act]").forEach(btn => btn.onclick = () => {
      const act = btn.dataset.act;
      if (act === "mention") insertMention(p);
      else if (act === "copy") { navigator.clipboard.writeText(p.handle || p.name); toast("Copied.", "good"); }
      else if (act === "edit") editPerson(p);
      else if (act === "del") {
        if (!confirm(`Delete ${p.name}?`)) return;
        state.people = state.people.filter(x => x.id !== p.id);
        savePeople(); renderInspector();
      }
    });
  });
}
function editPerson(p) {
  const name = prompt("Name:", p.name); if (name === null) return;
  const handle = prompt("Handle / profile URL:", p.handle || "");
  const note = prompt("Note:", p.note || "");
  p.name = name.trim() || p.name;
  if (handle !== null) p.handle = handle.trim();
  if (note !== null) p.note = note.trim();
  savePeople(); renderInspector();
}
function insertMention(p) {
  const a = current(); if (!a) return toast("Open an article first.", "bad");
  const ta = $("#mdInput");
  const token = p.handle && p.handle.startsWith("@") ? p.handle : "@" + p.name;
  const pos = ta.selectionStart != null ? ta.selectionStart : ta.value.length;
  ta.value = ta.value.slice(0, pos) + token + " " + ta.value.slice(pos);
  a.body = ta.value;
  updateCounter();
  if (railOpen) renderRail();
  scheduleSave();
  toast(`Inserted ${token}`, "good");
}

