import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Place } from './model/place.entity';
import { SunreiSpot } from './model/sunrei-spot.entity';
import { Sunrei } from './model/sunrei.entity';
import { Tag } from './model/tag.entity';
import { SunreiSpotModule } from './modules/sunrei-spot/sunrei-spot.module';
import { SunreiModule } from './modules/sunrei/sunrei.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.local', '.env.production'],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('DATABASE_HOST', 'localhost'),
        port: configService.get<number>('DATABASE_PORT', 5432),
        username: configService.get('DATABASE_USER', 'sunrei'),
        password: configService.get('DATABASE_PASSWORD', 'sunrei'),
        database: configService.get('DATABASE_NAME', 'sunrei'),
        entities: [Place, Sunrei, SunreiSpot, Tag],
        synchronize: false,
        logging: configService.get<boolean>('DATABASE_LOGGING', true),
      }),
      inject: [ConfigService],
    }),
    SunreiSpotModule,
    SunreiModule,
  ],
})
export class AppModule {}
