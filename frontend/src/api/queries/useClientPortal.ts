import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { keys } from '@/api/queryKeys';
import { ClientPortalAccessSchema, ClientPortalPasswordSchema } from '@/generated/zod';
import type { ClientPortalAccess, ClientPortalPassword } from '@/generated/types';
import { HttpUtil } from '@/utils';
import { parseMsg } from '@/utils/zodValidate';

const BASE = '/panel/api/clients';

async function fetchAccess(email: string): Promise<ClientPortalAccess> {
  const msg = await HttpUtil.get(`${BASE}/portal/${encodeURIComponent(email)}`, undefined, {
    silent: true,
  });
  if (!msg?.success) throw new Error(msg?.msg || 'Failed to fetch portal access');
  const validated = parseMsg(msg, ClientPortalAccessSchema, 'clients/portal');
  if (!validated.obj) throw new Error('Empty portal access');
  return validated.obj;
}

export function useClientPortalAccess(email?: string) {
  return useQuery({
    queryKey: keys.clientPortal(email ?? ''),
    queryFn: () => fetchAccess(email!),
    enabled: !!email,
  });
}

export function useClientPortalMutations(email: string) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: keys.clientPortal(email) });
  const issue = useMutation({
    mutationFn: async (): Promise<ClientPortalPassword | undefined> => {
      const msg = await HttpUtil.post(`${BASE}/portalPassword/${encodeURIComponent(email)}`);
      if (!msg?.success) return undefined;
      return parseMsg(msg, ClientPortalPasswordSchema, 'clients/portalPassword').obj ?? undefined;
    },
    onSuccess: invalidate,
  });
  const revoke = useMutation({
    mutationFn: () => HttpUtil.post(`${BASE}/portalRevoke/${encodeURIComponent(email)}`),
    onSuccess: invalidate,
  });
  return {
    issuePassword: issue.mutateAsync,
    revokeAccess: revoke.mutateAsync,
    pending: issue.isPending || revoke.isPending,
  };
}
