import { parseEnv } from './env';

const valid = {
  DATABASE_URL: 'postgresql://rpos:rpos@localhost:5433/rpos_dev',
  JWT_SECRET: 'x'.repeat(32),
};

describe('parseEnv', () => {
  it('applies defaults', () => {
    expect(parseEnv(valid)).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      DATABASE_URL: valid.DATABASE_URL,
      CORS_ORIGINS: ['http://localhost:5173', 'http://localhost:5174'],
      JWT_SECRET: valid.JWT_SECRET,
      MEDIA_DIR: 'uploads',
      R2: null,
      COOKIE_SECURE: false,
    });
  });

  const r2 = {
    R2_ACCOUNT_ID: 'acc123',
    R2_ACCESS_KEY_ID: 'key-id',
    R2_SECRET_ACCESS_KEY: 'secret',
    R2_BUCKET: 'menu-photos',
    R2_PUBLIC_URL: 'https://photos.example.in/',
  };

  it('reads a full Cloudflare R2 set, trimming the trailing slash of the public URL', () => {
    expect(parseEnv({ ...valid, ...r2 }).R2).toEqual({
      accountId: 'acc123',
      accessKeyId: 'key-id',
      secretAccessKey: 'secret',
      bucket: 'menu-photos',
      publicUrl: 'https://photos.example.in',
    });
  });

  it('treats empty R2 settings as not set, and refuses a partial set', () => {
    expect(parseEnv({ ...valid, R2_BUCKET: '', R2_PUBLIC_URL: '' }).R2).toBeNull();
    expect(() => parseEnv({ ...valid, R2_BUCKET: 'menu-photos' })).toThrow(
      /R2: set all of R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET and R2_PUBLIC_URL, or none/,
    );
    expect(() => parseEnv({ ...valid, ...r2, R2_PUBLIC_URL: 'not a url' })).toThrow(
      /R2_PUBLIC_URL/,
    );
  });

  it('coerces PORT and splits CORS_ORIGINS, trimming blanks', () => {
    const env = parseEnv({
      ...valid,
      PORT: '8080',
      CORS_ORIGINS: ' https://a.in , https://b.in ,',
    });
    expect(env.PORT).toBe(8080);
    expect(env.CORS_ORIGINS).toEqual(['https://a.in', 'https://b.in']);
  });

  it('names DATABASE_URL when it is missing', () => {
    expect(() => parseEnv({ JWT_SECRET: valid.JWT_SECRET })).toThrow(/DATABASE_URL/);
  });

  it('rejects a non-postgres DATABASE_URL', () => {
    expect(() => parseEnv({ ...valid, DATABASE_URL: 'mysql://x' })).toThrow(/DATABASE_URL/);
  });

  it('names PORT when it is not a number', () => {
    expect(() => parseEnv({ ...valid, PORT: 'abc' })).toThrow(/PORT/);
  });

  it('accepts the postgres:// scheme as well', () => {
    expect(parseEnv({ ...valid, DATABASE_URL: 'postgres://u:p@h:5432/d' }).DATABASE_URL).toBe(
      'postgres://u:p@h:5432/d',
    );
  });

  it('names JWT_SECRET when it is missing or shorter than 32 characters', () => {
    expect(() => parseEnv({ DATABASE_URL: valid.DATABASE_URL })).toThrow(/JWT_SECRET/);
    expect(() => parseEnv({ ...valid, JWT_SECRET: 'short-secret' })).toThrow(/JWT_SECRET/);
  });

  it('marks cookies secure in production', () => {
    expect(parseEnv({ ...valid, NODE_ENV: 'production' }).COOKIE_SECURE).toBe(true);
  });
});
