import { describe, expect, test } from "bun:test";
import { cachePathFor, missingAdhyayas, parseAdhyayaTitle, selectAdhyayas } from "./brahma";

describe("brahma crawl selection", () => {
  test("parses an unpadded adhyāya title", () => {
    expect(parseAdhyayaTitle("ब्रह्मपुराणम्/अध्यायः १")).toEqual({ adhyaya: 1 });
    expect(parseAdhyayaTitle("ब्रह्मपुराणम्/अध्यायः २४६")).toEqual({ adhyaya: 246 });
  });

  test("skips the index and stubs", () => {
    const selected = selectAdhyayas([
      { title: "ब्रह्मपुराणम्/अध्यायः १", length: 15000 },
      { title: "ब्रह्मपुराणम्/विषयानुक्रमणिका", length: 4000 },
      { title: "ब्रह्मपुराणम्/अध्यायः २", length: 100 },
    ]);
    expect(selected.map((page) => page.adhyaya)).toEqual([1]);
  });

  test("reports a gap and a stable cache path", () => {
    const selected = selectAdhyayas([
      { title: "ब्रह्मपुराणम्/अध्यायः १", length: 1000 },
      { title: "ब्रह्मपुराणम्/अध्यायः ३", length: 1000 },
    ]);
    expect(missingAdhyayas(selected)).toEqual([2]);
    expect(cachePathFor({ adhyaya: 12 }).endsWith("adhyaya-012.wikitext.json")).toBe(true);
  });
});
