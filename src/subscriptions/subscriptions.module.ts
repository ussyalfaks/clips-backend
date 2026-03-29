import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { StellarPaymentService } from './stellar-payment.service';
import { StellarWebhookService } from './stellar-webhook.service';
import { SubscriptionsController } from './subscriptions.controller';

@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [SubscriptionsController],
  providers: [StellarPaymentService, StellarWebhookService],
  exports: [StellarPaymentService, StellarWebhookService],
})
export class SubscriptionsModule {}
