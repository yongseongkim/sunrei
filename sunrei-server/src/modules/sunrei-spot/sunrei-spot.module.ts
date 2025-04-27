import { Module } from '@nestjs/common';
import { SunreiSpotController } from './sunrei-spot.controller';
import { SunreiSpotService } from './sunrei-spot.service';

@Module({
  controllers: [SunreiSpotController],
  providers: [SunreiSpotService],
})
export class SunreiSpotModule {}