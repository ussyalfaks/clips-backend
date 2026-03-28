import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ClipsModule } from './clips/clips.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { BullModule } from '@nestjs/bullmq';
import { VideosModule } from './videos/videos.module';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { JobsModule } from './jobs/jobs.module';

import { PayoutsModule } from './payouts/payouts.module';

import { WalletModule } from './wallet/wallet.module';
import { MintModule } from './mint/mint.module';
import { PayoutModule } from './payout/payout.module';
import { StellarModule } from './stellar/stellar.module';


@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot(),
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST ?? 'localhost',
        port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
      },
    }),
    PrismaModule,
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            name: 'default',
            ttl: 60000,
            limit: 100,
          },
          {
            name: 'auth',
            ttl: 60000,
            limit: 10,
          },
        ],
        skipIf: (context) => {
          const request = context.switchToHttp().getRequest();
          const whitelist = config.get<string>('THROTTLER_WHITELIST');
          if (!whitelist) return false;
          const whitelistedIps = whitelist.split(',').map((ip) => ip.trim());
          return whitelistedIps.includes(request.ip);
        },
      }),
    }),
    AuthModule,
    ClipsModule,
    VideosModule,
    JobsModule,
    WalletModule,
    MintModule,
    PayoutModule,
    StellarModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
