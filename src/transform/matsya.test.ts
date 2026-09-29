import { describe, expect, test } from "bun:test";
import { emitChapter, parseChapter } from "./matsya";
import { emitFacetAnnotations } from "./facets";

describe("matsya transform", () => {
  test("reads ।। n.v ।। verses, drops the title, and lifts speakers", () => {
    const parsed = parseChapter(`
{{मत्स्यपुराणम्}}
<poem>
मत्स्य-मनुसंवादवर्णनम्।
सूत उवाच।
एवमुक्तो मनुस्तेन पप्रच्छ मधुसूदनम्।
भगवन्! कियद्भिर्वर्षैर्भविष्यत्यन्तरक्षयः।। २.१ ।।
मत्स्य उवाच।
अद्य प्रभृत्यनावृष्टिर्भविष्यति महीतले।। २.३ ।।
(१) सुषुम्ण, (२) हरिकेश, (३) विश्वकर्मा
इति श्रीमत्स्यपुराणे मत्स्यमनु संवादवर्णनं नाम द्वितीयोऽध्यायः।।
</poem>
`);
    const verses = parsed.units.filter((unit) => unit.kind === "verse");
    expect(verses[0]?.speaker).toBe("सूत उवाच");
    expect(verses[0]?.printed).toBe(1);
    expect(verses[0]?.text).toContain("मधुसूदनम्");
    expect(verses[0]?.text).not.toContain("वर्णनम्");
    expect(verses[0]?.text.trimEnd()).toMatch(/॥$/);
    expect(verses[1]?.speaker).toBe("मत्स्य उवाच");
    expect(verses[1]?.text).not.toContain("सुषुम्ण");
    expect(parsed.units.some((unit) => unit.kind === "colophon" && unit.text.includes("द्वितीयोऽध्यायः"))).toBe(
      true,
    );
    expect(emitChapter(parsed)).not.toContain("`set context");
    expect(emitFacetAnnotations([2], parsed.units)).toContain('speaker="सूत उवाच"');
  });

  test("reads an unclosed chapter.verse number", () => {
    const parsed = parseChapter(`
सूत उवाच।
एतद्वः कथितं सर्वं यदुक्तं विश्वरूपिणा।।  २९१.१
`);
    const verses = parsed.units.filter((unit) => unit.kind === "verse");
    expect(verses).toHaveLength(1);
    expect(verses[0]?.printed).toBe(1);
    expect(verses[0]?.speaker).toBe("सूत उवाच");
    expect(verses[0]?.text).toContain("विश्वरूपिणा");
  });

  test("reads a plain end-of-line chapter.verse number", () => {
    const parsed = parseChapter(`
सूत उवाच।
विहारार्थं स देवेशो मानुषेष्विह जयते 47.1 ।
चतुर्बाहुस्तदा जातो दिव्यरूपो ज्वलञ्श्रिया 2 ।
इति श्रीमात्स्ये महापुराणेऽसुरशापो नाम सप्तचत्वारिंशोऽध्यायः 47।।
`);
    const verses = parsed.units.filter((unit) => unit.kind === "verse");
    expect(verses[0]?.printed).toBe(1);
    expect(verses[1]?.printed).toBe(2);
    expect(parsed.units.at(-1)?.kind).toBe("colophon");
  });

  test("reads a three-part ।। २.१५८.१ number", () => {
    const parsed = parseChapter(`
वीरक उवाच।
प्रवेशं लभते नान्या नारी कमललोचने ।। २.१५८.१
`);
    const verses = parsed.units.filter((unit) => unit.kind === "verse");
    expect(verses).toHaveLength(1);
    expect(verses[0]?.printed).toBe(1);
    expect(verses[0]?.speaker).toBe("वीरक उवाच");
  });
});
