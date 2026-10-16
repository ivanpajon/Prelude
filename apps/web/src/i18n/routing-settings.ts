export const routingModes = ["always", "never"] as const;
export type RoutingMode = (typeof routingModes)[number];
export type RoutingSettings = { defaultMode: RoutingMode; demoEnabled: boolean };

/**
 * Consumer configuration: set `demoEnabled: false` to hide the public Language in URL switch and
 * enforce one routing policy. This file has no imports, so the browser tests can read the same
 * settings and skip what they turn off.
 */
export const routingSettings: RoutingSettings = { defaultMode: "always", demoEnabled: true };
export const DEFAULT_ROUTING_MODE = routingSettings.defaultMode;
export const ROUTING_DEMO_ENABLED = routingSettings.demoEnabled;
