import { execSync } from 'node:child_process';
import { join } from 'node:path';

export default function globalSetup(): void {
  const apiRoot = join(__dirname, '..');
  process.loadEnvFile(join(apiRoot, '.env.test'));
  execSync('pnpm exec prisma migrate deploy', { cwd: apiRoot, stdio: 'inherit', env: process.env });
}
