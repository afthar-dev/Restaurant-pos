import { z } from 'zod';

/** An optional setting where an empty value (`R2_BUCKET=` in a .env file) means "not set". */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

const R2_KEYS = [
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET',
  'R2_PUBLIC_URL',
] as const;

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    DATABASE_URL: z
      .string()
      .regex(/^postgres(ql)?:\/\//, 'must be a postgres:// or postgresql:// URL'),
    CORS_ORIGINS: z
      .string()
      .default('http://localhost:5173,http://localhost:5174')
      .transform((value) =>
        value
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean),
      ),
    JWT_SECRET: z.string().min(32, 'must be at least 32 characters'),
    /** Where photos go when Cloudflare R2 is not set up (development, tests, small installs). */
    MEDIA_DIR: z.string().min(1).default('uploads'),
    R2_ACCOUNT_ID: optional(z.string()),
    R2_ACCESS_KEY_ID: optional(z.string()),
    R2_SECRET_ACCESS_KEY: optional(z.string()),
    R2_BUCKET: optional(z.string()),
    R2_PUBLIC_URL: optional(z.url('must be a URL like https://photos.example.in')),
  })
  .superRefine((env, ctx) => {
    const set = R2_KEYS.filter((key) => env[key] !== undefined).length;
    if (set > 0 && set < R2_KEYS.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['R2'],
        message: `set all of ${R2_KEYS.slice(0, -1).join(', ')} and R2_PUBLIC_URL, or none`,
      });
    }
  })
  .transform(
    ({
      R2_ACCOUNT_ID,
      R2_ACCESS_KEY_ID,
      R2_SECRET_ACCESS_KEY,
      R2_BUCKET,
      R2_PUBLIC_URL,
      ...env
    }) => ({
      ...env,
      // Cloudflare R2 for photos when fully configured; null means the local folder.
      R2:
        R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET && R2_PUBLIC_URL
          ? {
              accountId: R2_ACCOUNT_ID,
              accessKeyId: R2_ACCESS_KEY_ID,
              secretAccessKey: R2_SECRET_ACCESS_KEY,
              bucket: R2_BUCKET,
              publicUrl: R2_PUBLIC_URL.replace(/\/+$/, ''),
            }
          : null,
      COOKIE_SECURE: env.NODE_ENV === 'production',
    }),
  );

export type Env = z.infer<typeof envSchema>;

export function parseEnv(raw: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  return result.data;
}
