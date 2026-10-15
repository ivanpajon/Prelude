import { describe, expect, it } from "vitest";
import components from "../components.json";
import manifest from "../package.json";

// The shadcn CLI writes imports such as @repo/ui/hooks/use-mobile from these aliases. Other
// workspace packages resolve them through the package exports, so each alias needs one.
describe("shadcn aliases", () => {
  it.each(Object.entries(components.aliases))("exports the %s alias %s", (_name, alias) => {
    expect(alias.startsWith(`${manifest.name}/`)).toBe(true);
    const subpath = `.${alias.slice(manifest.name.length)}/example`;
    const folders = Object.keys(manifest.exports).filter((key) => key.endsWith("/*"));
    expect(folders.some((key) => subpath.startsWith(key.slice(0, -1)))).toBe(true);
  });
});
