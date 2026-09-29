#!/usr/bin/env bun
/**
 * Cache Viṣṇu Purāṇa adhyāya wikitext from sa.wikisource.org.
 *
 * Usage:
 *   bun run crawl:vishnu
 *   bun run src/crawl/vishnu.ts --dry-run
 *   bun run src/crawl/vishnu.ts --force
 *
 * Each chapter is one wiki page, titled विष्णुपुराणम्/<aṃśa>/अध्यायः N.
 * The six aṃśa index pages are not chapters. षष्टांशः is a stub.
 */

import fs from "node:fs/promises";
import path from "node:path";

const ORIGIN = "https://sa.wikisource.org";
const ROOT = "विष्णुपुराणम्";
const DELAY_MS = 1500;
const USER_AGENT =
  "ProjectVyasa-CurationBot/1.0 (+https://github.com/project-vyasa; contact@project-vyasa.org)";
const RAW_DIR = path.resolve("data/raw/vishnu-purana/wikitext");
const MIN_BYTES = 800;

const HELP = `Usage:
  bun run src/crawl/vishnu.ts
  bun run src/crawl/vishnu.ts --dry-run
  bun run src/crawl/vishnu.ts --force

Fetches विष्णुपुराणम् aṃśa/adhyāya pages as wikitext JSON.
Already cached files are skipped. --force downloads them again.

Examples:
  bun run src/crawl/vishnu.ts --dry-run
  bun run src/crawl/vishnu.ts
`;

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

const AMSA_NAME: Record<string, number> = {
  "प्रथमांशः": 1,
  "द्वितीयांशः": 2,
  "तृतीयांशः": 3,
  "चतुर्थांशः": 4,
  "पञ्चमांशः": 5,
  "षष्टांशः": 6,
};

export interface AdhyayaPage {
  title: string;
  amsa: number;
  adhyaya: number;
  length: number;
}

export function devanagariToArabic(str: string): string {
  return str.replace(/[०-९]/g, (ch) => DEV_TO_ARABIC[ch] ?? ch);
}

const AMSA_PATTERN = Object.keys(AMSA_NAME).join("|");

/** `विष्णुपुराणम्/प्रथमांशः/अध्यायः १` → aṃśa 1, adhyāya 1. */
export function parseAdhyayaTitle(title: string): { amsa: number; adhyaya: number } | null {
  const match = title.match(new RegExp(`^${ROOT}/(${AMSA_PATTERN})/अध्यायः ([०-९0-9]+)$`));
  if (!match) return null;
  const amsa = AMSA_NAME[match[1]!];
  const adhyaya = Number(devanagariToArabic(match[2]!));
  if (!amsa || !Number.isInteger(adhyaya) || adhyaya < 1) return null;
  return { amsa, adhyaya };
}

export function cachePathFor(page: Pick<AdhyayaPage, "amsa" | "adhyaya">): string {
  const amsa = String(page.amsa).padStart(2, "0");
  const adhyaya = String(page.adhyaya).padStart(2, "0");
  return path.join(RAW_DIR, `amsa-${amsa}`, `adhyaya-${adhyaya}.wikitext.json`);
}

export function selectAdhyayas(pages: Array<{ title: string; length: number }>): AdhyayaPage[] {
  const out: AdhyayaPage[] = [];
  for (const page of pages) {
    if (page.length < MIN_BYTES) continue;
    const parsed = parseAdhyayaTitle(page.title);
    if (!parsed) continue;
    out.push({ title: page.title, length: page.length, ...parsed });
  }
  out.sort((a, b) => a.amsa - b.amsa || a.adhyaya - b.adhyaya);
  return out;
}

/** Gaps inside each aṃśa, as `amsa:adhyaya`. */
export function missingAdhyayas(pages: AdhyayaPage[]): string[] {
  const byAmsa = new Map<number, Set<number>>();
  for (const page of pages) {
    const have = byAmsa.get(page.amsa) ?? new Set<number>();
    have.add(page.adhyaya);
    byAmsa.set(page.amsa, have);
  }
  const missing: string[] = [];
  for (const amsa of [...byAmsa.keys()].sort((a, b) => a - b)) {
    const have = byAmsa.get(amsa)!;
    const last = Math.max(...have);
    for (let n = 1; n <= last; n++) if (!have.has(n)) missing.push(`${amsa}:${n}`);
  }
  return missing;
}

async function api(params: Record<string, string>): Promise<unknown> {
  const body = new URLSearchParams({ format: "json", maxlag: "5", ...params });
  for (let attempt = 1; attempt <= 6; attempt++) {
    const response = await fetch(`${ORIGIN}/w/api.php`, {
      method: "POST",
      headers: {
        "User-Agent": USER_AGENT,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body,
    });
    if (response.status === 429 || response.status === 503) {
      const wait = Number(response.headers.get("Retry-After") ?? "20");
      console.warn(`[Crawl] HTTP ${response.status}, sleeping ${wait}s`);
      await sleep((Number.isFinite(wait) ? wait : 20) * 1000);
      continue;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
    const json = (await response.json()) as { error?: { code?: string; info?: string } };
    if (json.error?.code === "maxlag") {
      await sleep(5000);
      continue;
    }
    if (json.error) throw new Error(json.error.info ?? json.error.code ?? "api error");
    return json;
  }
  throw new Error("MediaWiki API failed after retries");
}

async function listSubpages(): Promise<Array<{ title: string; length: number }>> {
  const out: Array<{ title: string; length: number }> = [];
  let cont: Record<string, string> | undefined;
  for (;;) {
    const params: Record<string, string> = {
      action: "query",
      generator: "allpages",
      gapprefix: `${ROOT}/`,
      gapnamespace: "0",
      gaplimit: "100",
      prop: "info",
    };
    if (cont) Object.assign(params, cont);
    const data = (await api(params)) as {
      query?: { pages?: Record<string, { title: string; length?: number }> };
      continue?: Record<string, string>;
    };
    for (const page of Object.values(data.query?.pages ?? {})) {
      out.push({ title: page.title, length: page.length ?? 0 });
    }
    if (!data.continue) break;
    cont = data.continue;
    await sleep(400);
  }
  return out;
}

function parseUrl(title: string): string {
  const params = new URLSearchParams({
    action: "parse",
    page: title,
    prop: "wikitext",
    format: "json",
    formatversion: "2",
  });
  return `${ORIGIN}/w/api.php?${params.toString()}`;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(filePath);
    return stats.isFile() && stats.size > 0;
  } catch {
    return false;
  }
}

async function fetchWikitext(title: string): Promise<string> {
  for (let attempt = 1; attempt <= 5; attempt++) {
    const response = await fetch(parseUrl(title), {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    if (response.status === 429 || response.status === 503) {
      const wait = Number(response.headers.get("Retry-After") ?? "20");
      console.warn(`[Crawl] HTTP ${response.status} on ${title}, sleeping ${wait}s`);
      await sleep((Number.isFinite(wait) ? wait : 20) * 1000);
      continue;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
    const body = await response.text();
    const parsed = JSON.parse(body) as { parse?: { wikitext?: string }; error?: { info?: string } };
    if (!parsed.parse?.wikitext) throw new Error(parsed.error?.info ?? "parse response has no wikitext");
    return body;
  }
  throw new Error(`Failed to fetch ${title}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(HELP);
    return;
  }
  const force = argv.includes("--force");
  const dryRun = argv.includes("--dry-run");

  console.log("[Crawl] Listing Viṣṇu Purāṇa subpages");
  const pages = selectAdhyayas(await listSubpages());
  if (!pages.length) throw new Error("No adhyāya pages found under विष्णुपुराणम्");
  const missing = missingAdhyayas(pages);
  const last = pages[pages.length - 1]!;
  console.log(`[Crawl] ${pages.length} adhyāyas, last ${last.amsa}:${last.adhyaya}`);
  if (missing.length) console.log(`[Crawl] missing: ${missing.join(", ")}`);

  if (dryRun) {
    console.log(`[Crawl] dry-run: would write under ${RAW_DIR}`);
    console.log(`[Crawl] first: ${pages[0]!.title}`);
    console.log(`[Crawl] last: ${pages[pages.length - 1]!.title}`);
    return;
  }

  let downloaded = 0;
  let skipped = 0;
  let errors = 0;
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i]!;
    const dest = cachePathFor(page);
    const label = `aṃśa ${page.amsa} adhyāya ${page.adhyaya}`;
    if (!force && (await fileExists(dest))) {
      skipped += 1;
      console.log(`[Crawl] [${i + 1}/${pages.length}] Cached ${label}`);
      continue;
    }
    try {
      console.log(`[Crawl] [${i + 1}/${pages.length}] Fetching ${label}`);
      const body = await fetchWikitext(page.title);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.writeFile(dest, body, "utf8");
      downloaded += 1;
      if (i < pages.length - 1) await sleep(DELAY_MS);
    } catch (error) {
      errors += 1;
      console.error(`[Crawl] [ERROR] ${label}:`, error instanceof Error ? error.message : error);
      await sleep(DELAY_MS);
    }
  }

  const manifest = pages.map((page) => ({
    title: page.title,
    amsa: page.amsa,
    adhyaya: page.adhyaya,
    file: path.relative(RAW_DIR, cachePathFor(page)),
  }));
  await fs.mkdir(RAW_DIR, { recursive: true });
  await fs.writeFile(path.join(RAW_DIR, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  console.log("\n[Crawl] Summary:");
  console.log(`- Adhyāyas         : ${pages.length}`);
  console.log(`- Newly Downloaded : ${downloaded}`);
  console.log(`- Cached (Skipped) : ${skipped}`);
  console.log(`- Errors           : ${errors}`);
  console.log(`[Crawl] Cached under ${RAW_DIR}`);
  if (errors > 0) process.exit(1);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
