import { describe, expect, test } from "bun:test";
import { cachePathFor, missingAdhyayas, parseAdhyayaTitle, selectAdhyayas } from "./vishnu";

describe("vishnu crawl selection", () => {
  test("parses an aṃśa and an unpadded adhyāya", () => {
    expect(parseAdhyayaTitle("विष्णुपुराणम्/प्रथमांशः/अध्यायः १")).toEqual({ amsa: 1, adhyaya: 1 });
    expect(parseAdhyayaTitle("विष्णुपुराणम्/षष्टांशः/अध्यायः ८")).toEqual({ amsa: 6, adhyaya: 8 });
    expect(parseAdhyayaTitle("विष्णुपुराणम्/षष्टांशः")).toBeNull();
  });

  test("skips the aṃśa index and stubs", () => {
    const selected = selectAdhyayas([
      { title: "विष्णुपुराणम्/प्रथमांशः", length: 1501 },
      { title: "विष्णुपुराणम्/प्रथमांशः/अध्यायः १", length: 7779 },
      { title: "विष्णुपुराणम्/षष्टांशः", length: 611 },
      { title: "विष्णुपुराणम्/षष्टांशः/अध्यायः १", length: 15821 },
    ]);
    expect(selected.map((page) => `${page.amsa}:${page.adhyaya}`)).toEqual(["1:1", "6:1"]);
  });

  test("reports a gap and a stable cache path", () => {
    const selected = selectAdhyayas([
      { title: "विष्णुपुराणम्/प्रथमांशः/अध्यायः १", length: 1000 },
      { title: "विष्णुपुराणम्/प्रथमांशः/अध्यायः ३", length: 1000 },
    ]);
    expect(missingAdhyayas(selected)).toEqual(["1:2"]);
    expect(cachePathFor({ amsa: 1, adhyaya: 12 }).endsWith("amsa-01/adhyaya-12.wikitext.json")).toBe(true);
  });
});
