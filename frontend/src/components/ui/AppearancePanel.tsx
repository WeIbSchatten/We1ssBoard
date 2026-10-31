import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Popover, Segmented, Slider, Tooltip } from 'antd';
import { BgColorsOutlined, CheckOutlined } from '@ant-design/icons';

import {
  ENERGY_EDITIONS,
  STYLE_PRESETS,
  UI_SCALES,
  autoUiScale,
  pauseAnimationsUntilLeave,
  useTheme,
  type EnergyEdition,
  type StylePreset,
  type UiScale,
} from '@/hooks/useTheme';
import { BACKDROPS, BACKDROP_H, BACKDROP_W, backdropPaths } from '@/theme/backdrops';
import ThemeSwitch from './ThemeSwitch';
import './AppearancePanel.css';

// Swatches mirror the dark palette of each preset so the choice is visible before clicking.
const PRESET_SWATCHES: Record<Exclude<StylePreset, 'energy'>, string[]> = {
  mono: ['#0a0a0a', '#1b1b1b', '#8f8f8f', '#f5f5f5'],
  pastel: ['#f8ffa1', '#f6d5ee', '#a8a3f6', '#24316b'],
  ocean: ['#0a0d14', '#19202d', '#7fb0ff', '#2f74ff'],
  emerald: ['#090c0b', '#19201d', '#8ab8e0', '#34d399'],
  obsidian: ['#050506', '#1a1a1a', '#8c8c8c', '#f2f2f2'],
};

export const EDITION_SWATCHES: Record<EnergyEdition, string[]> = {
  classic: ['#1c2f6e', '#c7ccd6', '#db0a40', '#ffc906'],
  sugarfree: ['#0b5d8f', '#9fd2ef', '#e9eef3', '#db0a40'],
  winter: ['#1b2f4a', '#9fd4ff', '#e6f2fb', '#c9d3e0'],
  coconut: ['#f7f2e8', '#a07850', '#15a3b8', '#1d2a44'],
  tropical: ['#1a1606', '#ffc906', '#ff8a00', '#2fbf71'],
  red: ['#1a0a0e', '#e8364f', '#3fae6a', '#ffd2d8'],
};

function useAutoPercent(): number {
  const [width, setWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return Math.round(autoUiScale(width) * 100);
}

export function AppearancePanel() {
  const { t } = useTranslation();
  const {
    stylePreset,
    setStylePreset,
    uiScale,
    setUiScale,
    energyEdition,
    setEnergyEdition,
    background,
    setBackground,
    backgroundOpacity,
    setBackgroundOpacity,
  } = useTheme();
  const autoPercent = useAutoPercent();

  return (
    <div className="appearance-panel" id="appearance-panel">
      <section>
        <div className="appearance-label">{t('menu.appearance.style')}</div>
        <div
          className="appearance-presets"
          role="radiogroup"
          aria-label={t('menu.appearance.style')}
        >
          {STYLE_PRESETS.map((preset) => {
            const swatches =
              preset === 'energy' ? EDITION_SWATCHES[energyEdition] : PRESET_SWATCHES[preset];
            return (
              <button
                key={preset}
                type="button"
                role="radio"
                aria-checked={stylePreset === preset}
                className={`appearance-preset appearance-preset--${preset}${stylePreset === preset ? ' is-active' : ''}`}
                onClick={() => {
                  pauseAnimationsUntilLeave('appearance-panel');
                  setStylePreset(preset);
                }}
              >
                <span className="appearance-preset-art" aria-hidden>
                  <span className="appearance-preset-aa">Aa</span>
                  <span className="appearance-preset-swatches">
                    {swatches.map((c) => (
                      <i key={c} style={{ background: c }} />
                    ))}
                  </span>
                </span>
                <span className="appearance-preset-text">
                  <b>{t(`menu.appearance.preset.${preset}`)}</b>
                  <small>{t(`menu.appearance.preset.${preset}Hint`)}</small>
                </span>
                {stylePreset === preset && <CheckOutlined className="appearance-preset-check" />}
              </button>
            );
          })}
        </div>
      </section>

      {stylePreset === 'energy' && (
        <section>
          <div className="appearance-label">{t('menu.appearance.series')}</div>
          <div
            className="appearance-editions"
            role="radiogroup"
            aria-label={t('menu.appearance.series')}
          >
            {ENERGY_EDITIONS.map((edition) => (
              <button
                key={edition}
                type="button"
                role="radio"
                aria-checked={energyEdition === edition}
                className={`appearance-edition${energyEdition === edition ? ' is-active' : ''}`}
                onClick={() => setEnergyEdition(edition)}
              >
                <span className="appearance-edition-cans" aria-hidden>
                  {EDITION_SWATCHES[edition].slice(0, 3).map((c) => (
                    <i key={c} style={{ background: c }} />
                  ))}
                </span>
                <span className="appearance-preset-text">
                  <b>{t(`menu.appearance.edition.${edition}`)}</b>
                  <small>{t(`menu.appearance.edition.${edition}Hint`)}</small>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="appearance-label">{t('menu.theme')}</div>
        <ThemeSwitch />
      </section>

      <section>
        <div className="appearance-label">{t('menu.appearance.background')}</div>
        <div
          className="appearance-backdrops"
          role="radiogroup"
          aria-label={t('menu.appearance.background')}
        >
          {BACKDROPS.map((id) => (
            <Tooltip key={id} title={t(`menu.appearance.backdrop.${id}`)}>
              <button
                type="button"
                role="radio"
                aria-checked={background === id}
                aria-label={t(`menu.appearance.backdrop.${id}`)}
                className={`appearance-backdrop${background === id ? ' is-active' : ''}`}
                onClick={() => setBackground(id)}
              >
                <svg
                  viewBox={`0 0 ${BACKDROP_W} ${BACKDROP_H}`}
                  preserveAspectRatio="xMidYMid slice"
                  aria-hidden
                >
                  {backdropPaths(id, 2.4).map((p, i) => (
                    <path key={i} d={p.d} style={p.style} />
                  ))}
                </svg>
              </button>
            </Tooltip>
          ))}
        </div>
      </section>

      <section>
        <div className="appearance-label">{t('menu.appearance.backgroundOpacity')}</div>
        <Slider
          min={0}
          max={90}
          step={5}
          value={backgroundOpacity}
          disabled={background === 'plain'}
          onChange={setBackgroundOpacity}
          tooltip={{ formatter: (v) => `${v}%` }}
          ariaLabelForHandle={t('menu.appearance.backgroundOpacity')}
        />
        <div className="appearance-hint">
          {background === 'plain'
            ? t('menu.appearance.backgroundOpacityPlain')
            : t('menu.appearance.backgroundOpacityHint')}
        </div>
      </section>

      <section>
        <div className="appearance-label">{t('menu.appearance.size')}</div>
        <Segmented<UiScale>
          block
          size="small"
          value={uiScale}
          onChange={setUiScale}
          options={UI_SCALES.map((s) => ({
            value: s,
            label: s === 'auto' ? t('menu.appearance.sizeAuto') : `${s}%`,
          }))}
        />
        <div className="appearance-hint">
          {t('menu.appearance.sizeAutoHint', { percent: autoPercent })}
        </div>
      </section>
    </div>
  );
}

// Palette button that opens the appearance popover; used in the sidebar and login toolbar.
export function AppearanceButton({
  placement = 'rightBottom',
}: {
  placement?: 'rightBottom' | 'bottomRight' | 'top';
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <Popover
      trigger="click"
      open={open}
      onOpenChange={setOpen}
      placement={placement}
      content={<AppearancePanel />}
      title={t('menu.appearance.title')}
      arrow={false}
    >
      <Tooltip title={open ? undefined : t('menu.appearance.title')} placement="right">
        <button type="button" className="appearance-button" aria-label={t('menu.appearance.title')}>
          <BgColorsOutlined />
        </button>
      </Tooltip>
    </Popover>
  );
}
