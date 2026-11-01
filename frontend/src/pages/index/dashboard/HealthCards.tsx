import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Card, Tooltip } from 'antd';

import type { NodeRecord } from '@/api/queries/useNodesQuery';
import type { OutboundHealth } from '@/generated/zod';

const NODE_STATE_KEYS = {
  ok: 'pages.index.dash.nodeState.ok',
  warn: 'pages.index.dash.nodeState.warn',
  bad: 'pages.index.dash.nodeState.bad',
  off: 'pages.index.dash.nodeState.off',
} as const;

function nodeTone(n: NodeRecord): 'ok' | 'warn' | 'bad' | 'off' {
  if (!n.enable) return 'off';
  if (n.status !== 'online') return 'bad';
  if (n.xrayState && n.xrayState !== 'running') return 'warn';
  return 'ok';
}

export function NodesCard({ nodes }: { nodes: NodeRecord[] }) {
  const { t } = useTranslation();
  return (
    <Card className="dash-card">
      <div className="dash-card-head">
        <div className="ov-kicker">{t('pages.index.dash.nodes')}</div>
        <Link to="/nodes" className="dash-link">
          {t('pages.index.dash.openAll')}
        </Link>
      </div>
      {nodes.length === 0 ? (
        <div className="dash-empty">{t('pages.index.dash.nodesEmpty')}</div>
      ) : (
        <ul className="dash-list">
          {nodes.map((n) => {
            const tone = nodeTone(n);
            return (
              <li key={n.id} className="dash-list-row">
                <Tooltip title={n.lastError || n.xrayError || t(NODE_STATE_KEYS[tone])}>
                  <span className={`dash-dot dash-dot--${tone}`} />
                </Tooltip>
                <span className="dash-ellipsis">{n.remark || n.name || n.address}</span>
                <span className="dash-list-end ov-mono dash-muted">
                  {tone === 'ok' || tone === 'warn'
                    ? `${n.latencyMs ?? 0} ms · CPU ${Math.round(n.cpuPct ?? 0)}% · RAM ${Math.round(n.memPct ?? 0)}%`
                    : t(NODE_STATE_KEYS[tone])}
                </span>
                <span className="ov-mono">{`${n.onlineCount ?? 0} / ${n.clientCount ?? 0}`}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

// Down first, then failing, then not yet checked, then healthy: problems on top.
function outboundRank(o: OutboundHealth): number {
  if (!o.alive) return 0;
  if (o.failures > 0) return 1;
  if (!o.checked) return 2;
  return 3;
}

function outboundState(o: OutboundHealth): { tone: string; textKey?: string } {
  if (!o.alive) return { tone: 'bad', textKey: 'pages.index.dash.outboundDown' };
  if (o.failures > 0) return { tone: 'warn', textKey: 'pages.index.dash.outboundRetrying' };
  if (!o.checked) return { tone: 'off', textKey: 'pages.index.dash.outboundChecking' };
  return { tone: 'ok' };
}

export function OutboundsCard({ outbounds }: { outbounds: OutboundHealth[] }) {
  const { t } = useTranslation();
  const sorted = [...outbounds].sort(
    (a, b) => outboundRank(a) - outboundRank(b) || a.tag.localeCompare(b.tag),
  );
  return (
    <Card className="dash-card">
      <div className="dash-card-head">
        <div className="ov-kicker">{t('pages.index.dash.outbounds')}</div>
        <Link to="/connections#outbounds" className="dash-link">
          {t('pages.index.dash.openAll')}
        </Link>
      </div>
      {sorted.length === 0 ? (
        <div className="dash-empty">{t('pages.index.dash.outboundsEmpty')}</div>
      ) : (
        <ul className="dash-list">
          {sorted.map((o) => {
            const state = outboundState(o);
            return (
              <li key={o.tag} className="dash-list-row">
                <Tooltip title={o.error || undefined}>
                  <span className={`dash-dot dash-dot--${state.tone}`} />
                </Tooltip>
                <span className="dash-ellipsis">{o.tag}</span>
                <span className="dash-list-end ov-mono dash-muted">
                  {state.textKey ? t(state.textKey) : `${o.delay} ms`}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
