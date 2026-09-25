# Animation and morphing icons

`@repo/ui/components/motion-provider` configures Motion to respect the user's reduced-motion preference. The application mounts it inside its client providers. Motion disables transform and layout animation when that preference is active; color and opacity transitions remain available. Use `useReducedMotion` from `motion/react` when an effect needs a different alternative, such as disabling autoplay.

The task-list example uses `motion.li` with `layout="position"` to animate row positions when the user switches density or changes the list. `initial={false}` prevents an entrance animation during hydration. Keep animation decisions tied to existing application state rather than adding a separate animation store.

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

References: [Motion configuration](https://motion.dev/docs/react-motion-config), [Motion accessibility](https://motion.dev/docs/react-accessibility), [Morphicons](https://github.com/guillermolg00/morphicons).
