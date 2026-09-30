import { describe, expect, test } from "bun:test";
import { parseChapter } from "./varaha";

describe("varaha transform", () => {
  test("reads ।। n.v ।। verses and a वराह colophon", () => {
    const parsed = parseChapter(`
धरण्युवाच ।
योऽसौ सत्यतपा नाम लुब्धो भूत्वा द्विजो बभौ ।। १.१ ।।
एवमुक्त्वा तु तौ सिद्धौ उभौ सत्यतपारुणी ।। १.२ ।।
इति श्रीवराहपुराणे भगवच्छास्त्रे प्रथमोऽध्यायः ।। १ ।।
`);
    const verses = parsed.units.filter((unit) => unit.kind === "verse");
    expect(verses.map((verse) => verse.printed)).toEqual([1, 2]);
    expect(verses[0]?.speaker).toBe("धरण्युवाच");
    expect(verses[0]?.text.endsWith("॥")).toBe(true);
    expect(parsed.units.at(-1)?.kind).toBe("colophon");
    expect(parsed.units.at(-1)?.text).toContain("प्रथमोऽध्यायः");
  });
});