import { describe, expect, it } from 'vitest';

import { pickableInbounds } from '@/lib/inbounds/pickable';

const ib = (id: number, hidden?: boolean) => ({ id, protocol: 'vless', hidden });

describe('pickableInbounds', () => {
  // A node marked hidden is not offered when attaching inbounds to clients.
  it('leaves out inbounds of hidden nodes', () => {
    expect(pickableInbounds([ib(1), ib(2, true), ib(3, false)], []).map((i) => i.id)).toEqual([
      1, 3,
    ]);
  });

  // A client already attached there keeps the chip, or saving the form would detach it.
  it('keeps a hidden inbound the client is already attached to', () => {
    expect(pickableInbounds([ib(1), ib(2, true)], [2]).map((i) => i.id)).toEqual([1, 2]);
  });
});
