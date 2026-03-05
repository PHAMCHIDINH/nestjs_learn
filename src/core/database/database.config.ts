import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

const toNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toBoolean = (value: string | undefined, fallback = false): boolean => {
  if (value === undefined) {
    return fallback;
  }

  return value.toLowerCase() === 'true';
};

export const buildTypeOrmOptions = (
  configService: ConfigService,
): TypeOrmModuleOptions => {
  return {
    type: 'postgres',
    host: configService.get<string>('DB_HOST', 'localhost'),
    port: toNumber(configService.get<string>('DB_PORT'), 5432),
    username: configService.get<string>('DB_USER', 'app_user'),
    password: configService.get<string>('DB_PASSWORD', 'app_password'),
    database: configService.get<string>('DB_NAME', 'app_db'),
    autoLoadEntities: true,
    synchronize: toBoolean(configService.get<string>('DB_SYNC'), false),
    logging: toBoolean(configService.get<string>('DB_LOGGING'), false),
    retryAttempts: toNumber(configService.get<string>('DB_RETRY_ATTEMPTS'), 10),
    retryDelay: toNumber(configService.get<string>('DB_RETRY_DELAY_MS'), 3000),
    ssl: toBoolean(configService.get<string>('DB_SSL'), false)
      ? { rejectUnauthorized: false }
      : false,
    extra: {
      max: toNumber(configService.get<string>('DB_POOL_MAX'), 20),
      min: toNumber(configService.get<string>('DB_POOL_MIN'), 2),
      idleTimeoutMillis: toNumber(
        configService.get<string>('DB_POOL_IDLE_TIMEOUT_MS'),
        30000,
      ),
      connectionTimeoutMillis: toNumber(
        configService.get<string>('DB_POOL_CONN_TIMEOUT_MS'),
        10000,
      ),
      application_name: configService.get<string>(
        'DB_APP_NAME',
        'backend-repo',
      ),
    },
  };
};
