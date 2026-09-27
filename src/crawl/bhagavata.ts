#!/usr/bin/env bun
/**
 * Cache Śrīmad Bhāgavata adhyāya wikitext from sa.wikisource.org.
 *
 * Usage:
 *   bun run crawl:bhagavata
 *   bun run src/crawl/bhagavata.ts --dry-run
 *   bun run src/crawl/bhagavata.ts --force
 *
 * Each chapter is a wiki page. The MediaWiki parse API returns wikitext JSON,
 * saved under data/raw/bhagavata-purana/wikitext/. Cached files are skipped
 * unless --force is set.
 */

import fs from "node:fs/promises";
import path from "node:path";

const ORIGIN = "https://sa.wikisource.org";
const ROOT = "श्रीमद्भागवतपुराणम्";
const DELAY_MS = 1500;
const USER_AGENT =
  "ProjectVyasa-CurationBot/1.0 (+https://github.com/project-vyasa; contact@project-vyasa.org)";
const RAW_DIR = path.resolve("data/raw/bhagavata-purana/wikitext");
const MIN_BYTES = 800;

const HELP = `Usage:
  bun run src/crawl/bhagavata.ts
  bun run src/crawl/bhagavata.ts --dry-run
  bun run src/crawl/bhagavata.ts --force

Fetches श्रीमद्भागवतपुराणम् skandha/adhyāya pages as wikitext JSON.
Already cached files are skipped. --force downloads them again.

Examples:
  bun run src/crawl/bhagavata.ts --dry-run
  bun run src/crawl/bhagavata.ts
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

export interface AdhyayaPage {
  title: string;
  skandha: number;
  adhyaya: number;
  /** Skandha 10 is split into पूर्वार्धः and उत्तरार्धः. Other skandhas have none. */
  ardha: "purvardha" | "uttarardha" | null;
  length: number;
}

export function devanagariToArabic(str: string): string {
  return str.replace(/[०-९]/g, (ch) => DEV_TO_ARABIC[ch] ?? ch);
}

const ARDHA: Record<string, AdhyayaPage["ardha"]> = {
  "पूर्वार्धः": "purvardha",
  "उत्तरार्धः": "uttarardha",
};

/**
 * `श्रीमद्भागवतपुराणम्/स्कन्धः १/अध्यायः १` → skandha 1, adhyaya 1.
 * Skandha 10 inserts पूर्वार्धः or उत्तरार्धः before the adhyāya.
 */
export function parseAdhyayaTitle(
  title: string,
): { skandha: number; adhyaya: number; ardha: AdhyayaPage["ardha"] } | null {
  const prefix = `${ROOT}/स्कन्धः `;
  if (!title.startsWith(prefix)) return null;
  const rest = title.slice(prefix.length);
  const match = rest.match(
    /^([०-९]+|[\d]+)(?:\/(पूर्वार्धः|उत्तरार्धः))?\/अध्यायः ([०-९]+|[\d]+)$/,
  );
  if (!match) return null;
  const skandha = Number(devanagariToArabic(match[1]!));
  const adhyaya = Number(devanagariToArabic(match[3]!));
  if (!Number.isInteger(skandha) || !Number.isInteger(adhyaya)) return null;
  if (skandha < 1 || adhyaya < 1) return null;
  const ardha = match[2] ? ARDHA[match[2]] ?? null : null;
  if (match[2] && !ardha) return null;
  return { skandha, adhyaya, ardha };
}

export function cachePathFor(page: Pick<AdhyayaPage, "skandha" | "adhyaya">): string {
  const sk = String(page.skandha).padStart(2, "0");
  const ad = String(page.adhyaya).padStart(2, "0");
  return path.join(RAW_DIR, `skandha-${sk}`, `adhyaya-${ad}.wikitext.json`);
}

export function selectAdhyayas(
  pages: Array<{ title: string; length: number }>,
): AdhyayaPage[] {
  const out: AdhyayaPage[] = [];
  for (const page of pages) {
    if (page.length < MIN_BYTES) continue;
    const parsed = parseAdhyayaTitle(page.title);
    if (!parsed) continue;
    out.push({ title: page.title, length: page.length, ...parsed });
  }
  out.sort((a, b) => a.skandha - b.skandha || a.adhyaya - b.adhyaya);
  return out;
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

  console.log("[Crawl] Listing Bhāgavata subpages");
  const pages = selectAdhyayas(await listSubpages());
  if (!pages.length) {
    throw new Error("No adhyāya pages found under श्रीमद्भागवतपुराणम्");
  }
  const skandhas = new Set(pages.map((p) => p.skandha));
  console.log(`[Crawl] ${pages.length} adhyāyas across skandhas ${[...skandhas].sort((a, b) => a - b).join(", ")}`);

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
    const label = `skandha ${page.skandha} adhyāya ${page.adhyaya}`;
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
    skandha: page.skandha,
    adhyaya: page.adhyaya,
    ardha: page.ardha,
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
