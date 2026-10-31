import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ClientActiveConnection } from '@/pages/clients/RowCells';
import type { InboundOption } from '@/hooks/useClients';

const INBOUNDS: Record<number, InboundOption> = {
  1: { id: 1, tag: 'in-vless', remark: 'DE', protocol: 'vless' },
  2: { id: 2, tag: 'in-trojan', remark: 'NL', protocol: 'trojan' },
};
const COLORS = { vless: 'blue', trojan: 'volcano' };

describe('active connection cell', () => {
  // The FR: the column names the protocol in use now, not every attached inbound.
  it('shows the protocol and inbound of a connection the access log confirmed', () => {
    render(
      <ClientActiveConnection
        connections={[{ inboundId: 2, exact: true }]}
        inboundsById={INBOUNDS}
        protocolColors={COLORS}
      />,
    );
    const chip = screen.getByText('TROJAN').closest('.ant-tag');
    expect(chip?.textContent).toBe('TROJANNL');
    expect(chip?.getAttribute('data-guess')).toBeNull();
    expect(screen.queryByText('VLESS')).toBeNull();
  });

  // Without an access log the backend only infers; the cell must not pass a
  // guess off as fact.
  it('marks an inferred connection as a guess', () => {
    render(
      <ClientActiveConnection
        connections={[{ inboundId: 1, exact: false }]}
        inboundsById={INBOUNDS}
        protocolColors={COLORS}
      />,
    );
    expect(screen.getByText('VLESS').closest('.ant-tag')?.getAttribute('data-guess')).toBe('true');
  });

  it('shows a dash for a client with no live connection', () => {
    render(
      <ClientActiveConnection
        connections={undefined}
        inboundsById={INBOUNDS}
        protocolColors={COLORS}
      />,
    );
    expect(screen.getByText('—')).toBeTruthy();
  });
});
