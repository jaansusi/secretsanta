import { ConfigModule, ConfigService } from '@nestjs/config';
import { SequelizeModuleAsyncOptions } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { WinstonLoggerService } from '../logger/logger.service';
import { migrateToGroups } from './group-migration';

const logger = new WinstonLoggerService();

export const dataBaseConfig: SequelizeModuleAsyncOptions = {
  imports: [ConfigModule],
  useFactory: async (configService: ConfigService) => ({
    dialect: 'postgres',
    host: configService.get<string>('DB_HOST'),
    port: parseInt(configService.get<string>('DB_PORT') || '5432', 10),
    username: configService.get<string>('DB_USER'),
    password: configService.get<string>('DB_PASSWORD'),
    database: configService.get<string>('DB_NAME'),
    autoLoadModels: true,
    synchronize: true,
    hooks: {
      // sync() never adds columns to existing tables: the group columns are added here, before it runs.
      async beforeBulkSync(this: Sequelize) {
        await migrateToGroups(this);
      },
    },
    // TLS to the database when DB_SSL=true (verify-full against the system CA store,
    // or DB_SSL_CA if the server uses a private CA).
    dialectOptions: configService.get<string>('DB_SSL') === 'true'
      ? { ssl: { rejectUnauthorized: true, ca: configService.get<string>('DB_SSL_CA') || undefined } }
      : undefined,
    // SQL statements contain decryption codes in WHERE clauses, so they are never logged unless
    // explicitly enabled for local debugging.
    logging: configService.get<string>('DB_LOGGING') === 'true' ? (msg: string) => logger.debug(msg) : false,
  }),
  inject: [ConfigService],
};