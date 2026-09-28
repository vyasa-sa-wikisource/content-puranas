#!/usr/bin/env bun
/**
 * Cache Mārkaṇḍeya Purāṇa bundle wikitext from sa.wikisource.org.
 *
 * Usage:
 *   bun run crawl:markandeya
 *   bun run src/crawl/markandeya.ts --dry-run
 *   bun run src/crawl/markandeya.ts --force
 *
 * Chapters 1–134 are continuous bundles (often five adhyāyas per page),
 * not one wiki page per chapter. Redirects, the index, and single-chapter
 * copies of text already inside a bundle are skipped.
 */

import fs from "node:fs/promises";
import path from "node:path";

const ORIGIN = "https://sa.wikisource.org";
const ROOT = "मार्कण्डेयपुराणम्";
const DELAY_MS = 1500;
const USER_AGENT =
  "ProjectVyasa-CurationBot/1.0 (+https://github.com/project-vyasa; contact@project-vyasa.org)";
const RAW_DIR = path.resolve("data/raw/markandeya-purana/wikitext");
const MIN_BYTES = 800;
const INVISIBLE = /[\u200b\u200c\u200d\ufeff]/g;

const HELP = `Usage:
  bun run src/crawl/markandeya.ts
  bun run src/crawl/markandeya.ts --dry-run
  bun run src/crawl/markandeya.ts --force

Fetches मार्कण्डेयपुराणम् adhyāya-bundle pages as wikitext JSON.
Already cached files are skipped. --force downloads them again.

Examples:
  bun run src/crawl/markandeya.ts --dry-run
  bun run src/crawl/markandeya.ts
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

export interface BundlePage {
  title: string;
  from: number;
  to: number;
  length: number;
}

export function devanagariToArabic(str: string): string {
  return str.replace(/[०-९]/g, (ch) => DEV_TO_ARABIC[ch] ?? ch);
}

/**
 * `मार्कण्डेयपुराणम्/अध्यायः ००१-००५` or `…/अध्यायाः १३१-१३४`.
 * A zero-width character sometimes sits before the hyphen.
 */
export function parseBundleTitle(title: string): { from: number; to: number } | null {
  const clean = title.replace(INVISIBLE, "");
  const prefix = `${ROOT}/अध्याय`;
  if (!clean.startsWith(prefix)) return null;
  const match = clean.slice(prefix.length).match(/^ा?ः ([०-९0-9]+)[-–—]([०-९0-9]+)$/);
  if (!match) return null;
  const from = Number(devanagariToArabic(match[1]!));
  const to = Number(devanagariToArabic(match[2]!));
  if (!Number.isInteger(from) || !Number.isInteger(to)) return null;
  if (from < 1 || to < from) return null;
  return { from, to };
}

export function cachePathFor(page: Pick<BundlePage, "from" | "to">): string {
  const from = String(page.from).padStart(3, "0");
  const to = String(page.to).padStart(3, "0");
  return path.join(RAW_DIR, `adhyaya-${from}-${to}.wikitext.json`);
}

export function selectBundles(pages: Array<{ title: string; length: number }>): BundlePage[] {
  const byRange = new Map<string, BundlePage>();
  for (const page of pages) {
    if (page.length < MIN_BYTES) continue;
    const parsed = parseBundleTitle(page.title);
    if (!parsed) continue;
    const key = `${parsed.from}-${parsed.to}`;
    const next: BundlePage = { title: page.title, length: page.length, ...parsed };
    const prev = byRange.get(key);
    if (!prev || next.length > prev.length) byRange.set(key, next);
  }
  return [...byRange.values()].sort((a, b) => a.from - b.from || a.to - b.to);
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
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
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
    if (!parsed.parse?.wikitext) {
      throw new Error(parsed.error?.info ?? "parse response has no wikitext");
    }
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

  console.log("[Crawl] Listing Mārkaṇḍeya subpages");
  const pages = selectBundles(await listSubpages());
  if (!pages.length) {
    throw new Error("No adhyāya bundles found under मार्कण्डेयपुराणम्");
  }
  console.log(`[Crawl] ${pages.length} bundles, adhyāyas ${pages[0]!.from}–${pages[pages.length - 1]!.to}`);

  if (dryRun) {
    console.log(`[Crawl] dry-run: would write under ${RAW_DIR}`);
    for (const page of pages) console.log(`  ${page.from}–${page.to}\t${page.length}\t${page.title}`);
    return;
  }

  let downloaded = 0;
  let skipped = 0;
  let errors = 0;
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i]!;
    const dest = cachePathFor(page);
    const label = `adhyāyas ${page.from}–${page.to}`;
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
    from: page.from,
    to: page.to,
    file: path.relative(RAW_DIR, cachePathFor(page)),
  }));
  await fs.mkdir(RAW_DIR, { recursive: true });
  await fs.writeFile(path.join(RAW_DIR, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  console.log("\n[Crawl] Summary:");
  console.log(`- Bundles          : ${pages.length}`);
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
