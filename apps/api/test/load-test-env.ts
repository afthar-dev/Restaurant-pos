import { join } from 'node:path';

process.loadEnvFile(join(__dirname, '..', '.env.test'));
