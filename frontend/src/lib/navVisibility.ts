/** Nav keys that can be hidden from the sidebar / command palette. */
export const HIDEABLE_NAV_KEYS = [
  '/',
  '/clients',
  '/connections',
  '/nodes',
  '/notifications',
  '/settings',
  '/api-docs',
] as const;

export type HideableNavKey = (typeof HIDEABLE_NAV_KEYS)[number];

export type NavVisibility = {
  /** Keys listed here are omitted from the sidebar (except logout). */
  hidden: string[];
};

export const DEFAULT_NAV_VISIBILITY: NavVisibility = { hidden: [] };

// Older bundles may still carry showRouting or pre-1.4.8 keys; both are ignored.
export function parseNavVisibility(raw: unknown): NavVisibility {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_NAV_VISIBILITY };
  const obj = raw as Record<string, unknown>;
  const hidden = Array.isArray(obj.hidden)
    ? obj.hidden.filter((k): k is string => typeof k === 'string')
    : [];
  return { hidden };
}

export function isNavKeyVisible(key: string, vis: NavVisibility): boolean {
  const base = key.split('#')[0] || key;
  return !vis.hidden.includes(base) && !vis.hidden.includes(key);
}
