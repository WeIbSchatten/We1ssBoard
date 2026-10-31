import { USAGE_CRIT_PERCENT, USAGE_WARN_PERCENT } from '@/models/status';

export interface AttentionInput {
  xrayState: string;
  xrayError: string;
  resources: { key: string; percent: number }[];
  nodes: { name: string; enable: boolean; status: string; xrayState: string }[];
  outbounds: { tag: string; alive: boolean }[];
  depletedCount: number;
  expiringCount: number;
}

export interface AttentionItem {
  id: string;
  level: 'error' | 'warning';
  key: string;
  params: Record<string, string | number>;
  to?: string;
}

// Errors are things already broken, warnings things about to be; the dashboard
// shows them in that order so the worst problem is always on top.
export function buildAttention(input: AttentionInput): AttentionItem[] {
  const items: AttentionItem[] = [];
  if (input.xrayState !== 'running') {
    items.push(
      input.xrayError
        ? { id: 'xray', level: 'error', key: 'attXrayError', params: { msg: input.xrayError } }
        : { id: 'xray', level: 'error', key: 'attXrayStopped', params: {} },
    );
  }
  for (const r of input.resources) {
    if (r.percent < USAGE_WARN_PERCENT) continue;
    items.push({
      id: `res-${r.key}`,
      level: r.percent >= USAGE_CRIT_PERCENT ? 'error' : 'warning',
      key: 'attResource',
      params: { name: r.key, value: Math.round(r.percent) },
    });
  }
  for (const n of input.nodes) {
    if (!n.enable) continue;
    if (n.status !== 'online') {
      items.push({
        id: `node-${n.name}`,
        level: 'error',
        key: 'attNodeOffline',
        params: { name: n.name },
        to: '/nodes',
      });
    } else if (n.xrayState && n.xrayState !== 'running') {
      items.push({
        id: `node-xray-${n.name}`,
        level: 'error',
        key: 'attNodeXray',
        params: { name: n.name },
        to: '/nodes',
      });
    }
  }
  for (const o of input.outbounds) {
    if (!o.alive) {
      items.push({
        id: `out-${o.tag}`,
        level: 'error',
        key: 'attOutboundDown',
        params: { tag: o.tag },
        to: '/connections#outbounds',
      });
    }
  }
  if (input.depletedCount > 0) {
    items.push({
      id: 'depleted',
      level: 'error',
      key: 'attDepleted',
      params: { count: input.depletedCount },
      to: '/clients',
    });
  }
  if (input.expiringCount > 0) {
    items.push({
      id: 'expiring',
      level: 'warning',
      key: 'attExpiring',
      params: { count: input.expiringCount },
      to: '/clients',
    });
  }
  return [
    ...items.filter((i) => i.level === 'error'),
    ...items.filter((i) => i.level === 'warning'),
  ];
}
