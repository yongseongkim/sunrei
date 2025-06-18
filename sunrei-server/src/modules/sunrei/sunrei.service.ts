import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Sunrei } from '../../model/sunrei.entity';
import { SunreiDTO } from '@/dto';
import { parseWKTPolygon, isPointInPolygon } from '@/utils/polygon-utils';

@Injectable()
export class SunreiService {
  constructor(
    @InjectRepository(Sunrei)
    private sunreiRepository: Repository<Sunrei>,
  ) {}

  async findAll(): Promise<SunreiDTO[]> {
    const sunreis = await this.sunreiRepository.find({
      relations: ['spots', 'spots.place', 'tags'],
      order: {
        createdAt: 'DESC',
      },
    });

    return sunreis.map(this.toDto);
  }

  async findOne(id: string): Promise<SunreiDTO | null> {
    const sunrei = await this.sunreiRepository.findOne({
      where: { id },
      relations: ['spots', 'spots.place', 'tags'],
    });

    return sunrei ? this.toDto(sunrei) : null;
  }

  async findByPolygon(polygonWKT: string): Promise<SunreiDTO[]> {
    const polygon = parseWKTPolygon(polygonWKT);
    
    const allSunreis = await this.sunreiRepository.find({
      relations: ['spots', 'spots.place', 'tags'],
      order: {
        createdAt: 'DESC',
      },
    });

    const sunreisInPolygon = allSunreis.filter(sunrei => {
      return sunrei.spots?.some(spot => {
        if (!spot.place) return false;
        const point = {
          latitude: spot.place.latitude,
          longitude: spot.place.longitude,
        };
        return isPointInPolygon(point, polygon);
      });
    });

    return sunreisInPolygon.map(this.toDto);
  }

  private toDto(sunrei: Sunrei): SunreiDTO {
    return {
      id: sunrei.id,
      title: sunrei.title,
      description: sunrei.description,
      link: sunrei.link,
      images: sunrei.images,
      tags: sunrei.tags?.map(tag => ({
        id: tag.id,
        name: tag.name,
        description: tag.description,
      })),
      spots: sunrei.spots?.map(spot => ({
        id: spot.id,
        title: spot.title,
        description: spot.description,
        images: spot.images,
        youtubeLink: spot.youtubeLink,
        places: spot.place ? [{
          id: spot.place.id,
          name: spot.place.name,
          address: spot.place.address,
          latitude: spot.place.latitude,
          longitude: spot.place.longitude,
        }] : [],
      })),
    };
  }
}