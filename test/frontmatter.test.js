/* Round-trip test for the shared front-matter schema.
   Guards against the frontend/backend drift that used to silently drop fields.
   Run: npm test   (or: node test/frontmatter.test.js) */
const assert = require("assert");
const FM = require("../shared/frontmatter.js");

let passed = 0;
function check(name, fn) { fn(); passed++; console.log("  ✓ " + name); }

console.log("frontmatter round-trip:");

check("all fields survive a full round-trip", () => {
  const article = {
    id: "a123", title: "Hello: a Test", platform: "linkedin", status: "ready",
    tags: ["toastmasters", "it"], summary: "A summary, with a comma",
    publishDate: "2026-07-15",
    images: [
      { name: "a.jpg", path: "images/a.jpg", people: ["Jane Doe", "Bob"] },
      { name: "b.png", path: "images/b.png" }
    ],
    created: "2026-01-01T00:00:00.000Z", updated: "2026-02-02T00:00:00.000Z",
    body: "# Heading\n\nBody text with **bold**.\n"
  };
  const parsed = FM.parseFrontmatter(FM.toFrontmatter(article), "fallback");

  assert.strictEqual(parsed.title, article.title, "title");
  assert.strictEqual(parsed.platform, article.platform, "platform");
  assert.strictEqual(parsed.status, article.status, "status");
  assert.strictEqual(parsed.summary, article.summary, "summary (with comma)");
  assert.strictEqual(parsed.publishDate, article.publishDate, "publishDate");
  assert.strictEqual(parsed.id, article.id, "id");
  assert.strictEqual(parsed.created, article.created, "created");
  assert.deepStrictEqual(parsed.tags, article.tags, "tags");
  assert.strictEqual(parsed.body, article.body, "body");
  assert.strictEqual(parsed.images.length, 2, "image count");
  assert.strictEqual(parsed.images[0].path, "images/a.jpg", "image path");
  assert.deepStrictEqual(parsed.images[0].people, ["Jane Doe", "Bob"], "photo people tags");
  assert.strictEqual(parsed.images[1].people, undefined, "untagged photo has no people");
});

check("empty / missing article gets safe defaults", () => {
  const parsed = FM.parseFrontmatter(FM.toFrontmatter({}), "fb");
  assert.strictEqual(parsed.title, "Untitled");
  assert.strictEqual(parsed.platform, "blog");
  assert.deepStrictEqual(parsed.tags, []);
  assert.deepStrictEqual(parsed.images, []);
  assert.strictEqual(parsed.publishDate, "");
});

check("body without front-matter is preserved verbatim", () => {
  const raw = "just some text\nno frontmatter";
  const parsed = FM.parseFrontmatter(raw, "fb");
  assert.strictEqual(parsed.body, raw);
});

console.log(`\n${passed} checks passed.`);
