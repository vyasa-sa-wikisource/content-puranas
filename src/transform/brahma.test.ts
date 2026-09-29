import { describe, expect, test } from "bun:test";
import fs from "node:fs/promises";
import { emitChapter, parseChapter } from "./brahma";
import { emitFacetAnnotations } from "./facets";

async function wikitext(file: string): Promise<string> {
  const json = JSON.parse(await fs.readFile(file, "utf8")) as { parse: { wikitext: string } };
  return json.parse.wikitext;
}

describe("brahma transform", () => {
  test("splits dotted verses and lifts the opening speaker", async () => {
    const parsed = parseChapter(
      await wikitext("data/raw/brahma-purana/wikitext/adhyaya-001.wikitext.json"),
    );
    const verses = parsed.units.filter((unit) => unit.kind === "verse");
    expect(verses[0]?.text.startsWith("यस्मात्")).toBe(true);
    expect(verses[0]?.text.endsWith("निश्चलम्॥")).toBe(true);
    expect(verses[0]?.text).not.toContain("।।");
    expect(verses[0]?.text).not.toContain("गणेश");
    expect(verses[0]?.text).not.toContain("वर्णनम्");
    expect(verses).toHaveLength(56);
    const speaker = parsed.units.find((unit) => unit.printed === 16);
    expect(speaker?.speaker).toBe("मुनय ऊचुः");
    expect(parsed.units.some((unit) => unit.kind === "colophon" && unit.text.includes("प्रथमोऽध्यायः"))).toBe(
      true,
    );
    expect(emitChapter(parsed)).not.toContain("`set context");
    expect(emitFacetAnnotations([1], parsed.units)).toContain('speaker="मुनय ऊचुः"');
  });

  test("reads a chapter whose verse numbers are bare", async () => {
    const parsed = parseChapter(
      await wikitext("data/raw/brahma-purana/wikitext/adhyaya-002.wikitext.json"),
    );
    const verses = parsed.units.filter((unit) => unit.kind === "verse");
    expect(verses[0]?.speaker).toBe("लोमहर्षण उवाच");
    expect(verses[0]?.text.startsWith("स सृष्ट्वा")).toBe(true);
    expect(verses.length).toBeGreaterThan(20);
  });
});
