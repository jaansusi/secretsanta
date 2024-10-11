import { SequelizeModuleOptions } from '@nestjs/sequelize';

export const dataBaseConfig: SequelizeModuleOptions = {
    dialect: 'postgres',
    database: 'secretsanta',
    username: 'user',
    password: 'pass',
    host: 'postgres',
    port: 5432,
    ssl: false,
    autoLoadModels: true,
    synchronize: true,
};