import { describe, expect, test } from "bun:test";
import { emitChapter, parseChapter } from "./agni";
import { emitFacetAnnotations } from "./facets";

const OPENING = `
{{अग्निपुराणम्}}
===ग्रन्थप्रस्तावना===
<poem>
श्रियं सरस्वतीं गौरीं गणेशं स्कन्दमीश्वरम् ।
ब्रह्माणं वह्निमिन्द्रादीन् वासुदेवं नमाम्यहम् ।। १ ।।
ऋषय ऊचुः
सूत त्वं पूजितोऽस्माभिः सारात्सारं वदस्व नः ।
येन विज्ञानमात्रेणसर्व्वज्ञत्वं प्रजायते ।। ३ ।।
इत्यदिमहापुराणे आग्नेये प्रश्नो नाम प्रथमोध्यायः ।। २० ।।
</poem>
`;

describe("agni transform", () => {
  test("splits ।। n ।। verses, drops the heading, and lifts speakers", () => {
    const parsed = parseChapter(OPENING);
    const verses = parsed.units.filter((unit) => unit.kind === "verse");
    expect(verses[0]?.text.startsWith("श्रियं")).toBe(true);
    expect(verses[0]?.text).not.toContain("प्रस्तावना");
    expect(verses[0]?.text.trimEnd()).toMatch(/हम्\s*॥$/);
    expect(verses[1]?.speaker).toBe("ऋषय ऊचुः");
    expect(verses[1]?.printed).toBe(3);
    expect(parsed.units.some((unit) => unit.kind === "colophon" && unit.text.includes("प्रथमोध्यायः"))).toBe(
      true,
    );
    expect(emitChapter(parsed)).not.toContain("`set context");
    expect(emitFacetAnnotations([1], parsed.units)).toContain('speaker="ऋषय ऊचुः"');
  });

  test("joins ।३.००१ and ॥३.००१ into one verse and drops the apparatus", () => {
    const parsed = parseChapter(`
अग्निरुवाच
वक्ष्ये कूर्मावतारञ्च श्रुत्वा पापप्रणाशनम्(३)  ।३.००१
पुरा देवासुरे युद्धे दैत्यैर्देवाः पराजिताः  ॥३.००१
<small>टिप्पणी
३ संश्रुतं पापनाशनमिति</small>
इत्यादिमहापुराणे आग्नेये कूर्मावतारो नाम तृतीयोऽध्यायः ॥
`);
    const verses = parsed.units.filter((unit) => unit.kind === "verse");
    expect(verses).toHaveLength(1);
    expect(verses[0]?.speaker).toBe("अग्निरुवाच");
    expect(verses[0]?.printed).toBe(1);
    expect(verses[0]?.text).toContain("प्रणाशनम्");
    expect(verses[0]?.text).toContain("पराजिताः");
    expect(verses[0]?.text.trimEnd()).toMatch(/॥$/);
    expect(verses[0]?.text).not.toContain("३.००१");
    expect(verses[0]?.text).not.toContain("(३)");
    expect(verses[0]?.text).not.toContain("टिप्पणी");
    expect(parsed.units.some((unit) => unit.kind === "colophon" && unit.text.includes("तृतीयोऽध्यायः"))).toBe(
      true,
    );
  });

  test("reads a chapter.verse number between double dandas", () => {
    const parsed = parseChapter(`
अग्निरुवाच
यथादौ कथितं तद्वद्वशिष्ठ कथयामि ते ।। २१८.१ ।।
इत्यादिमहापुराणे आग्नेये राज्यभिषेको नाम अष्टादशाधिक द्विशततमोऽध्यायः ।
`);
    const verses = parsed.units.filter((unit) => unit.kind === "verse");
    expect(verses).toHaveLength(1);
    expect(verses[0]?.printed).toBe(1);
    expect(verses[0]?.text).toContain("कथयामि ते");
    expect(verses[0]?.text.trimEnd()).toMatch(/॥$/);
    expect(verses[0]?.text).not.toContain("२१८");
  });
});
