import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Button, Form, Input, Typography } from 'antd';
import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { FormProvider } from 'react-hook-form';

import { FormField, useZodForm } from '@/components/form/rhf';
import { PortalLoginFormSchema } from '@/schemas/portal';
import type { PortalLoginFormValues } from '@/schemas/portal';
import { portalApi } from './portalApi';
import { portalErrorText } from './portalErrors';

export default function PortalLogin({ onLoggedIn }: { onLoggedIn: () => void }) {
  const { t } = useTranslation();
  const methods = useZodForm<PortalLoginFormValues>(PortalLoginFormSchema, {
    defaultValues: { login: '', password: '' },
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = async (values: PortalLoginFormValues) => {
    setBusy(true);
    setError('');
    try {
      await portalApi.login(values.login, values.password);
      onLoggedIn();
    } catch (err) {
      setError(portalErrorText(t, err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="portal-form">
      <Typography.Title level={4}>{t('portal.login.title')}</Typography.Title>
      <Typography.Paragraph type="secondary">{t('portal.login.hint')}</Typography.Paragraph>
      <FormProvider {...methods}>
        <Form layout="vertical" onFinish={methods.handleSubmit(onSubmit)}>
          <FormField name="login" label={t('portal.login.login')}>
            <Input prefix={<UserOutlined />} autoComplete="username" autoFocus />
          </FormField>
          <FormField name="password" label={t('portal.login.password')}>
            <Input.Password prefix={<LockOutlined />} autoComplete="current-password" />
          </FormField>
          {error && <Alert type="error" showIcon title={error} className="portal-form-error" />}
          <Button type="primary" htmlType="submit" block loading={busy}>
            {t('portal.login.submit')}
          </Button>
        </Form>
      </FormProvider>
    </div>
  );
}
