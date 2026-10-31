import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { keys } from '@/api/queryKeys';
import {
  RelayShareInfoSchema,
  RelaySnapshotSchema,
  RelayStatusSchema,
  TgWebProxyBindingListSchema,
  TgWebProxyRelaySummarySchema,
} from '@/generated/zod';
import type {
  TgWebProxyBindManyRequest,
  TgWebProxyBindRequest,
  TgWebProxyBinding,
  TgWebProxyBindingList,
  RelayApplyResult,
  RelayConfig,
  RelayInstallRequest,
  RelayJobStatus,
  RelayProfile,
  RelayShareInfo,
  RelaySnapshot,
  RelayStatus,
  TgWebProxyRelaySummary,
} from '@/generated/types';
import { HttpUtil } from '@/utils';
import { parseMsg } from '@/utils/zodValidate';

const BASE = '/panel/api/tgWebProxy';
const JSON_HEADERS = { headers: { 'Content-Type': 'application/json' } };

async function fetchStatus(): Promise<RelayStatus> {
  const msg = await HttpUtil.get(`${BASE}/status`, undefined, { silent: true });
  if (!msg?.success) throw new Error(msg?.msg || 'Failed to fetch tg-web-proxy status');
  const validated = parseMsg(msg, RelayStatusSchema, 'tgWebProxy/status');
  if (!validated.obj) throw new Error('Empty tg-web-proxy status');
  return validated.obj;
}

async function fetchSnapshot(): Promise<RelaySnapshot> {
  const msg = await HttpUtil.get(`${BASE}/config`, undefined, { silent: true });
  if (!msg?.success) throw new Error(msg?.msg || 'Failed to fetch tg-web-proxy config');
  const validated = parseMsg(msg, RelaySnapshotSchema, 'tgWebProxy/config');
  if (!validated.obj) throw new Error('Empty tg-web-proxy config');
  return validated.obj;
}

export function useTgWebProxyStatus() {
  return useQuery({
    queryKey: keys.tgWebProxy.status(),
    queryFn: fetchStatus,
    refetchInterval: (query) => (query.state.data?.job.state === 'running' ? 3000 : 10000),
  });
}

async function fetchOverview(): Promise<TgWebProxyRelaySummary[]> {
  const msg = await HttpUtil.get(`${BASE}/overview`, undefined, {
    silent: true,
  });
  if (!msg?.success) throw new Error(msg?.msg || 'Failed to fetch tg-web-proxy overview');
  return parseMsg(msg, TgWebProxyRelaySummarySchema.array(), 'tgWebProxy/overview').obj ?? [];
}

// One row per relay host (this panel and nodes), for the dashboard.
export function useTgWebProxyOverview() {
  return useQuery({
    queryKey: keys.tgWebProxy.overview(),
    queryFn: fetchOverview,
    refetchInterval: 30_000,
  });
}

export function useTgWebProxySnapshot() {
  return useQuery({
    queryKey: keys.tgWebProxy.config(),
    queryFn: fetchSnapshot,
  });
}

async function fetchRemoteSnapshot(nodeId: number): Promise<RelaySnapshot> {
  const msg = await HttpUtil.get(`/panel/api/nodes/remote/${nodeId}/tgWebProxy/config`, undefined, {
    silent: true,
  });
  if (!msg?.success) throw new Error(msg?.msg || 'Failed to fetch remote tg-web-proxy config');
  const validated = parseMsg(msg, RelaySnapshotSchema, 'nodes/remote/tgWebProxy/config');
  if (!validated.obj) throw new Error('Empty remote tg-web-proxy config');
  return validated.obj;
}

// A node's relay config, proxied by the master's node API.
export function useRemoteTgWebProxySnapshot(nodeId: number) {
  return useQuery({
    queryKey: [...keys.tgWebProxy.config(), 'remote', nodeId],
    queryFn: () => fetchRemoteSnapshot(nodeId),
    enabled: nodeId > 0,
  });
}

async function fetchBindings(): Promise<TgWebProxyBindingList> {
  const msg = await HttpUtil.get(`${BASE}/bindings`, undefined, {
    silent: true,
  });
  if (!msg?.success) throw new Error(msg?.msg || 'Failed to fetch tg-web-proxy bindings');
  const validated = parseMsg(msg, TgWebProxyBindingListSchema, 'tgWebProxy/bindings');
  if (!validated.obj) throw new Error('Empty tg-web-proxy bindings');
  return validated.obj;
}

export function useTgWebProxyBindings() {
  return useQuery({
    queryKey: keys.tgWebProxy.bindings(),
    queryFn: fetchBindings,
  });
}

// The relay profile of a dedicated binding is written by a debounced server-side sync.
const BINDING_SYNC_REFETCH_MS = 3000;

export function useTgWebProxyBindingMutations() {
  const queryClient = useQueryClient();
  const onSuccess = (msg: { success?: boolean } | undefined) => {
    if (!msg?.success) return;
    const invalidate = () => queryClient.invalidateQueries({ queryKey: keys.tgWebProxy.root() });
    invalidate();
    setTimeout(invalidate, BINDING_SYNC_REFETCH_MS);
  };
  const bind = useMutation({
    mutationFn: (req: TgWebProxyBindRequest) =>
      HttpUtil.post<TgWebProxyBinding>(`${BASE}/bindings/bind`, req, JSON_HEADERS),
    onSuccess,
  });
  const bindMany = useMutation({
    mutationFn: (req: TgWebProxyBindManyRequest) =>
      HttpUtil.post<TgWebProxyBinding[]>(`${BASE}/bindings/bindMany`, req, JSON_HEADERS),
    onSuccess,
  });
  const unbind = useMutation({
    mutationFn: (email: string) =>
      HttpUtil.post(`${BASE}/bindings/unbind`, { email }, JSON_HEADERS),
    onSuccess,
  });
  return {
    bindClient: bind.mutateAsync,
    bindClients: bindMany.mutateAsync,
    unbindClient: unbind.mutateAsync,
    pending: bind.isPending || bindMany.isPending || unbind.isPending,
  };
}

export async function fetchShare(name: string): Promise<RelayShareInfo | null> {
  const msg = await HttpUtil.get(`${BASE}/share/${encodeURIComponent(name)}`);
  if (!msg?.success) return null;
  return parseMsg(msg, RelayShareInfoSchema, 'tgWebProxy/share').obj ?? null;
}

export async function fetchLogs(unit: string, lines: number): Promise<string> {
  const msg = await HttpUtil.get<string>(`${BASE}/logs/${unit}`, { lines });
  return msg?.success && typeof msg.obj === 'string' ? msg.obj : '';
}

export function useTgWebProxyMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: keys.tgWebProxy.root() });
  const onSuccess = (msg: { success?: boolean } | undefined) => {
    if (msg?.success) invalidate();
  };

  const saveConfig = useMutation({
    mutationFn: (payload: { config: RelayConfig; initialProfile?: RelayProfile }) =>
      HttpUtil.post<RelayApplyResult>(`${BASE}/config`, payload, JSON_HEADERS),
    onSuccess,
  });
  const check = useMutation({
    mutationFn: () => HttpUtil.post(`${BASE}/check`),
  });
  const fixCaddy = useMutation({
    mutationFn: () => HttpUtil.post(`${BASE}/fixCaddy`),
    onSuccess,
  });
  const addProfile = useMutation({
    mutationFn: (profile: RelayProfile) =>
      HttpUtil.post<RelayApplyResult>(`${BASE}/profiles/add`, profile, JSON_HEADERS),
    onSuccess,
  });
  const updateProfile = useMutation({
    mutationFn: ({ name, profile }: { name: string; profile: RelayProfile }) =>
      HttpUtil.post<RelayApplyResult>(
        `${BASE}/profiles/update/${encodeURIComponent(name)}`,
        profile,
        JSON_HEADERS,
      ),
    onSuccess,
  });
  const deleteProfile = useMutation({
    mutationFn: (name: string) =>
      HttpUtil.post<RelayApplyResult>(`${BASE}/profiles/del/${encodeURIComponent(name)}`),
    onSuccess,
  });
  const controlUnit = useMutation({
    mutationFn: ({ unit, action }: { unit: string; action: string }) =>
      HttpUtil.post(`${BASE}/service/${unit}/${action}`),
    onSuccess,
  });
  const install = useMutation({
    mutationFn: (req: RelayInstallRequest) =>
      HttpUtil.post<RelayJobStatus>(`${BASE}/install`, req, JSON_HEADERS),
    onSuccess,
  });
  const update = useMutation({
    mutationFn: () => HttpUtil.post<RelayJobStatus>(`${BASE}/update`),
    onSuccess,
  });

  return {
    saveConfig: saveConfig.mutateAsync,
    check: check.mutateAsync,
    fixCaddy: fixCaddy.mutateAsync,
    addProfile: addProfile.mutateAsync,
    updateProfile: (name: string, profile: RelayProfile) =>
      updateProfile.mutateAsync({ name, profile }),
    deleteProfile: deleteProfile.mutateAsync,
    controlUnit: (unit: string, action: string) => controlUnit.mutateAsync({ unit, action }),
    install: install.mutateAsync,
    update: update.mutateAsync,
    pending:
      saveConfig.isPending ||
      check.isPending ||
      fixCaddy.isPending ||
      addProfile.isPending ||
      updateProfile.isPending ||
      deleteProfile.isPending ||
      controlUnit.isPending ||
      install.isPending ||
      update.isPending,
  };
}

// Profile CRUD on a node's relay, proxied by the master's node API.
export function useRemoteTgWebProxyProfileMutations(nodeId: number) {
  const queryClient = useQueryClient();
  const base = `/panel/api/nodes/remote/${nodeId}/tgWebProxy`;
  const onSuccess = (msg: { success?: boolean } | undefined) => {
    if (msg?.success) void queryClient.invalidateQueries({ queryKey: keys.tgWebProxy.root() });
  };
  const add = useMutation({
    mutationFn: (profile: RelayProfile) =>
      HttpUtil.post<RelayApplyResult>(`${base}/profiles/add`, profile, JSON_HEADERS),
    onSuccess,
  });
  const update = useMutation({
    mutationFn: ({ name, profile }: { name: string; profile: RelayProfile }) =>
      HttpUtil.post<RelayApplyResult>(
        `${base}/profiles/update/${encodeURIComponent(name)}`,
        profile,
        JSON_HEADERS,
      ),
    onSuccess,
  });
  const remove = useMutation({
    mutationFn: (name: string) =>
      HttpUtil.post<RelayApplyResult>(`${base}/profiles/del/${encodeURIComponent(name)}`),
    onSuccess,
  });
  return {
    addProfile: add.mutateAsync,
    updateProfile: (name: string, profile: RelayProfile) => update.mutateAsync({ name, profile }),
    deleteProfile: remove.mutateAsync,
    pending: add.isPending || update.isPending || remove.isPending,
  };
}
