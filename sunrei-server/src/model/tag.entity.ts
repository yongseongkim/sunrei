import { IdGenerator } from '@/utils/IdGenerator';
import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  JoinTable,
  ManyToMany,
  PrimaryColumn,
  UpdateDateColumn
} from 'typeorm';
import { Sunrei } from './sunrei.entity';

@Entity()
export class Tag {
  @PrimaryColumn({ name: 'id', type: 'varchar', length: 32 })
  id!: string;

  @Column({ name: 'name', type: 'varchar', length: 32, unique: true })
  name: string = '';

  @Column({ name: 'description', type: 'varchar', length: 255, nullable: true })
  description?: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt!: Date;

  @ManyToMany(() => Sunrei, (sunrei) => sunrei.tags)
  @JoinTable({
    name: 'sunrei_tag',
    joinColumn: {
      name: 'tag_id',
      referencedColumnName: 'id'
    },
    inverseJoinColumn: {
      name: 'sunrei_id',
      referencedColumnName: 'id'
    }
  })
  sunreis!: Sunrei[];

  @BeforeInsert()
  generateId() {
    this.id = IdGenerator.generate('TG');
  }
}