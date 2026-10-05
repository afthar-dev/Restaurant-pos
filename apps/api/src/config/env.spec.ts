import { parseEnv } from './env';

const valid = {
  DATABASE_URL: 'postgresql://rpos:rpos@localhost:5433/rpos_dev',
};

describe('parseEnv', () => {
  it('applies defaults', () => {
    expect(parseEnv(valid)).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      DATABASE_URL: valid.DATABASE_URL,
      CORS_ORIGINS: ['http://localhost:5173', 'http://localhost:5174'],
    });
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
    expect(() => parseEnv({})).toThrow(/DATABASE_URL/);
  });

  it('rejects a non-postgres DATABASE_URL', () => {
    expect(() => parseEnv({ DATABASE_URL: 'mysql://x' })).toThrow(/DATABASE_URL/);
  });

  it('names PORT when it is not a number', () => {
    expect(() => parseEnv({ ...valid, PORT: 'abc' })).toThrow(/PORT/);
  });

  it('accepts the postgres:// scheme as well', () => {
    expect(parseEnv({ DATABASE_URL: 'postgres://u:p@h:5432/d' }).DATABASE_URL).toBe(
      'postgres://u:p@h:5432/d',
    );
  });
});
