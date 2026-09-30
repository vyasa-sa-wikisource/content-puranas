import { describe, expect, test } from "bun:test";
import { cachePathFor, missingAdhyayas, parseAdhyayaTitle, selectAdhyayas } from "./varaha";

describe("varaha crawl selection", () => {
  test("parses a zero-padded adhyāya and a nested fill", () => {
    expect(parseAdhyayaTitle("वराहपुराणम्/अध्यायः ००१")).toEqual({ adhyaya: 1, nested: false });
    expect(parseAdhyayaTitle("वराहपुराणम्/अध्यायः ०९७/अध्यायः ०९८")).toEqual({
      adhyaya: 98,
      nested: true,
    });
  });

  test("keeps the direct page and uses a nested page only to fill a gap", () => {
    const selected = selectAdhyayas([
      { title: "वराहपुराणम्/अध्यायः ००१", length: 4000 },
      { title: "वराहपुराणम्/अध्यायः १", length: 104 },
      { title: "वराहपुराणम्/अध्यायः ०९८", length: 5000 },
      { title: "वराहपुराणम्/अध्यायः ०९७/अध्यायः ०९८", length: 9000 },
      { title: "वराहपुराणम्/अध्यायः ०९६/अध्यायः ०९७", length: 8000 },
      { title: "वराहपुराणम्/विषयानुक्रमणिका", length: 90000 },
    ]);
    expect(selected.map((page) => page.adhyaya)).toEqual([1, 97, 98]);
    expect(selected.find((page) => page.adhyaya === 98)?.nested).toBe(false);
    expect(selected.find((page) => page.adhyaya === 97)?.nested).toBe(true);
  });

  test("reports a gap and a stable cache path", () => {
    const selected = selectAdhyayas([
      { title: "वराहपुराणम्/अध्यायः ००१", length: 1000 },
      { title: "वराहपुराणम्/अध्यायः ००३", length: 1000 },
    ]);
    expect(missingAdhyayas(selected)).toEqual([2]);
    expect(cachePathFor({ adhyaya: 12 }).endsWith("adhyaya-012.wikitext.json")).toBe(true);
  });
});
