import { DataSource } from 'typeorm';
import { CreateUsersTable1741160400000 } from './migrations/1741160400000-CreateUsersTable';
import { User } from '../../modules/users/entities/user.entity';

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

const dataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: toNumber(process.env.DB_PORT, 5432),
  username: process.env.DB_USER ?? 'app_user',
  password: process.env.DB_PASSWORD ?? 'app_password',
  database: process.env.DB_NAME ?? 'app_db',
  entities: [User],
  migrations: [CreateUsersTable1741160400000],
  synchronize: false,
  ssl: toBoolean(process.env.DB_SSL, false) ? { rejectUnauthorized: false } : false,
});

export default dataSource;
