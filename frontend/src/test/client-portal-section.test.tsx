import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';

import ClientPortalSection from '@/pages/clients/ClientPortalSection';
import { HttpUtil, Msg } from '@/utils';

import { renderWithProviders } from './test-utils';

function mockHttp(
  access: Record<string, unknown>,
  issued = { password: 'k7QmN2pXa9Rz', sentToTelegram: true },
) {
  const get = vi.spyOn(HttpUtil, 'get').mockResolvedValue(
    new Msg(true, '', {
      status: 'own',
      hiddenKeys: 2,
      devices: 1,
      portalEnabled: true,
      ...access,
    }),
  );
  const post = vi.spyOn(HttpUtil, 'post').mockResolvedValue(new Msg(true, '', issued));
  return { get, post };
}

afterEach(() => vi.restoreAllMocks());

describe('ClientPortalSection', () => {
  it('shows the access status, hidden keys and devices', async () => {
    mockHttp({});
    renderWithProviders(<ClientPortalSection email="alice" />);
    expect(await screen.findByText('Own password')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy();
  });

  it('issues a temporary password and shows it once with the Telegram note', async () => {
    const { post } = mockHttp({});
    renderWithProviders(<ClientPortalSection email="alice" />);
    fireEvent.click(await screen.findByRole('button', { name: /Issue temporary password/ }));
    await waitFor(() =>
      expect(post.mock.calls[0]?.[0]).toBe('/panel/api/clients/portalPassword/alice'),
    );
    expect(await screen.findByText('k7QmN2pXa9Rz')).toBeTruthy();
    expect(screen.getByText('Also sent to the client in Telegram.')).toBeTruthy();
  });

  it('asks to save a new client first', () => {
    const { get } = mockHttp({});
    renderWithProviders(<ClientPortalSection />);
    expect(screen.getByText('Save the client first to manage portal access.')).toBeTruthy();
    expect(get).not.toHaveBeenCalled();
  });

  it('warns when the portal is off and offers no actions', async () => {
    mockHttp({ portalEnabled: false });
    renderWithProviders(<ClientPortalSection email="alice" />);
    expect(
      await screen.findByText('The client portal is off. Turn it on in Subscription settings.'),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Issue temporary password/ })).toBeNull();
  });
});
