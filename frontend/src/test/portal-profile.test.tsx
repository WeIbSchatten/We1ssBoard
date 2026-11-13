import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';

import PortalProfileView from '@/pages/portal/PortalProfile';
import { PortalApiError, portalApi } from '@/pages/portal/portalApi';
import type { PortalProfile } from '@/schemas/portal';

import { renderWithProviders } from './test-utils';

const PROFILE: PortalProfile = {
  email: 'a.smirnova',
  enable: true,
  expiryTime: 0,
  totalGB: 0,
  up: 1024,
  down: 2048,
  group: '',
  subUrl: 'https://vpn.example.com/sub/s1',
  mustChange: false,
  ldap: false,
  keys: [
    { inboundId: 1, hostId: 0, remark: 'VLESS REALITY', protocol: 'vless', hidden: false },
    { inboundId: 2, hostId: 5, remark: 'Trojan CDN', protocol: 'trojan', hidden: false },
  ],
  devices: [{ id: 7, name: 'Pixel 8', createdAt: 1, lastUsedAt: 0 }],
};

function render(profile: Partial<PortalProfile> = {}) {
  const onChanged = vi.fn();
  renderWithProviders(
    <PortalProfileView
      profile={{ ...PROFILE, ...profile }}
      onChanged={onChanged}
      onUnauthorized={vi.fn()}
    />,
  );
  return { onChanged };
}

const keySwitch = (remark: string) =>
  screen
    .getByText(remark)
    .closest('.portal-key')
    ?.querySelector('button[role="switch"]') as HTMLButtonElement;

function openTab(name: RegExp) {
  fireEvent.click(screen.getByRole('tab', { name }));
}

afterEach(() => vi.restoreAllMocks());

describe('PortalProfileView', () => {
  it('hides a key by sending the whole hidden set', async () => {
    const put = vi.spyOn(portalApi, 'replaceHidden').mockResolvedValue();
    const { onChanged } = render();
    openTab(/My keys/);
    fireEvent.click(keySwitch('Trojan CDN'));
    await waitFor(() => expect(put).toHaveBeenCalledWith([{ inboundId: 2, hostId: 5 }]));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('keeps the last visible key on', () => {
    render({ keys: [PROFILE.keys[0], { ...PROFILE.keys[1], hidden: true }] });
    openTab(/My keys/);
    expect(keySwitch('VLESS REALITY').disabled).toBe(true);
    expect(screen.getByText('At least one key must stay in your subscription.')).toBeTruthy();
  });

  it('puts the switch back when the server refuses', async () => {
    vi.spyOn(portalApi, 'replaceHidden').mockRejectedValue(
      new PortalApiError('nothing_visible', 400),
    );
    render();
    openTab(/My keys/);
    fireEvent.click(keySwitch('Trojan CDN'));
    await waitFor(() => expect(keySwitch('Trojan CDN').getAttribute('aria-checked')).toBe('true'));
  });

  it('is read-only for a disabled client', () => {
    render({ enable: false });
    openTab(/My keys/);
    expect(keySwitch('VLESS REALITY').disabled).toBe(true);
    expect(keySwitch('Trojan CDN').disabled).toBe(true);
    expect(
      screen.getByText('Your account is disabled, so changes are not available.'),
    ).toBeTruthy();
  });

  it('signs a device out after confirmation', async () => {
    const del = vi.spyOn(portalApi, 'revokeDevice').mockResolvedValue();
    render();
    openTab(/Devices/);
    expect(screen.getByText('Pixel 8')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Sign out/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'OK' }));
    await waitFor(() => expect(del).toHaveBeenCalledWith(7));
  });

  it('shows the directory note instead of the password form for LDAP clients', () => {
    render({ ldap: true });
    openTab(/Security/);
    expect(screen.getByText('Your password is managed by the company directory.')).toBeTruthy();
    expect(screen.queryByLabelText('Current password')).toBeNull();
  });
});
