import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';

import { TopClientsCard } from '@/pages/index/dashboard/LiveCards';
import { HttpUtil, Msg } from '@/utils';
import { renderWithProviders } from './test-utils';

afterEach(() => vi.restoreAllMocks());

const GB = 1024 ** 3;

describe('top clients all-time toggle', () => {
  // The current-period ranking resets with the counters; "All time" must show
  // the server's all-time ranking instead, heaviest first.
  it('switches from the current limit period to all-time totals', async () => {
    const get = vi.spyOn(HttpUtil, 'get').mockResolvedValue(
      new Msg(true, '', {
        clients: [
          { email: 'veteran@x', up: 40 * GB, down: 60 * GB },
          { email: 'fresh@x', up: GB, down: GB },
        ],
        inbounds: {},
      }),
    );
    renderWithProviders(
      <TopClientsCard
        clients={[
          { email: 'fresh@x', traffic: { up: GB, down: GB }, totalGB: 0 },
          { email: 'veteran@x', traffic: { up: 0, down: 512 }, totalGB: 0 },
        ]}
      />,
    );
    const names = () =>
      [...document.querySelectorAll('.dash-list-col .dash-ellipsis')].map((n) => n.textContent);
    expect(names()).toEqual(['fresh@x', 'veteran@x']);
    expect(get).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('radio', { name: 'All time' }));

    await waitFor(() => expect(names()).toEqual(['veteran@x', 'fresh@x']));
    expect(get).toHaveBeenCalledWith('/panel/api/server/allTimeTraffic', undefined, {
      silent: true,
    });
    expect(screen.getByText('100.00 GB')).toBeTruthy();
  });
});
