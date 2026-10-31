import { useMemo } from 'react';

import type { Status } from '@/models/status';
import type { InboundOption } from '@/hooks/useClients';
import { useNodesQuery } from '@/api/queries/useNodesQuery';
import { buildAttention } from './attention';
import {
  useDashboardActiveConnections,
  useDashboardClients,
  useDashboardEvents,
  useDashboardInbounds,
  useDashboardObservatory,
  useDashboardOnlines,
  useTrafficHistory,
} from './useDashboardData';

const EMPTY: never[] = [];

export function useDashboardModel(status: Status) {
  const inbounds = useDashboardInbounds().data ?? EMPTY;
  const clientsPage = useDashboardClients().data;
  const online = useDashboardOnlines().data ?? EMPTY;
  const connections = useDashboardActiveConnections().data;
  const events = useDashboardEvents().data ?? EMPTY;
  const outbounds = useDashboardObservatory().data ?? EMPTY;
  const week = useTrafficHistory('7d').data ?? EMPTY;
  const { nodes } = useNodesQuery();

  return useMemo(() => {
    const activeConnections = connections ?? {};
    const onlineByInbound = new Map<number, number>();
    for (const list of Object.values(activeConnections)) {
      for (const c of list)
        onlineByInbound.set(c.inboundId, (onlineByInbound.get(c.inboundId) ?? 0) + 1);
    }
    const inboundsById: Record<number, InboundOption> = {};
    for (const ib of inbounds) {
      inboundsById[ib.id] = { id: ib.id, tag: ib.tag, remark: ib.remark, protocol: ib.protocol };
    }
    const nodeNames = new Map(
      nodes.map((n) => [n.id, n.remark || n.name || n.address || `#${n.id}`]),
    );
    const summary = clientsPage?.summary;
    const today = week[week.length - 1];

    const attention = buildAttention({
      xrayState: status.xray.state,
      xrayError: status.xray.errorMsg,
      resources: [
        { key: 'cpu', percent: status.cpu.percent },
        { key: 'memory', percent: status.mem.percent },
        { key: 'storage', percent: status.disk.percent },
      ],
      nodes: nodes.map((n) => ({
        name: n.remark || n.name || n.address || `#${n.id}`,
        enable: n.enable !== false,
        status: n.status ?? '',
        xrayState: n.xrayState ?? '',
      })),
      outbounds,
      depletedCount: summary?.depletedCount ?? 0,
      expiringCount: summary?.expiringCount ?? 0,
    });

    return {
      inbounds,
      inboundsById,
      onlineByInbound,
      nodeNames,
      nodes,
      online,
      activeConnections,
      events,
      outbounds,
      attention,
      topClients: clientsPage?.items ?? EMPTY,
      kpis: {
        online: online.length,
        clientsTotal: clientsPage?.total ?? 0,
        todayBytes: today ? today.up + today.down : 0,
        inboundsEnabled: inbounds.filter((ib) => ib.enable).length,
        inboundsTotal: inbounds.length,
        inboundsBusy: onlineByInbound.size,
        nodesOnline: nodes.filter((n) => n.enable !== false && n.status === 'online').length,
        nodesTotal: nodes.filter((n) => n.enable !== false).length,
        attentionErrors: attention.filter((a) => a.level === 'error').length,
        attentionTotal: attention.length,
      },
    };
  }, [inbounds, clientsPage, online, connections, events, outbounds, week, nodes, status]);
}
