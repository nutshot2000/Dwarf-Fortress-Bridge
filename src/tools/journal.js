// Tools: the fort journal (see src/journal.js) and the chapters written from it (STORYTELLING.md).
import fs from "node:fs";
import path from "node:path";
import { tool, text, fail, json, z, luaFile } from "../core.js";
import { JOURNAL, ASK, fortInfo, fortJournal, setChoice, readEntries, readQuotes, readCast, writeCast, addEntry, castBeats, intro } from "../journal.js";

const SEASONS = ["Spring", "Summer", "Autumn", "Winter"];
const GUIDE = (() => {
  try { return fs.readFileSync(new URL("../../STORYTELLING.md", import.meta.url), "utf8"); }
  catch { return "Write only what happened; open on a situation; introduce dwarves when they act; end on a hook."; }
})();
const line = (e) => `${e.date}: ${e.kind === "note" ? `[overseer] ${e.text}` : e.text}${e.shot ? ` (photo ${e.shot})` : ""}`;
const bareName = (d) => d.name.replace(/, .*$/, "").replace(/ "[^"]*"$/, "");
const later = (a, b) => a.year > b.year || (a.year === b.year && a.tick > b.tick);

/** Make sure the cast exists (a fresh journal starts with everyone's introduction). */
async function ready() {
  const j = await fortJournal();
  if (!readCast(j.dir)) {
    const { value: c } = await luaFile("journal", { action: "cast" });
    if (c?.cast) await castBeats(j, c.cast);
  }
  return j;
}

/** The dwarves an entry is about: listed units (not the whole founding cast) or a full name in the text. */
function mentions(e, dwarves) {
  if (e.kind === "founding") return [];
  return dwarves.filter((d) => e.units?.includes(d.id) || e.text.includes(bareName(d)));
}

// The rarest lines a dwarf ever said are the strange and funny ones; generic ones repeat endlessly.
function rarest(quotes, from, n) {
  const said = new Map();
  for (const q of quotes) said.set(q.text, (said.get(q.text) ?? 0) + 1);
  return [...new Map(from.filter((q) => said.get(q.text) === 1).map((q) => [q.text, q])).values()].slice(0, n);
}

// ---- chapters ---------------------------------------------------------------------------------------------------

const chaptersDir = (j) => { const d = path.join(j.dir, "chapters"); fs.mkdirSync(d, { recursive: true }); return d; };
const readIndex = (j) => { try { return JSON.parse(fs.readFileSync(path.join(chaptersDir(j), "index.json"), "utf8")); }
  catch { return { chapters: [], introduced: [] }; } };
const writeIndex = (j, idx) => fs.writeFileSync(path.join(chaptersDir(j), "index.json"), JSON.stringify(idx, null, 1));

const TONES = {
  funny: "funny: the deadpan, darkly comic narrator of the guide (the default)",
  dramatic: "dramatic: tension and loss carry this chapter; humour only in the margins",
  epic: "epic: a saga voice for sieges, megabeasts and last stands; grand, but every claim still true",
};

/** Everything that happened since the last chapter, the people in it and how to tell it. */
function chapterMaterial(j, tone = "funny") {
  const book = readCast(j.dir) ?? { dwarves: {} };
  const dwarves = Object.values(book.dwarves);
  const idx = readIndex(j);
  const prev = idx.chapters.at(-1);
  const entries = readEntries(j.dir);
  const es = entries.slice(prev?.entries_until ?? 0);
  const quotes = readQuotes(j.dir);
  const qs = prev?.until ? quotes.filter((q) => q.tick !== undefined && later(q, prev.until)) : quotes;
  if (!es.length && !qs.length) return { nothing_new: `Nothing has happened since chapter ${prev?.n}. Let time run (df_wait) first.` };
  const met = new Set(idx.introduced);
  const inChapter = new Map();
  for (const e of es) for (const d of mentions(e, dwarves)) inChapter.set(d.id, d);
  const crafts = es.filter((e) => e.kind === "craft");
  const events = es.filter((e) => e.kind !== "craft" && e.kind !== "founding").map(line);
  if (crafts.length) events.push(`(${crafts.length} masterpiece${crafts.length > 1 ? "s" : ""} made: ${crafts.slice(0, 4).map((c) => c.text).join("; ")})`);
  const founding = es.find((e) => e.kind === "founding");
  const prevText = prev ? (() => { try { return fs.readFileSync(path.join(chaptersDir(j), prev.file), "utf8"); } catch { return ""; } })() : "";
  return {
    chapter: (prev?.n ?? 0) + 1, from: prev?.date ?? book.founded, to: j.date.text, fort: j.fort, world: j.world,
    tone: TONES[tone],
    situation: founding ? `This is the start of the journal: ${founding.text} Open on what is happening now, not on the founders.` : undefined,
    events: events.length ? events : ["(no recorded events: build the chapter from the overseer's notes and what the dwarves say)"],
    new_characters: [...inChapter.values()].filter((d) => !met.has(d.id)).map((d) => ({ id: d.id, name: d.name, intro: d.intro, fate: d.fate })),
    returning_characters: [...inChapter.values()].filter((d) => met.has(d.id)).map((d) => `${d.name}${d.fate ? ` (${d.fate})` : ""}`),
    // dwarves the story has not met yet, for when the chapter needs someone (the founders, early on)
    not_yet_met: dwarves.filter((d) => !met.has(d.id) && !inChapter.has(d.id) && !d.gone).slice(0, 30)
      .map((d) => `#${d.id} ${d.name}: ${d.intro.split(". ").slice(1, 3).join(". ")}`),
    overheard: rarest(quotes, qs, 6).map((q) => `"${q.text}" (${q.speaker}, ${q.role.toLowerCase()})`),
    photos: es.filter((e) => e.shot).map((e) => `${e.shot}: ${e.text}`),
    previous_chapter_ending: prevText ? prevText.slice(-500) : undefined,
    next_step: "Write the chapter by the guide below, then df_journal save_chapter title=... text=... (plain paragraphs).",
    guide: GUIDE,
  };
}

function saveChapter(j, title, body) {
  const idx = readIndex(j);
  const book = readCast(j.dir) ?? { dwarves: {} };
  const n = (idx.chapters.at(-1)?.n ?? 0) + 1;
  const file = `${String(n).padStart(2, "0")} - ${title.replace(/[<>:"/\\|?*\x00-\x1f]/g, "").slice(0, 60).trim()}.md`;
  fs.writeFileSync(path.join(chaptersDir(j), file), `Chapter ${n}: ${title}\n\n${body.trim()}\n`);
  // whoever the chapter names (full name, or first name when unambiguous) has now been met
  const firsts = new Map();
  for (const d of Object.values(book.dwarves)) firsts.set(d.first_name, (firsts.get(d.first_name) ?? 0) + 1);
  const named = Object.values(book.dwarves).filter((d) => body.includes(bareName(d))
    || (firsts.get(d.first_name) === 1 && new RegExp(`\\b${d.first_name}\\b`).test(body))).map((d) => d.id);
  idx.introduced = [...new Set([...idx.introduced, ...named])];
  idx.chapters.push({ n, title, file, date: j.date.text, until: { year: j.date.year, tick: j.date.tick },
    entries_until: readEntries(j.dir).length });
  writeIndex(j, idx);
  return { saved: path.join(chaptersDir(j), file), chapter: n, characters_met: named.length };
}

// ---- the chronicle (the raw record, readable) -------------------------------------------------------------------

function story(j) {
  const book = readCast(j.dir) ?? { dwarves: {} };
  const entries = readEntries(j.dir);
  const quotes = readQuotes(j.dir);
  const dwarves = Object.values(book.dwarves);
  const out = [`# ${j.fort}`, "", `*A chronicle of ${j.fort} in ${j.world}, from ${book.founded ?? entries[0]?.date ?? "its founding"} to ${j.date.text}.*`, ""];
  const met = new Set();
  const years = [...new Set([...entries.map((e) => e.year), ...quotes.map((q) => q.year)])].sort((a, b) => a - b);
  for (const y of years) {
    out.push(`## Year ${y}`, "");
    for (const season of SEASONS) {
      const es = entries.filter((e) => e.year === y && e.season === season);
      const qs = quotes.filter((q) => q.year === y && q.season === season);
      if (!es.length && !qs.length) continue;
      out.push(`### ${season}`, "");
      const crafts = es.filter((e) => e.kind === "craft");
      for (const e of es.filter((e) => e.kind !== "craft")) {
        out.push(e.kind === "note" ? `> ${e.text}` : `- ${e.text}`);
        // a dwarf is introduced where the story first meets them
        for (const d of mentions(e, dwarves)) if (!met.has(d.id)) { met.add(d.id); out.push(`  *${d.intro}*`); }
        if (e.shot) out.push("", `![${e.text.replace(/[[\]]/g, "")}](${e.shot})`, "");
        if (e.kind === "note") out.push("");
      }
      if (crafts.length) out.push(`- ${crafts.length === 1 ? "A masterpiece was" : `${crafts.length} masterpieces were`} made${crafts.length <= 3 ? `: ${crafts.map((c) => c.text.replace(/ has created a masterpiece /, ": ").replace(/!$/, "")).join("; ")}` : ""}.`);
      const rare = rarest(quotes, qs, 3);
      if (rare.length) out.push("", "*Overheard:*", ...rare.map((q) => `- "${q.text}" (${q.speaker}, ${q.role.toLowerCase()})`));
      out.push("");
    }
  }
  out.push("## Who's who", "");
  for (const d of dwarves.filter((d) => !d.gone)) out.push(`**${d.name}**: ${d.intro}${d.first_seen !== book.founded ? ` *(arrived ${d.first_seen})*` : ""}`, "");
  const lost = dwarves.filter((d) => d.gone);
  if (lost.length) {
    out.push("### Remembered", "");
    for (const d of lost) out.push(`**${d.name}**: ${d.intro} *${d.fate ?? ""}*`, "");
  }
  const file = path.join(j.dir, "chronicle.md");
  fs.writeFileSync(file, out.join("\n"));
  // the written chapters, in order, as one book
  const idx = readIndex(j);
  let bookFile;
  if (idx.chapters.length) {
    bookFile = path.join(j.dir, "book.md");
    const chapters = idx.chapters.map((c) => { try { return fs.readFileSync(path.join(chaptersDir(j), c.file), "utf8").trim(); } catch { return ""; } });
    fs.writeFileSync(bookFile, [`The Chronicle of ${j.fort}`, "", ...chapters.flatMap((c) => [c, ""])].join("\n"));
  }
  return { chronicle: file, book: bookFile, chapters: idx.chapters.length, dwarves: dwarves.length, remembered: lost.length,
    entries: entries.length, quotes: quotes.length, photos: entries.filter((e) => e.shot).length };
}

tool("df_journal", "The fort's journal: a record of its life to tell as a story (books, narrated videos). It is the player's choice per fort: a new fort starts undecided and df_wait says so; ask the player once, then action=enable or action=disable (they can change their mind later; DF_JOURNAL=on/off overrides for every fort). Once enabled, df_wait fills it automatically: deaths (cause, killer), arrivals with a short introduction of each dwarf, lovers, marriages, births, first kills, legendary skills, dreams come true, offices, breakdowns, moods and artifacts, sieges and megabeasts (screenshots of the biggest moments), and every line a dwarf says. write: YOUR note, what you decided and why, what went wrong, what was funny (tags e.g. funny, mistake). intro unit_id: a dwarf's sketch, introduction and story so far; with text, replaces the introduction with yours. chapter: everything since the last chapter, who appears (new and returning), the best overheard lines and the storytelling guide; write the chapter from it and keep it with save_chapter title=... text=... (plain prose, it may be read aloud). read: recent entries (unit_id or kind filter). cast: everyone's introduction. story: writes chronicle.md (the record, dwarves introduced where they first appear, who's who at the back) and book.md (the chapters). Files: DF_JOURNAL_DIR (default Documents/df-journals), one folder per fort.",
  { action: z.enum(["status", "enable", "disable", "read", "write", "intro", "cast", "chapter", "save_chapter", "story"]).default("status"),
    text: z.string().max(12000).optional(), title: z.string().max(120).optional(), unit_id: z.number().int().optional(),
    unit_ids: z.array(z.number().int()).optional(), tags: z.array(z.string()).optional(), kind: z.string().optional(),
    limit: z.number().int().min(1).max(200).optional(),
    tone: z.enum(["funny", "dramatic", "epic"]).optional().describe("chapter: the narrator's voice; funny (deadpan dark comedy) unless the player or the events call for another") },
  async (a) => {
    if (JOURNAL.mode === "off") return fail("The journal is off for every fort (DF_JOURNAL=off in the server settings).");
    const info = await fortInfo();
    if (a.action === "enable" || a.action === "disable") {
      if (JOURNAL.mode === "on") return fail("DF_JOURNAL=on keeps a journal for every fort; change the server setting to choose per fort.");
      setChoice(info, a.action === "enable" ? "on" : "off");
      if (a.action === "disable") return text(`No journal for ${info.fort}. Nothing will be recorded (df_journal action=enable to start one later).`);
      const j = await ready();
      return text(`Journal on for ${info.fort}: ${Object.keys(readCast(j.dir).dwarves).length} dwarves introduced, kept in ${j.dir}.`);
    }
    if (info.choice === "off") return fail(`The player chose no journal for ${info.fort}. df_journal action=enable if they change their mind.`);
    if (info.choice !== "on") return fail(ASK.replace(/^Journal: /, ""));
    const j = await ready();
    const book = readCast(j.dir);
    if (a.action === "write") {
      if (!a.text) return fail("write needs text: your note, in a sentence or a few.");
      const e = addEntry(j.dir, j.date, { kind: "note", text: a.text, units: a.unit_ids ?? (a.unit_id !== undefined ? [a.unit_id] : undefined), tags: a.tags });
      return text(`Noted (${e.date}).`);
    }
    if (a.action === "intro") {
      if (a.unit_id === undefined) return fail("intro needs unit_id.");
      const d = book.dwarves[a.unit_id];
      if (!d) return fail(`Unit ${a.unit_id} is not in the journal's cast (citizens only).`);
      if (a.text) { d.intro = a.text.trim(); d.intro_by = "overseer"; writeCast(j.dir, book); return text(`Introduction of ${d.name} replaced.`); }
      const { value: s } = await luaFile("journal", { action: "sketch", unit_id: a.unit_id });
      const mine = readEntries(j.dir).filter((e) => e.units?.includes(a.unit_id) || e.text.includes(bareName(d))).slice(-15).map(line);
      return text(json({ introduction: d.intro, written_by: d.intro_by ?? "journal", first_seen: d.first_seen, fate: d.fate,
        fresh_draft: s && !s.error ? intro(s) : undefined, sketch: s, story_so_far: mine }));
    }
    if (a.action === "cast") {
      const ds = Object.values(book.dwarves);
      return text(ds.map((d) => `#${d.id} ${d.name}${d.gone ? ` [${d.gone}]` : ""}: ${d.intro}`).join("\n\n") || "No cast yet.");
    }
    if (a.action === "read") {
      let es = readEntries(j.dir);
      if (a.unit_id !== undefined) { const d = book.dwarves[a.unit_id]; es = es.filter((e) => e.units?.includes(a.unit_id) || (d && e.text.includes(bareName(d)))); }
      if (a.kind) es = es.filter((e) => e.kind === a.kind);
      return text(es.slice(-(a.limit ?? 30)).map(line).join("\n") || "No entries yet.");
    }
    if (a.action === "chapter") return text(json(chapterMaterial(j, a.tone)));
    if (a.action === "save_chapter") {
      if (!a.title || !a.text) return fail("save_chapter needs title and text (the chapter's prose).");
      return text(json(saveChapter(j, a.title, a.text)));
    }
    if (a.action === "story") return text(json(story(j)));
    const es = readEntries(j.dir);
    const kinds = {};
    for (const e of es) kinds[e.kind] = (kinds[e.kind] ?? 0) + 1;
    return text(json({ folder: j.dir, fort: j.fort, world: j.world, since: book.founded, entries: es.length, by_kind: kinds,
      dwarves: Object.keys(book.dwarves).length, overheard: readQuotes(j.dir).length, chapters: readIndex(j).chapters.length,
      hint: "df_journal write after anything notable; intro unit_id=... to meet a dwarf; chapter, then save_chapter, to tell the story." }));
  });
