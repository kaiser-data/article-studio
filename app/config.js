/* ============================================================
   Article Studio — content desk (served over http://localhost)
   Bridge to coding agents = Markdown files in a chosen folder
   ============================================================ */

const PLATFORMS = {
  linkedin: {
    label: "LinkedIn", color: "#7c9cff",
    specs: { "Sweet spot": "1300–2000 chars", "Hook limit": "~210 chars (before 'see more')", "Hashtags": "3–5", "Images": "1200×627 or square 1080" },
    tips: {
      "Hook & structure": [
        "<b>First 2 lines decide everything</b> — they show before 'see more'. Lead with a result, a tension, or a question.",
        "Write in <b>short 1–2 line paragraphs</b> with blank lines between — wall-of-text kills reach.",
        "End with one clear <b>question or CTA</b> to drive comments."
      ],
      "Reach mechanics": [
        "Put <b>external links in the first comment</b>, not the post — links in-body suppress reach.",
        "Front-load value; don't bury the point under a long preamble.",
        "<b>3–5 hashtags</b> max, at the end. Mix one broad + a few niche (#Toastmasters #PublicSpeaking #IT)."
      ],
      "Style": [
        "LinkedIn does NOT render markdown bold — use sparingly or Unicode bold for emphasis.",
        "Emoji as lightweight bullets (▸ ✅ →) reads well; don't overdo it.",
        "Document/carousel posts get strong dwell time for how-to IT content."
      ]
    }
  },
  medium: {
    label: "Medium", color: "#5fd0a0",
    specs: { "Ideal length": "~1600 words (7 min)", "Title": "H1", "Tags": "up to 5", "Cover": "1500px+ wide" },
    tips: {
      "Structure": [
        "Use a <b>strong H1 title + optional subtitle (kicker)</b>. Subheads (H2) every 200–300 words.",
        "Open with a <b>concrete scene or claim</b>, not 'In this article I will…'.",
        "Add a <b>pull quote</b> or bold takeaway to break the rhythm."
      ],
      "Craft": [
        "Markdown renders fully here — headings, lists, code blocks, blockquotes all work.",
        "Add a <b>relevant cover image</b> (≥1500px). It drives the preview card.",
        "Close with a takeaways list and a soft CTA (follow / subscribe)."
      ],
      "Discovery": [
        "Pick <b>5 specific tags</b> over broad ones (e.g. 'Kubernetes' > 'Tech').",
        "A clear, benefit-driven title beats clever wordplay for clicks."
      ]
    }
  },
  toastmasters: {
    label: "Toastmasters", color: "#ffcf5c",
    specs: { "Newsletter": "500–800 words", "Tone": "Encouraging, practical", "Audience": "Club members & guests" },
    tips: {
      "Voice": [
        "Warm, <b>encouraging, member-to-member</b> tone. Celebrate progress, not just polish.",
        "Tie back to <b>Pathways / evaluations / leadership</b> where relevant.",
        "Use a personal story or club moment as the anchor."
      ],
      "Structure": [
        "Clear <b>opening – body – call to action</b> (mirror a good speech).",
        "Give <b>3 practical takeaways</b> a reader can use at the next meeting.",
        "End by inviting them to a meeting / role / contest."
      ],
      "IT crossover": [
        "Great place to repurpose an IT talk into 'what speaking taught me about explaining tech'.",
        "Keep jargon light — mixed-audience newsletter."
      ]
    }
  },
  luma: {
    label: "Luma event", color: "#ff8a3d",
    specs: { "Cover": "16:9 (1920×1080)", "Title": "Clear + value prop", "Body": "Scannable, agenda-led" },
    tips: {
      "Event page": [
        "Title = <b>what + value</b> ('Hands-on Kubernetes Night — ship your first deploy').",
        "First line states <b>who it's for</b> and what they'll leave with.",
        "Add a short <b>agenda / timeline</b> and any prerequisites."
      ],
      "Conversion": [
        "<b>16:9 cover image</b> with the title legible as a thumbnail.",
        "List <b>hosts/speakers</b> with a one-line credibility note.",
        "Clear date, time, timezone, location/link + a single RSVP CTA."
      ],
      "Promo": [
        "Reuse the hook as your LinkedIn post; link the Luma page in the first comment.",
        "Post a recap afterward to feed the next event."
      ]
    }
  },
  blog: {
    label: "Blog / generic", color: "#9aa4b5",
    specs: { "Length": "flexible", "Format": "Full markdown", "SEO": "1 H1, descriptive H2s" },
    tips: {
      "Fundamentals": [
        "One <b>H1</b>, descriptive <b>H2/H3</b> hierarchy for skimmability and SEO.",
        "Lead with the answer; expand below (inverted pyramid).",
        "Add a meta description (use the Summary field in Meta tab)."
      ],
      "Craft": [
        "Code blocks for IT content; annotate why, not just what.",
        "One idea per paragraph; cut every sentence that doesn't earn its place."
      ]
    }
  }
};

const STATUSES = [
  { key: "idea",     label: "Ideas",    color: "var(--idea)" },
  { key: "drafting", label: "Drafting", color: "var(--draft)" },
  { key: "ready",    label: "Ready to publish", color: "var(--ready)" },
  { key: "posted",   label: "Posted",   color: "var(--posted)" }
];

const OFFICIAL_WRITING_SKILLS = {
  "none": {
    label: "No extra skill",
    blurb: "Use only the voice guide, task, and platform playbook.",
    prompt: ""
  },
  "linkedin-punchy": {
    label: "LinkedIn punchy",
    blurb: "Sharper hook, short paragraphs, practical CTA.",
    prompt: [
      "Write for LinkedIn with a strong first two lines, short 1-2 line paragraphs, and a concrete final question or CTA.",
      "Prefer plain language and visible momentum. Keep links out of the body unless the draft already needs them there."
    ].join("\n")
  },
  "medium-essay": {
    label: "Medium essay",
    blurb: "Narrative opening, clear sections, fuller argument.",
    prompt: [
      "Shape the draft like a Medium essay: concrete opening, clear section headings, developed argument, and a useful close.",
      "Keep the piece skimmable without reducing it to a checklist."
    ].join("\n")
  },
  "technical-explainer": {
    label: "Technical explainer",
    blurb: "Precise, structured, example-led.",
    prompt: [
      "Write as a technical explainer. Lead with the practical outcome, define terms before using them heavily, and use examples where they reduce ambiguity.",
      "Preserve technical accuracy. Do not simplify by removing important caveats."
    ].join("\n")
  },
  "personal-story": {
    label: "Personal story",
    blurb: "Scene, tension, reflection, takeaway.",
    prompt: [
      "Shape the piece around a personal story: start with a concrete moment, show the tension, then connect it to the lesson.",
      "Keep the reflection earned by the story instead of sounding generic."
    ].join("\n")
  },
  "toastmasters-warm": {
    label: "Toastmasters warm",
    blurb: "Encouraging member-to-member voice.",
    prompt: [
      "Write in a Toastmasters-friendly style: warm, practical, encouraging, and member-to-member.",
      "Celebrate progress, include a clear invitation, and avoid heavy jargon."
    ].join("\n")
  },
  "no-fluff-edit": {
    label: "No-fluff edit",
    blurb: "Tighter wording, fewer claims, direct flow.",
    prompt: [
      "Edit aggressively for clarity and density. Remove filler, throat-clearing, repeated points, and vague claims.",
      "Keep the author's meaning and voice, but make every paragraph earn its place."
    ].join("\n")
  },
  "german-native-english": {
    label: "German-native English polish",
    blurb: "Natural English without flattening the voice.",
    prompt: [
      "Polish English written by a German-native speaker. Keep it natural, direct, and idiomatic without making it sound corporate or over-Americanized.",
      "Fix stiffness, false friends, awkward article/preposition usage, and overly long sentence structures."
    ].join("\n")
  }
};

