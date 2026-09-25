# Animation and morphing icons

`@repo/ui/components/motion-provider` configures Motion to respect the user's reduced-motion preference. The application mounts it inside its client providers. Motion disables transform and layout animation when that preference is active; color and opacity transitions remain available. Use `useReducedMotion` from `motion/react` when an effect needs a different alternative, such as disabling autoplay.

The same provider uses `LazyMotion` to load `@repo/ui/lib/motion-features` after the initial render. That separate module exports `domMax`, which includes the layout features these examples need. Components import `* as m` from `motion/react-m` and render `m.div` or `m.li`, keeping animation features out of their initial module bundle. The provider's `strict` flag catches accidental full `motion` components beneath it. The initial HTML remains visible while features load; an early interaction still updates the underlying layout even if its animation is not ready yet.

The task-list example uses `m.li` with `layout="position"` to animate row positions when the user switches density or changes the list. `initial={false}` prevents an entrance animation during hydration. Keep animation decisions tied to existing application state rather than adding a separate animation store.

The home page also has two independent previews in `apps/web/src/components/animation-examples.tsx`. **Start / End** changes a tile's flex alignment while Motion animates its position with a spring. **Save idea** toggles a large bookmark between Lucide's `Bookmark` and `BookmarkCheck` icon data through Morphicons. Both previews start with deterministic state, have keyboard-accessible controls and text feedback, and reset on reload. Their local state belongs to each component; no server data or shared state store is needed. Reduced motion removes the layout and icon morph transitions while keeping both controls functional. Remove the component and its page import to remove these previews.

`@repo/ui/components/morph-icon` wraps Morphicons with `reducedMotion="user"` by default. The library's own default is `"never"`, so use this shared wrapper for consistent accessibility. It accepts the native Morphicons props, including `"always"` for instant changes in screenshots or a local reduced-motion policy. Morphicons uses its own animation engine; Motion's provider does not configure it.

```tsx
import { MorphIcon } from "@repo/ui/components/morph-icon";
import { Menu, X } from "lucide";

<button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
  <MorphIcon icon={open ? X : Menu} />
  Menu
</button>;
```

Morphicons consumes icon data from `lucide`, not components from `lucide-react`. Keep these packages at matching versions and use named imports so unused icons can be removed from the bundle. Custom stroke paths and compatible icon data from other libraries also work. The wrapper is decorative by default; supply `label` for a standalone meaningful icon. An icon-only button still needs its own accessible name.

Morphicons renders the starting SVG during server rendering and adopts it on hydration. Pass the same initial state on server and client; do not add a client-only loading placeholder or key the component by icon. The compact-view button shows this approach using the request-safe workbench store.

References: [Motion configuration](https://motion.dev/docs/react-motion-config), [Motion accessibility](https://motion.dev/docs/react-accessibility), [LazyMotion](https://motion.dev/docs/react-lazy-motion), [Motion bundle size](https://motion.dev/docs/react-reduce-bundle-size), [Morphicons](https://github.com/guillermolg00/morphicons).
