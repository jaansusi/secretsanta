import { ConfigModule, ConfigService } from '@nestjs/config';
import { SequelizeModuleAsyncOptions } from '@nestjs/sequelize';

export const dataBaseConfig: SequelizeModuleAsyncOptions = {
    imports: [ConfigModule],
    useFactory: async (configService: ConfigService) => ({
      dialect: 'postgres',
      host: configService.get<string>('DB_HOST'),
      port: parseInt(configService.get<string>('DB_PORT'), 10),
      username: configService.get<string>('DB_USER'),
      password: configService.get<string>('DB_PASSWORD'),
      database: configService.get<string>('DB_NAME'),
      autoLoadModels: true,
      synchronize: true,
    }),
    inject: [ConfigService],
  };