import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Sunrei } from '../../model/sunrei.entity';
import { SunreiController } from './sunrei.controller';
import { SunreiService } from './sunrei.service';

@Module({
  imports: [TypeOrmModule.forFeature([Sunrei])],
  controllers: [SunreiController],
  providers: [SunreiService],
})
export class SunreiModule {}
