import { describe, expect, test } from "bun:test";
import { cachePathFor, missingAdhyayas, parseAdhyayaTitle, selectAdhyayas } from "./matsya";

describe("matsya crawl selection", () => {
  test("parses an unpadded adhyāya title", () => {
    expect(parseAdhyayaTitle("मत्स्यपुराणम्/अध्यायः १")).toEqual({ adhyaya: 1 });
    expect(parseAdhyayaTitle("मत्स्यपुराणम्/अध्यायः २९१")).toEqual({ adhyaya: 291 });
    expect(parseAdhyayaTitle("मत्स्यपुराणम्/अध्यायः-१")).toBeNull();
  });

  test("skips the index, hyphen copies, and the short stub", () => {
    const selected = selectAdhyayas([
      { title: "मत्स्यपुराणम्/अध्यायः १", length: 3500 },
      { title: "मत्स्यपुराणम्/अध्यायः-१", length: 104 },
      { title: "मत्स्यपुराणम्/विषयानुक्रमणिका", length: 4000 },
      { title: "मत्स्यपुराणम्/अध्यायः २७७", length: 121 },
    ]);
    expect(selected.map((page) => page.adhyaya)).toEqual([1]);
  });

  test("reports a gap and a stable cache path", () => {
    const selected = selectAdhyayas([
      { title: "मत्स्यपुराणम्/अध्यायः १", length: 1000 },
      { title: "मत्स्यपुराणम्/अध्यायः ३", length: 1000 },
    ]);
    expect(missingAdhyayas(selected)).toEqual([2]);
    expect(cachePathFor({ adhyaya: 12 }).endsWith("adhyaya-012.wikitext.json")).toBe(true);
  });
});
