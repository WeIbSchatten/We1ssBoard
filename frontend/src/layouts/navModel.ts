export type NavSection = 'main' | 'users' | 'traffic' | 'infra' | 'system';

export interface NavRoute {
  key: string;
  titleKey: string;
  hintKey: string;
  section: NavSection;
}

// Single source for sidebar order, top-bar titles and page hints. Pages group
// related screens as tabs, so each task has one place in the sidebar.
export const NAV_ROUTES: NavRoute[] = [
  { key: '/', titleKey: 'menu.dashboard', hintKey: 'menu.hint.dashboard', section: 'main' },
  { key: '/clients', titleKey: 'menu.clients', hintKey: 'menu.hint.clients', section: 'users' },
  {
    key: '/connections',
    titleKey: 'menu.connections',
    hintKey: 'menu.hint.connections',
    section: 'traffic',
  },
  { key: '/nodes', titleKey: 'menu.nodesHosts', hintKey: 'menu.hint.nodesHosts', section: 'infra' },
  {
    key: '/notifications',
    titleKey: 'menu.notifications',
    hintKey: 'menu.hint.notifications',
    section: 'system',
  },
  { key: '/settings', titleKey: 'menu.settings', hintKey: 'menu.hint.settings', section: 'system' },
  { key: '/api-docs', titleKey: 'menu.apiDocs', hintKey: 'menu.hint.apiDocs', section: 'system' },
];

export const NAV_SECTION_TITLE_KEYS: Record<Exclude<NavSection, 'main'>, string> = {
  users: 'menu.sectionUsers',
  traffic: 'menu.sectionTraffic',
  infra: 'menu.sectionInfra',
  system: 'menu.sectionSystem',
};

// Where each pre-1.4.8 page or section lives now; keys are "path" or "path#hash".
const LEGACY_LOCATIONS: Record<string, string> = {
  '/inbounds': '/connections#inbounds',
  '/outbound': '/connections#outbounds',
  '/tg-web-proxy': '/connections#tg-web-proxy',
  '/routing': '/connections#routing',
  '/groups': '/clients#groups',
  '/hosts': '/nodes#hosts',
  '/xray': '/settings#xray',
  '/xray#basic': '/settings#xray',
  '/xray#advanced': '/settings#xray-advanced',
  '/xray#routing': '/connections#routing',
  '/xray#balancer': '/connections#balancers',
  '/xray#dns': '/connections#dns',
  '/xray#outbound': '/connections#outbounds',
  '/settings#general': '/settings',
  '/settings#telegram': '/notifications#telegram',
  '/settings#discord': '/notifications#discord',
  '/settings#email': '/notifications#email',
  '/subscriptions': '/settings#subscription',
  '/subscriptions#general': '/settings#subscription',
  '/subscriptions#formats': '/settings#subscription-formats',
  '/subscriptions#balancers': '/settings#subscription-balancers',
};

// Maps an old location to its new home, or returns null when it is current.
export function legacyTarget(pathname: string, hash: string): string | null {
  const path = pathname.replace(/\/+$/, '') || '/';
  const slug = hash.replace(/^#/, '');
  if (slug && LEGACY_LOCATIONS[`${path}#${slug}`]) return LEGACY_LOCATIONS[`${path}#${slug}`];
  return LEGACY_LOCATIONS[path] ?? null;
}

export function routeForPath(pathname: string): NavRoute {
  const clean = pathname.replace(/\/+$/, '') || '/';
  return NAV_ROUTES.find((r) => r.key === clean) ?? NAV_ROUTES[0];
}
