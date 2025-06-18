import { SunreiSpotDTO } from '@/dto';
import { Controller, Get, Param } from '@nestjs/common';
import { SunreiSpotService } from './sunrei-spot.service';

@Controller('sunrei-spots')
export class SunreiSpotController {
  constructor(private readonly sunreiSpotService: SunreiSpotService) {}

  @Get()
  list(): SunreiSpotDTO[] {
    return [];
  }

  @Get(':id')
  get(@Param('id') id: string): SunreiSpotDTO {
    return {
      id: id,
      title: '',
      description: '',
    };
  }
}
