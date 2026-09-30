#!/usr/bin/env bun
/**
 * List a Sanskrit Wikisource subpage tree and group titles by shape.
 *
 * Usage:
 *   bun run probe -- --root शिवपुराणम्
 *   bun run probe -- --root वराहपुराणम् --sample 1
 *
 * Numbers in a title become #, so अध्यायः १ and अध्यायः १२ share one shape.
 * Pages shorter than --min-bytes (default 800) are stubs. --sample fetches
 * wikitext for the first real page of each shape and prints its head and tail.
 */

const ORIGIN = "https://sa.wikisource.org";
const USER_AGENT =
  "ProjectVyasa-CurationBot/1.0 (+https://github.com/project-vyasa; contact@project-vyasa.org)";
const DEFAULT_MIN_BYTES = 800;

const HELP = `Usage:
  bun run probe -- --root <wiki title>
  bun run probe -- --root शिवपुराणम् --sample 1
  bun run probe -- --root वराहपुराणम् --min-bytes 800 --json

Lists subpages of a sa.wikisource.org title. Read-only.

Options:
  --root <title>     Root page. Required.
  --min-bytes <n>    Stub threshold (default ${DEFAULT_MIN_BYTES}).
  --sample <n>       Wikitext samples per shape (default 0). Head and tail.
  --title <page>     Print the first and last lines of one page. Repeatable.
  --json             Print one JSON object instead of text.
  --help             Show this help.

Examples:
  bun run probe -- --root शिवपुराणम्
  bun run probe -- --root वराहपुराणम् --sample 1 --json
  bun run probe -- --title "शिवपुराणम्/संहिता १ (विश्वेश्वरसंहिता)/अध्यायः ०१"
`;

export interface ListedPage {
  title: string;
  length: number;
}

export function shapeOf(title: string, root: string): string {
  const prefix = `${root}/`;
  const rest = title.startsWith(prefix) ? title.slice(prefix.length) : title;
  return rest.replace(/[०-९0-9]+/g, "#");
}

export function parseArgs(argv: string[]): {
  root: string;
  minBytes: number;
  sample: number;
  json: boolean;
  titles: string[];
} {
  let root = "";
  let minBytes = DEFAULT_MIN_BYTES;
  let sample = 0;
  let json = false;
  const titles: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--root") {
      root = argv[++i] ?? "";
      continue;
    }
    if (arg === "--title") {
      const title = argv[++i] ?? "";
      if (!title) throw new Error(`--title needs a page title.\n${HELP}`);
      titles.push(title);
      continue;
    }
    if (arg === "--min-bytes") {
      minBytes = Number(argv[++i]);
      continue;
    }
    if (arg === "--sample") {
      sample = Number(argv[++i]);
      continue;
    }
    throw new Error(`Unknown argument ${arg}\n${HELP}`);
  }
  if (!root && titles.length === 0) {
    throw new Error(`Missing --root.\n  bun run probe -- --root शिवपुराणम्`);
  }
  if (!Number.isInteger(minBytes) || minBytes < 0) {
    throw new Error(`--min-bytes must be a non-negative integer.\n${HELP}`);
  }
  if (!Number.isInteger(sample) || sample < 0) {
    throw new Error(`--sample must be a non-negative integer.\n${HELP}`);
  }
  return { root, minBytes, sample, json, titles };
}

function lineWindow(text: string, count: number): { head: string[]; tail: string[] } {
  const lines = text.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
  return {
    head: lines.slice(0, count),
    tail: lines.slice(Math.max(0, lines.length - count)),
  };
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

export async function listSubpages(root: string): Promise<ListedPage[]> {
  const out: ListedPage[] = [];
  let cont: Record<string, string> | undefined;
  for (;;) {
    const params: Record<string, string> = {
      action: "query",
      generator: "allpages",
      gapprefix: `${root}/`,
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
  out.sort((a, b) => a.title.localeCompare(b.title, "hi"));
  return out;
}

async function fetchWikitext(title: string): Promise<string> {
  const params = new URLSearchParams({
    action: "parse",
    page: title,
    prop: "wikitext",
    format: "json",
    formatversion: "2",
  });
  const response = await fetch(`${ORIGIN}/w/api.php?${params.toString()}`, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} ${title}`);
  const parsed = (await response.json()) as {
    parse?: { wikitext?: string };
    error?: { info?: string };
  };
  if (!parsed.parse?.wikitext) {
    throw new Error(parsed.error?.info ?? `no wikitext for ${title}`);
  }
  return parsed.parse.wikitext;
}

function clip(text: string, edge: number): { head: string; tail: string } {
  const flat = text.replace(/\s+/g, " ").trim();
  return {
    head: flat.slice(0, edge),
    tail: flat.slice(Math.max(0, flat.length - edge)),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface ShapeGroup {
  shape: string;
  count: number;
  bytes: number;
  real: number;
  stubs: ListedPage[];
  sampleTitles: string[];
}

function groupPages(root: string, pages: ListedPage[], minBytes: number, sample: number): ShapeGroup[] {
  const groups = new Map<string, ShapeGroup>();
  for (const page of pages) {
    const shape = shapeOf(page.title, root);
    const group = groups.get(shape) ?? {
      shape,
      count: 0,
      bytes: 0,
      real: 0,
      stubs: [],
      sampleTitles: [],
    };
    group.count += 1;
    group.bytes += page.length;
    if (page.length < minBytes) group.stubs.push(page);
    else {
      group.real += 1;
      if (group.sampleTitles.length < sample) group.sampleTitles.push(page.title);
    }
    groups.set(shape, group);
  }
  return [...groups.values()].sort((a, b) => b.real - a.real || b.bytes - a.bytes);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h") || argv.length === 0) {
    console.log(HELP);
    return;
  }
  const { root, minBytes, sample, json, titles } = parseArgs(argv);
  if (titles.length && !root) {
    for (const title of titles) {
      const text = await fetchWikitext(title);
      const window = lineWindow(text, 12);
      console.log(`title: ${title}`);
      console.log("head:");
      for (const line of window.head) console.log(`  ${line}`);
      console.log("tail:");
      for (const line of window.tail) console.log(`  ${line}`);
      console.log("");
      await sleep(1500);
    }
    return;
  }
  const pages = await listSubpages(root);
  const shapes = groupPages(root, pages, minBytes, sample);
  const samples: Array<{ title: string; head: string; tail: string }> = [];
  if (sample > 0) {
    for (const group of shapes) {
      for (const title of group.sampleTitles) {
        const text = await fetchWikitext(title);
        samples.push({ title, ...clip(text, 280) });
        await sleep(1500);
      }
    }
  }
  const report = {
    root,
    pages: pages.length,
    bytes: pages.reduce((sum, page) => sum + page.length, 0),
    minBytes,
    shapes: shapes.map((group) => ({
      shape: group.shape,
      count: group.count,
      real: group.real,
      stubs: group.stubs.length,
      bytes: group.bytes,
      stubTitles: group.stubs.map((page) => ({ title: page.title, length: page.length })),
    })),
    samples,
  };
  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(`root: ${report.root}`);
  console.log(`pages: ${report.pages}`);
  console.log(`bytes: ${report.bytes}`);
  console.log(`min-bytes: ${report.minBytes}`);
  console.log("");
  for (const shape of report.shapes) {
    console.log(
      `${String(shape.real).padStart(4)} real  ${String(shape.stubs).padStart(3)} stub  ${String(shape.bytes).padStart(8)} B  ${shape.shape}`,
    );
    for (const stub of shape.stubTitles) {
      console.log(`       stub ${stub.length} B  ${stub.title}`);
    }
  }
  for (const samplePage of report.samples) {
    console.log("");
    console.log(`sample: ${samplePage.title}`);
    console.log(`  head: ${samplePage.head}`);
    console.log(`  tail: ${samplePage.tail}`);
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
