import { describe, expect, test } from "bun:test";
import { parseArgs, shapeOf } from "./probe";

describe("wikisource probe", () => {
  test("collapses digits so chapter titles share a shape", () => {
    expect(shapeOf("शिवपुराणम्/संहिता/अध्यायः १२", "शिवपुराणम्")).toBe("संहिता/अध्यायः #");
    expect(shapeOf("वराहपुराणम्/अध्यायः ३", "वराहपुराणम्")).toBe("अध्यायः #");
  });

  test("requires a root and reads the sample count", () => {
    expect(parseArgs(["--root", "शिवपुराणम्", "--sample", "1"]).sample).toBe(1);
    expect(() => parseArgs([])).toThrow(/--root/);
  });
});
