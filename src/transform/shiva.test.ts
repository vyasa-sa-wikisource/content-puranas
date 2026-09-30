import { describe, expect, test } from "bun:test";
import { parseChapter } from "./shiva";

describe("shiva transform", () => {
  test("reads ।। n ।। verses and lifts a whole-line speaker", () => {
    const parsed = parseChapter(`
श्रीगणेशाय नमः ।।
अथ पञ्चम्युमासंहिता प्रारभ्यते ।।
<poem>
नारद उवाच ।।
दाक्षायणी सती देवी त्यक्तदेहा पितुर्मखे ।। १ ।।
इति श्रीशिवमहापुराणे पंचम्यामुमासंहितायां प्रथमोऽध्यायः ।। १ ।।
</poem>
`);
    const verses = parsed.units.filter((unit) => unit.kind === "verse");
    expect(verses).toHaveLength(1);
    expect(verses[0]?.printed).toBe(1);
    expect(verses[0]?.speaker).toBe("नारद उवाच");
    expect(verses[0]?.text).toContain("दाक्षायणी");
    expect(verses[0]?.text.endsWith("॥")).toBe(true);
    expect(parsed.units.at(-1)?.kind).toBe("colophon");
  });

  test("joins the two pādas that share ॥ ७.१,१.१", () => {
    const parsed = parseChapter(`
व्यास उवाच
नमश्शिवाय सोमाय सगणाय ससूनवे  ॥ ७.१,१.१
प्रधानपुरुषेशाय सर्गस्थित्यंतहेतवे  ॥ ७.१,१.१
शक्तिरप्रतिमा यस्य ह्यैश्वर्यं चापि सर्वगम्  ॥ ७.१,१.२
स्वामित्वं च विभुत्वं च स्वभावं संप्रचक्षते  ॥ ७.१,१.२
`);
    const verses = parsed.units.filter((unit) => unit.kind === "verse");
    expect(verses.map((verse) => verse.printed)).toEqual([1, 2]);
    expect(verses[0]?.text).toContain("नमश्शिवाय");
    expect(verses[0]?.text).toContain("प्रधानपुरुषेशाय");
    expect(verses[0]?.speaker).toBe("व्यास उवाच");
  });

  test("reads a bare end-of-line number", () => {
    const parsed = parseChapter(`
व्यास उवाच ।
प्रयागे परमे पुण्ये ब्रह्मलोकस्य वर्त्मनि १ ।
मुनयः शंसितात्मानस्सत्यव्रतपरायणाः २ ।
इति श्रीशैवेमहापुराणे विद्येश्वरसंहितायां प्रथमोऽध्यायः १ ।
`);
    const verses = parsed.units.filter((unit) => unit.kind === "verse");
    expect(verses.map((verse) => verse.printed)).toEqual([1, 2]);
    expect(parsed.units.at(-1)?.kind).toBe("colophon");
  });

  test("keeps a second verse that reuses the number after a new speaker", () => {
    const parsed = parseChapter(`
संभावये मनसिशंकरमम्बिकेशम् १।
व्यास उवाच ।
प्रयागे परमे पुण्ये ब्रह्मलोकस्य वर्त्मनि १ ।
`);
    const verses = parsed.units.filter((unit) => unit.kind === "verse");
    expect(verses).toHaveLength(2);
    expect(verses[1]?.speaker).toBe("व्यास उवाच");
    expect(verses[1]?.text).toContain("प्रयागे");
  });
});
