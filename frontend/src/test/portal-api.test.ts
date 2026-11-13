import { afterEach, describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';

import { PortalApiError, portalApi } from '@/pages/portal/portalApi';

function reply(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

const PROFILE = {
  email: 'a.smirnova',
  enable: true,
  expiryTime: 0,
  totalGB: 0,
  up: 1,
  down: 2,
  group: '',
  subUrl: 'https://vpn.example.com/sub/s1',
  mustChange: false,
  ldap: false,
  keys: [{ inboundId: 1, hostId: 0, remark: 'VLESS', protocol: 'vless', hidden: false }],
  devices: null,
  csrfToken: 'csrf-from-me',
};

afterEach(() => vi.restoreAllMocks());

describe('portalApi', () => {
  it('logs in as a web client and sends the CSRF token on later writes', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(reply(200, { mustChange: false, csrfToken: 'csrf-1' }))
      .mockResolvedValueOnce(reply(204, undefined));

    await portalApi.login('a.smirnova', 'secret-pass');
    await portalApi.replaceHidden([{ inboundId: 1, hostId: 0 }]);

    const [loginUrl, loginInit] = fetchMock.mock.calls[0];
    expect(loginUrl).toBe('/portal/api/login');
    expect(JSON.parse(String(loginInit?.body))).toEqual({
      login: 'a.smirnova',
      password: 'secret-pass',
      client: 'web',
    });
    const [hiddenUrl, hiddenInit] = fetchMock.mock.calls[1];
    expect(hiddenUrl).toBe('/portal/api/hidden');
    expect(hiddenInit?.method).toBe('PUT');
    expect(new Headers(hiddenInit?.headers).get('X-CSRF-Token')).toBe('csrf-1');
  });

  it('reports the wait from Retry-After on a rate-limited login', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      reply(429, { error: 'too_many_attempts' }, { 'Retry-After': '30' }),
    );
    const err = await portalApi.login('a.smirnova', 'x').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PortalApiError);
    expect(err).toMatchObject({ code: 'too_many_attempts', status: 429, retryAfter: 30 });
  });

  it('turns an expired session into an unauthorized error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(reply(401, { error: 'unauthorized' }));
    await expect(portalApi.me()).rejects.toMatchObject({ code: 'unauthorized', status: 401 });
  });

  it('validates the profile and keeps the CSRF token it carries', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(reply(200, { ...PROFILE, extra: 'ignored' }))
      .mockResolvedValueOnce(reply(204, undefined))
      .mockResolvedValueOnce(reply(200, { ...PROFILE, email: undefined }));

    const me = await portalApi.me();
    expect(me.devices).toEqual([]);
    await portalApi.revokeDevice(7);
    expect(fetchMock.mock.calls[1][0]).toBe('/portal/api/devices/7');
    expect(new Headers(fetchMock.mock.calls[1][1]?.headers).get('X-CSRF-Token')).toBe(
      'csrf-from-me',
    );
    await expect(portalApi.me()).rejects.toBeInstanceOf(ZodError);
  });

  it('takes the CSRF token from a must-change answer so a reloaded page can change the password', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        reply(403, { error: 'must_change_password', csrfToken: 'csrf-after-reload' }),
      )
      .mockResolvedValueOnce(reply(204, undefined));

    await expect(portalApi.me()).rejects.toMatchObject({ code: 'must_change_password' });
    await portalApi.changePassword('temp-pass-1', 'my-own-pass');

    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe('/portal/api/password');
    expect(new Headers(init?.headers).get('X-CSRF-Token')).toBe('csrf-after-reload');
  });
});
