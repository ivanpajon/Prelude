// Native when available; the full fallback retains support for every standard calendar.
// This local entry does not install globals or patch Date/Intl.
export { Temporal } from "temporal-polyfill/full";
