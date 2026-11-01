import { describe, expect, it } from 'vitest';

import { legacyTarget } from '@/layouts/navModel';

describe('legacyTarget', () => {
  // Bookmarks and links from older releases must land on the regrouped pages.
  it.each([
    ['/groups', '', '/clients#groups'],
    ['/hosts', '', '/nodes#hosts'],
    ['/routing', '', '/connections#routing'],
    ['/xray', '#dns', '/connections#dns'],
    ['/xray', '#advanced', '/settings#xray-advanced'],
    ['/xray', '', '/settings#xray'],
    ['/settings', '#telegram', '/notifications#telegram'],
    ['/subscriptions', '', '/settings#subscription'],
    ['/subscriptions', '#formats', '/settings#subscription-formats'],
    ['/subscriptions', '#balancers', '/settings#subscription-balancers'],
  ])('%s%s → %s', (path, hash, want) => {
    expect(legacyTarget(path, hash)).toBe(want);
  });

  it('leaves current locations alone', () => {
    expect(legacyTarget('/settings', '#security')).toBeNull();
    expect(legacyTarget('/settings', '#subscription-formats')).toBeNull();
    expect(legacyTarget('/clients', '#groups')).toBeNull();
  });
});
