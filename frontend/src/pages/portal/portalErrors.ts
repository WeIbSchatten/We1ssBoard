import type { TFunction } from 'i18next';

import { PortalApiError } from './portalApi';

export function isUnauthorized(err: unknown): boolean {
  return err instanceof PortalApiError && err.code === 'unauthorized';
}

// Maps a portal API error code to a message; unknown codes fall back to the generic one.
export function portalErrorText(t: TFunction, err: unknown): string {
  if (!(err instanceof PortalApiError)) return t('portal.error');
  switch (err.code) {
    case 'invalid_credentials':
      return t('portal.login.invalid');
    case 'too_many_attempts':
      return t('portal.login.tooMany', { seconds: err.retryAfter ?? 60 });
    case 'wrong_password':
      return t('portal.password.wrong');
    case 'weak_password':
      return t('portal.password.weak');
    case 'ldap_managed':
      return t('portal.security.ldap');
    case 'nothing_visible':
      return t('portal.keys.lastVisible');
    case 'client_disabled':
      return t('portal.readOnly');
    case 'csrf':
      return t('portal.csrf');
    default:
      return t('portal.error');
  }
}
