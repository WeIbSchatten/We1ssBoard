import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Button, Form, Input, Typography } from 'antd';
import { FormProvider } from 'react-hook-form';

import { FormField, useZodForm } from '@/components/form/rhf';
import { getMessage } from '@/utils/messageBus';
import { PortalPasswordFormSchema } from '@/schemas/portal';
import type { PortalPasswordFormValues } from '@/schemas/portal';
import { portalApi } from './portalApi';
import { isUnauthorized, portalErrorText } from './portalErrors';

interface Props {
  temporary?: boolean;
  onDone: () => void;
  onUnauthorized: () => void;
}

export default function PortalChangePassword({ temporary, onDone, onUnauthorized }: Props) {
  const { t } = useTranslation();
  const methods = useZodForm<PortalPasswordFormValues>(PortalPasswordFormSchema, {
    defaultValues: { current: '', next: '', repeat: '' },
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = async (values: PortalPasswordFormValues) => {
    setBusy(true);
    setError('');
    try {
      await portalApi.changePassword(values.current, values.next);
      getMessage().success(t('portal.password.changed'));
      methods.reset();
      onDone();
    } catch (err) {
      if (isUnauthorized(err)) onUnauthorized();
      else setError(portalErrorText(t, err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={temporary ? 'portal-form' : 'portal-section portal-form-inline'}>
      <Typography.Title level={temporary ? 4 : 5}>{t('portal.password.title')}</Typography.Title>
      {temporary && (
        <Alert
          type="warning"
          showIcon
          title={t('portal.password.tempHint')}
          className="portal-form-error"
        />
      )}
      <FormProvider {...methods}>
        <Form layout="vertical" onFinish={methods.handleSubmit(onSubmit)}>
          <FormField name="current" label={t('portal.password.current')}>
            <Input.Password autoComplete="current-password" />
          </FormField>
          <FormField name="next" label={t('portal.password.next')}>
            <Input.Password autoComplete="new-password" />
          </FormField>
          <FormField name="repeat" label={t('portal.password.repeat')}>
            <Input.Password autoComplete="new-password" />
          </FormField>
          {error && <Alert type="error" showIcon title={error} className="portal-form-error" />}
          <Button type="primary" htmlType="submit" block={temporary} loading={busy}>
            {t('portal.password.submit')}
          </Button>
        </Form>
      </FormProvider>
    </div>
  );
}
