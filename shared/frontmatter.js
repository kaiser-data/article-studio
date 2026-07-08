/* ============================================================
   Article Studio — shared front-matter schema (single source of truth)
   Used by BOTH the browser app (index.html, via <script>) and the
   Node backend (server.js, via require). Keep article <-> Markdown
   serialization here so the two sides can never drift and silently
   drop fields on agent runs.
   ============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;   // Node
  else root.Frontmatter = api;                                              // browser -> window.Frontmatter
})(typeof self !== "undefined" ? self : this, function () {

  function nowISO() { return new Date().toISOString(); }
  function uid() { return "a" + Math.random().toString(36).slice(2, 9); }
  function slugify(s) {
    return (s || "untitled").toLowerCase().replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "untitled";
  }
  function escYaml(s) {
    s = (s == null ? "" : String(s));
    if (/[:#\[\]{}",]|^\s|\s$/.test(s)) return JSON.stringify(s);
    return s;
  }
  function unesc(s) {
    if (s.startsWith('"') && s.endsWith('"')) { try { return JSON.parse(s); } catch (e) {} }
    return s;
  }

  function toFrontmatter(a) {
    a = a || {};
    const fm = [
      "---",
      `title: ${escYaml(a.title || "Untitled")}`,
      `platform: ${a.platform || "blog"}`,
      `status: ${a.status || "drafting"}`,
      `tags: [${(a.tags || []).map(t => escYaml(t)).join(", ")}]`,
      `summary: ${escYaml(a.summary || "")}`,
      `publishDate: ${a.publishDate || ""}`,
      `group: ${a.group || ""}`,
      `images: [${(a.images || []).map(im => escYaml(im.path || im.name || im)).join(", ")}]`,
      `imageTags: [${(a.images || []).filter(im => im && im.people && im.people.length).map(im => escYaml(`${im.path || im.name} :: ${im.people.join("; ")}`)).join(", ")}]`,
      `created: ${a.created || nowISO()}`,
      `updated: ${a.updated || nowISO()}`,
      `id: ${a.id || uid()}`,
      "---",
      ""
    ].join("\n");
    return fm + (a.body || "");
  }

  function parseFrontmatter(text, fallbackId) {
    const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
    const a = { id: fallbackId || uid(), title: "Untitled", platform: "blog", status: "drafting", tags: [], summary: "", publishDate: "", group: "", images: [], created: nowISO(), updated: nowISO(), body: text };
    if (!m) { a.body = text; return a; }
    a.body = text.slice(m[0].length);
    for (const line of m[1].split("\n")) {
      const idx = line.indexOf(":");
      if (idx < 0) continue;
      const key = line.slice(0, idx).trim();
      let val = line.slice(idx + 1).trim();
      if (key === "tags" || key === "images" || key === "imageTags") {
        val = val.replace(/^\[|\]$/g, "").trim();
        const arr = val ? val.split(",").map(s => unesc(s.trim())).filter(Boolean) : [];
        if (key === "tags") a.tags = arr;
        else if (key === "images") a.images = arr.map(p => ({ name: p.split("/").pop(), path: p }));
        else a._imageTags = arr;   // "path :: Name; Name" — mapped onto images below
      } else if (["title", "platform", "status", "summary", "publishDate", "group", "created", "updated", "id"].includes(key)) {
        a[key] = unesc(val);
      }
    }
    // attach per-photo people tags back onto their image objects
    if (a._imageTags) {
      for (const entry of a._imageTags) {
        const sep = entry.indexOf(" :: ");
        if (sep < 0) continue;
        const ref = entry.slice(0, sep).trim();
        const names = entry.slice(sep + 4).split(";").map(s => s.trim()).filter(Boolean);
        const img = (a.images || []).find(im => (im.path || im.name) === ref);
        if (img) img.people = names;
      }
      delete a._imageTags;
    }
    return a;
  }

  return { nowISO, uid, slugify, escYaml, unesc, toFrontmatter, parseFrontmatter };
});
