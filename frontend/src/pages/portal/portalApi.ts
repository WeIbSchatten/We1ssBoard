import { PortalProfileSchema } from '@/schemas/portal';
import type { PortalProfile } from '@/schemas/portal';

/** An API failure carrying the portal's error code, e.g. invalid_credentials or nothing_visible. */
export class PortalApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryAfter?: number;

  constructor(code: string, status: number, retryAfter?: number) {
    super(code);
    this.name = 'PortalApiError';
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

const base = () => `${window.__PORTAL__?.basePath ?? '/portal'}/api`;

// The cookie session pairs with a CSRF token the login and profile responses hand out.
let csrfToken = '';

async function call(method: string, path: string, body?: unknown): Promise<unknown> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (method !== 'GET' && csrfToken) headers['X-CSRF-Token'] = csrfToken;
  const res = await fetch(`${base()}${path}`, {
    method,
    headers,
    credentials: 'same-origin',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data: unknown = res.status === 204 ? undefined : await res.json().catch(() => undefined);
  if (!res.ok) {
    const code = (data as { error?: string } | undefined)?.error ?? 'internal';
    const retry = Number(res.headers.get('Retry-After'));
    throw new PortalApiError(
      code,
      res.status,
      Number.isFinite(retry) && retry > 0 ? retry : undefined,
    );
  }
  return data;
}

export const portalApi = {
  async login(login: string, password: string): Promise<{ mustChange: boolean }> {
    const data = (await call('POST', '/login', { login, password, client: 'web' })) as {
      mustChange?: boolean;
      csrfToken?: string;
    };
    csrfToken = data?.csrfToken ?? '';
    return { mustChange: !!data?.mustChange };
  },
  async logout(): Promise<void> {
    await call('POST', '/logout');
    csrfToken = '';
  },
  async me(): Promise<PortalProfile> {
    const profile = PortalProfileSchema.parse(await call('GET', '/me'));
    if (profile.csrfToken) csrfToken = profile.csrfToken;
    return profile;
  },
  async changePassword(current: string, next: string): Promise<void> {
    await call('POST', '/password', { current, new: next });
  },
  async replaceHidden(keys: { inboundId: number; hostId: number }[]): Promise<void> {
    await call('PUT', '/hidden', { keys });
  },
  async revokeDevice(id: number): Promise<void> {
    await call('DELETE', `/devices/${id}`);
  },
};
