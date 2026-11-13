import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Grid, Menu, Popover, Space } from 'antd';
import { TranslationOutlined } from '@ant-design/icons';

import { LanguageManager } from '@/utils';
import { useTheme } from '@/hooks/useTheme';
import BrandMark from '@/components/ui/BrandMark';
import ThemeSwitch from '@/components/ui/ThemeSwitch';
import { AppearanceButton } from '@/components/ui/AppearancePanel';

interface SubHeaderProps {
  title: string;
  sId: string;
  email: string;
  lang: string;
  onLangChange: (lang: string) => void;
  actions?: ReactNode;
}

export default function SubHeader({
  title,
  sId,
  email,
  lang,
  onLangChange,
  actions,
}: SubHeaderProps) {
  const { t } = useTranslation();
  const { isDark } = useTheme();
  const screens = Grid.useBreakpoint();

  const langMenuItems = useMemo(
    () =>
      (LanguageManager.supportedLanguages as { value: string; name: string; icon: string }[]).map(
        (l) => ({
          key: l.value,
          label: (
            <Space size={8}>
              <span aria-hidden="true">{l.icon}</span>
              <span>{l.name}</span>
            </Space>
          ),
        }),
      ),
    [],
  );

  return (
    <header className="sub-header">
      <div className="sub-brand">
        <BrandMark size={40} className="sub-brand-mark" />
        <div className="sub-brand-text">
          <div className="sub-brand-title" dir="auto">
            {title || t('subscription.title')}
          </div>
          <div className="sub-brand-id">
            <bdi>{sId && email ? `${sId} - ${email}` : sId || email}</bdi>
          </div>
        </div>
      </div>
      <div className="sub-toolbar">
        {actions}
        <ThemeSwitch compact={!screens.sm} />
        <AppearanceButton placement="bottomRight" />
        <Popover
          rootClassName={isDark ? 'dark' : 'light'}
          placement="bottomRight"
          trigger="click"
          styles={{ content: { padding: 4 } }}
          content={
            <Menu
              mode="vertical"
              selectable
              selectedKeys={[lang]}
              items={langMenuItems}
              onClick={({ key }) => onLangChange(key)}
              style={{ border: 'none', minWidth: 160 }}
            />
          }
        >
          <Button
            className="toolbar-btn"
            aria-label={t('pages.settings.language')}
            icon={<TranslationOutlined />}
          />
        </Popover>
      </div>
    </header>
  );
}
