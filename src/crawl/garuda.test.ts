import { describe, expect, test } from "bun:test";
import { cachePathFor, missingAdhyayas, parseAdhyayaTitle, selectAdhyayas } from "./garuda";

describe("garuda crawl selection", () => {
  test("parses the three kāṇḍa titles", () => {
    expect(parseAdhyayaTitle("गरुडपुराणम्/आचारकाण्डः/अध्यायः २४०")).toEqual({
      kanda: 1,
      adhyaya: 240,
    });
    expect(parseAdhyayaTitle("गरुडपुराणम्/प्रेतकाण्डः (धर्मकाण्डः)/अध्यायः १")).toEqual({
      kanda: 2,
      adhyaya: 1,
    });
    expect(parseAdhyayaTitle("गरुडपुराणम्/ब्रह्मकाण्डः (मोक्षकाण्डः)/अध्यायः २९")).toEqual({
      kanda: 3,
      adhyaya: 29,
    });
  });

  test("skips the index pages", () => {
    const selected = selectAdhyayas([
      { title: "गरुडपुराणम्/आचारकाण्डः/अध्यायः १", length: 4000 },
      { title: "गरुडपुराणम्/आचारकाण्डः", length: 2000 },
      { title: "गरुडपुराणम्/विषयानुक्रमणिका", length: 8000 },
    ]);
    expect(selected.map((page) => page.adhyaya)).toEqual([1]);
  });

  test("reports a gap inside one kāṇḍa", () => {
    const selected = selectAdhyayas([
      { title: "गरुडपुराणम्/आचारकाण्डः/अध्यायः १", length: 1000 },
      { title: "गरुडपुराणम्/आचारकाण्डः/अध्यायः ३", length: 1000 },
      { title: "गरुडपुराणम्/प्रेतकाण्डः (धर्मकाण्डः)/अध्यायः १", length: 1000 },
    ]);
    expect(missingAdhyayas(selected)).toEqual(["1:2"]);
    expect(cachePathFor({ kanda: 2, adhyaya: 12 }).endsWith("kanda-02/adhyaya-012.wikitext.json")).toBe(
      true,
    );
  });
});
