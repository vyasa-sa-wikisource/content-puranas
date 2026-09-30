import { describe, expect, test } from "bun:test";
import { cachePathFor, missingAdhyayas, parseAdhyayaTitle, selectAdhyayas } from "./shiva";

describe("shiva crawl selection", () => {
  test("parses saṃhitā, khaṇḍa, and the two Vāyavīya bhāgas", () => {
    expect(
      parseAdhyayaTitle("शिवपुराणम्/संहिता २ (रुद्रसंहिता)/खण्डः ५ (युद्धखण्डः)/अध्यायः ०१"),
    ).toEqual({ samhita: 2, khanda: 5, adhyaya: 1 });
    expect(parseAdhyayaTitle("शिवपुराणम्/संहिता १ (विश्वेश्वरसंहिता)/अध्यायः ०१")).toEqual({
      samhita: 1,
      khanda: 1,
      adhyaya: 1,
    });
    expect(parseAdhyayaTitle("शिवपुराणम्/संहिता ७ (वायवीयसंहिता)/उत्तर भागः/अध्यायः ०१")).toEqual({
      samhita: 7,
      khanda: 2,
      adhyaya: 1,
    });
  });

  test("keeps the zero-padded title when two pages share an adhyāya", () => {
    const selected = selectAdhyayas([
      { title: "शिवपुराणम्/संहिता १ (विश्वेश्वरसंहिता)/अध्यायः ७", length: 8000 },
      { title: "शिवपुराणम्/संहिता १ (विश्वेश्वरसंहिता)/अध्यायः ०७", length: 8000 },
    ]);
    expect(selected).toHaveLength(1);
    expect(selected[0]?.title.endsWith("अध्यायः ०७")).toBe(true);
  });

  test("skips indexes, plural copies, and the unnumbered tree", () => {
    const selected = selectAdhyayas([
      { title: "शिवपुराणम्/संहिता १ (विश्वेश्वरसंहिता)/अध्यायः १", length: 4000 },
      { title: "शिवपुराणम्/संहिता १ (विश्वेश्वरसंहिता)/अध्यायाः १०", length: 172 },
      { title: "शिवपुराणम्/कैलाससंहिता/अध्यायः १८", length: 5000 },
      { title: "शिवपुराणम्/संहिता १ (विश्वेश्वरसंहिता)/विषयानुक्रमणिका", length: 5000 },
    ]);
    expect(selected.map((page) => page.adhyaya)).toEqual([1]);
  });

  test("reports a gap inside one khaṇḍa", () => {
    const selected = selectAdhyayas([
      { title: "शिवपुराणम्/संहिता ५ (उमासंहिता)/अध्यायः १", length: 1000 },
      { title: "शिवपुराणम्/संहिता ५ (उमासंहिता)/अध्यायः ३", length: 1000 },
    ]);
    expect(missingAdhyayas(selected)).toEqual(["5:1:2"]);
    expect(cachePathFor({ samhita: 7, khanda: 2, adhyaya: 1 }).endsWith(
      "samhita-07/khanda-02/adhyaya-001.wikitext.json",
    )).toBe(true);
  });
});
