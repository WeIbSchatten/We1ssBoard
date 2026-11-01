import { act, fireEvent, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, test, vi } from 'vitest';

import AppSidebar from '@/layouts/AppSidebar';
import PanelTopBar from '@/layouts/PanelTopBar';
import { renderWithProviders } from './test-utils';

vi.mock('@/api/queries/useAllSettings', () => ({
  useAllSettings: () => ({ allSetting: {} }),
}));

afterEach(() => {
  localStorage.clear();
});

// rc-menu registers its items in a microtask after render; settle it inside act().
async function renderSidebar(path = '/') {
  const view = renderWithProviders(
    <MemoryRouter initialEntries={[path]}>
      <AppSidebar />
    </MemoryRouter>,
  );
  await act(async () => {});
  return view;
}

test('starts expanded with labelled sections so every page is named', async () => {
  const view = await renderSidebar();
  const sider = view.container.querySelector('.ant-layout-sider');

  expect(sider?.classList.contains('ant-layout-sider-collapsed')).toBe(false);
  expect(screen.getByText('Users')).toBeTruthy();
  expect(screen.getByText('Traffic')).toBeTruthy();
  expect(screen.getByText('Infrastructure')).toBeTruthy();
  expect(screen.getByText('Clients')).toBeTruthy();
});

test('collapses to the icon rail and restores the choice after a reload', async () => {
  const first = await renderSidebar();
  fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }));

  expect(
    first.container
      .querySelector('.ant-layout-sider')
      ?.classList.contains('ant-layout-sider-collapsed'),
  ).toBe(true);
  expect(localStorage.getItem('sidebar-collapsed')).toBe('true');
  first.unmount();

  const second = await renderSidebar();
  expect(
    second.container
      .querySelector('.ant-layout-sider')
      ?.classList.contains('ant-layout-sider-collapsed'),
  ).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }));
  expect(localStorage.getItem('sidebar-collapsed')).toBe('false');
});

// Subscriptions moved into Settings, so the sidebar has no entry of its own for them.
test('shows subscription settings under Settings, not as a sidebar entry', async () => {
  const view = await renderSidebar('/settings');
  const selected = view.container.querySelector('.sider-nav .ant-menu-item-selected');
  expect(selected?.textContent).toBe('Settings');
  const labels = [...view.container.querySelectorAll('.sider-nav .ant-menu-item')].map(
    (i) => i.textContent,
  );
  expect(labels).not.toContain('Subscriptions');
});

test('labels the palette shortcut with the modifier the platform actually uses', async () => {
  const view = renderWithProviders(
    <MemoryRouter>
      <PanelTopBar />
    </MemoryRouter>,
  );
  await act(async () => {});
  const chip = view.container.querySelector('.panel-topbar-search-kbd');
  expect(chip?.textContent).toBe('CtrlK');
});

test('titles the page from the route instead of falling back to Overview', async () => {
  renderWithProviders(
    <MemoryRouter initialEntries={['/connections']}>
      <PanelTopBar />
    </MemoryRouter>,
  );
  await act(async () => {});
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Connections');
});
