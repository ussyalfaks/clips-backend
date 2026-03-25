import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // This is the "Magic Line" that turns on the security for every door
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true, // Strips away any data that isn't in our DTOs
    forbidNonWhitelisted: true, // Rejects the request if extra data is sent
    transform: true, // Automatically converts data to the right type
  }));

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
