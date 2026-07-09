# Graph Report - article_publisher  (2026-07-09)

## Corpus Check
- 6 files · ~15,938 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 53 nodes · 61 edges · 8 communities (6 shown, 2 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `86229b14`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_package.json|package.json]]
- [[_COMMUNITY_server.js|server.js]]
- [[_COMMUNITY_Article Studio|Article Studio]]
- [[_COMMUNITY_frontmatter.js|frontmatter.js]]
- [[_COMMUNITY_handleRun|handleRun]]
- [[_COMMUNITY_frontmatter.test.js|frontmatter.test.js]]
- [[_COMMUNITY_sendText|sendText]]

## God Nodes (most connected - your core abstractions)
1. `Article Studio` - 7 edges
2. `handleRun()` - 6 edges
3. `toFrontmatter()` - 4 edges
4. `parseFrontmatter()` - 4 edges
5. `scripts` - 3 edges
6. `nowISO()` - 3 edges
7. `uid()` - 3 edges
8. `engines` - 2 edges
9. `runEngine()` - 2 edges
10. `engineAvailable()` - 2 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Import Cycles
- None detected.

## Communities (8 total, 2 thin omitted)

### Community 0 - "package.json"
Cohesion: 0.17
Nodes (11): description, engines, node, license, name, private, scripts, start (+3 more)

### Community 1 - "server.js"
Cohesion: 0.17
Nodes (10): ARTICLES_DIR, ENGINES, FM, fs, http, MIME, path, PORT (+2 more)

### Community 2 - "Article Studio"
Cohesion: 0.25
Nodes (7): Article Studio, Browser note, Development, Features, Folders, Run it, The agent bridge

### Community 3 - "frontmatter.js"
Cohesion: 0.46
Nodes (6): escYaml(), nowISO(), parseFrontmatter(), toFrontmatter(), uid(), unesc()

### Community 4 - "handleRun"
Cohesion: 0.33
Nodes (6): engineAvailable(), handleRun(), readJson(), runEngine(), safeArticleFile(), sendJson()

## Knowledge Gaps
- **27 isolated node(s):** `name`, `version`, `description`, `private`, `type` (+22 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What connects `name`, `version`, `description` to the rest of the system?**
  _27 weakly-connected nodes found - possible documentation gaps or missing edges._