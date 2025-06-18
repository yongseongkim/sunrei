import { IdGenerator } from '@/utils/IdGenerator';
import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  ManyToMany,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn
} from 'typeorm';
import { Image } from './image';
import { SunreiSpot } from './sunrei-spot.entity';
import { Tag } from './tag.entity';

@Entity()
export class Sunrei {
  @PrimaryColumn({ name: 'id', type: 'varchar', length: 32 })
  id!: string;

  @Column({ name: 'title', type: 'varchar', length: 128 })
  title: string = '';

  @Column({ name: 'description', type: 'text', nullable: true })
  description?: string;

  @Column({ name: 'link', type: 'varchar', length: 255, nullable: true })
  link?: string;

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

  @OneToMany(() => SunreiSpot, (spot) => spot.sunrei)
  spots!: SunreiSpot[];

  @ManyToMany(() => Tag, (tag) => tag.sunreis)
  tags!: Tag[];

  @BeforeInsert()
  generateId() {
    this.id = IdGenerator.generate('SR');
  }
}
