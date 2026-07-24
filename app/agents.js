/* ---------------- Agent tasks ---------------- */
const AGENT_TASKS = {
  polish: {
    label: "Polish draft",
    ask: "Polish this article for clarity, flow, and platform fit. Keep the author's voice, preserve Markdown, and do not invent facts."
  },
  hook: {
    label: "Improve hook",
    ask: "Rewrite the opening hook and first section to make the article more compelling. Keep the rest of the draft mostly intact."
  },
  repurpose: {
    label: "Repurpose",
    ask: "Create a platform-ready variant of this article. Keep the core idea, adapt structure and tone for the selected platform, and update the metadata if needed."
  },
  alttext: {
    label: "Alt text",
    ask: "Write descriptive alt text for every image in this article. Open each file listed under Images and look at it, then fill the alt text in the Markdown image syntax ![alt](path). Describe what is actually visible, name the tagged people, keep each alt under 125 characters, and skip filler like \"image of\". Replace weak alts (file names, single words); leave good ones alone. Do not change anything else."
  },
  factcheck: {
    label: "Review risks",
    ask: "Review this article for factual gaps, unsupported claims, unclear wording, and missing caveats. Prefer concrete edits over broad advice."
  }
};

const AGENT_TARGETS = {
  codex: { label: "Codex" },
  claude: { label: "Claude Code" },
  grok: { label: "Grok Build" }
};

function getWritingSkill(key = state.selectedWritingSkill) {
  const selected = key || "official:none";
  if (selected.startsWith("custom:")) {
    const id = selected.slice(7);
    const skill = (state.customSkills || []).find(s => s.id === id);
    if (skill) return {
      key: selected,
      type: "custom",
      label: skill.name,
      blurb: skill.note || "Custom writing skill",
      prompt: skill.prompt || ""
    };
  }
  const officialKey = selected.startsWith("official:") ? selected.slice(9) : "none";
  const skill = OFFICIAL_WRITING_SKILLS[officialKey] || OFFICIAL_WRITING_SKILLS.none;
  return {
    key: `official:${OFFICIAL_WRITING_SKILLS[officialKey] ? officialKey : "none"}`,
    type: "official",
    label: skill.label,
    blurb: skill.blurb,
    prompt: skill.prompt
  };
}

function writingSkillOptionsHtml() {
  const selected = getWritingSkill().key;
  const official = Object.entries(OFFICIAL_WRITING_SKILLS).map(([key, skill]) =>
    `<option value="${attr(`official:${key}`)}" ${selected === `official:${key}` ? "selected" : ""}>${esc(skill.label)}</option>`
  ).join("");
  const custom = (state.customSkills || []).map(skill =>
    `<option value="${attr(`custom:${skill.id}`)}" ${selected === `custom:${skill.id}` ? "selected" : ""}>${esc(skill.name)}</option>`
  ).join("");
  return `
    <optgroup label="Official">${official}</optgroup>
    ${custom ? `<optgroup label="Custom">${custom}</optgroup>` : ""}
  `;
}

function engineReady(key = agentTarget) {
  return !!backendStatus[key];
}

function renderAgents(a) {
  if (!a) return `<div class="empty-hint">Open an article to create an agent task.</div>`;
  const target = AGENT_TARGETS[agentTarget] || AGENT_TARGETS.codex;
  const engineOk = engineReady(agentTarget);
  const backendClass = backendStatus.ok && engineOk ? "good" : backendStatus.ok ? "warn" : "";
  const backendText = !backendStatus.checked
    ? "Checking local backend..."
    : backendStatus.ok && engineOk
      ? `${target.label} backend ready`
      : backendStatus.ok
        ? `Backend running, ${target.label} CLI missing`
        : "Backend not running";
  const runDisabled = aiAssistBusy || !backendStatus.ok || !engineOk ? "disabled" : "";
  const resultHtml = aiAssistResult ? `
    <div class="agent-result">
      <b>AI result ready</b>
      <div>${esc(aiAssistResult.notes || "Review the draft before applying.")}</div>
      <pre>${esc((aiAssistResult.body || "").slice(0, 900))}${(aiAssistResult.body || "").length > 900 ? "\n..." : ""}</pre>
      <div class="agent-actions" style="margin-top:8px">
        <button class="btn primary" id="applyAiAssist">Apply result</button>
        <button class="btn ghost" id="discardAiAssist">Discard</button>
      </div>
    </div>` : "";
  return `
    <div class="agent-panel">
      <div class="tip-platform"><span class="swatch" style="width:9px;height:9px;border-radius:3px;background:var(--accent)"></span>Agent handoff (edits the file)</div>
      <div class="seg" id="agentTargetSeg">
        ${Object.entries(AGENT_TARGETS).map(([key, item]) => `<button data-agent-target="${key}" class="${agentTarget===key?"active":""}">${item.label}</button>`).join("")}
      </div>
      <div class="agent-status ${backendClass}">
        <span class="led"></span>
        <span>${backendText}</span>
        <span style="flex:1"></span>
        <button class="btn ghost sm" id="checkBackend">Check</button>
      </div>
      <div class="agent-presets">
        ${Object.entries(AGENT_TASKS).map(([key, task]) => `<button class="agent-preset ${agentTask===key?"active":""}" data-agent-task="${key}">${task.label}</button>`).join("")}
      </div>
      <div class="meta-field" style="margin-bottom:0">
        <label>Writing skill</label>
        <div class="skill-row">
          <select id="writingSkillSelect">${writingSkillOptionsHtml()}</select>
          <button class="btn ghost sm" id="manageSkills">Manage</button>
        </div>
      </div>
      <textarea class="prompt-box" id="agentPrompt">${esc(buildAgentPrompt(a))}</textarea>
      <button class="btn" id="copyAgentPrompt">Copy prompt</button>
      <button class="btn primary" id="runAiAssist" ${runDisabled}>${aiAssistBusy ? `Running ${target.label}…` : `Run ${target.label}`}</button>
      ${resultHtml}
      <div class="agent-note">
        ${backendStatus.ok ? `Run uses the local <b>${target.label}</b> CLI. It edits the file directly. Or copy the prompt.` : "Start <code>serve.command</code> for the local backend (agents run on your machine)."}
      </div>
    </div>`;
}

function buildAgentPrompt(a) {
  const p = PLATFORMS[a.platform] || PLATFORMS.blog;
  const task = AGENT_TASKS[agentTask] || AGENT_TASKS.polish;
  const target = AGENT_TARGETS[agentTarget] || AGENT_TARGETS.codex;
  const skill = getWritingSkill();
  const file = a._file ? `articles/${a._file}` : `articles/${slugify(a.title)}.md`;
  const tags = (a.tags || []).join(", ") || "none";
  // Images only exist as real files when a folder is connected (im.path);
  // browser-only blobs (idbKey) can't be opened by the agent, so they're skipped.
  const imgs = (a.images || []).filter(im => im.path);
  const imgLines = imgs.length
    ? ["", "Images (paths relative to the repo root):",
       ...imgs.map(im => `- articles/${im.path}${(im.people || []).length ? ` — people in photo: ${im.people.join(", ")}` : ""}`)]
    : [];
  return [
    `You are ${target.label}, editing my Article Studio draft in this repo.`,
    ``,
    `Task: ${task.ask}`,
    ``,
    ...(skill.prompt ? [
      `Writing skill (${skill.type}): ${skill.label}`,
      skill.prompt,
      ``
    ] : []),
    `Article file: ${file}`,
    `Title: ${a.title || "Untitled"}`,
    `Platform: ${p.label}`,
    `Status: ${a.status}`,
    `Tags: ${tags}`,
    `Summary: ${a.summary || "none"}`,
    ...imgLines,
    ``,
    `Constraints:`,
    `- Edit the Markdown file directly and preserve the YAML front matter.`,
    `- Keep image references as relative paths under articles/images/.`,
    `- Keep the draft appropriate for ${p.label}.`,
    `- After editing, briefly summarize what changed.`,
    ``,
    `Current draft:`,
    a.body || "(empty draft)"
  ].join("\n");
}

function wireAgents() {
  const a = current(); if (!a) return;
  $$("#agentTargetSeg button").forEach(btn => btn.onclick = () => {
    agentTarget = btn.dataset.agentTarget;
    aiAssistResult = null;
    renderInspector();
  });
  $$(".agent-preset").forEach(btn => btn.onclick = () => {
    agentTask = btn.dataset.agentTask;
    aiAssistResult = null;
    renderInspector();
  });
  $("#writingSkillSelect").onchange = e => {
    state.selectedWritingSkill = e.target.value;
    aiAssistResult = null;
    saveLocal();
    renderInspector();
  };
  $("#manageSkills").onclick = openSkillsModal;
  $("#checkBackend").onclick = () => checkBackend(true);
  $("#copyAgentPrompt").onclick = async () => {
    const prompt = $("#agentPrompt").value;
    try {
      await navigator.clipboard.writeText(prompt);
      toast("Prompt copied.", "good");
    } catch (e) {
      toast("Clipboard failed. Select and copy the prompt manually.", "bad");
    }
  };
  $("#runAiAssist").onclick = runAiAssist;
  const applyBtn = $("#applyAiAssist");
  if (applyBtn) applyBtn.onclick = applyAiAssistResult;
  const discardBtn = $("#discardAiAssist");
  if (discardBtn) discardBtn.onclick = () => { aiAssistResult = null; renderInspector(); };
}

function openSkillsModal() {
  closeMenu();
  const selected = getWritingSkill();
  editingSkillId = selected.type === "custom" ? selected.key.slice(7) : null;
  renderSkillsModal();
  $("#skillsModal").classList.add("show");
}

function closeSkillsModal() {
  $("#skillsModal").classList.remove("show");
}

function renderSkillsModal() {
  const skills = state.customSkills || [];
  if (editingSkillId && !skills.some(s => s.id === editingSkillId)) editingSkillId = null;
  const active = skills.find(s => s.id === editingSkillId);
  $("#skillList").innerHTML = skills.length ? skills.map(s => `
    <button class="skill-item ${s.id === editingSkillId ? "active" : ""}" data-skill-id="${attr(s.id)}">
      ${esc(s.name)}
      <small>${esc((s.prompt || "").split("\n").find(Boolean) || "No instructions yet.")}</small>
    </button>
  `).join("") : `<div class="empty-hint" style="padding:8px 0">No custom skills yet.</div>`;
  $("#skillName").value = active ? active.name || "" : "";
  $("#skillPrompt").value = active ? active.prompt || "" : "";
  $("#skillDelete").disabled = !active;
  $$(".skill-item").forEach(btn => btn.onclick = () => {
    editingSkillId = btn.dataset.skillId;
    renderSkillsModal();
  });
}

function newSkillDraft() {
  editingSkillId = null;
  renderSkillsModal();
  $("#skillName").focus();
}

function saveSkillFromModal() {
  const name = $("#skillName").value.trim();
  const prompt = $("#skillPrompt").value.trim();
  if (!name || !prompt) return toast("Add a skill name and instructions.", "bad");
  const skills = state.customSkills || (state.customSkills = []);
  let skill = editingSkillId ? skills.find(s => s.id === editingSkillId) : null;
  if (!skill) {
    skill = { id: uid(), created: nowISO() };
    skills.push(skill);
  }
  skill.name = name;
  skill.prompt = prompt;
  skill.updated = nowISO();
  editingSkillId = skill.id;
  state.selectedWritingSkill = `custom:${skill.id}`;
  saveSkills();
  renderSkillsModal();
  if (inspTab === "agents") renderInspector();
  toast(bridgeConnected() ? "Writing skill saved → articles/writing-skills.json" : "Writing skill saved locally.", "good");
}

function deleteSkillFromModal() {
  if (!editingSkillId) return;
  const skill = (state.customSkills || []).find(s => s.id === editingSkillId);
  if (!skill || !confirm(`Delete "${skill.name}"?`)) return;
  state.customSkills = (state.customSkills || []).filter(s => s.id !== editingSkillId);
  if (state.selectedWritingSkill === `custom:${editingSkillId}`) state.selectedWritingSkill = "official:none";
  editingSkillId = null;
  saveSkills();
  renderSkillsModal();
  if (inspTab === "agents") renderInspector();
  toast("Writing skill deleted.", "good");
}


async function checkBackend(showToast = false) {
  try {
    const res = await fetch("/api/health", { cache: "no-store" });
    if (!res.ok) throw new Error("Backend health check failed");
    const data = await res.json();
    backendStatus = {
      checked: true,
      ok: true,
      codex: !!data.codex,
      claude: !!data.claude,
      grok: !!data.grok,
      error: ""
    };
    if (data.files && !bridgeConnected()) await connectBackendBridge(false);
    if (showToast) {
      const parts = [
        `Codex ${data.codex ? "✓" : "✗"}`,
        `Claude Code ${data.claude ? "✓" : "✗"}`,
        `Grok Build ${data.grok ? "✓" : "✗"}`
      ];
      const anyEngine = !!(data.codex || data.claude || data.grok);
      toast(`Backend ready. ${parts.join(" · ")}`, anyEngine ? "good" : "bad");
    }
  } catch (e) {
    backendStatus = { checked: true, ok: false, codex: false, claude: false, grok: false, error: e.message };
    if (showToast) toast("Backend not running. Start with serve.command.", "bad");
  }
  if (inspTab === "agents") renderInspector();
  // Refresh Ask agent button state
  const askBtn = $("#askAgentBtn");
  if (askBtn && document.getElementById("edPane").style.display !== "none") {
    askBtn.disabled = !backendStatus.ok;
    askBtn.title = backendStatus.ok
      ? "Polish or rewrite with Codex / Claude / Grok"
      : "Start the local backend (serve.command) to use agents";
  }
}

async function runAiAssist() {
  const a = current();
  if (!a || aiAssistBusy) return;
  aiAssistBusy = true;
  aiAssistResult = null;
  renderInspector();
  try {
    const res = await fetch("/api/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        engine: agentTarget,
        task: agentTask,
        prompt: $("#agentPrompt").value,
        platform: (PLATFORMS[a.platform] || PLATFORMS.blog).label,
        article: {
          file: a._file || `${slugify(a.title)}.md`,
          id: a.id,
          title: a.title,
          platform: a.platform,
          status: a.status,
          tags: a.tags || [],
          images: a.images || [],
          created: a.created,
          summary: a.summary || "",
          body: a.body || ""
        }
      })
    });
    const data = await res.json().catch(() => ({}));
    const label = (AGENT_TARGETS[agentTarget] || AGENT_TARGETS.codex).label;
    if (!res.ok) throw new Error(data.error || `${label} run failed`);
    aiAssistResult = data.result;
    if (data.file) {
      const a = current();
      if (a) a._file = data.file;
    }
    toast(`${label} result ready.`, "good");
  } catch (e) {
    toast(e.message || "Run failed.", "bad");
  } finally {
    aiAssistBusy = false;
    renderInspector();
  }
}

function applyAiAssistResult() {
  const a = current();
  if (!a || !aiAssistResult) return;
  if (aiAssistResult.title) a.title = aiAssistResult.title;
  if (aiAssistResult.summary != null) a.summary = aiAssistResult.summary;
  if (aiAssistResult.body) a.body = aiAssistResult.body;
  aiAssistResult = null;
  openEditor();
  scheduleSave();
  toast("AI result applied. Review before publishing.", "good");
}

async function renderImages(body, a) {
  if (!a) { body.innerHTML = `<div class="empty-hint">No article open.</div>`; return; }
  body.innerHTML = `
    <div class="dropzone" id="dropzone">
      <div style="font-size:22px;margin-bottom:6px">🖼️</div>
      Drag images here or <b>click to pick</b>.<br/>
      ${bridgeConnected() ? `Saved into <code>articles/images/</code> via ${backendBridge ? "backend" : "folder"}.` : "Stored locally — connect the backend or a folder to save real files."}
    </div>
    <input type="file" id="imgInput" accept="image/*" multiple style="display:none" />
    <div class="img-grid" id="imgGrid"></div>`;
  const grid = $("#imgGrid");
  for (const im of (a.images || [])) {
    if (!im.people) im.people = [];
    const src = await resolveImageSrc(im);
    const cell = document.createElement("div");
    cell.className = "img-cell";
    const people = state.people || [];
    const tagBox = people.length
      ? `<details class="img-tag-box">
           <summary>🏷 ${im.people.length ? im.people.length + " tagged" : "Tag people"}</summary>
           <div class="people-check">
             ${people.map(p => `<label><input type="checkbox" data-tag-pid="${p.id}" ${im.people.includes(p.name) ? "checked" : ""}/> ${esc(p.name)}</label>`).join("")}
           </div>
         </details>`
      : `<div class="img-tag-empty">Add people in the People tab to tag them here.</div>`;
    cell.innerHTML = `
      ${src ? `<img src="${src}" />` : `<div style="height:84px;display:flex;align-items:center;justify-content:center;color:var(--text-dim2);font-size:11px">missing</div>`}
      <div class="img-name">${esc(im.name)}</div>
      ${im.people.length ? `<div class="img-people-chips">${im.people.map(n => `<span class="tag">${esc(n)}</span>`).join("")}</div>` : ""}
      ${tagBox}
      <div class="img-actions">
        <button data-act="md" title="Insert into article">＋md</button>
        <button data-act="rm" title="Remove">✕</button>
      </div>`;
    cell.querySelector('[data-act="md"]').onclick = () => insertImageMarkdown(im);
    cell.querySelector('[data-act="rm"]').onclick = () => {
      revokeImageUrl(im);
      if (im.idbKey) idbDel(im.idbKey);
      a.images = a.images.filter(x => x !== im);
      scheduleSave(); renderInspector();
    };
    cell.querySelectorAll("[data-tag-pid]").forEach(cb => cb.onchange = () => {
      const person = (state.people || []).find(x => x.id === cb.dataset.tagPid);
      if (!person) return;
      if (cb.checked) { if (!im.people.includes(person.name)) im.people.push(person.name); }
      else im.people = im.people.filter(n => n !== person.name);
      scheduleSave();
      renderInspector();   // refresh chip count
    });
    grid.appendChild(cell);
  }
}
function wireImages() {
  const dz = $("#dropzone"), input = $("#imgInput");
  if (!dz) return;
  dz.onclick = () => input.click();
  input.onchange = () => handleFiles(input.files);
  dz.ondragover = e => { e.preventDefault(); dz.classList.add("drag"); };
  dz.ondragleave = () => dz.classList.remove("drag");
  dz.ondrop = e => { e.preventDefault(); dz.classList.remove("drag"); handleFiles(e.dataTransfer.files); };
}
async function handleFiles(files) {
  const a = current(); if (!a) return;
  const slug = slugify(a.title);
  let savedBytes = 0;
  for (const file of files) {
    if (!file.type.startsWith("image/")) continue;
    const blob = await compressImage(file);          // resize/compress oversized photos
    savedBytes += Math.max(0, file.size - blob.size);
    const name = blob.name || file.name;
    if (bridgeConnected()) {
      const path = await writeImageFile(slug, blob, name);
      if (path) a.images.push({ name, path });
    } else {
      const idbKey = "img_" + uid();                 // blob → IndexedDB (not base64 in localStorage)
      try { await idbPut(idbKey, blob); a.images.push({ name, idbKey }); }
      catch (e) { toast("Couldn't store image: " + e.message, "bad"); }
    }
  }
  scheduleSave();
  renderInspector();
  toast(savedBytes > 50 * 1024 ? `Image added (saved ${(savedBytes/1024/1024).toFixed(1)}MB via compression).` : "Image added.", "good");
}
async function insertImageMarkdown(im) {
  const a = current(); if (!a) return;
  let ref = im.path || im.dataUrl;
  if (!ref && im.idbKey) {                       // browser-only: inline as data URL so it's portable
    const blob = await idbGet(im.idbKey);
    if (blob) ref = await fileToDataUrl(blob);
  }
  if (!ref) return toast("Image not available.", "bad");
  const ta = $("#mdInput");
  const snippet = `\n![${im.name}](${ref})\n`;
  const pos = ta.selectionStart || ta.value.length;
  ta.value = ta.value.slice(0, pos) + snippet + ta.value.slice(pos);
  a.body = ta.value;
  updateCounter();
  if (railOpen) renderRail();
  scheduleSave();
}

