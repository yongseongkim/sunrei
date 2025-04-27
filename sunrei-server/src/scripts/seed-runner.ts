import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../app.module';
import { seedDatabase } from './seed-data';

async function runSeed() {
  console.log('🌱 Starting database seeding...');

  const app = await NestFactory.createApplicationContext(AppModule);
  const dataSource = app.get(DataSource);

  try {
    // Check if data already exists
    const sunreiCount = await dataSource.getRepository('Sunrei').count();
    if (sunreiCount > 0) {
      console.log('⚠️  Database already contains data. Skipping seed.');
      await app.close();
      return;
    }

    // Run seed
    await seedDatabase(dataSource);
    console.log('✅ Database seeding completed successfully!');
  } catch (error) {
    console.error('❌ Error during seeding:', error);
    throw error;
  } finally {
    await app.close();
  }
}

// Run if called directly
if (require.main === module) {
  runSeed()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
