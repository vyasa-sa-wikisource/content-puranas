import { describe, expect, test } from "bun:test";
import { emitChapter, parseChapter } from "./garuda";
import { emitFacetAnnotations } from "./facets";

describe("garuda transform", () => {
  test("reads ।। n.v ।। verses and lifts a bold speaker", () => {
    const parsed = parseChapter(`
{{header|title=[[../../]]|section=अध्यायः २}}
<poem>
'''।। ऋषय ऊचुः ।। '''
कथं व्यासेन कथितं पुराणं गारुडं तव ।।
एतत्सर्वं समाख्याहि परं विष्णुकथाश्रयम् ।। 2.1 ।।
'''सूत उवाच ।। '''
अहं हि मुनिभिः सार्द्धं गतो बदरिकाश्रमम् ।। 2.2 ।।
इति श्रीगारुडे महापुराणे पूर्वखण्डे द्वितीयोऽध्यायः ।। 2 ।।
</poem>
`);
    const verses = parsed.units.filter((unit) => unit.kind === "verse");
    expect(verses[0]?.speaker).toBe("ऋषय ऊचुः");
    expect(verses[0]?.printed).toBe(1);
    expect(verses[0]?.text).toContain("विष्णुकथाश्रयम्");
    expect(verses[0]?.text.trimEnd()).toMatch(/॥$/);
    expect(verses[1]?.speaker).toBe("सूत उवाच");
    expect(parsed.units.some((unit) => unit.kind === "colophon" && unit.text.includes("द्वितीयोऽध्यायः"))).toBe(
      true,
    );
    expect(emitChapter(parsed)).not.toContain("header");
    expect(emitFacetAnnotations([1, 2], parsed.units)).toContain('speaker="ऋषय ऊचुः"');
  });

  test("reads ॥ २,१.१ ॥ and keeps the maṅgala line", () => {
    const parsed = parseChapter(`
<poem>
देवीं सरस्वतीं चैव ततो जयमुदीरयेत् ॥ २,१.म ॥
धर्मन्दृढबद्धमूलो वेदस्कन्धः पुराणशाखाढ्यः  ।
क्रतुकुसुमो मोक्षफलो मधुसूदनपादपो जयति  ॥ २,१.१ ॥
। '''सूत उवाच ''' ।
साधु पृष्टं महाभागाः शृणुध्वं भवतां पुनः  ॥ २,१.२ ॥
इति श्रीगारुडे महापुराणे उत्तरखण्डे प्रथमोऽध्यायः
</poem>
`);
    const verses = parsed.units.filter((unit) => unit.kind === "verse");
    expect(verses[0]?.printed).toBe(0);
    expect(verses[0]?.text).toContain("जयमुदीरयेत्");
    expect(verses[1]?.printed).toBe(1);
    expect(verses[1]?.text).toContain("जयति");
    expect(verses[2]?.speaker).toBe("सूत उवाच");
    expect(parsed.units.at(-1)?.kind).toBe("colophon");
  });

  test("drops a Hindi gloss and accepts इति गारुडे", () => {
    const parsed = parseChapter(`
अध्याय का आरम्भ मङ्गलाचरण से होता है और फिर काव्यात्मक रूप से बताया जाता है
'''ओं मल्लानामशनिर्नृणां नरवरः  ।
मृत्युर्भोजपतेर्विधातृविहित स्तत्त्वं परं योगिनां  ॥ ३,१.१ ॥'''
इति गारुडे महापुराणे ब्रह्मकाण्डे प्रथमोऽध्यायः
`);
    const verses = parsed.units.filter((unit) => unit.kind === "verse");
    expect(verses).toHaveLength(1);
    expect(verses[0]?.text).not.toContain("मङ्गलाचरण");
    expect(verses[0]?.text).toContain("मल्लानाम");
    expect(parsed.units.some((unit) => unit.kind === "colophon")).toBe(true);
  });

  test("reads a bare end-of-line Devanagari number", () => {
    const parsed = parseChapter(`
सूत उवाच
मात्रावर्णप्रभेदेन च्छन्दो वक्ष्येऽल्पबुद्धये  १
सर्वादिमध्यान्तगलौ म्नौ भ्यौ ज्रौ स्तौ त्रिका गणाः  २
इति श्रीगारुडे महापुराणे आचारकाण्डे सप्तोत्तरद्विशततमोऽध्यायः
`);
    const verses = parsed.units.filter((unit) => unit.kind === "verse");
    expect(verses).toHaveLength(2);
    expect(verses[0]?.speaker).toBe("सूत उवाच");
    expect(verses[0]?.printed).toBe(1);
    expect(verses[1]?.printed).toBe(2);
    expect(parsed.units.at(-1)?.kind).toBe("colophon");
  });
});
