# Candidate project skills

Reviewed on 2026-09-25. This is a shortlist, not an installed skill bundle. The review checked the skills.sh leaderboard, searched with the Skills CLI, read upstream `SKILL.md` files and relevant references, and checked repository stars through GitHub. Counts below are approximate snapshots; they describe adoption, not a guarantee of correctness.

Start with React best practices, shadcn, and accessibility review. Add the Next.js workflows when their additional browser/test tooling is wanted. None of these choices requires a database, authentication provider, or deployment platform.

| Priority | Skill and inspected source | Why it fits | Popularity and compatibility notes |
| --- | --- | --- | --- |
| 1 | [vercel-react-best-practices](https://github.com/vercel-labs/agent-skills/blob/main/skills/react-best-practices/SKILL.md) | SSR request isolation, parallel fetching, Suspense, hydration, and bundle size. | Vercel; [743K installs](https://www.skills.sh/vercel-labs/agent-skills/vercel-react-best-practices), repository 31.5K stars. Adapt SWR examples to the existing TanStack Query setup. Do not add a second client cache or a shared cache for personalized data. |
| 2 | [shadcn](https://github.com/shadcn-ui/ui/blob/main/skills/shadcn/SKILL.md) | Component discovery, semantic design tokens, composition, and updating generated components. | Official shadcn source; [272K installs](https://www.skills.sh/shadcn/ui/shadcn), repository 124.6K stars. Its [Base/Radix reference](https://github.com/shadcn-ui/ui/blob/main/skills/shadcn/rules/base-vs-radix.md) explicitly distinguishes Base UI `render` from Radix `asChild`. Retain this project's Base UI selection and shared `@repo/ui` paths. |
| 3 | [web-design-guidelines](https://github.com/vercel-labs/agent-skills/blob/main/skills/web-design-guidelines/SKILL.md) | Keyboard access, focus, labels, reduced motion, touch interaction, and hydration review. | Vercel; [667K installs](https://www.skills.sh/vercel-labs/agent-skills/web-design-guidelines), repository 31.5K stars. Fetches current rules during a review; it needs network access. Product conventions such as copy style and which state belongs in URLs remain project decisions. |
| 4 | [next-dev-loop](https://github.com/vercel/next.js/blob/canary/skills/next-dev-loop/SKILL.md) | Cross-check Next.js compilation/runtime errors through `/_next/mcp` and an actual browser. Particularly useful for errors that production builds miss. | Official Next.js source; [16.3K installs](https://www.skills.sh/vercel/next.js/next-dev-loop), repository 142.4K stars. Requires Next.js 16.3+, Turbopack, and `agent-browser` >=0.31.1. Its shell examples use Bash and suggest a global browser CLI install; adapt those to PowerShell and the project's tooling policy before use. |
| 5 | [next-cache-components-optimizer](https://github.com/vercel/next.js/blob/canary/skills/next-cache-components-optimizer/SKILL.md) | Verify that meaningful static content renders immediately while request data streams through narrow Suspense boundaries. | Official Next.js source; [14.5K installs](https://www.skills.sh/vercel/next.js/next-cache-components-optimizer), repository 142.4K stars. Matches Next.js 16.3+ with Cache Components already enabled. Adds `@next/playwright` matching Next.js and an explicitly enabled testing API for test builds; that API must stay disabled in deployed production. The workflow supports local builds without requiring Vercel. |
| 6 | [vitest](https://github.com/antfu/skills/blob/main/skills/vitest/SKILL.md) | Mocking, test fixtures, coverage, jsdom, and separate test projects. | Anthony Fu; [37.5K installs](https://www.skills.sh/antfu/skills/vitest), repository 5.9K stars. The inspected skill identifies its source as a June 2026 Vitest 5 beta snapshot. Check options against the installed stable Vitest version; preserve our existing node/DOM projects and Testing Library cleanup. |
| 7 | [vercel-composition-patterns](https://github.com/vercel-labs/agent-skills/blob/main/skills/composition-patterns/SKILL.md) | Reusable component APIs, compound components, and React 19 context patterns. | Vercel; [356K installs](https://www.skills.sh/vercel-labs/agent-skills/vercel-composition-patterns), repository 31.5K stars. Useful as shared UI grows. Its preference for children over render props does not replace Base UI's required `render` composition API. |
| 8 | [review-animations](https://github.com/emilkowalski/skills/blob/main/skills/review-animations/SKILL.md) | Optional focused review of animation timing, interruptibility, reduced motion, and rendering cost. | Emil Kowalski; [179K installs](https://www.skills.sh/emilkowalski/skills/review-animations), repository 41.1K stars. This is an opinionated review skill, not a Motion API reference. It prohibits animation for all keyboard actions and prefers only transform/opacity animation; apply those as design guidance rather than automatically deleting the template's intentional Morphicons path transitions. |

## Project-local installation commands

Run selected commands from the repository root. The flags were checked against Skills CLI 1.7.0 help and its [Codex adapter](https://github.com/vercel-labs/skills/blob/main/src/agents.ts): project scope is the default, `--agent codex` selects Codex, `--skill` selects named skills, and `--copy` avoids Windows symlink requirements. Omitting `--global` keeps these in this repository's `.agents/skills/`. Review and commit installed skill files and the generated `skills-lock.json` alongside the project.

```powershell
# React, accessibility, and optional component architecture.
pnpm dlx skills@1.7.0 add vercel-labs/agent-skills --skill vercel-react-best-practices web-design-guidelines vercel-composition-patterns --agent codex --copy --yes

# Official shadcn skill, including Base UI guidance.
pnpm dlx skills@1.7.0 add shadcn-ui/ui --skill shadcn --agent codex --copy --yes

# Next.js runtime verification and Cache Components optimization.
pnpm dlx skills@1.7.0 add https://github.com/vercel/next.js/tree/canary/skills --skill next-dev-loop next-cache-components-optimizer --agent codex --copy --yes

# Unit/component testing reference.
pnpm dlx skills@1.7.0 add antfu/skills --skill vitest --agent codex --copy --yes

# Optional animation review.
pnpm dlx skills@1.7.0 add emilkowalski/skills --skill review-animations --agent codex --copy --yes
```

These are proposed installation commands; no skills were installed during the review. Discovery confirmed the official shadcn skill using `--list`. GitHub source files were verified for the remaining recommendations; the Next.js repository discovery attempt was too slow to use as an installation check. The `canary` path above selects the upstream skill source, not a request to upgrade this project's Next.js package to a prerelease. Keep its advice aligned with the installed stable framework and bundled `next/dist/docs`.

## ArkType and Motion gaps

**ArkType:** the search found [oakoss/agent-skills: arktype-validation](https://github.com/oakoss/agent-skills/blob/main/skills/arktype-validation/SKILL.md), with 132 installs and only 16 repository stars. It includes useful schema syntax, but also promotes ArkEnv/Vite integration and says ArkType is unsuitable for JSON Schema output, while the [official Type API](https://arktype.io/docs/type-api) includes `toJsonSchema`. I would not install it unchanged as the template's default.

A small project-owned `arktype-orpc-contracts` skill would be more precise: browser-safe schemas in `@repo/contracts`, input/output validation, morph input versus output types, stable [oRPC v1 contracts](https://v1.orpc.dev/docs/contract-first/implement-contract), server-only implementation boundaries, and tests proving invalid inputs and outputs are rejected. It should use the existing repository abstraction and avoid introducing a database or web server framework.

**Motion:** search results advertised a free official `motion-react` skill, but live checks of `motion.dev/docs/react-app-builders` and `motion.dev/.well-known/agent-skills/index.json` returned 404; `skills add https://motion.dev --list` also failed discovery. It is not a verified installable recommendation at this time. The separately documented [Motion AI Kit](https://motion.dev/docs/ai-kit-context) requires Motion+, so it is not a default for this template.

Use [the existing Motion guide](./motion.md) as the basis of a small `motion-morphicons` project skill: `motion/react-m` components, lazy `domMax` features, deterministic server rendering, the shared `MotionProvider`, the separate Morphicons reduced-motion policy, accessible names, and keyboard/reduced-motion browser checks. This would complement the optional animation review skill without adding a paid service or outdated `framer-motion` dependency.

## Keep the template's existing decisions

- Biome remains the source formatter and linter. Skills are guidance; they should not introduce ESLint, Prettier, or competing hooks.
- Keep TanStack Query for server data, nuqs for URL state, and Zustand for shared local UI state. Provider/composition examples do not change that ownership.
- Preserve Base UI primitives, Tailwind 4 tokens, the shared `cn` export, and the monorepo package boundaries.
- Check Next.js advice against the installed framework's bundled documentation. The older `vercel-labs/next-skills/next-best-practices` and `next-cache-components` directory pages returned 404 during this review; do not copy their old install commands blindly.
- Check oRPC examples against its pinned stable release and v1 documentation. Generic backend skills that assume a database, authentication service, or beta oRPC API are outside the template's defaults.
