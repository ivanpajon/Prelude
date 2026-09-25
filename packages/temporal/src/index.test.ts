import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { Temporal } from "./index";

const entryUrl = new URL("./index.ts", import.meta.url).href;

// A fresh process ensures native detection runs before the polyfill's first import.
// Changing globals inside Vitest would leave the dependency's module cache populated.
function evaluateRuntime(source: string): unknown {
  return JSON.parse(
    execFileSync(process.execPath, ["--input-type=module", "--eval", source], {
      encoding: "utf8",
      timeout: 10_000,
    }),
  );
}

describe("Temporal runtime boundary", () => {
  it("uses the Node 26 native implementation", () => {
    expect(
      evaluateRuntime(`
        const nativeTemporal = globalThis.Temporal;
        if (!nativeTemporal) throw new Error("Node 26 must provide native Temporal");
        const { Temporal } = await import(${JSON.stringify(entryUrl)});
        console.log(JSON.stringify({
          selectedNative: Temporal === nativeTemporal,
          unchangedGlobal: globalThis.Temporal === nativeTemporal,
        }));
      `),
    ).toEqual({ selectedNative: true, unchangedGlobal: true });
  });

  it("supplies full Temporal behavior without installing globals when native is absent", () => {
    expect(
      evaluateRuntime(`
        delete globalThis.Temporal;
        const dateTimeFormat = Intl.DateTimeFormat;
        const dateConversion = Date.prototype.toTemporalInstant;
        const { Temporal } = await import(${JSON.stringify(entryUrl)});
        const before = Temporal.ZonedDateTime.from(
          "2026-03-28T12:00:00+01:00[Europe/Madrid]",
        );
        const after = before.add({ days: 1 });
        const instant = Temporal.Instant.from("2026-09-25T12:34:56.123456789Z");
        console.log(JSON.stringify({
          globalAbsent: !("Temporal" in globalThis),
          unchangedIntl: Intl.DateTimeFormat === dateTimeFormat,
          unchangedDate: Date.prototype.toTemporalInstant === dateConversion,
          roundTrip: instant.toString(),
          calendar: Temporal.PlainDate.from("2026-09-25").withCalendar("hebrew").calendarId,
          nextDayHour: after.hour,
          elapsedHours: before.until(after, { largestUnit: "hours" }).hours,
        }));
      `),
    ).toEqual({
      globalAbsent: true,
      unchangedIntl: true,
      unchangedDate: true,
      roundTrip: "2026-09-25T12:34:56.123456789Z",
      calendar: "hebrew",
      nextDayHour: 12,
      elapsedHours: 23,
    });
  });

  it("exposes the standard type namespace and date-only API to consumers", () => {
    const date: Temporal.PlainDate = Temporal.PlainDate.from("2024-02-28");
    expect(date.add({ days: 1 }).toString()).toBe("2024-02-29");
    expect(date.toString()).toBe("2024-02-28");
  });
});
