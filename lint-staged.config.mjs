export default {
  "*.{js,jsx,ts,tsx,cjs,mjs,json,jsonc,css}": [
    "biome check --write --no-errors-on-unmatched --files-ignore-unknown=true",
  ],
};
