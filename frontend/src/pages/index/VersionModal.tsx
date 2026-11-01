import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Button, Collapse, Modal, Radio, Spin, Tag, Tooltip } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';

import { HttpUtil, PromiseUtil } from '@/utils';
import { activateOnKey } from '@/utils/a11y';
import { TASK_STAGES, taskProgressView, type TaskKind } from '@/lib/updateProgress';
import { TaskProgressSchema } from '@/generated/zod';
import type { Status } from '@/models/status';
import GeodataSection from './GeodataSection';
import type { UpdateProgressState } from './UpdateProgressDialog';
import './VersionModal.css';

interface VersionModalProps {
  open: boolean;
  status: Status;
  onClose: () => void;
  onBusy: (e: { busy: boolean; tip?: string }) => void;
  onProgress: (state: UpdateProgressState | null) => void;
}

const TASK_STAGE_KEYS: Record<string, string> = {
  download: 'pages.index.progress.download',
  verify: 'pages.index.progress.verify',
  install: 'pages.index.progress.install',
  restart: 'pages.index.progress.restartXray',
};

async function fetchTaskProgress() {
  const msg = await HttpUtil.get('/panel/api/server/taskProgress', undefined, { silent: true });
  const parsed = TaskProgressSchema.safeParse(msg?.obj);
  return parsed.success ? parsed.data : null;
}

const GEOFILES = [
  'geosite.dat',
  'geoip.dat',
  'geosite_IR.dat',
  'geoip_IR.dat',
  'geosite_RU.dat',
  'geoip_RU.dat',
];

export default function VersionModal({
  open,
  status,
  onClose,
  onBusy,
  onProgress,
}: VersionModalProps) {
  const { t } = useTranslation();

  // Polls the server's task snapshot while the install request is in flight. The
  // baseline's own timestamp marks stale snapshots, so browser and server clocks never meet.
  async function runWithProgress(kind: TaskKind, title: string, request: () => Promise<unknown>) {
    onClose();
    const steps = TASK_STAGES[kind].map((s) => t(TASK_STAGE_KEYS[s]));
    onProgress({ title, steps, current: 0, percent: 0 });
    const baseline = (await fetchTaskProgress())?.updatedAt ?? 0;
    let running = true;
    const poll = (async () => {
      while (running) {
        await PromiseUtil.sleep(500);
        const p = running ? await fetchTaskProgress() : null;
        if (!running || !p || p.updatedAt <= baseline || p.kind !== kind) continue;
        const view = taskProgressView(p);
        onProgress({
          title,
          steps,
          current: view.current,
          percent: view.percent,
          failed: view.failed,
          detail: view.file
            ? t('pages.index.progress.file', {
                step: view.file.step,
                steps: view.file.steps,
                name: view.file.name,
              })
            : undefined,
        });
      }
    })();
    try {
      await request();
    } finally {
      running = false;
      await poll;
      onProgress(null);
    }
  }
  const [modal, modalContextHolder] = Modal.useModal();
  const [activeKey, setActiveKey] = useState<string | string[]>('1');
  const [versions, setVersions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [pinned, setPinned] = useState('');

  const fetchVersions = useCallback(async () => {
    try {
      const [msg, defaults] = await Promise.all([
        HttpUtil.get<string[]>('/panel/api/server/getXrayVersion'),
        HttpUtil.post<{ xrayPinnedVersion?: string }>(
          '/panel/api/setting/defaultSettings',
          undefined,
          {
            silent: true,
          },
        ),
      ]);
      if (msg?.success) setVersions(msg.obj || []);
      if (defaults?.success) setPinned(defaults.obj?.xrayPinnedVersion ?? '');
    } finally {
      setLoading(false);
    }
  }, []);

  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setLoading(true);
  }

  useEffect(() => {
    if (open) void fetchVersions();
  }, [open, fetchVersions]);

  function switchXrayVersion(version: string) {
    modal.confirm({
      title: t('pages.index.xraySwitchVersionDialog'),
      content: t('pages.index.xraySwitchVersionDialogDesc').replace('#version#', version),
      okText: t('confirm'),
      cancelText: t('cancel'),
      // Not returned: a pending onOk keeps the confirm open over the progress overlay.
      onOk: () => {
        void runWithProgress('xray', `Xray ${version}`, () =>
          HttpUtil.post(`/panel/api/server/installXray/${version}`),
        );
      },
    });
  }

  async function unpinXray() {
    const msg = await HttpUtil.post('/panel/api/server/unpinXray');
    if (msg?.success) setPinned('');
  }

  function updateGeofile(fileName: string) {
    const isSingle = !!fileName;
    modal.confirm({
      title: t('pages.index.geofileUpdateDialog'),
      content: isSingle
        ? t('pages.index.geofileUpdateDialogDesc').replace('#filename#', fileName)
        : t('pages.index.geofilesUpdateDialogDesc'),
      okText: t('confirm'),
      cancelText: t('cancel'),
      onOk: () => {
        void runWithProgress('geofile', t('pages.index.progress.geofiles'), () =>
          HttpUtil.post(
            isSingle
              ? `/panel/api/server/updateGeofile/${fileName}`
              : '/panel/api/server/updateGeofile',
          ),
        );
      },
    });
  }

  const activeKeyStr = Array.isArray(activeKey) ? activeKey[0] : activeKey;

  return (
    <Modal open={open} title={t('pages.index.xrayUpdates')} footer={null} onCancel={onClose}>
      {modalContextHolder}
      <Spin spinning={loading}>
        <Collapse
          accordion
          activeKey={activeKey}
          onChange={setActiveKey}
          items={[
            {
              key: '1',
              label: 'Xray',
              children: (
                <>
                  <Alert
                    type="warning"
                    className="mb-12"
                    title={t('pages.index.xraySwitchClickDesk')}
                    showIcon
                  />
                  {pinned && (
                    <Alert
                      type="info"
                      className="mb-12"
                      title={t('pages.index.xrayPinned', { version: pinned })}
                      action={
                        <Button size="small" onClick={() => void unpinXray()}>
                          {t('pages.index.xrayUnpin')}
                        </Button>
                      }
                      showIcon
                    />
                  )}
                  <div className="version-list">
                    {versions.map((version, index) => (
                      <div key={version} className="version-list-item">
                        <Tag color={index % 2 === 0 ? 'purple' : 'green'}>{version}</Tag>
                        <Radio
                          checked={version === `v${status?.xray?.version}`}
                          onClick={() => switchXrayVersion(version)}
                        />
                      </div>
                    ))}
                  </div>
                </>
              ),
            },
            {
              key: '2',
              label: 'Geofiles',
              children: (
                <>
                  <div className="version-list">
                    {GEOFILES.map((file, index) => (
                      <div key={file} className="version-list-item">
                        <Tag color={index % 2 === 0 ? 'purple' : 'green'}>{file}</Tag>
                        <Tooltip title={t('update')}>
                          <ReloadOutlined
                            className="reload-icon"
                            role="button"
                            tabIndex={0}
                            aria-label={t('update')}
                            onClick={() => updateGeofile(file)}
                            onKeyDown={activateOnKey(() => updateGeofile(file))}
                          />
                        </Tooltip>
                      </div>
                    ))}
                  </div>
                  <div className="actions-row">
                    <Button onClick={() => updateGeofile('')}>
                      {t('pages.index.geofilesUpdateAll')}
                    </Button>
                  </div>
                </>
              ),
            },
            {
              key: '3',
              label: t('pages.index.geodataTitle'),
              children: (
                <GeodataSection active={activeKeyStr === '3'} onBusy={onBusy} onClose={onClose} />
              ),
            },
          ]}
        />
      </Spin>
    </Modal>
  );
}
