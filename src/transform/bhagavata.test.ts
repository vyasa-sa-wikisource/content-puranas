import { describe, expect, test } from "bun:test";
import fs from "node:fs/promises";
import { emitChapter, parseChapter } from "./bhagavata";
import { emitFacetAnnotations } from "./facets";

describe("bhagavata transform", () => {
  test("splits skandha 1 adhyāya 1 into verses, speakers, meters, and a colophon", async () => {
    const json = JSON.parse(
      await fs.readFile("data/raw/bhagavata-purana/wikitext/skandha-01/adhyaya-01.wikitext.json", "utf8"),
    ) as { parse: { wikitext: string } };
    const parsed = parseChapter(json.parse.wikitext);
    const verses = parsed.units.filter((unit) => unit.kind === "verse");
    const colophons = parsed.units.filter((unit) => unit.kind === "colophon");
    expect(verses.map((unit) => unit.printed)).toEqual(
      Array.from({ length: 23 }, (_, i) => i + 1),
    );
    expect(colophons).toHaveLength(1);
    expect(verses[2]?.meter).toBe("द्रुतविलम्बित");
    expect(verses[3]?.meter).toBe("अनुष्टुप्");
    expect(verses[5]?.speaker).toBe("ऋषय ऊचुः");
    const emitted = emitChapter(parsed);
    expect(emitted).not.toContain("`set context");
    const notes = emitFacetAnnotations([1, 1], parsed.units);
    expect(notes).toContain('speaker="ऋषय ऊचुः"');
    expect(notes).toContain("1:1:6");
    expect(notes).toContain('meter="अनुष्टुप्"');
    expect(emitted).toContain("`verse 6 [");
    expect(emitted).toContain("`colophon [");
  });

  test("reads a prose chapter that has no poem tag", async () => {
    const json = JSON.parse(
      await fs.readFile("data/raw/bhagavata-purana/wikitext/skandha-05/adhyaya-22.wikitext.json", "utf8"),
    ) as { parse: { wikitext: string } };
    const parsed = parseChapter(json.parse.wikitext);
    expect(parsed.preface.length).toBeGreaterThan(0);
    expect(parsed.units.filter((unit) => unit.kind === "verse").length).toBeGreaterThan(3);
    expect(parsed.units[0]?.text.startsWith("यदेतद्")).toBe(true);
  });

  test("reads verse numbers that sit at the end of the line", async () => {
    const json = JSON.parse(
      await fs.readFile("data/raw/bhagavata-purana/wikitext/skandha-05/adhyaya-01.wikitext.json", "utf8"),
    ) as { parse: { wikitext: string } };
    const parsed = parseChapter(json.parse.wikitext);
    const verses = parsed.units.filter((unit) => unit.kind === "verse");
    expect(verses[0]?.printed).toBe(1);
    expect(verses[0]?.speaker).toBe("राजोवाच");
    expect(verses.length).toBeGreaterThan(30);
    expect(parsed.units.some((unit) => unit.kind === "colophon")).toBe(true);
  });
});
