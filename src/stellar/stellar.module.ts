import { Module } from '@nestjs/common';
import { StellarService } from './stellar.service';
import { StellarPaymentListenerService } from './stellar-payment-listener.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [StellarService, StellarPaymentListenerService],
  exports: [StellarService, StellarPaymentListenerService],
})
export class StellarModule {}
