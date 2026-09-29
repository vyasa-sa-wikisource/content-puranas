import { describe, expect, test } from "bun:test";
import { emitChapter, parseChapter } from "./vishnu";
import { emitFacetAnnotations } from "./facets";

const OPENING = `
{{श्रीविष्णुपुराणम्-प्रथमांशः}}
<poem>
'''श्रीसूत उवाच

ॐ पराशरं मुनिवरं कृतपौर्वाह्णिकक्रियम् । <br>मैत्रेयः परिपप्रच्छ प्रणिपत्याभिवाद्य च ॥१॥

त्वत्तो हि वेदाध्ययनमधीतमखिलं गुरो । <br>धर्मशास्त्राणि सर्वाणि तथांगनि यथाक्रमम् ॥२॥

'''श्रीपराशर उवाच

साधु मैत्रेय धर्मज्ञ स्मारितोऽस्मि पुरातनम् । <br>पितुः पिता मे भगवान् वसिष्ठो यदुवाच ह ॥१२॥

तात मा तद्वशो भव ॥१९
</poem>
`;

describe("vishnu transform", () => {
  test("splits ॥ n ॥ verses and lifts speakers", () => {
    const parsed = parseChapter(OPENING);
    const verses = parsed.units.filter((unit) => unit.kind === "verse");
    expect(verses[0]?.speaker).toBe("श्रीसूत उवाच");
    expect(verses[0]?.text.startsWith("ॐ पराशरं")).toBe(true);
    expect(verses[0]?.text).toContain("मैत्रेयः परिपप्रच्छ");
    expect(verses[0]?.text.trimEnd()).toMatch(/च\s*॥$/);
    expect(verses.map((unit) => unit.printed)).toEqual([1, 2, 12, 19]);
    expect(verses[2]?.speaker).toBe("श्रीपराशर उवाच");
    expect(emitChapter(parsed)).not.toContain("`set context");
    expect(emitFacetAnnotations([1, 1], parsed.units)).toContain('speaker="श्रीसूत उवाच"');
  });

  test("reads a bare end-of-line number and a colophon", () => {
    const parsed = parseChapter(`श्रीमैत्रेय उवाच ।
ब्रह्मानारायणाख्योऽसौ कल्पादौ भगवान्यथा ।
ससर्ज सर्वभूतानि तदाचक्ष्व महामुने १ ।
इति श्रीविष्णुपुराणे प्रथमेंशो! पृथिव्युद्धारश्चतुर्थोऽध्यायः ४ ।`);
    const verses = parsed.units.filter((unit) => unit.kind === "verse");
    expect(verses).toHaveLength(1);
    expect(verses[0]?.speaker).toBe("श्रीमैत्रेय उवाच");
    expect(verses[0]?.text).toContain("ससर्ज सर्वभूतानि");
    expect(parsed.units.some((unit) => unit.kind === "colophon")).toBe(true);
  });

  test("reads hyphen and compound verse numbers", () => {
    const hyphen = parseChapter("इक्ष्वाकुतनयो योऽसौनिमिर्नाम ।। ४-५-१ ।।\nतमाह वशिष्ठः ।। ४-५-३ ।।");
    expect(hyphen.units.map((unit) => unit.printed)).toEqual([1, 3]);
    const compound = parseChapter("विष्णोस्तं विस्तरेणाहं श्रोतुमिच्छामि तत्त्वतः  ॥ ५,१.२ ॥");
    expect(compound.units.map((unit) => unit.printed)).toEqual([2]);
  });
});
