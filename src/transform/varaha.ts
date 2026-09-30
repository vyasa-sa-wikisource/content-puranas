#!/usr/bin/env bun
/**
 * Turn the Varāha Purāṇa wikitext snapshot into a Vyasa workspace.
 *
 * Usage:
 *   bun run transform:varaha
 *   bun run src/transform/varaha.ts --dry-run
 *
 * Chapters are one file per adhyāya. Verse numbers are ।। n.v ।।, the same
 * shape Matsya uses, so this transform reads them with that parser.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { emitFacetAnnotations } from "./facets";
import { emitChapter, parseChapter } from "./matsya";

const RAW_DIR = path.resolve("data/raw/varaha-purana/wikitext");
const WORKSPACE_DIR = path.resolve("data/processed/varaha-purana");
const CONTENT_DIR = path.join(WORKSPACE_DIR, "content", "mula");
const ANNOTATIONS_DIR = path.join(WORKSPACE_DIR, "annotations");

export { parseChapter, emitChapter };

async function listChapters(): Promise<Array<{ adhyaya: number; file: string }>> {
  const manifest = JSON.parse(await fs.readFile(path.join(RAW_DIR, "manifest.json"), "utf8")) as Array<{
    adhyaya: number;
    file: string;
  }>;
  return manifest.sort((a, b) => a.adhyaya - b.adhyaya);
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
      console.warn(`[Transform] no verses in adhyāya ${chapter.adhyaya}`);
    }
    verses += verseCount;
    colophons += parsed.units.length - verseCount;
    if (dryRun) continue;
    const file = `${String(chapter.adhyaya).padStart(3, "0")}.vy`;
    const dest = path.join(CONTENT_DIR, file);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, emitChapter(parsed));
    const notes = emitFacetAnnotations([chapter.adhyaya], parsed.units);
    if (notes) {
      const ann = path.join(ANNOTATIONS_DIR, file);
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
