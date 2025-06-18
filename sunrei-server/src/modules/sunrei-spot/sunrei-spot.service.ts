import { Injectable } from '@nestjs/common';
import { SunreiSpot } from '../../model/sunrei-spot.entity';

@Injectable()
export class SunreiSpotService {
  private sunreiSpots: SunreiSpot[] = [];

  findAll(): SunreiSpot[] {
    return this.sunreiSpots;
  }

  create(sunreiSpot: SunreiSpot): SunreiSpot {
    this.sunreiSpots.push(sunreiSpot);
    return sunreiSpot;
  }
}
