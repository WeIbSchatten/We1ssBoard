import { describe, expect, it } from 'vitest';

import { visibleDashboardData } from '@/pages/index/dashboard/visibility';

const inbound = (id: number, nodeId?: number) => ({ id, nodeId, protocol: 'vless' });

describe('dashboard visibility of hidden nodes', () => {
  // A node marked hidden must vanish from the dashboard: its inbounds, the
  // connections through them and clients online only there.
  it('drops a hidden node from inbounds, connections and the online list', () => {
    const got = visibleDashboardData({
      nodes: [
        { id: 7, hidden: true },
        { id: 8, hidden: false },
      ],
      inbounds: [inbound(1), inbound(2, 7), inbound(3, 8)],
      connections: {
        'local@x': [{ inboundId: 1, exact: true }],
        'relay@x': [{ inboundId: 2, exact: true }],
        'both@x': [
          { inboundId: 2, exact: false },
          { inboundId: 3, exact: false },
        ],
      },
      online: ['local@x', 'relay@x', 'both@x', 'unattached@x'],
    });

    expect(got.inbounds.map((i) => i.id)).toEqual([1, 3]);
    expect(got.connections).toEqual({
      'local@x': [{ inboundId: 1, exact: true }],
      'both@x': [{ inboundId: 3, exact: false }],
    });
    // A client with no attached inbound has nothing to hide, so it stays.
    expect(got.online).toEqual(['local@x', 'both@x', 'unattached@x']);
  });
});
