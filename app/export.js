/* ---------------- markdown preview (compact renderer) ---------------- */
function esc(s) { return (s == null ? "" : String(s)).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function attr(s) { return esc(s).replace(/"/g,"&quot;"); }

function mdToHtml(src) {
  if (!src) return '<p style="color:var(--text-dim2)">Nothing to preview yet…</p>';
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  let html = "", i = 0;
  const inline = t => esc(t)
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2" />')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
  while (i < lines.length) {
    let line = lines[i];
    if (/^```/.test(line)) {
      let code = ""; i++;
      while (i < lines.length && !/^```/.test(lines[i])) { code += lines[i] + "\n"; i++; }
      html += "<pre><code>" + esc(code) + "</code></pre>"; i++; continue;
    }
    if (/^\s*$/.test(line)) { i++; continue; }
    let h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) { const lvl = h[1].length; html += `<h${lvl}>${inline(h[2])}</h${lvl}>`; i++; continue; }
    if (/^\s*>\s?/.test(line)) {
      let q = "";
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) { q += lines[i].replace(/^\s*>\s?/, "") + " "; i++; }
      html += `<blockquote>${inline(q.trim())}</blockquote>`; continue;
    }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) { html += "<hr/>"; i++; continue; }
    if (/^\s*([-*+])\s+/.test(line)) {
      html += "<ul>";
      while (i < lines.length && /^\s*([-*+])\s+/.test(lines[i])) { html += `<li>${inline(lines[i].replace(/^\s*([-*+])\s+/, ""))}</li>`; i++; }
      html += "</ul>"; continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      html += "<ol>";
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) { html += `<li>${inline(lines[i].replace(/^\s*\d+\.\s+/, ""))}</li>`; i++; }
      html += "</ol>"; continue;
    }
    let para = line;
    while (i + 1 < lines.length && !/^\s*$/.test(lines[i + 1]) && !/^(#{1,6}\s|\s*>|\s*[-*+]\s|\s*\d+\.\s|```)/.test(lines[i + 1])) {
      i++; para += " " + lines[i];
    }
    html += `<p>${inline(para)}</p>`; i++;
  }
  return html;
}
// The live publish rail: shows exactly what you'll paste, transformed for the
// current platform (Unicode bold for LinkedIn, clean Markdown for Medium, …).
function renderRail() {
  const a = current(); if (!a) return;
  const out = platformReady(a);
  const plat = $("#railPlatform");
  if (plat) plat.textContent = out.label || "Preview";
  const budget = $("#railBudget");
  if (budget) {
    const n = (out.text || "").length;
    let cls = "rail-budget", html = "";
    if (out.format === "linkedin") {
      if (n > 3000) cls += " over"; else if (n > 2200) cls += " warn";
      html = `<b>${n}</b>/3000`;
    } else {
      html = `<b>${wordCount(out.text || "")}</b> words`;
    }
    budget.className = cls; budget.innerHTML = html;
  }
  const firstComment = out.links && out.links.length
    ? `👇 Links:\n${out.links.map(l => `${l.text}: ${l.url}`).join("\n")}`
    : "";
  $("#railBody").innerHTML = `
    <div class="platform-ready">
      ${out.hint ? `<div class="ready-note">${esc(out.hint)}</div>` : ""}
      <pre>${esc(out.text || "")}</pre>
      ${firstComment ? `
        <div class="first-comment">
          <div class="export-sub">First comment — paste as your first reply so links don't suppress reach</div>
          <pre>${esc(firstComment)}</pre>
          <button class="btn ghost sm" id="railCopyComment" style="margin-top:8px">⧉ Copy first comment</button>
        </div>` : ""}
    </div>`;
  const cc = $("#railCopyComment");
  if (cc) cc.onclick = () => { navigator.clipboard.writeText(firstComment); toast("First comment copied.", "good"); };
}

/* ---------------- backup / import ---------------- */
function exportJson() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "article-studio-backup.json"; a.click();
  URL.revokeObjectURL(url);
}
function importJson(file) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const data = JSON.parse(r.result);
      if (data.articles) {
        state = data;
        // backups from older versions may miss newer collections
        if (!state.people) state.people = [];
        if (!state.tagsets) state.tagsets = [];
        if (!state.customSkills) state.customSkills = [];
        if (!state.selectedWritingSkill) state.selectedWritingSkill = "official:none";
        if (typeof state.voice !== "string") state.voice = "";
        saveLocal(); renderAll(); closeMenu(); toast("Backup imported.", "good");
      }
    } catch (e) { toast("Invalid backup file.", "bad"); }
  };
  r.readAsText(file);
}
async function syncAll() {
  if (!bridgeConnected()) { toast("Connect the backend or a folder first.", "bad"); return; }
  let n = 0;
  for (const a of state.articles) { if (await writeArticleFile(a)) n++; }
  saveLocal(); renderLanes(); closeMenu();
  toast(`Saved ${n} article${n!==1?"s":""} to ${bridgeName()}/`, "good");
}

/* ---------------- helpers ---------------- */
function wordCount(s) { return (s || "").trim() ? s.trim().split(/\s+/).length : 0; }
function fmtDate(iso) { try { return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }); } catch (e) { return iso; } }

/* ---------------- scheduling helpers ---------------- */
function todayKey() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function dateKey(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function fmtDay(key) { try { const [y,m,d] = key.split("-").map(Number); return new Date(y, m-1, d).toLocaleDateString(undefined, { weekday:"short", month:"short", day:"numeric" }); } catch(e){ return key; } }
// returns {label, cls} for a card chip, or null
function scheduleChip(a) {
  if (!a.publishDate) return null;
  if (a.status === "posted") return { label: "✓ " + fmtDay(a.publishDate), cls: "sch-done" };
  const today = todayKey();
  if (a.publishDate < today) return { label: "⚠ " + fmtDay(a.publishDate), cls: "sch-over" };
  if (a.publishDate === today) return { label: "● Today", cls: "sch-today" };
  return { label: "📅 " + fmtDay(a.publishDate), cls: "sch-up" };
}
function toast(msg, kind) {
  const t = document.createElement("div");
  t.className = "toast " + (kind || "");
  t.textContent = msg;
  $("#toasts").appendChild(t);
  setTimeout(() => { t.style.opacity = "0"; t.style.transition = ".3s"; }, 2600);
  setTimeout(() => t.remove(), 3000);
}
function fileToDataUrl(file) { return new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(file); }); }
function closeMenu() { $("#menuModal").classList.remove("show"); }

/* ---------------- calendar ---------------- */
let calYear = null, calMonth = null;   // month currently shown (0-based month)
function openCalendar() {
  if (calYear === null) { const d = new Date(); calYear = d.getFullYear(); calMonth = d.getMonth(); }
  $("#calModal").classList.add("show");
  renderCalendar();
}
function closeCalendar() { $("#calModal").classList.remove("show"); }
function calShift(delta) {
  calMonth += delta;
  if (calMonth < 0) { calMonth = 11; calYear--; }
  else if (calMonth > 11) { calMonth = 0; calYear++; }
  renderCalendar();
}
function renderCalendar() {
  const label = new Date(calYear, calMonth, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  $("#calMonthLabel").textContent = label;

  // group scheduled articles by date key
  const byDate = {};
  for (const a of state.articles) {
    if (!a.publishDate) continue;
    (byDate[a.publishDate] = byDate[a.publishDate] || []).push(a);
  }

  const first = new Date(calYear, calMonth, 1);
  const startDow = (first.getDay() + 6) % 7;              // Monday-first
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const today = todayKey();

  const dow = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  let html = `<div class="cal-grid">`;
  for (const d of dow) html += `<div class="cal-dow">${d}</div>`;
  for (let i = 0; i < startDow; i++) html += `<div class="cal-cell empty"></div>`;
  for (let day = 1; day <= daysInMonth; day++) {
    const key = dateKey(new Date(calYear, calMonth, day));
    const items = byDate[key] || [];
    const isToday = key === today;
    html += `<div class="cal-cell ${isToday ? "today" : ""}">
      <div class="cal-daynum">${day}</div>
      <div class="cal-items">
        ${items.map(a => {
          const p = PLATFORMS[a.platform] || PLATFORMS.blog;
          const over = a.status !== "posted" && key < today;
          return `<div class="cal-item ${a.status === "posted" ? "done" : over ? "over" : ""}" data-cal-id="${a.id}" title="${esc(a.title)||"Untitled"} · ${p.label}">
            <span class="cal-dot" style="background:${p.color}"></span>${esc(a.title) || "Untitled"}
          </div>`;
        }).join("")}
      </div>
    </div>`;
  }
  html += `</div>`;
  $("#calBody").innerHTML = html;

  // upcoming list (next scheduled, not yet posted)
  const upcoming = state.articles
    .filter(a => a.publishDate && a.status !== "posted" && a.publishDate >= today)
    .sort((x, y) => x.publishDate.localeCompare(y.publishDate))
    .slice(0, 6);
  const overdue = state.articles
    .filter(a => a.publishDate && a.status !== "posted" && a.publishDate < today)
    .sort((x, y) => x.publishDate.localeCompare(y.publishDate));
  let up = "";
  if (overdue.length) up += `<div class="cal-up-head" style="color:var(--danger)">⚠ Overdue (${overdue.length})</div>` +
    overdue.map(a => calUpRow(a)).join("");
  up += `<div class="cal-up-head">Upcoming</div>`;
  up += upcoming.length ? upcoming.map(a => calUpRow(a)).join("") : `<div class="empty-hint" style="padding:8px">Nothing scheduled. Set a publish date in an article's <b>Meta</b> tab.</div>`;
  $("#calUpcoming").innerHTML = up;

  $$("#calModal [data-cal-id]").forEach(el => el.onclick = () => {
    currentId = el.dataset.calId;
    closeCalendar();
    renderLanes();
    openEditor();
  });
}
function calUpRow(a) {
  const p = PLATFORMS[a.platform] || PLATFORMS.blog;
  return `<div class="cal-up-row" data-cal-id="${a.id}">
    <span class="cal-dot" style="background:${p.color}"></span>
    <span class="cal-up-date">${fmtDay(a.publishDate)}</span>
    <span class="cal-up-title">${esc(a.title) || "Untitled"}</span>
    <span class="pill" style="border-color:${p.color};color:${p.color}">${p.label}</span>
  </div>`;
}

/* ---------------- platform-ready export ---------------- */
let exportFormat = "linkedin";
// Unicode "fonts" so bold survives on LinkedIn (which strips markdown)
function toUnicode(str, kind) {
  return [...str].map(ch => {
    const c = ch.codePointAt(0);
    if (kind === "bold") {
      if (c >= 65 && c <= 90) return String.fromCodePoint(0x1D5D4 + (c - 65));
      if (c >= 97 && c <= 122) return String.fromCodePoint(0x1D5EE + (c - 97));
      if (c >= 48 && c <= 57) return String.fromCodePoint(0x1D7EC + (c - 48));
    } else if (kind === "italic") {
      if (c >= 65 && c <= 90) return String.fromCodePoint(0x1D608 + (c - 65));
      if (c >= 97 && c <= 122) return String.fromCodePoint(0x1D622 + (c - 97));
    }
    return ch;
  }).join("");
}
function toLinkedIn(md) {
  const links = [];
  let t = (md || "");
  t = t.replace(/!\[[^\]]*\]\([^)]+\)/g, "");                         // drop images (uploaded separately)
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, text, url) => { links.push({ text, url }); return text; });
  t = t.split("\n").map(line => {
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) return toUnicode(h[2], "bold");                            // headings -> bold line
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) return "";               // hr -> blank
    let l = line.replace(/^\s*[-*+]\s+/, "• ").replace(/^\s*>\s?/, "");
    return l;
  }).join("\n");
  t = t.replace(/\*\*([^*]+)\*\*/g, (m, x) => toUnicode(x, "bold"));
  t = t.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, (m, pre, x) => pre + toUnicode(x, "italic"));
  t = t.replace(/`([^`]+)`/g, "$1");
  t = t.replace(/\n{3,}/g, "\n\n").trim();
  return { text: t, links };
}
function toPlain(md) {
  return (md || "")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1").replace(/(^|[^*])\*([^*]+)\*/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*>\s?/gm, "").replace(/^\s*[-*+]\s+/gm, "• ")
    .replace(/\n{3,}/g, "\n\n").trim();
}
function platformReady(a, fmt) {
  const format = fmt || (a.platform === "medium" || a.platform === "blog" ? "medium"
    : a.platform === "luma" ? "luma"
    : a.platform === "toastmasters" ? "plain" : "linkedin");
  if (format === "linkedin") {
    const out = toLinkedIn(a.body);
    return {
      format,
      label: "LinkedIn",
      text: out.text,
      links: out.links,
      hint: "Ready for LinkedIn: Unicode formatting, no Markdown, links pulled out for the first comment."
    };
  }
  if (format === "medium") {
    return { format, label: "Medium / blog", text: a.body || "", links: [], hint: "Medium and most blogs understand Markdown, so the draft stays in Markdown." };
  }
  if (format === "luma") {
    return { format, label: "Luma", text: toPlain(a.body), links: [], hint: "Luma event descriptions work best as clean plain text. Use Export when you also need the .ics file." };
  }
  return { format, label: "Plain text", text: toPlain(a.body), links: [], hint: "Markdown markers are removed and bullets are normalized for newsletters, email, and plain-text channels." };
}
function toICS(a) {
  const dt = (a.publishDate || todayKey()).replace(/-/g, "");
  const stamp = nowISO().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const esc = s => (s || "").replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Article Studio//EN", "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    "UID:" + (a.id || "evt") + "@article-studio",
    "DTSTAMP:" + stamp,
    "DTSTART;VALUE=DATE:" + dt,
    "SUMMARY:" + esc(a.title || "Event"),
    "DESCRIPTION:" + esc(a.summary || toPlain(a.body).slice(0, 500)),
    "END:VEVENT", "END:VCALENDAR"
  ].join("\r\n");
}
function copyPlatformReady() {
  const a = current();
  if (!a) return toast("Open an article first.", "bad");
  const out = platformReady(a);
  navigator.clipboard.writeText(out.text || "");
  toast(`${out.label} ready text copied.`, "good");
}
function applyPlatformReadyToDraft() {
  const a = current();
  if (!a) return toast("Open an article first.", "bad");
  const out = platformReady(a);
  if (!out.text) return toast("Nothing to apply.", "bad");
  const warning = out.format === "linkedin"
    ? "Replace the Markdown source with LinkedIn-ready text?\n\n• Bold becomes Unicode\n• Links are removed from the body (use the first comment)\n• This cannot be undone easily."
    : "Replace the current Markdown draft with the platform-ready version?";
  if (!confirm(warning)) return;
  a.body = out.text;
  $("#mdInput").value = out.text;
  updateCounter();
  if (railOpen) renderRail();
  scheduleSave();
  toast("Platform version applied to source draft.", "good");
}
function openExport() {
  const a = current();
  if (!a) return toast("Open an article first.", "bad");
  exportFormat = a.platform === "medium" || a.platform === "blog" ? "medium"
    : a.platform === "luma" ? "luma"
    : a.platform === "toastmasters" ? "plain" : "linkedin";
  $("#exportModal").classList.add("show");
  renderExport();
}
function closeExport() { $("#exportModal").classList.remove("show"); }
function renderExport() {
  const a = current(); if (!a) return;
  $$("#exportSeg button").forEach(b => b.classList.toggle("active", b.dataset.fmt === exportFormat));
  const out = $("#exportOut"), extra = $("#exportExtra"), hint = $("#exportHint"), dl = $("#exportDownload");
  extra.innerHTML = ""; dl.style.display = "none"; out.style.display = "block";
  if (exportFormat === "linkedin") {
    const ready = platformReady(a, "linkedin");
    hint.textContent = ready.hint + " Paste the post first, then the comment.";
    out.value = ready.text;
    const links = ready.links || [];
    if (links.length) {
      extra.innerHTML = `<div class="export-sub">First comment (paste after the post):</div>
        <textarea class="export-out sm" id="exportComment" spellcheck="false">👇 Links:\n${links.map(l => `${l.text}: ${l.url}`).join("\n")}</textarea>
        <button class="btn ghost sm" id="copyComment" style="margin-top:6px">⧉ Copy first comment</button>`;
    }
  } else if (exportFormat === "medium") {
    const ready = platformReady(a, "medium");
    hint.textContent = ready.hint;
    out.value = ready.text;
  } else if (exportFormat === "plain") {
    const ready = platformReady(a, "plain");
    hint.textContent = ready.hint;
    out.value = ready.text;
  } else if (exportFormat === "luma") {
    const ready = platformReady(a, "luma");
    hint.textContent = `${ready.hint} Calendar file${a.publishDate ? " for " + fmtDay(a.publishDate) : " uses the Meta publish date when set"}.`;
    out.value = ready.text;
    dl.style.display = "inline-block";
  }
  const cc = $("#copyComment");
  if (cc) cc.onclick = () => { navigator.clipboard.writeText($("#exportComment").value); toast("First comment copied.", "good"); };
}

