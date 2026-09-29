#!/usr/bin/env bun
/**
 * Turn the Garuḍa Purāṇa wikitext snapshot into a Vyasa workspace.
 *
 * Usage:
 *   bun run transform:garuda
 *   bun run src/transform/garuda.ts --dry-run
 *
 * Ācāra numbers verses as ।। 2.1 ।।. Preta and Brahma kāṇḍas use ॥ २,१.१ ॥.
 * The kāṇḍa and adhyāya ids come from the path.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { emitFacetAnnotations } from "./facets";

const RAW_DIR = path.resolve("data/raw/garuda-purana/wikitext");
const WORKSPACE_DIR = path.resolve("data/processed/garuda-purana");
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
  preface: string;
  units: VerseUnit[];
}

export function devanagariToArabic(str: string): string {
  return str.replace(/[०-९]/g, (ch) => DEV_TO_ARABIC[ch] ?? ch);
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
  text = text.replace(/<center\b[^>]*>[\s\S]*?<\/center>/gi, "");
  text = stripBalanced(text, "{{", "}}");
  text = text.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2");
  text = text.replace(/\[\[[^\]]+\]\]/g, "");
  text = text.replace(/\[https?:\/\/[^\]]+\]/g, "");
  text = text.replace(/<\/?(?:poem|center|div|span|br)\b[^>]*>/gi, "");
  text = text.replace(/<ref\b[^>]*>[\s\S]*?<\/ref>/gi, "");
  text = text.replace(/^={2,}.*?={2,}\s*$/gm, "");
  text = text.replace(/'{2,}/g, "");
  text = text.replace(/<[^>]+>/g, "");
  text = text.replace(/\u200b/g, "");
  text = text.replace(/,{2,}/g, "");
  return text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

const SPEAKER_LINE =
  /^[\s।॥*]*([\u0900-\u097F][\u0900-\u097F\s\u200c\u200d\u200b.'’-]{0,80}(?:उवाच|ोवाच|रुवाच|ऊचुः|ूचतुः))\s*[।॥*\-–—:]*\s*$/;

/** `॥ २,१.१ ॥`, `।। 2.1 ।।`, a bare `।। 1 ।।`, or an end-of-line Devanagari number. */
const VERSE_END =
  /(?<=॥)\s*[०-९0-9]+\s*[,，]\s*[०-९0-9]+\s*[.．]\s*([०-९0-9]+|म)\s*॥|(?<=॥)\s*[०-९0-9]+\s*[.．]\s*([०-९0-9]+)\s*॥|(?<=॥)\s*([०-९0-9]+)\s*॥|[ \t]+([०-९]+)[ \t]*(?=\n|$)/g;

function normalizeDandas(text: string): string {
  return text.replace(/।।/g, "॥");
}

/** `इति श्रीगारुडे` and `इति गारुडे`. A verse that merely opens with `इति` stays a verse. */
function isColophon(text: string): boolean {
  return /^[।॥\s]*इति\s+(?:श्री)?गारुडे/u.test(text);
}

function isHindiGloss(line: string): boolean {
  if (/[।॥]/.test(line)) return false;
  return /(?:^|\s)(?:का|की|के|को|से|में|है|हैं|था|थी|और|यह|किया|जाता|होता|रहा|लिए)(?:\s|$)/u.test(line);
}

function isChromeLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (/^[।॥\s*]+$/.test(t)) return true;
  if (/[।॥]/.test(t)) return false;
  return /(?:ध्याय|नमः|पुराणम्|प्रारभ्यते|आरभ्यते)/u.test(t) && t.length < 120;
}

function takeSpeakerAndMeter(chunk: string): { speaker: string | null; meter: string | null; text: string } {
  const lines = chunk.split("\n");
  const speakers: string[] = [];
  const body: string[] = [];
  for (const line of lines) {
    if (!line.trim()) {
      if (body.length > 0) body.push(line);
      continue;
    }
    if (isHindiGloss(line)) continue;
    if (isChromeLine(line) && body.length === 0) continue;
    const speaker = line.match(SPEAKER_LINE);
    if (speaker && body.length === 0) {
      speakers.push(speaker[1]!.replace(/\s+/g, " ").trim());
      continue;
    }
    body.push(line);
  }
  return {
    speaker: speakers.length ? speakers.join("\n") : null,
    meter: null,
    text: normalizeDandas(body.join("\n").replace(/\n{3,}/g, "\n\n").trim()),
  };
}

function printedNumber(raw: string | undefined): number {
  if (!raw || raw === "म") return 0;
  return Number(devanagariToArabic(raw));
}

export function parseChapter(wikitext: string): ParsedChapter {
  let text = normalizeDandas(stripWikitext(wikitext));
  text = text.replace(/\(\s*[०-९0-9]+\s*\)/g, "");
  const units: VerseUnit[] = [];
  let cursor = 0;
  for (const match of text.matchAll(VERSE_END)) {
    const start = match.index ?? 0;
    const chunk = text.slice(cursor, start);
    const printed = printedNumber(match.slice(1).findLast((group) => group));
    const taken = takeSpeakerAndMeter(chunk);
    if (taken.text) {
      units.push({ printed, kind: isColophon(taken.text) ? "colophon" : "verse", ...taken });
    }
    cursor = start + match[0].length;
  }
  const tail = normalizeDandas(text.slice(cursor).trim());
  if (isColophon(tail)) {
    units.push({ printed: 0, kind: "colophon", text: tail, speaker: null, meter: null });
  }
  return { preface: "", units };
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
  let verse = 0;
  for (const unit of chapter.units) {
    if (unit.speaker) parts.push(emitBlock("speaker", null, unit.speaker));
    if (unit.kind === "colophon") {
      parts.push(emitBlock("colophon", null, unit.text));
      continue;
    }
    verse += 1;
    parts.push(emitBlock("verse", verse, unit.text));
  }
  return parts.join("\n\n") + "\n";
}

async function listChapters(): Promise<Array<{ kanda: number; adhyaya: number; file: string }>> {
  const manifest = JSON.parse(await fs.readFile(path.join(RAW_DIR, "manifest.json"), "utf8")) as Array<{
    kanda: number;
    adhyaya: number;
    file: string;
  }>;
  return manifest.sort((a, b) => a.kanda - b.kanda || a.adhyaya - b.adhyaya);
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const chapters = await listChapters();
  let verses = 0;
  let colophons = 0;
  let empty = 0;
  for (const chapter of chapters) {
    const json = JSON.parse(await fs.readFile(path.join(RAW_DIR, chapter.file), "utf8")) as {
      parse?: { wikitext?: string };
    };
    const wikitext = json.parse?.wikitext;
    if (!wikitext) throw new Error(`No wikitext in ${chapter.file}`);
    const parsed = parseChapter(wikitext);
    const verseCount = parsed.units.filter((unit) => unit.kind === "verse").length;
    if (verseCount === 0) {
      empty += 1;
      console.warn(`[Transform] no verses in kāṇḍa ${chapter.kanda} adhyāya ${chapter.adhyaya}`);
    }
    verses += verseCount;
    colophons += parsed.units.length - verseCount;
    if (dryRun) continue;
    const dir = String(chapter.kanda).padStart(2, "0");
    const file = `${String(chapter.adhyaya).padStart(3, "0")}.vy`;
    const dest = path.join(CONTENT_DIR, dir, file);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, emitChapter(parsed));
    const notes = emitFacetAnnotations([chapter.kanda, chapter.adhyaya], parsed.units);
    if (notes) {
      const ann = path.join(ANNOTATIONS_DIR, dir, file);
      await fs.mkdir(path.dirname(ann), { recursive: true });
      await fs.writeFile(ann, notes);
    }
  }
  console.log(
    `[Transform] ${chapters.length} adhyāyas, ${verses} verses, ${colophons} colophons, ${empty} empty`,
  );
  if (dryRun) console.log("[Transform] dry-run: wrote nothing");
  else console.log(`[Transform] wrote ${CONTENT_DIR}`);
  if (empty > 0) process.exit(1);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
