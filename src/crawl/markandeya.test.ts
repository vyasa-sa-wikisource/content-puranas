import { describe, expect, test } from "bun:test";
import { cachePathFor, parseBundleTitle, selectBundles } from "./markandeya";

describe("markandeya crawl selection", () => {
  test("parses a zero-padded bundle, including a zero-width hyphen", () => {
    expect(parseBundleTitle("मार्कण्डेयपुराणम्/अध्यायः ००१\u200c-००५")).toEqual({
      from: 1,
      to: 5,
    });
  });

  test("parses the plural अध्यायाः title and an unpadded range", () => {
    expect(parseBundleTitle("मार्कण्डेयपुराणम्/अध्यायाः १३१-१३४")).toEqual({ from: 131, to: 134 });
    expect(parseBundleTitle("मार्कण्डेयपुराणम्/अध्यायः ७१-८०")).toEqual({ from: 71, to: 80 });
  });

  test("skips the index, redirects, and single-chapter copies", () => {
    const selected = selectBundles([
      { title: "मार्कण्डेयपुराणम्/अध्यायः ००१-००५", length: 77000 },
      { title: "मार्कण्डेयपुराणम्/अध्यायः ००७", length: 18000 },
      { title: "मार्कण्डेयपुराणम्/अध्यायः १-१०", length: 132 },
      { title: "मार्कण्डेयपुराणम्/विषयानुक्रमणिका", length: 16000 },
      { title: "मार्कण्डेयपुराणम्/अध्यायः ०९१-०९५", length: 135 },
      { title: "मार्कण्डेयपुराणम्/अध्यायाः ०९१-०९५", length: 42000 },
    ]);
    expect(selected.map((page) => `${page.from}-${page.to}`)).toEqual(["1-5", "91-95"]);
    expect(selected[1]?.title).toContain("अध्यायाः");
  });

  test("cache path is stable", () => {
    expect(cachePathFor({ from: 6, to: 10 }).endsWith("adhyaya-006-010.wikitext.json")).toBe(true);
  });
});
