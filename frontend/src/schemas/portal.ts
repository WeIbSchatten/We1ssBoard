import { z } from 'zod';

export const PortalKeySchema = z.object({
  inboundId: z.number().int(),
  hostId: z.number().int(),
  remark: z.string(),
  protocol: z.string(),
  hidden: z.boolean(),
});

export const PortalDeviceSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  createdAt: z.number(),
  lastUsedAt: z.number(),
});

export const PortalProfileSchema = z.object({
  email: z.string().min(1),
  enable: z.boolean(),
  expiryTime: z.number(),
  totalGB: z.number(),
  up: z.number(),
  down: z.number(),
  group: z.string(),
  subUrl: z.string(),
  mustChange: z.boolean(),
  ldap: z.boolean(),
  keys: z
    .array(PortalKeySchema)
    .nullable()
    .transform((v) => v ?? []),
  devices: z
    .array(PortalDeviceSchema)
    .nullable()
    .transform((v) => v ?? []),
  csrfToken: z.string().optional(),
});

export const PortalLoginFormSchema = z.object({
  login: z.string().trim().min(1, 'portal.login.required'),
  password: z.string().min(1, 'portal.login.required'),
});

export const PortalPasswordFormSchema = z
  .object({
    current: z.string().min(1, 'portal.login.required'),
    next: z.string().min(8, 'portal.password.weak'),
    repeat: z.string(),
  })
  .refine((v) => v.next === v.repeat, { path: ['repeat'], message: 'portal.password.mismatch' });

export type PortalKey = z.infer<typeof PortalKeySchema>;
export type PortalDevice = z.infer<typeof PortalDeviceSchema>;
export type PortalProfile = z.infer<typeof PortalProfileSchema>;
export type PortalLoginFormValues = z.infer<typeof PortalLoginFormSchema>;
export type PortalPasswordFormValues = z.infer<typeof PortalPasswordFormSchema>;
