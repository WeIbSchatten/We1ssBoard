import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from 'antd';

import './KeyboardShortcuts.css';

// g + letter jumps to a page; letters follow the English page names.
const GO_TARGETS: { key: string; path: string; titleKey: string }[] = [
  { key: 'd', path: '/', titleKey: 'menu.dashboard' },
  { key: 'u', path: '/clients', titleKey: 'menu.clients' },
  { key: 'b', path: '/settings#subscription', titleKey: 'menu.subscriptions' },
  { key: 'c', path: '/connections', titleKey: 'menu.connections' },
  { key: 'n', path: '/nodes', titleKey: 'menu.nodesHosts' },
  { key: 'a', path: '/notifications', titleKey: 'menu.notifications' },
  { key: 's', path: '/settings', titleKey: 'menu.settings' },
];

const SEQUENCE_TIMEOUT_MS = 1200;

// The account menu opens the sheet through this event.
export const SHORTCUTS_EVENT = 'fb:shortcuts';

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

function focusPageSearch(): boolean {
  const el = document.querySelector<HTMLInputElement>('.content-main [data-page-search]');
  if (!el) return false;
  el.focus();
  el.select?.();
  return true;
}

export default function KeyboardShortcuts({ navigate }: { navigate: (path: string) => void }) {
  const { t } = useTranslation();
  const [helpOpen, setHelpOpen] = useState(false);
  const pendingG = useRef<number | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (
        isTypingTarget(e.target) ||
        document.querySelector('.ant-modal-wrap:not([style*="none"])')
      ) {
        return;
      }
      if (pendingG.current !== null) {
        window.clearTimeout(pendingG.current);
        pendingG.current = null;
        const target = GO_TARGETS.find((g) => g.key === e.key.toLowerCase());
        if (target) {
          e.preventDefault();
          navigate(target.path);
        }
        return;
      }
      if (e.key === 'g') {
        pendingG.current = window.setTimeout(() => (pendingG.current = null), SEQUENCE_TIMEOUT_MS);
      } else if (e.key === '/' && focusPageSearch()) {
        e.preventDefault();
      } else if (e.key === '?') {
        e.preventDefault();
        setHelpOpen(true);
      }
    };
    const openHelp = () => setHelpOpen(true);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener(SHORTCUTS_EVENT, openHelp);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener(SHORTCUTS_EVENT, openHelp);
    };
  }, [navigate]);

  const rows: { keys: string[]; label: string }[] = [
    { keys: ['Ctrl', 'K'], label: t('shortcuts.palette') },
    { keys: ['/'], label: t('shortcuts.search') },
    ...GO_TARGETS.map((g) => ({ keys: ['g', g.key], label: t(g.titleKey) })),
    { keys: ['?'], label: t('shortcuts.help') },
  ];

  return (
    <Modal
      open={helpOpen}
      title={t('shortcuts.title')}
      footer={null}
      width={420}
      onCancel={() => setHelpOpen(false)}
    >
      <ul className="shortcut-list">
        {rows.map((r) => (
          <li key={r.keys.join('+')}>
            <span>{r.label}</span>
            <span className="shortcut-keys">
              {r.keys.map((k) => (
                <kbd key={k}>{k}</kbd>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
