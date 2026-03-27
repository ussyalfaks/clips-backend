import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Security headers with Helmet
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: [`'self'`],
          styleSrc: [`'self'`, `'unsafe-inline'`],
          scriptSrc: [`'self'`],
          imgSrc: [`'self'`, 'data:', 'https:'],
          connectSrc: [`'self'`],
          fontSrc: [`'self'`],
          objectSrc: [`'none'`],
          mediaSrc: [`'self'`],
          frameSrc: [`'none'`],
        },
      },
      crossOriginEmbedderPolicy: false, // Allow embedding resources
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
      noSniff: true, // X-Content-Type-Options: nosniff
      xssFilter: true, // X-XSS-Protection: 1; mode=block
      hidePoweredBy: true, // Remove X-Powered-By header
      frameguard: {
        action: 'deny', // X-Frame-Options: DENY (prevents clickjacking)
      },
    }),
  );

  // This is the "Magic Line" that turns on the security for every door
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strips away any data that isn't in our DTOs
      forbidNonWhitelisted: true, // Rejects the request if extra data is sent
      transform: true, // Automatically converts data to the right type
    }),
  );

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
