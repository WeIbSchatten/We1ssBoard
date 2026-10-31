import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Card, Tooltip } from 'antd';

import type { NodeRecord } from '@/api/queries/useNodesQuery';
import type { ObservatoryTag } from './useDashboardData';

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

export function OutboundsCard({ outbounds }: { outbounds: ObservatoryTag[] }) {
  const { t } = useTranslation();
  const sorted = [...outbounds].sort(
    (a, b) => Number(a.alive) - Number(b.alive) || a.tag.localeCompare(b.tag),
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
          {sorted.map((o) => (
            <li key={o.tag} className="dash-list-row">
              <span className={`dash-dot dash-dot--${o.alive ? 'ok' : 'bad'}`} />
              <span className="dash-ellipsis">{o.tag}</span>
              <span className="dash-list-end ov-mono dash-muted">
                {o.alive ? `${o.delay} ms` : t('pages.index.dash.outboundDown')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
