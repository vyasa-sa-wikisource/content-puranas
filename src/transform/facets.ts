/**
 * Explorer facets for speaker and meter.
 *
 * Reading blocks stay in the mula stream. The explorer reads graph
 * `annotate` spans, which the annotations stream packs without HTML.
 */

export interface FacetUnit {
  kind: "verse" | "colophon";
  speaker: string | null;
  meter: string | null;
}

interface Run {
  key: "speaker" | "meter";
  value: string;
  start: number;
  end: number;
}

function quoteAttr(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\s+/g, " ").trim()}"`;
}

export function emitFacetAnnotations(pathParts: number[], units: FacetUnit[]): string {
  const runs: Run[] = [];
  const active: Record<"speaker" | "meter", Run | null> = { speaker: null, meter: null };
  let speaker: string | null = null;
  let meter: string | null = null;
  let verse = 0;

  const flush = (key: "speaker" | "meter") => {
    const run = active[key];
    if (run) runs.push(run);
    active[key] = null;
  };

  for (const unit of units) {
    if (unit.kind !== "verse") continue;
    if (unit.speaker) speaker = unit.speaker;
    if (unit.meter) meter = unit.meter;
    verse += 1;
    for (const key of ["speaker", "meter"] as const) {
      const value = key === "speaker" ? speaker : meter;
      if (!value) continue;
      const run = active[key];
      if (run && run.value === value) run.end = verse;
      else {
        flush(key);
        active[key] = { key, value, start: verse, end: verse };
      }
    }
  }
  flush("speaker");
  flush("meter");

  const prefix = pathParts.join(":");
  return (
    runs
      .map((run) => {
        const span =
          run.start === run.end
            ? `${prefix}:${run.start}`
            : `${prefix}:${run.start}..${prefix}:${run.end}`;
        return `\`annotate "${span}" { ${run.key}=${quoteAttr(run.value)} }`;
      })
      .join("\n") + (runs.length ? "\n" : "")
  );
}
