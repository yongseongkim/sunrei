import { IdGenerator } from '@/utils/IdGenerator';
import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Image } from './image';
import { Place } from './place.entity';
import { Sunrei } from './sunrei.entity';

@Entity()
export class SunreiSpot {
  @PrimaryColumn({ name: 'id', type: 'varchar', length: 32 })
  id!: string;

  @Column({ name: 'title', type: 'varchar', length: 64 })
  title: string = '';

  @Column({ name: 'description', type: 'text', nullable: true })
  description?: string;

  @Column({ name: 'youtube_link', type: 'varchar', length: 255, nullable: true })
  youtubeLink?: string;

  @Column({
    name: 'images',
    type: 'jsonb',
    default: '[]',
    transformer: {
      to: (value: Image[]) => value || [],
      from: (value: any) => value || [],
    },
  })
  images: Image[] = [];

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt!: Date;

  @Column({ name: 'place_id', type: 'varchar', length: 32 })
  placeId!: string;

  @Column({ name: 'sunrei_id', type: 'varchar', length: 32 })
  sunreiId!: string;

  @ManyToOne(() => Place, (place) => place.sunreiSpots)
  @JoinColumn({ name: 'place_id' })
  place?: Place;

  @ManyToOne(() => Sunrei, (sunrei) => sunrei.spots)
  @JoinColumn({ name: 'sunrei_id' })
  sunrei?: Sunrei;

  @BeforeInsert()
  generateId() {
    this.id = IdGenerator.generate('SS');
  }
}
