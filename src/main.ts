import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { loadConfig } from './config/config';

async function bootstrap() {
  // Validate config before anything else starts; throws if it is bad.
  const config = loadConfig();
  const app = await NestFactory.create(AppModule);
  await app.listen(config.PORT);
}

bootstrap().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
