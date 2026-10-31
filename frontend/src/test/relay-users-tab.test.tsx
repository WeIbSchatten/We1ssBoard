import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';

import RelayUsersTab from '@/pages/tg-web-proxy/RelayUsersTab';
import { HttpUtil, Msg } from '@/utils';

import { renderWithProviders } from './test-utils';

const profile = (name: string) => ({ name, backend: '127.0.0.1:2398', secret: '0'.repeat(32) });

function mockHttp() {
  vi.spyOn(HttpUtil, 'get').mockImplementation(async (url: string) => {
    if (url === '/panel/api/clients/list')
      return new Msg(
        true,
        '',
        ['alice', 'bob', 'carol', 'dave'].map((email) => ({ email })),
      );
    if (url === '/panel/api/tgWebProxy/overview')
      return new Msg(true, '', [
        {
          nodeId: 0,
          name: '',
          hostname: 'a.example.com',
          installed: true,
          running: true,
          ready: true,
          profiles: 1,
          clients: 1,
          backendsActive: 1,
          backendsTotal: 1,
        },
        {
          nodeId: 4,
          name: 'nl-2',
          hostname: 'b.example.com',
          installed: true,
          running: true,
          ready: true,
          profiles: 1,
          clients: 1,
          backendsActive: 1,
          backendsTotal: 1,
        },
      ]);
    if (url === '/panel/api/tgWebProxy/config')
      return new Msg(true, '', {
        configExists: true,
        profilesExists: true,
        profiles: [profile('eu'), profile('fb:carol')],
      });
    if (url === '/panel/api/nodes/remote/4/tgWebProxy/config')
      return new Msg(true, '', {
        configExists: true,
        profilesExists: true,
        profiles: [profile('nl')],
      });
    if (url === '/panel/api/tgWebProxy/bindings')
      return new Msg(true, '', {
        bindings: [
          {
            clientId: 3,
            email: 'carol',
            profileName: 'eu',
            effectiveProfile: 'fb:carol',
            dedicated: true,
          },
          {
            clientId: 4,
            email: 'dave',
            profileName: 'nl',
            effectiveProfile: 'fb:dave',
            dedicated: true,
            nodeId: 4,
          },
        ],
        syncError: '',
      });
    return new Msg(false, 'unexpected ' + url);
  });
  return vi.spyOn(HttpUtil, 'post').mockResolvedValue(new Msg(true, '', []));
}

function list(title: string) {
  const header = screen.getByText(title);
  return header.closest('.ant-transfer-section') as HTMLElement;
}

function transferAction(name: string) {
  const actions = document.querySelector('.ant-transfer-actions') as HTMLElement;
  return within(actions).getByRole('button', {
    name: `${name === 'Bind' ? 'right' : 'left'} ${name}`,
  });
}

async function itemsOf(title: string) {
  await waitFor(() =>
    expect(within(list(title)).queryAllByRole('listitem').length).toBeGreaterThan(0),
  );
  return within(list(title))
    .getAllByRole('listitem')
    .map((li) => li.textContent);
}

afterEach(() => vi.restoreAllMocks());

describe('web proxy users tab', () => {
  // Concept A: per relay, who is bound and who is not, side by side.
  it('splits clients into bound and unbound for this panel relay', async () => {
    mockHttp();
    renderWithProviders(<RelayUsersTab />);

    expect(await itemsOf('Bound')).toEqual(['carol']);
    // A client bound to another relay is offered here too, and says where it is now.
    expect(await itemsOf('Not bound')).toEqual(['alice', 'bob', 'davenow on nl-2']);
  });

  it('binds the picked clients to this panel relay with the chosen profile', async () => {
    const post = mockHttp();
    renderWithProviders(<RelayUsersTab />);
    await itemsOf('Not bound');

    fireEvent.click(within(list('Not bound')).getByText('alice'));
    fireEvent.click(within(list('Not bound')).getByText('bob'));
    fireEvent.click(transferAction('Bind'));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0][0]).toBe('/panel/api/tgWebProxy/bindings/bindMany');
    expect(post.mock.calls[0][1]).toEqual({
      emails: ['alice', 'bob'],
      profileName: 'eu',
      dedicated: true,
    });
  });

  // A node relay takes its profiles from the node and always binds dedicated.
  it('binds to a node relay with that node id and its own profile', async () => {
    const post = mockHttp();
    renderWithProviders(<RelayUsersTab />);
    fireEvent.click(await screen.findByRole('radio', { name: /nl-2/ }));

    expect(await itemsOf('Bound')).toEqual(['dave']);
    fireEvent.click(within(list('Not bound')).getByText('carol'));
    await waitFor(() =>
      expect(
        screen.getByRole('combobox', { name: 'Profile' }).closest('.ant-select')?.textContent,
      ).toBe('nl'),
    );
    fireEvent.click(transferAction('Bind'));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0][1]).toEqual({
      emails: ['carol'],
      profileName: 'nl',
      dedicated: true,
      nodeId: 4,
    });
  });

  it('unbinds the picked clients one by one', async () => {
    const post = mockHttp();
    renderWithProviders(<RelayUsersTab />);
    await itemsOf('Bound');

    fireEvent.click(within(list('Bound')).getByText('carol'));
    fireEvent.click(transferAction('Unbind'));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0]).toEqual([
      '/panel/api/tgWebProxy/bindings/unbind',
      { email: 'carol' },
      expect.anything(),
    ]);
  });
});
