#!/usr/bin/env node
const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

const ROOT = __dirname;
const ARTICLES_DIR = path.join(ROOT, "articles");
const PORT = Number(process.env.PORT || 8765);
const CODEX_BIN = process.env.CODEX_BIN || "codex";
const CLAUDE_BIN = process.env.CLAUDE_BIN || "claude";

// Both engines are local CLIs that edit the article file in place, then we read it back.
const ENGINES = {
  codex: {
    bin: CODEX_BIN,
    label: "Codex",
    versionArgs: ["--version"],
    // codex takes the prompt as a positional arg
    build: prompt => ({
      args: ["exec", "--cd", ROOT, "--sandbox", "workspace-write", "--ask-for-approval", "never", prompt],
      stdin: null
    })
  },
  claude: {
    bin: CLAUDE_BIN,
    label: "Claude Code",
    versionArgs: ["--version"],
    // claude print-mode reads the prompt from stdin; acceptEdits auto-applies file edits,
    // allowedTools scopes it to reading/editing files only (no shell, no network).
    build: prompt => ({
      args: ["-p", "--permission-mode", "acceptEdits", "--allowedTools", "Read,Edit,Write,Glob,Grep"],
      stdin: prompt
    })
  }
};

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml"
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (req.method === "GET" && url.pathname === "/api/health") return sendJson(res, 200, {
      ok: true,
      codex: engineAvailable("codex"),
      claude: engineAvailable("claude")
    });
    // /api/run is the unified endpoint; /api/codex kept as a backward-compatible alias
    if (req.method === "POST" && (url.pathname === "/api/run" || url.pathname === "/api/codex")) return handleRun(req, res);
    if (req.method !== "GET" && req.method !== "HEAD") return sendText(res, 405, "Method not allowed");
    return serveStatic(req, res, url.pathname);
  } catch (err) {
    sendJson(res, 500, { error: err.message || "Server error" });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Article Studio Codex backend running at http://127.0.0.1:${PORT}/index.html`);
});

async function handleRun(req, res) {
  const payload = await readJson(req);
  const engineKey = ENGINES[payload.engine] ? payload.engine : "codex";
  const engine = ENGINES[engineKey];

  if (!engineAvailable(engineKey)) {
    return sendJson(res, 400, { error: `\`${engine.bin}\` CLI (${engine.label}) was not found on PATH.` });
  }

  const article = payload.article || {};
  const prompt = payload.prompt || "";
  const fileName = safeArticleFile(article.file || article._file || `${slugify(article.title)}.md`);
  const articlePath = path.join(ARTICLES_DIR, fileName);

  fs.mkdirSync(ARTICLES_DIR, { recursive: true });
  fs.writeFileSync(articlePath, toFrontmatter({ ...article, file: fileName }), "utf8");

  const fullPrompt = [
    prompt,
    "",
    `You are ${engine.label}, running from Article Studio's local backend.`,
    `Edit this file directly: articles/${fileName}`,
    "",
    "Rules:",
    "- Preserve YAML front matter keys.",
    "- Preserve facts and do not invent event details.",
    "- Keep image links as relative paths.",
    "- Make the requested edit, then finish with a short summary.",
    "- Do not modify unrelated files."
  ].join("\n");

  const run = await runEngine(engineKey, fullPrompt);
  const updated = parseFrontmatter(fs.readFileSync(articlePath, "utf8"), article.id);
  updated._file = fileName;

  sendJson(res, 200, {
    engine: engineKey,
    result: {
      title: updated.title || article.title || "Untitled",
      summary: updated.summary || "",
      body: updated.body || "",
      notes: run.output.trim() || `${engine.label} finished.`
    },
    file: fileName,
    output: run.output
  });
}

function runEngine(engineKey, prompt) {
  const engine = ENGINES[engineKey];
  const { args, stdin } = engine.build(prompt);
  return new Promise((resolve, reject) => {
    const child = spawn(engine.bin, args, {
      cwd: ROOT,
      env: process.env,
      stdio: [stdin == null ? "ignore" : "pipe", "pipe", "pipe"]
    });
    let output = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`${engine.label} timed out after 10 minutes.`));
    }, 10 * 60 * 1000);

    child.stdout.on("data", chunk => { output += chunk.toString(); });
    child.stderr.on("data", chunk => { output += chunk.toString(); });
    child.on("error", err => { clearTimeout(timer); reject(err); });
    child.on("close", code => {
      clearTimeout(timer);
      if (code === 0) resolve({ output });
      else reject(new Error(output.trim() || `${engine.label} exited with code ${code}`));
    });

    if (stdin != null) { child.stdin.write(stdin); child.stdin.end(); }
  });
}

function engineAvailable(engineKey) {
  const engine = ENGINES[engineKey];
  if (!engine) return false;
  const check = spawnSync(engine.bin, engine.versionArgs, { encoding: "utf8" });
  return !check.error && check.status === 0;
}

function toFrontmatter(a) {
  const fm = [
    "---",
    `title: ${escYaml(a.title || "Untitled")}`,
    `platform: ${a.platform || "blog"}`,
    `status: ${a.status || "drafting"}`,
    `tags: [${(a.tags || []).map(t => escYaml(t)).join(", ")}]`,
    `summary: ${escYaml(a.summary || "")}`,
    `publishDate: ${a.publishDate || ""}`,
    `images: [${(a.images || []).map(im => escYaml(im.path || im.name || im)).join(", ")}]`,
    `imageTags: [${(a.images || []).filter(im => im && im.people && im.people.length).map(im => escYaml(`${im.path || im.name} :: ${im.people.join("; ")}`)).join(", ")}]`,
    `created: ${a.created || new Date().toISOString()}`,
    `updated: ${new Date().toISOString()}`,
    `id: ${a.id || uid()}`,
    "---",
    ""
  ].join("\n");
  return fm + (a.body || "");
}

function parseFrontmatter(text, fallbackId) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
  const a = { id: fallbackId || uid(), title: "Untitled", platform: "blog", status: "drafting", tags: [], summary: "", images: [], body: text };
  if (!m) return a;
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
      else a._imageTags = arr;
    } else if (["title", "platform", "status", "summary", "publishDate", "created", "updated", "id"].includes(key)) {
      a[key] = unesc(val);
    }
  }
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

function serveStatic(req, res, pathname) {
  const clean = decodeURIComponent(pathname === "/" ? "/index.html" : pathname);
  const target = path.normalize(path.join(ROOT, clean));
  if (!target.startsWith(ROOT)) return sendText(res, 403, "Forbidden");
  fs.stat(target, (err, stat) => {
    if (err || !stat.isFile()) return sendText(res, 404, "Not found");
    res.writeHead(200, { "Content-Type": MIME[path.extname(target).toLowerCase()] || "application/octet-stream" });
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(target).pipe(res);
  });
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 2_000_000) {
        req.destroy();
        reject(new Error("Request too large"));
      }
    });
    req.on("end", () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch (err) { reject(new Error("Invalid JSON")); }
    });
    req.on("error", reject);
  });
}

function safeArticleFile(name) {
  const base = path.basename(name || "untitled.md");
  const clean = base.replace(/[^\w.\-]/g, "-");
  return clean.endsWith(".md") ? clean : `${clean}.md`;
}

function slugify(s) {
  return (s || "untitled").toLowerCase().replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "untitled";
}

function escYaml(s) {
  s = (s == null ? "" : String(s));
  if (/[:#\[\]{}",]|^\s|\s$/.test(s)) return JSON.stringify(s);
  return s;
}

function unesc(s) {
  if (s.startsWith('"') && s.endsWith('"')) {
    try { return JSON.parse(s); } catch (e) {}
  }
  return s;
}

function uid() {
  return "a" + Math.random().toString(36).slice(2, 9);
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function sendText(res, status, body) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(body);
}
