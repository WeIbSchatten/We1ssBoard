import { fireEvent, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Status } from '@/models/status';
import VersionModal from '@/pages/index/VersionModal';
import { HttpUtil } from '@/utils';
import { renderWithProviders } from './test-utils';

function Harness({ onProgress }: { onProgress: (p: unknown) => void }) {
  const [open, setOpen] = useState(true);
  return (
    <VersionModal
      open={open}
      status={{} as Status}
      onClose={() => setOpen(false)}
      onBusy={vi.fn()}
      onProgress={onProgress}
    />
  );
}

afterEach(() => vi.restoreAllMocks());

describe('Xray version switch', () => {
  // The progress overlay takes over once the switch is confirmed; a confirm
  // left open until the install finished sat on top of it.
  it('closes the confirm while the install is still running', async () => {
    vi.spyOn(HttpUtil, 'get').mockImplementation((url: string) =>
      Promise.resolve(
        url.endsWith('getXrayVersion')
          ? { success: true, msg: '', obj: ['v26.10.10'] }
          : { success: false, msg: '', obj: null },
      ),
    );
    let finishInstall = () => {};
    vi.spyOn(HttpUtil, 'post').mockImplementation((url: string) =>
      url.includes('installXray')
        ? new Promise((resolve) => {
            finishInstall = () => resolve({ success: true, msg: '', obj: null });
          })
        : Promise.resolve({ success: true, msg: '', obj: {} }),
    );
    const onProgress = vi.fn();
    renderWithProviders(<Harness onProgress={onProgress} />);

    await screen.findByText('v26.10.10');
    fireEvent.click(
      document.querySelector('.version-list-item .ant-radio-wrapper, .version-list-item input')!,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }));

    await waitFor(() =>
      expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ title: 'Xray v26.10.10' })),
    );
    await waitFor(() =>
      expect(document.querySelector('.ant-modal-confirm:not(.ant-zoom-leave)')).toBeNull(),
    );
    finishInstall();
    await waitFor(() => expect(onProgress).toHaveBeenLastCalledWith(null));
  });
});
