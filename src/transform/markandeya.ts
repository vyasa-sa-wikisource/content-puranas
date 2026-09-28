#!/usr/bin/env bun
/**
 * Turn the Mārkaṇḍeya wikitext snapshot into a Vyasa workspace.
 *
 * Usage:
 *   bun run transform:markandeya
 *   bun run src/transform/markandeya.ts --dry-run
 *
 * Each wiki page holds several adhyāyas. Verse numbers are either
 * chapter.verse (॥६१.१॥) or a bare number after । । . Two stretches are
 * both numbered 91–93: the Devīmāhātmya close, then the narrative that
 * follows it. Both are kept, in that reading order.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { emitFacetAnnotations } from "./facets";

const RAW_DIR = path.resolve("data/raw/markandeya-purana/wikitext");
const WORKSPACE_DIR = path.resolve("data/processed/markandeya-purana");
const CONTENT_DIR = path.join(WORKSPACE_DIR, "content", "mula");
const ANNOTATIONS_DIR = path.join(WORKSPACE_DIR, "annotations");

const DEV_TO_ARABIC: Record<string, string> = {
  "०": "0",
  "१": "1",
  "२": "2",
  "३": "3",
  "४": "4",
  "५": "5",
  "६": "6",
  "७": "7",
  "८": "8",
  "९": "9",
};

export interface VerseUnit {
  printed: number;
  kind: "verse" | "colophon";
  text: string;
  speaker: string | null;
  meter: string | null;
}

export interface ParsedChapter {
  /** Wikisource chapter number, from the verse label or the colophon. */
  printed: number;
  preface: string;
  units: VerseUnit[];
  /** True when a verse label named this chapter, as in ॥६९.५३॥. */
  fromDotted: boolean;
}

interface BundleRange {
  from: number;
  to: number;
}

export function devanagariToArabic(str: string): string {
  return str.replace(/[०-९]/g, (ch) => DEV_TO_ARABIC[ch] ?? ch);
}

function toInt(raw: string): number {
  return Number(devanagariToArabic(raw));
}

function stripBalanced(source: string, open: string, close: string): string {
  let out = "";
  let i = 0;
  while (i < source.length) {
    if (source.startsWith(open, i)) {
      let depth = 1;
      i += open.length;
      while (i < source.length && depth > 0) {
        if (source.startsWith(open, i)) {
          depth += 1;
          i += open.length;
        } else if (source.startsWith(close, i)) {
          depth -= 1;
          i += close.length;
        } else {
          i += 1;
        }
      }
      continue;
    }
    out += source[i];
    i += 1;
  }
  return out;
}

export function stripWikitext(source: string): string {
  let text = source.replace(/\r\n/g, "\n");
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = stripBalanced(text, "{{", "}}");
  text = text.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2");
  text = text.replace(/\[\[[^\]]+\]\]/g, "");
  text = text.replace(/\[https?:\/\/[^\]]+\]/g, "");
  text = text.replace(/<\/?(?:poem|center|div|span|br)\b[^>]*>/gi, "");
  text = text.replace(/<ref\b[^>]*>[\s\S]*?<\/ref>/gi, "");
  text = text.replace(/'{2,}/g, "");
  text = text.replace(/<[^>]+>/g, "");
  return text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

const SPEAKER_LINE =
  /^[\s\u00a0;]*([\u0900-\u097F][\u0900-\u097F\s\u200c\u200d\u200b.'’-]{0,80}(?:उवाच|ोवाच|रुवाच|ऊचुः))\s*[-–—।:]*\s*$/;
const METER_LINE = /^\s*\(([^)]+)\)\s*$/;

function isChromeLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (/^[०-९0-9]+$/.test(t)) return true;
  if (/^[०-९0-9]+\s*\(\s*[०-९0-9]+\s*\)$/.test(t)) return true;
  // Avagraha hides the अ: प्रथमोऽध्यायः is …ोऽध्यायः, not …अध्यायः.
  if (/ध्याय/.test(t) && !/^इति\s/u.test(t) && t.length < 80 && !/[।॥]/.test(t)) return true;
  if (/वर्णनम्\s*$/.test(t) && t.length < 80 && !/[।॥]/.test(t)) return true;
  if (/मङ्गलम्\s*$/.test(t) && t.length < 40 && !/[।॥]/.test(t)) return true;
  return false;
}

function takeSpeakerAndMeter(chunk: string): { speaker: string | null; meter: string | null; text: string } {
  const lines = chunk.split("\n");
  const speakers: string[] = [];
  let meter: string | null = null;
  const body: string[] = [];
  for (const line of lines) {
    if (!line.trim()) {
      if (body.length > 0) body.push(line);
      continue;
    }
    if (isChromeLine(line) && body.length === 0) continue;
    const speaker = line.match(SPEAKER_LINE);
    const meterMatch = line.match(METER_LINE);
    if (speaker && body.length === 0) {
      speakers.push(speaker[1]!.replace(/\s+/g, " ").trim());
      continue;
    }
    if (meterMatch && body.length === 0 && !meter) {
      meter = meterMatch[1]!.trim();
      continue;
    }
    body.push(line);
  }
  return {
    speaker: speakers.length ? speakers.join("\n") : null,
    meter,
    text: body.join("\n").replace(/\n{3,}/g, "\n\n").trim(),
  };
}

function headingNumber(chunk: string, range: BundleRange): number | null {
  let found: number | null = null;
  for (const line of chunk.split("\n")) {
    const t = line.trim();
    const paren = t.match(/^[०-९0-9]+\s*\(\s*([०-९0-9]+)\s*\)$/);
    if (paren) {
      const n = toInt(paren[1]!);
      if (inRange(n, range)) found = n;
      continue;
    }
    const only = t.match(/^([०-९0-9]+)$/);
    if (only) {
      const n = toInt(only[1]!);
      if (inRange(n, range)) found = n;
      continue;
    }
    const labeled = t.match(/अध्यायः\s*[-–—]?\s*([०-९0-9]+)/);
    if (labeled && !/^इति\s/u.test(t)) {
      const n = toInt(labeled[1]!);
      if (inRange(n, range)) found = n;
    }
  }
  return found;
}

function colophonNumber(text: string): number | null {
  const m = text.match(/([०-९0-9]+)\s*[।.]?\s*$/);
  if (!m) return null;
  const n = toInt(m[1]!);
  if (n < 1 || n > 200) return null;
  return n;
}

const VERSE_END =
  /॥\s*मंगल\s*([०-९0-9]+)\s*॥|॥\s*([०-९0-9]+)\s*\.\s*([०-९0-9]+)\s*॥|।\s*।\s*([०-९0-9]+)\s*\.\s*([०-९0-9]+)(?:[ \t]+([०-९0-9]+))?|।।\s*([०-९0-9]+)\s*।।|।\s*।\s*([०-९0-9])[ \t]+([०-९0-9]+)(?=[ \t]|$)|।\s*।\s*([०-९0-9]+)(?=\s|$)|।\s*([०-९0-9]{2,3})\s*\.\s*([०-९0-9]+)/g;

interface Segment {
  heading: number | null;
  dotted: number | null;
  colophonNo: number | null;
  preface: string;
  units: VerseUnit[];
}

function inRange(n: number, range: BundleRange): boolean {
  return n >= range.from && n <= range.to;
}

function printedOf(seg: Segment, range: BundleRange): number | null {
  if (seg.dotted != null && inRange(seg.dotted, range)) return seg.dotted;
  if (seg.colophonNo != null && inRange(seg.colophonNo, range)) return seg.colophonNo;
  if (seg.heading != null && inRange(seg.heading, range)) return seg.heading;
  if (seg.dotted != null) return seg.dotted;
  if (seg.colophonNo != null && seg.colophonNo >= range.from) return seg.colophonNo;
  return null;
}

export function parseBundle(wikitext: string, range: BundleRange): ParsedChapter[] {
  const text = stripWikitext(wikitext);
  const segments: Segment[] = [];
  let current: Segment = { heading: null, dotted: null, colophonNo: null, preface: "", units: [] };

  const pushCurrent = () => {
    if (current.units.length === 0 && !current.preface) return;
    segments.push(current);
    current = { heading: null, dotted: null, colophonNo: null, preface: "", units: [] };
  };

  let cursor = 0;
  for (const match of text.matchAll(VERSE_END)) {
    const start = match.index ?? 0;
    let chunk = text.slice(cursor, start);
    const coloAt = chunk.search(/इति\s+श्री/u);
    if (coloAt >= 0 && (current.units.length > 0 || current.preface)) {
      const coloText = chunk.slice(coloAt).split(/\n\s*\n/)[0]!.trim();
      current.colophonNo = colophonNumber(coloText) ?? current.colophonNo;
      current.units.push({
        printed: 0,
        kind: "colophon",
        text: coloText,
        speaker: null,
        meter: null,
      });
      pushCurrent();
      chunk = chunk.slice(coloAt + coloText.length);
    }
    const heading = headingNumber(chunk, range);
    const dotted = match[2] ? toInt(match[2]) : match[4] ? toInt(match[4]) : match[11] ? toInt(match[11]) : null;
    const verseNo = match[3]
      ? toInt(match[3])
      : match[5]
        ? toInt(`${match[5]}${match[6] ?? ""}`)
        : match[12]
          ? toInt(match[12])
          : null;
    const bare = match[7]
      ? toInt(match[7])
      : match[8]
        ? toInt(`${match[8]}${match[9]}`)
        : match[10]
          ? toInt(match[10])
          : null;
    const mangala = match[1] ? toInt(match[1]) : null;

    const chapterChanged =
      (dotted != null && current.dotted != null && dotted !== current.dotted) ||
      (heading != null && current.units.length > 0 && heading !== current.heading);
    if (chapterChanged) pushCurrent();
    if (heading != null) current.heading = heading;
    if (dotted != null) current.dotted = dotted;

    const taken = takeSpeakerAndMeter(chunk);
    if (mangala != null) {
      if (taken.text) current.units.push({ printed: mangala, kind: "verse", ...taken });
    } else if (taken.text) {
      const kind = /^इति\s+श्री/u.test(taken.text) ? "colophon" : "verse";
      const printed = verseNo ?? bare ?? 0;
      if (kind === "colophon") {
        current.colophonNo = colophonNumber(taken.text) ?? current.colophonNo;
        current.units.push({ printed: 0, kind, ...taken });
        cursor = start + match[0].length;
        pushCurrent();
        continue;
      } else if (printed > 0) {
        current.units.push({ printed, kind, ...taken });
      }
    }
    cursor = start + match[0].length;
  }
  const tail = text.slice(cursor).trim();
  if (/^इति\s+श्री/u.test(tail)) {
    current.colophonNo = colophonNumber(tail) ?? current.colophonNo;
    current.units.push({ printed: 0, kind: "colophon", text: tail, speaker: null, meter: null });
  }
  pushCurrent();

  const chapters: ParsedChapter[] = [];
  for (const seg of segments) {
    const printed = printedOf(seg, range);
    if (printed == null) continue;
    if (printed < range.from) continue;
    const verses = seg.units.filter((unit) => unit.kind === "verse");
    if (verses.length === 0) continue;
    chapters.push({
      printed,
      preface: seg.preface,
      units: seg.units,
      fromDotted: seg.dotted != null,
    });
  }
  return attachBarePrefix(chapters);
}

function versePrinted(chapter: ParsedChapter): number[] {
  return chapter.units.filter((unit) => unit.kind === "verse").map((unit) => unit.printed);
}

/** Bare । । n verses just before ॥69.53॥ belong to chapter 69, not to a second numbering. */
function attachBarePrefix(chapters: ParsedChapter[]): ParsedChapter[] {
  const out: ParsedChapter[] = [];
  for (let i = 0; i < chapters.length; i++) {
    const chapter = chapters[i]!;
    const next = chapters[i + 1];
    if (!chapter.fromDotted && next?.fromDotted) {
      const bare = versePrinted(chapter);
      const dotted = versePrinted(next);
      const maxBare = Math.max(...bare);
      const minDotted = Math.min(...dotted);
      if (bare.length > 0 && maxBare < minDotted) {
        mergeChapters(next, chapter);
        continue;
      }
    }
    if (!chapter.fromDotted && chapters.some((item) => item.fromDotted)) continue;
    out.push(chapter);
  }
  return out;
}

function versePrefix(chapter: ParsedChapter): string {
  const verse = chapter.units.find((unit) => unit.kind === "verse");
  return verse?.text.slice(0, 32) ?? "";
}

function overlaps(a: ParsedChapter, b: ParsedChapter): boolean {
  if (a.printed !== b.printed) return false;
  const bVerses = b.units.filter((unit) => unit.kind === "verse");
  for (const verse of bVerses) {
    const hit = a.units.find((unit) => unit.kind === "verse" && unit.printed === verse.printed);
    if (hit && hit.text.slice(0, 24) === verse.text.slice(0, 24)) return true;
  }
  return versePrefix(a) !== "" && versePrefix(a) === versePrefix(b);
}

function mergeChapters(into: ParsedChapter, extra: ParsedChapter): void {
  if (!into.preface && extra.preface) into.preface = extra.preface;
  const have = new Set(
    into.units.filter((unit) => unit.kind === "verse").map((unit) => unit.printed),
  );
  const colophon = into.units.some((unit) => unit.kind === "colophon");
  const additions = extra.units.filter((unit) => {
    if (unit.kind === "colophon") return !colophon;
    return !have.has(unit.printed);
  });
  const verses = [...into.units.filter((unit) => unit.kind === "verse"), ...additions.filter((u) => u.kind === "verse")];
  verses.sort((a, b) => a.printed - b.printed);
  const colophons = [
    ...into.units.filter((unit) => unit.kind === "colophon"),
    ...additions.filter((unit) => unit.kind === "colophon"),
  ].slice(0, 1);
  into.units = [...verses, ...colophons];
}

/** Reading order. A repeated chapter number is a second stretch, not a replacement. */
export function assemble(groups: ParsedChapter[][]): ParsedChapter[] {
  const chapters: ParsedChapter[] = [];
  for (const group of groups) {
    for (const chapter of group) {
      const same = chapters.findIndex((existing) => overlaps(existing, chapter));
      if (same >= 0) {
        mergeChapters(chapters[same]!, chapter);
        continue;
      }
      const seen = chapters.some((existing) => existing.printed === chapter.printed);
      if (!seen) {
        const idx = chapters.findIndex((existing) => existing.printed > chapter.printed);
        if (idx >= 0) {
          chapters.splice(idx, 0, chapter);
          continue;
        }
      }
      chapters.push(chapter);
    }
  }
  return chapters;
}

function emitBlock(cmd: string, arg: number | null, body: string): string {
  const head = arg == null ? `\`${cmd}` : `\`${cmd} ${arg}`;
  const delimiter = body.includes("]") || body.includes("`") ? " ;B" : "";
  const close = delimiter ? "]B" : "]";
  const open = delimiter ? `${head}${delimiter} [` : `${head} [`;
  return `${open}\n${body}\n${close}`;
}

export function emitChapter(chapter: ParsedChapter): string {
  const parts: string[] = [];
  if (chapter.preface) parts.push(emitBlock("preface", null, chapter.preface));
  let verse = 0;
  for (const unit of chapter.units) {
    if (unit.speaker) parts.push(emitBlock("speaker", null, unit.speaker));
    if (unit.meter) parts.push(emitBlock("meter", null, unit.meter));
    if (unit.kind === "colophon") {
      parts.push(emitBlock("colophon", null, unit.text));
      continue;
    }
    verse += 1;
    parts.push(emitBlock("verse", verse, unit.text));
  }
  return parts.join("\n\n") + "\n";
}

async function loadBundles(): Promise<Array<{ from: number; to: number; wikitext: string }>> {
  const manifest = JSON.parse(await fs.readFile(path.join(RAW_DIR, "manifest.json"), "utf8")) as Array<{
    from: number;
    to: number;
    file: string;
  }>;
  const bundles = [];
  for (const row of manifest) {
    const json = JSON.parse(await fs.readFile(path.join(RAW_DIR, row.file), "utf8")) as {
      parse?: { wikitext?: string };
    };
    if (!json.parse?.wikitext) throw new Error(`No wikitext in ${row.file}`);
    bundles.push({ from: row.from, to: row.to, wikitext: json.parse.wikitext });
  }
  return bundles;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const bundles = await loadBundles();
  const chapters = assemble(bundles.map((bundle) => parseBundle(bundle.wikitext, bundle)));
  let verses = 0;
  let colophons = 0;
  const printed: number[] = [];
  for (const chapter of chapters) {
    const verseCount = chapter.units.filter((unit) => unit.kind === "verse").length;
    verses += verseCount;
    colophons += chapter.units.length - verseCount;
    printed.push(chapter.printed);
  }
  const missing = [];
  for (let n = 1; n <= 134; n++) if (!printed.includes(n)) missing.push(n);
  console.log(
    `[Transform] ${chapters.length} adhyāyas in reading order, ${verses} verses, ${colophons} colophons`,
  );
  console.log(`[Transform] printed numbers: ${printed.join(",")}`);
  if (missing.length) console.log(`[Transform] missing printed numbers: ${missing.join(",")}`);
  if (dryRun) {
    console.log("[Transform] dry-run: wrote nothing");
    return;
  }
  for (let i = 0; i < chapters.length; i++) {
    const file = `${String(i + 1).padStart(3, "0")}.vy`;
    const dest = path.join(CONTENT_DIR, file);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, emitChapter(chapters[i]!));
    const notes = emitFacetAnnotations([i + 1], chapters[i]!.units);
    if (notes) {
      const ann = path.join(ANNOTATIONS_DIR, file);
      await fs.mkdir(path.dirname(ann), { recursive: true });
      await fs.writeFile(ann, notes);
    }
  }
  console.log(`[Transform] wrote ${CONTENT_DIR}`);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
