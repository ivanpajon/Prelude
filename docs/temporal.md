# Dates and times with Temporal

Import the standard Temporal API from the browser-safe `@repo/temporal` package in server or client code:

```ts
import { Temporal } from "@repo/temporal";

const birthday: Temporal.PlainDate = Temporal.PlainDate.from("2000-02-29");
const instant = Temporal.Instant.from("2026-09-25T12:00:00Z");
const madridTime = instant.toZonedDateTimeISO("Europe/Madrid");
```

The package re-exports `temporal-polyfill/full` 1.0.5. Its local entry uses the runtime's native `Temporal` when available and supplies the polyfill otherwise, without modifying `globalThis`, `Date`, or `Intl`. The full entry retains the standard non-ISO calendar systems. Node 26 supplies native Temporal; the fallback covers browsers without it. No experimental Node flags or global TypeScript declarations are needed for these imports. See the [polyfill entrypoint documentation](https://github.com/fullcalendar/temporal-polyfill/blob/main/polyfill/README.md#package-entrypoints).

This is a synchronous import: fallback code is bundled when a client module imports this package, even if that browser eventually selects native Temporal. Keep date logic on the server when appropriate. Native detection happens once when the module loads. Once every supported runtime has native Temporal, the shared boundary gives you one place to remove the fallback.

Choose types by meaning: `PlainDate` for a calendar date without a time zone, `Instant` for an exact point in time, and `ZonedDateTime` when a named time zone matters. Calendar days can be shorter or longer than 24 hours across daylight-saving changes. Specify the intended time zone instead of relying on the server's or browser's local zone.

Serialize values as ISO strings at oRPC, persistence, and Server Component boundaries, then reconstruct the appropriate Temporal type on the receiving side. This keeps transport and storage technology independent. Preserve the zone annotation when serializing a `ZonedDateTime`; an instant alone does not retain the originating zone.

For hydrated UI, pass a stable serialized value from the server. Avoid computing `Temporal.Now` separately during the server render and first client render, or formatting the same value with different locale/time-zone defaults. Read the clock after hydration for a live client clock.

The runtime tests exercise both native selection and fallback in fresh Node processes, check that globals stay unchanged, and cover nanosecond serialization, non-ISO calendars, and a calendar-day transition through daylight saving. Run them with `pnpm exec vitest run packages/temporal`.
