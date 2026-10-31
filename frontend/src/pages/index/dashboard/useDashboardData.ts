import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import { HttpUtil } from '@/utils';
import { parseMsg } from '@/utils/zodValidate';
import { keys } from '@/api/queryKeys';
import {
  ActiveConnectionsSchema,
  ClientPageResponseSchema,
  OnlinesSchema,
  type ActiveConnection,
  type ClientPageResponse,
} from '@/schemas/client';
import {
  PanelEventSchema,
  TrafficPointSchema,
  type PanelEvent,
  type TrafficPoint,
} from '@/generated/zod';

export type TrafficRange = '24h' | '7d' | '30d';

const DashboardInboundSchema = z
  .object({
    id: z.number(),
    remark: z.string().optional().default(''),
    tag: z.string().optional().default(''),
    protocol: z.string(),
    port: z.number().optional().default(0),
    enable: z.boolean().optional().default(true),
    up: z.number().optional().default(0),
    down: z.number().optional().default(0),
    total: z.number().optional().default(0),
    nodeId: z.number().nullish(),
    clientStats: z.array(z.unknown()).nullish(),
  })
  .loose();

export type DashboardInbound = z.infer<typeof DashboardInboundSchema>;

export interface ObservatoryTag {
  tag: string;
  alive: boolean;
  delay: number;
  lastSeenTime: number;
  lastTryTime: number;
}

const REFRESH_MS = 10_000;

async function getObj<T extends z.ZodType>(
  method: 'get' | 'post',
  url: string,
  schema: T,
): Promise<z.infer<T> | undefined> {
  const msg =
    method === 'get'
      ? await HttpUtil.get(url, undefined, { silent: true })
      : await HttpUtil.post(url, undefined, { silent: true });
  if (!msg?.success) throw new Error(msg?.msg || `Failed to fetch ${url}`);
  return parseMsg(msg, schema, url).obj ?? undefined;
}

// Dashboard-only keys: the slim inbound list is parsed into a narrower shape than
// the inbounds page caches, so the two must not share a cache entry.
const dashKeys = {
  inbounds: () => ['dashboard', 'inbounds'] as const,
  topClients: () => ['dashboard', 'topClients'] as const,
  traffic: (range: TrafficRange) => ['dashboard', 'traffic', range] as const,
  events: () => ['dashboard', 'events'] as const,
  observatory: () => ['dashboard', 'observatory'] as const,
};

export function useDashboardInbounds() {
  return useQuery({
    queryKey: dashKeys.inbounds(),
    queryFn: async () =>
      (await getObj('get', '/panel/api/inbounds/list/slim', z.array(DashboardInboundSchema))) ?? [],
    refetchInterval: REFRESH_MS,
  });
}

// Top clients by usage in their current limit period, plus the panel-wide summary
// counters the paged list already computes.
export function useDashboardClients() {
  return useQuery({
    queryKey: dashKeys.topClients(),
    queryFn: async (): Promise<ClientPageResponse | undefined> =>
      getObj(
        'get',
        '/panel/api/clients/list/paged?page=1&pageSize=6&sort=traffic&order=descend',
        ClientPageResponseSchema,
      ),
    refetchInterval: REFRESH_MS,
  });
}

export function useDashboardOnlines() {
  return useQuery({
    queryKey: keys.clients.onlines(),
    queryFn: async () => (await getObj('post', '/panel/api/clients/onlines', OnlinesSchema)) ?? [],
    refetchInterval: REFRESH_MS,
  });
}

export function useDashboardActiveConnections() {
  return useQuery({
    queryKey: keys.clients.activeConnections(),
    queryFn: async (): Promise<Record<string, ActiveConnection[]>> =>
      (await getObj('post', '/panel/api/clients/activeConnections', ActiveConnectionsSchema)) ?? {},
    refetchInterval: REFRESH_MS,
  });
}

export function useTrafficHistory(range: TrafficRange) {
  return useQuery({
    queryKey: dashKeys.traffic(range),
    queryFn: async (): Promise<TrafficPoint[]> =>
      (await getObj(
        'get',
        `/panel/api/server/trafficHistory/${range}`,
        z.array(TrafficPointSchema),
      )) ?? [],
    refetchInterval: 60_000,
  });
}

export function useDashboardEvents() {
  return useQuery({
    queryKey: dashKeys.events(),
    queryFn: async (): Promise<PanelEvent[]> =>
      (await getObj('get', '/panel/api/server/events', z.array(PanelEventSchema))) ?? [],
    refetchInterval: REFRESH_MS,
  });
}

const ObservatorySchema = z.array(
  z.object({
    tag: z.string(),
    alive: z.boolean(),
    delay: z.number().optional().default(0),
    lastSeenTime: z.number().optional().default(0),
    lastTryTime: z.number().optional().default(0),
  }),
);

export function useDashboardObservatory() {
  return useQuery({
    queryKey: dashKeys.observatory(),
    queryFn: async (): Promise<ObservatoryTag[]> =>
      (await getObj('get', '/panel/api/server/xrayObservatory', ObservatorySchema)) ?? [],
    refetchInterval: 30_000,
  });
}
