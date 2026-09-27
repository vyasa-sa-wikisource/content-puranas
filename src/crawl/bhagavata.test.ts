import { describe, expect, test } from "bun:test";
import { cachePathFor, parseAdhyayaTitle, selectAdhyayas } from "./bhagavata";

describe("bhagavata crawl selection", () => {
  test("parses a skandha/adhyāya title", () => {
    expect(parseAdhyayaTitle("श्रीमद्भागवतपुराणम्/स्कन्धः १/अध्यायः १")).toEqual({
      skandha: 1,
      adhyaya: 1,
      ardha: null,
    });
  });

  test("parses skandha 10 pūrva and uttara halves", () => {
    expect(parseAdhyayaTitle("श्रीमद्भागवतपुराणम्/स्कन्धः १०/पूर्वार्धः/अध्यायः १")).toEqual({
      skandha: 10,
      adhyaya: 1,
      ardha: "purvardha",
    });
    expect(parseAdhyayaTitle("श्रीमद्भागवतपुराणम्/स्कन्धः १०/उत्तरार्धः/अध्यायः ९०")).toEqual({
      skandha: 10,
      adhyaya: 90,
      ardha: "uttarardha",
    });
  });

  test("skips the misspelled skanda tree, mahatmya, and stubs", () => {
    const selected = selectAdhyayas([
      { title: "श्रीमद्भागवतपुराणम्/स्कन्धः १/अध्यायः १", length: 7000 },
      { title: "श्रीमद्भागवतपुराणम्/स्कन्दः १/अध्यायः १", length: 7000 },
      { title: "श्रीमद्भागवतपुराणम्/माहात्म्य (पाद्मे)", length: 5000 },
      { title: "श्रीमद्भागवतपुराणम्/स्कन्धः १/अध्यायः २", length: 100 },
    ]);
    expect(selected.map((p) => p.adhyaya)).toEqual([1]);
  });

  test("cache path is stable", () => {
    expect(cachePathFor({ skandha: 2, adhyaya: 10 }).endsWith("skandha-02/adhyaya-10.wikitext.json")).toBe(
      true,
    );
  });
});
