import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router';

import { OutboundsCard } from '@/pages/index/dashboard/HealthCards';
import type { OutboundHealth } from '@/generated/zod';
import { renderWithProviders } from './test-utils';

const health = (p: Partial<OutboundHealth>): OutboundHealth => ({
  tag: 'x',
  protocol: 'vless',
  checked: true,
  alive: true,
  delay: 0,
  failures: 0,
  checkedAt: 0,
  ...p,
});

describe('outbound health card', () => {
  // Every proxy outbound is listed whether or not it was probed yet, and a
  // first failure reads as "rechecking", not as down.
  it('shows each outbound with its own state', () => {
    const view = renderWithProviders(
      <MemoryRouter>
        <OutboundsCard
          outbounds={[
            health({ tag: 'new', checked: false }),
            health({ tag: 'fin', delay: 87 }),
            health({ tag: 'flaky', failures: 1, error: 'timeout' }),
            health({ tag: 'warp', alive: false, failures: 3, error: 'i/o timeout' }),
          ]}
        />
      </MemoryRouter>,
    );
    const rows = [...view.container.querySelectorAll('.dash-list-row')].map((r) => r.textContent);
    expect(rows).toEqual(['warpDown', 'flakyFailed, rechecking', 'newChecking…', 'fin87 ms']);
  });
});
