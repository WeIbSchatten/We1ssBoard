import { afterEach, expect, test } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';

import { AppearancePanel } from '@/components/ui/AppearancePanel';
import { renderWithProviders } from './test-utils';

afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-style');
  document.documentElement.removeAttribute('data-edition');
});

// The series picker belongs to Энергия alone; showing it elsewhere would change nothing.
test('offers series only for the Energy style and applies the picked one', () => {
  renderWithProviders(<AppearancePanel />);
  expect(screen.queryByRole('radiogroup', { name: 'Series' })).toBeNull();

  fireEvent.click(screen.getByRole('radio', { name: /Energy/ }));
  const series = screen.getByRole('radiogroup', { name: 'Series' });
  fireEvent.click(within(series).getByRole('radio', { name: /Winter Edition/ }));
  expect(document.documentElement.getAttribute('data-edition')).toBe('winter');

  fireEvent.click(screen.getByRole('radio', { name: /Mono/ }));
  expect(screen.queryByRole('radiogroup', { name: 'Series' })).toBeNull();
});

test('stores the picked background for the current style', () => {
  renderWithProviders(<AppearancePanel />);
  const backgrounds = screen.getByRole('radiogroup', { name: 'Background' });
  fireEvent.click(within(backgrounds).getByRole('radio', { name: 'Waves' }));
  expect(JSON.parse(localStorage.getItem('fb-backgrounds') ?? '{}').mono.id).toBe('waves');
});

// A plain background has nothing to fade, so its opacity control stays locked.
test('locks background opacity for the plain background', () => {
  renderWithProviders(<AppearancePanel />);
  const slider = screen.getByRole('slider', { name: 'Background opacity' });
  expect(slider.getAttribute('aria-disabled')).not.toBe('true');
  fireEvent.click(
    within(screen.getByRole('radiogroup', { name: 'Background' })).getByRole('radio', {
      name: 'Plain',
    }),
  );
  expect(
    screen.getByRole('slider', { name: 'Background opacity' }).getAttribute('aria-disabled'),
  ).toBe('true');
});
