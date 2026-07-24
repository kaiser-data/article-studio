/* ---------------- events ---------------- */
// Connection chip: click to connect when disconnected, or reload when connected.
$("#folderState").onclick = () => {
  if (!bridgeConnected()) return connectFolder();
  const dirty = state.articles.some(a => a._dirty);
  const source = backendBridge ? "backend" : "folder";
  if (dirty && !confirm(`Some articles have unsaved edits. Reload from ${source} anyway?\n\nOK = force reload (your unsaved edits are discarded)\nCancel = keep your edits`)) {
    return backendBridge ? importFromBackend({ force: false }) : importFromFolder({ force: false });
  }
  backendBridge ? importFromBackend({ force: dirty }) : importFromFolder({ force: dirty });
};
$("#keepMine").onclick = () => resolveConflict("mine");
$("#loadTheirs").onclick = () => resolveConflict("theirs");
$("#newBtn").onclick = openTemplateModal;
$("#tplClose").onclick = closeTemplateModal;
$("#tplModal").onclick = e => { if (e.target.id === "tplModal") closeTemplateModal(); };
$("#repurposeClose").onclick = closeRepurpose;
$("#repurposeModal").onclick = e => { if (e.target.id === "repurposeModal") closeRepurpose(); };
$("#railPublish").onclick = openExport;
$("#railCopy").onclick = copyPlatformReady;
$("#focusToggle").onclick = () => { railOpen = !railOpen; applyRail(); };
$("#detailsBtn").onclick = () => {
  const app = document.querySelector(".app");
  const open = app.classList.toggle("details-open");
  $("#detailsBtn").classList.toggle("active", open);
};
$("#exportClose").onclick = closeExport;
$("#exportModal").onclick = e => { if (e.target.id === "exportModal") closeExport(); };
$$("#exportSeg button").forEach(b => b.onclick = () => { exportFormat = b.dataset.fmt; renderExport(); });
$("#exportCopy").onclick = () => { navigator.clipboard.writeText($("#exportOut").value); toast("Copied. Paste into " + exportFormat + ".", "good"); };
$("#exportDownload").onclick = () => {
  const a = current(); if (!a) return;
  const blob = new Blob([toICS(a)], { type: "text/calendar" });
  const url = URL.createObjectURL(blob);
  const el = document.createElement("a");
  el.href = url; el.download = slugify(a.title) + ".ics"; el.click();
  URL.revokeObjectURL(url);
  toast("Downloaded .ics", "good");
};
$("#calendarBtn").onclick = openCalendar;
$("#calClose").onclick = closeCalendar;
$("#calPrev").onclick = () => calShift(-1);
$("#calNext").onclick = () => calShift(1);
$("#calToday").onclick = () => { const d = new Date(); calYear = d.getFullYear(); calMonth = d.getMonth(); renderCalendar(); };
$("#calModal").onclick = e => { if (e.target.id === "calModal") closeCalendar(); };
$("#menuBtn").onclick = () => $("#menuModal").classList.add("show");
$("#closeMenu").onclick = closeMenu;
$("#menuModal").onclick = e => { if (e.target.id === "menuModal") closeMenu(); };

$("#voiceBtn").onclick = () => { closeMenu(); $("#voiceOut").value = state.voice || ""; $("#voiceModal").classList.add("show"); };
$("#voiceClose").onclick = () => $("#voiceModal").classList.remove("show");
$("#voiceCancel").onclick = () => $("#voiceModal").classList.remove("show");
$("#voiceModal").onclick = e => { if (e.target.id === "voiceModal") $("#voiceModal").classList.remove("show"); };
$("#voiceSave").onclick = () => {
  state.voice = $("#voiceOut").value;
  saveVoice();
  $("#voiceModal").classList.remove("show");
  toast(bridgeConnected() ? "Voice guide saved → articles/voice.md" : "Voice guide saved locally.", "good");
};
$("#skillsBtn").onclick = openSkillsModal;
$("#skillsClose").onclick = closeSkillsModal;
$("#skillsModal").onclick = e => { if (e.target.id === "skillsModal") closeSkillsModal(); };
$("#skillNew").onclick = newSkillDraft;
$("#skillSave").onclick = saveSkillFromModal;
$("#skillDelete").onclick = deleteSkillFromModal;
$("#exportJsonBtn").onclick = exportJson;
$("#importJsonBtn").onclick = () => $("#jsonFile").click();
$("#jsonFile").onchange = e => { if (e.target.files[0]) importJson(e.target.files[0]); };
$("#syncAllBtn").onclick = syncAll;
$("#helpBtn").onclick = () => { closeMenu(); showHelp(); };

$("#search").oninput = e => { searchText = e.target.value.toLowerCase(); renderLanes(); };

$("#edTitle").oninput = () => { const a = current(); if (a) { a.title = $("#edTitle").value; scheduleSave(); } };
$("#mdInput").oninput = () => { const a = current(); if (a) { a.body = $("#mdInput").value; updateCounter(); if (railOpen) renderRail(); scheduleSave(); } };
$("#edPlatform").onchange = () => { const a = current(); if (a) { a.platform = $("#edPlatform").value; updateCounter(); if (railOpen) renderRail(); renderInspector(); renderLanes(); scheduleSave(); } };
$("#edStatus").onchange = () => { const a = current(); if (a) { a.status = $("#edStatus").value; renderLanes(); scheduleSave(); } };
$("#deleteBtn").onclick = deleteCurrent;

// ✨ Agent opens Details on the Agents tab
$("#askAgentBtn").onclick = () => {
  const app = document.querySelector(".app");
  app.classList.add("details-open");
  $("#detailsBtn").classList.add("active");
  inspTab = "agents";
  renderInspector();
  setTimeout(() => { const p = $("#agentPrompt"); if (p) p.focus(); }, 30);
};

$$("#inspTabs button").forEach(b => b.onclick = () => { inspTab = b.dataset.tab; renderInspector(); });

document.addEventListener("keydown", e => {
  if ((e.metaKey || e.ctrlKey) && e.key === "s") { e.preventDefault(); commitSave(); toast("Saved."); }
  if ((e.metaKey || e.ctrlKey) && e.key === "n" && !e.shiftKey) { e.preventDefault(); newArticle(); }
  if ((e.metaKey || e.ctrlKey) && e.key === ".") { e.preventDefault(); railOpen = !railOpen; applyRail(); }
});

function showHelp() {
  $("#menuModal").classList.add("show");
  const m = $("#menuModal .modal");
  m.innerHTML = `
    <h3>How the agent bridge works</h3>
    <p>This app, Codex, Claude Code, and Grok Build can share the same files.</p>
    <ol style="font-size:13px;color:var(--text-dim);line-height:1.7;padding-left:18px">
      <li>Click <b>🔗 Connect articles folder</b> (or start with <code>serve.command</code> for the backend).</li>
      <li>Every article is saved as a <kbd>.md</kbd> file with YAML front-matter (title, platform, status, tags, images).</li>
      <li>Use the <b>Agents</b> tab (right panel) to pick <b>Codex</b>, <b>Claude Code</b>, or <b>Grok Build</b>, then polish, rewrite hooks, or generate alt text. Run directly or copy the prompt.</li>
      <li>Hit <b>↻ Reload</b> to pull agent edits into the app.</li>
      <li>The <b>◫ Preview</b> rail always shows exactly what you'll paste — Unicode for LinkedIn, clean Markdown for Medium. Toggle it with <kbd>⌘.</kbd></li>
    </ol>
    <p style="margin-top:14px;font-size:12px">Copy from the rail, or hit <b>⤴ Publish…</b> for every format plus the first-comment block and <kbd>.ics</kbd> download.</p>
    <div class="row"><button class="btn primary" onclick="document.getElementById('menuModal').classList.remove('show')">Got it</button></div>`;
  m.querySelector(".btn.primary").onclick = closeMenu;
}

/* ---------------- boot ---------------- */
loadLocal();
if (!bridgeConnected()) setFolderState(null);
renderAll();
applyRail();
checkBackend(false);
// open most recent if any
if (state.articles.length) { currentId = state.articles[0].id; openEditor(); }
