import { GetSunreiResult, ListSunreiResult } from '@/dto';
import { Controller, Get, Param, Query } from '@nestjs/common';
import { SunreiService } from './sunrei.service';

@Controller('sunreis')
export class SunreiController {
  constructor(private readonly sunreiService: SunreiService) {}

  @Get()
  async list(@Query('polygon') polygon?: string): Promise<ListSunreiResult> {
    const sunreis = polygon
      ? await this.sunreiService.findByPolygon(polygon)
      : await this.sunreiService.findAll();

    console.log(sunreis);
    return {
      sunreis: sunreis,
      totalCount: sunreis.length,
    };
  }

  @Get(':id')
  async get(@Param('id') id: string): Promise<GetSunreiResult> {
    const sunrei = await this.sunreiService.findOne(id);
    return {
      sunrei: sunrei || undefined,
    };
  }
}
