import { fireEvent, screen, within } from '@testing-library/react';
import { Modal } from 'antd';
import { afterEach, describe, expect, it, vi } from 'vitest';

import PanelUpdateModal from '@/pages/index/PanelUpdateModal';
import { HttpUtil, Msg } from '@/utils';
import { renderWithProviders } from './test-utils';

let restoreUseModal = () => {};

describe('panel update modal', () => {
  afterEach(() => {
    restoreUseModal();
    restoreUseModal = () => {};
    vi.mocked(HttpUtil.post).mockReset();
  });

  it('lets the confirmation close before the update request finishes', () => {
    const confirm = vi.fn();
    const useModal = vi.spyOn(Modal, 'useModal').mockReturnValue([
      {
        confirm,
        error: vi.fn(),
        warning: vi.fn(),
      } as unknown as ReturnType<typeof Modal.useModal>[0],
      <span key="modal-context" />,
    ]);
    restoreUseModal = () => useModal.mockRestore();
    vi.mocked(HttpUtil.post).mockReturnValue(new Promise(() => {}));
    const onClose = vi.fn();
    const onProgress = vi.fn();
    renderWithProviders(
      <PanelUpdateModal
        open
        info={{
          channel: 'dev',
          currentVersion: 'dev+old',
          latestVersion: 'dev+new',
          currentCommit: 'old',
          latestCommit: 'new',
          updateAvailable: true,
        }}
        devChannelEnable
        onClose={onClose}
        onProgress={onProgress}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Update Panel/ }));
    expect(confirm).toHaveBeenCalledOnce();
    const config = confirm.mock.calls[0]?.[0];
    if (!config?.onOk) throw new Error('Confirmation onOk handler was not registered');

    expect(config.onOk()).toBeUndefined();
    expect(onClose).toHaveBeenCalledOnce();
    expect(HttpUtil.post).toHaveBeenCalledWith('/panel/api/server/updatePanel');
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Update Panel · dev+new', current: 0, percent: 2 }),
    );
  });

  // The bar follows the step update.sh reports for this run and ignores a stale
  // status file left by an earlier run.
  it('moves the progress bar with the steps the updater reports', async () => {
    vi.useFakeTimers();
    try {
      const confirm = vi.fn();
      const useModal = vi
        .spyOn(Modal, 'useModal')
        .mockReturnValue([
          { confirm, error: vi.fn(), warning: vi.fn() } as unknown as ReturnType<
            typeof Modal.useModal
          >[0],
          <span key="modal-context" />,
        ]);
      restoreUseModal = () => useModal.mockRestore();
      vi.mocked(HttpUtil.post).mockResolvedValue(new Msg(true, '', { runId: '7' }));
      const replies = [
        { runId: '6', state: 'success', exitCode: 0, finishedAt: 1 },
        { runId: '7', state: 'pending', stage: 'install', exitCode: 0, finishedAt: 2 },
        { runId: '7', state: 'success', exitCode: 0, finishedAt: 3 },
      ];
      vi.mocked(HttpUtil.get).mockImplementation(async (url: string) =>
        url === '/panel/api/server/getUpdateStatus'
          ? new Msg(true, '', replies.shift())
          : new Msg(true, '', {}),
      );
      const reload = vi.fn();
      vi.stubGlobal('location', { ...window.location, reload });
      const onProgress = vi.fn();
      renderWithProviders(
        <PanelUpdateModal
          open
          info={{
            channel: 'stable',
            currentVersion: '1.10.0',
            latestVersion: 'v1.10.1',
            updateAvailable: true,
          }}
          onClose={() => {}}
          onProgress={onProgress}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: /Update Panel/ }));
      confirm.mock.calls[0][0].onOk();

      await vi.advanceTimersByTimeAsync(1500);
      const afterStale = onProgress.mock.calls.at(-1)?.[0];
      expect(afterStale).toEqual(expect.objectContaining({ current: 0, percent: 2 }));

      await vi.advanceTimersByTimeAsync(1500);
      expect(onProgress.mock.calls.at(-1)?.[0]).toEqual(
        expect.objectContaining({ current: 3, percent: 58 }),
      );

      await vi.advanceTimersByTimeAsync(1500 + 800);
      expect(onProgress.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({ percent: 100 }));
      expect(reload).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  // FR 1: the update dialog must say what the new version adds, changes and fixes.
  it('lists the server changelog with its sections before updating', async () => {
    vi.mocked(HttpUtil.get).mockImplementation(async (url: string, params?: unknown) => {
      if (url !== '/panel/api/server/getChangelog') return new Msg(true, '', {});
      expect(params).toEqual({ lang: 'en-US' });
      return new Msg(true, '', {
        currentVersion: '1.8.3',
        latestVersion: 'v1.8.4',
        url: 'https://github.com/WeIbSchatten/We1ssBoard/blob/v1.8.4/CHANGELOG.md',
        releases: [
          {
            version: '1.8.4',
            date: '2026-10-20',
            sections: [
              { kind: 'added', items: [{ text: 'Write `99-quic.conf` on install.' }] },
              { kind: 'known_issues', items: [{ text: 'APK crashes.', sub: ['Fixed in 1.8.5.'] }] },
            ],
          },
        ],
      });
    });
    renderWithProviders(
      <PanelUpdateModal
        open
        info={{
          channel: 'stable',
          currentVersion: '1.8.3',
          latestVersion: 'v1.8.4',
          updateAvailable: true,
        }}
        onClose={() => {}}
        onProgress={() => {}}
      />,
    );

    const notes = await screen.findByRole('region', { name: "What's new" });
    const release = await within(notes).findByRole('heading', { level: 5 });
    expect(release.textContent).toBe('1.8.42026-10-20');
    expect(within(notes).getByText('Added')).toBeTruthy();
    expect(within(notes).getByText('99-quic.conf').tagName).toBe('CODE');
    expect(within(notes).getByText('Known issues')).toBeTruthy();
    expect(within(notes).getByText('Fixed in 1.8.5.')).toBeTruthy();
    expect(within(notes).getByRole('link', { name: 'Full changelog' }).getAttribute('href')).toBe(
      'https://github.com/WeIbSchatten/We1ssBoard/blob/v1.8.4/CHANGELOG.md',
    );
  });
});
