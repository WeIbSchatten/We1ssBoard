import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Card } from 'antd';
import { CheckCircleOutlined } from '@ant-design/icons';

import type { PanelEvent } from '@/generated/zod';
import type { AttentionItem } from './attention';

const EVENT_KEYS: Record<string, string> = {
  'outbound.down': 'pages.index.dash.eventOutboundDown',
  'outbound.up': 'pages.index.dash.eventOutboundUp',
  'xray.crash': 'pages.index.dash.eventXrayCrash',
  'node.down': 'pages.index.dash.eventNodeDown',
  'node.up': 'pages.index.dash.eventNodeUp',
  'cpu.high': 'pages.index.dash.eventCpuHigh',
  'memory.high': 'pages.index.dash.eventMemoryHigh',
  'login.attempt': 'pages.index.dash.eventLogin',
};

const ATTENTION_KEYS: Record<string, string> = {
  attXrayError: 'pages.index.dash.attXrayError',
  attXrayStopped: 'pages.index.dash.attXrayStopped',
  attResource: 'pages.index.dash.attResource',
  attNodeOffline: 'pages.index.dash.attNodeOffline',
  attNodeXray: 'pages.index.dash.attNodeXray',
  attOutboundDown: 'pages.index.dash.attOutboundDown',
  attDepleted: 'pages.index.dash.attDepleted',
  attExpiring: 'pages.index.dash.attExpiring',
};

const RESOURCE_KEYS: Record<string, string> = {
  cpu: 'pages.index.cpu',
  memory: 'pages.index.memory',
  storage: 'pages.index.storage',
};

const LEVEL_TONE: Record<string, string> = {
  error: 'bad',
  warning: 'warn',
  success: 'ok',
  info: 'off',
};

function eventTime(ms: number): string {
  const d = new Date(ms);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : d.toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function EventsCard({ events }: { events: PanelEvent[] }) {
  const { t } = useTranslation();
  return (
    <Card className="dash-card">
      <div className="dash-card-head">
        <div className="ov-kicker">{t('pages.index.dash.events')}</div>
      </div>
      {events.length === 0 ? (
        <div className="dash-empty">{t('pages.index.dash.eventsEmpty')}</div>
      ) : (
        <ul className="dash-list dash-scroll">
          {events.map((e, i) => (
            <li key={`${e.time}-${i}`} className="dash-list-row">
              <span className={`dash-dot dash-dot--${LEVEL_TONE[e.level] ?? 'off'}`} />
              <span className="dash-ellipsis">
                {EVENT_KEYS[e.type] ? t(EVENT_KEYS[e.type]) : e.type}
                {e.source && <b>{` ${e.source}`}</b>}
                {e.detail && <span className="dash-muted">{` — ${e.detail}`}</span>}
              </span>
              <span className="dash-list-end ov-mono dash-muted">{eventTime(e.time)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function AttentionCard({ items }: { items: AttentionItem[] }) {
  const { t } = useTranslation();
  const text = (item: AttentionItem) =>
    t(ATTENTION_KEYS[item.key] ?? item.key, {
      ...item.params,
      ...(item.key === 'attResource' ? { name: t(RESOURCE_KEYS[item.params.name] ?? '') } : {}),
    });
  return (
    <Card className="dash-card">
      <div className="dash-card-head">
        <div className="ov-kicker">{t('pages.index.dash.attention')}</div>
      </div>
      {items.length === 0 ? (
        <div className="dash-empty dash-allgood">
          <CheckCircleOutlined /> {t('pages.index.dash.attentionEmpty')}
        </div>
      ) : (
        <ul className="dash-list">
          {items.map((item) => (
            <li key={item.id} className="dash-list-row">
              <span className={`dash-dot dash-dot--${item.level === 'error' ? 'bad' : 'warn'}`} />
              <span className="dash-ellipsis">{text(item)}</span>
              {item.to && (
                <Link to={item.to} className="dash-link dash-list-end">
                  {t('pages.index.dash.fix')}
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
