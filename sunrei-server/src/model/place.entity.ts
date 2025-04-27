import { IdGenerator } from '@/utils/IdGenerator';
import {
  BeforeInsert,
  Column,
  Entity,
  OneToMany,
  PrimaryColumn,
} from 'typeorm';
import { SunreiSpot } from './sunrei-spot.entity';

@Entity()
export class Place {
  @PrimaryColumn({ name: 'id', type: 'varchar', length: 32 })
  id!: string;

  @Column({ name: 'name', type: 'varchar', length: 128 })
  name: string = '';

  @Column({ name: 'address', type: 'varchar', length: 255 })
  address: string = '';

  @Column({ name: 'latitude', type: 'float' })
  latitude: number = 0.0;

  @Column({ name: 'longitude', type: 'float' })
  longitude: number = 0.0;

  // https://www.google.com/maps/place/?q=place_id:{your place id} 로 검색이 가능하다.
  @Column({ name: 'google_maps_id', type: 'varchar', length: 255, nullable: true })
  googleMapsId?: string;

  @OneToMany(() => SunreiSpot, (sunreiSpot) => sunreiSpot.place)
  sunreiSpots!: SunreiSpot[];

  @BeforeInsert()
  generateId() {
    this.id = IdGenerator.generate('P');
  }
}
