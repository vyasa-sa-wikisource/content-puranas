import { describe, expect, test } from "bun:test";
import fs from "node:fs/promises";
import { assemble, emitChapter, parseBundle } from "./markandeya";
import { emitFacetAnnotations } from "./facets";

async function wikitext(file: string): Promise<string> {
  const json = JSON.parse(await fs.readFile(file, "utf8")) as { parse: { wikitext: string } };
  return json.parse.wikitext;
}

describe("markandeya transform", () => {
  test("splits the first bundle into adhyāyas 1–5", async () => {
    const chapters = parseBundle(
      await wikitext("data/raw/markandeya-purana/wikitext/adhyaya-001-005.wikitext.json"),
      { from: 1, to: 5 },
    );
    expect(chapters.map((chapter) => chapter.printed)).toEqual([1, 2, 3, 4, 5]);
    const first = chapters[0]!;
    const verses = first.units.filter((unit) => unit.kind === "verse");
    expect(verses[0]?.text).toContain("यद्योगिभिर्भवभयार्तिविनाशयोग्यम्");
    expect(verses[0]?.text).not.toContain("प्रथमोऽध्यायः");
    expect(verses[3]?.text.startsWith("तपः स्वाध्यायनिरतं")).toBe(true);
    expect(first.units.some((unit) => unit.kind === "colophon")).toBe(true);
    expect(emitChapter(first)).not.toContain("`set context");
    expect(emitChapter(first)).toContain("`verse 1 [");
  });

  test("keeps the Devīmāhātmya close and the later adhyāyas 91–93", async () => {
    const devi = parseBundle(
      await wikitext("data/raw/markandeya-purana/wikitext/adhyaya-091-093.wikitext.json"),
      { from: 91, to: 93 },
    );
    const next = parseBundle(
      await wikitext("data/raw/markandeya-purana/wikitext/adhyaya-091-095.wikitext.json"),
      { from: 91, to: 95 },
    );
    const chapters = assemble([devi, next]);
    const ninetyOne = chapters.filter((chapter) => chapter.printed === 91);
    expect(ninetyOne).toHaveLength(2);
    expect(ninetyOne[0]?.units[0]?.text).toContain("देव्या हते");
    expect(ninetyOne[1]?.units.find((unit) => unit.kind === "verse")?.text).toContain("सावर्णिकमिदं");
  });

  test("drops the chapter label and lifts a sandhi speaker", async () => {
    const chapters = parseBundle(
      await wikitext("data/raw/markandeya-purana/wikitext/adhyaya-006-010.wikitext.json"),
      { from: 6, to: 10 },
    );
    const chapter = chapters.find((item) => item.printed === 8);
    const verse = chapter?.units.find((unit) => unit.kind === "verse");
    expect(verse?.speaker).toBe("जैमिनिरुवाच");
    expect(verse?.text.startsWith("भवद्भिरिदमाख्यातं")).toBe(true);
    expect(verse?.text).not.toContain("अध्याय");
    const notes = emitFacetAnnotations([8], chapter!.units);
    expect(notes).toContain('`annotate "8:1');
    expect(notes).toContain('speaker="जैमिनिरुवाच"');
  });
});
