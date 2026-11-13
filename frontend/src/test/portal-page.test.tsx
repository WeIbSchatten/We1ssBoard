import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';

import PortalPage from '@/pages/portal/PortalPage';
import { PortalApiError, portalApi } from '@/pages/portal/portalApi';
import type { PortalProfile } from '@/schemas/portal';

import { renderWithProviders } from './test-utils';

export const PROFILE: PortalProfile = {
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
    { inboundId: 2, hostId: 0, remark: 'Trojan', protocol: 'trojan', hidden: false },
  ],
  devices: [],
};

const unauthorized = () => new PortalApiError('unauthorized', 401);

function fillLogin(password: string) {
  fireEvent.change(screen.getByLabelText('Login'), { target: { value: 'a.smirnova' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
}

afterEach(() => vi.restoreAllMocks());

describe('PortalPage', () => {
  it('shows the login form without a session and rejects a wrong password', async () => {
    vi.spyOn(portalApi, 'me').mockRejectedValue(unauthorized());
    vi.spyOn(portalApi, 'login').mockRejectedValue(new PortalApiError('invalid_credentials', 401));
    renderWithProviders(<PortalPage />);

    await screen.findByRole('button', { name: 'Sign in' });
    fillLogin('nope');
    expect(await screen.findByText('Wrong login or password')).toBeTruthy();
  });

  it('tells how long to wait after too many attempts', async () => {
    vi.spyOn(portalApi, 'me').mockRejectedValue(unauthorized());
    vi.spyOn(portalApi, 'login').mockRejectedValue(
      new PortalApiError('too_many_attempts', 429, 30),
    );
    renderWithProviders(<PortalPage />);

    await screen.findByRole('button', { name: 'Sign in' });
    fillLogin('nope');
    expect(await screen.findByText('Too many attempts. Try again in 30 s.')).toBeTruthy();
  });

  it('forces a temporary password change, then opens the profile', async () => {
    const me = vi
      .spyOn(portalApi, 'me')
      .mockRejectedValueOnce(unauthorized())
      .mockRejectedValueOnce(new PortalApiError('must_change_password', 403))
      .mockResolvedValue(PROFILE);
    vi.spyOn(portalApi, 'login').mockResolvedValue({ mustChange: true });
    const change = vi.spyOn(portalApi, 'changePassword').mockResolvedValue();
    renderWithProviders(<PortalPage />);

    await screen.findByRole('button', { name: 'Sign in' });
    fillLogin('temp-pass-1');
    await screen.findByText('Your password is temporary. Choose a new one to continue.');

    fireEvent.change(screen.getByLabelText('Current password'), {
      target: { value: 'temp-pass-1' },
    });
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'short' } });
    fireEvent.change(screen.getByLabelText('Repeat the new password'), {
      target: { value: 'short' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByText('At least 8 characters')).toBeTruthy();
    expect(change).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'my-own-pass' } });
    fireEvent.change(screen.getByLabelText('Repeat the new password'), {
      target: { value: 'my-own-pass' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    await waitFor(() => expect(change).toHaveBeenCalledWith('temp-pass-1', 'my-own-pass'));
    expect(await screen.findByText('a.smirnova')).toBeTruthy();
    expect(me).toHaveBeenCalledTimes(3);
  });

  it('returns to the login form when the session expires', async () => {
    vi.spyOn(portalApi, 'me').mockResolvedValueOnce(PROFILE).mockRejectedValue(unauthorized());
    vi.spyOn(portalApi, 'logout').mockRejectedValue(unauthorized());
    renderWithProviders(<PortalPage />);

    fireEvent.click(await screen.findByRole('button', { name: /Log out/ }));
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeTruthy();
  });

  it('offers Log out on the must-change screen', async () => {
    vi.spyOn(portalApi, 'me').mockRejectedValue(new PortalApiError('must_change_password', 403));
    renderWithProviders(<PortalPage />);
    await screen.findByText('Your password is temporary. Choose a new one to continue.');
    expect(screen.getByRole('button', { name: /Log out/ })).toBeTruthy();
  });
});
