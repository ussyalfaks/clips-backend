import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import Server, { Horizon } from '@stellar/stellar-sdk';

@Injectable()
export class StellarWebhookService {
  private readonly logger = new Logger(StellarWebhookService.name);
  private server: any;
  private horizon: any;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.server = new Server(
      this.configService.get<string>('STELLAR_HORIZON_URL') || 'https://horizon-testnet.stellar.org',
    );
    this.horizon = new Horizon.Server(
      this.configService.get<string>('STELLAR_HORIZON_URL') || 'https://horizon-testnet.stellar.org',
    );
  }

  /**
   * Start listening for Stellar transactions
   */
  async startTransactionListener(): Promise<void> {
    try {
      this.logger.log('Starting Stellar transaction listener...');

      // Listen for account transactions (for payment monitoring)
      this.horizon.transactions()
        .forAccount(this.configService.get<string>('STELLAR_WALLET_ADDRESS'))
        .cursor('now')
        .stream({
          onmessage: (transaction) => {
            this.handleTransaction(transaction);
          },
          onerror: (error) => {
            this.logger.error('Stream error:', error);
          },
        })
        .catch((error: any) => {
          this.logger.error('Failed to start transaction stream:', error);
        });

    } catch (error) {
      this.logger.error('Error setting up Stellar webhook:', error);
    }
  }

  /**
   * Handle incoming Stellar transaction
   */
  private async handleTransaction(transaction: any): Promise<void> {
    try {
      // Look for payment operations with our memo format
      const paymentOperations = transaction.operations
        .filter((op: any) => op.type === 'payment')
        .filter((op: any) => op.memo && op.memo.startsWith && op.memo.startsWith('CLIPS-'));

      for (const payment of paymentOperations) {
        await this.processPayment(payment, transaction);
      }
    } catch (error) {
      this.logger.error('Error handling transaction:', error);
    }
  }

  /**
   * Process payment from transaction
   */
  private async processPayment(payment: any, transaction: any): Promise<void> {
    try {
      // Extract memo to find payment intent
      const memo = payment.memo;
      
      // Find payment intent by memo
      const paymentIntent = await this.prisma.stellarPaymentIntent.findFirst({
        where: {
          memo,
          status: 'pending',
        },
      });

      if (!paymentIntent) {
        this.logger.warn(`Payment intent not found for memo: ${memo}`);
        return;
      }

      // Verify payment details
      const isValidPayment = 
        payment.destination === paymentIntent.destination &&
        payment.asset_code === paymentIntent.asset &&
        parseFloat(payment.amount) === paymentIntent.amount;

      if (!isValidPayment) {
        this.logger.warn(`Payment validation failed for intent: ${paymentIntent.id}`);
        return;
      }

      // Update payment intent as completed
      await this.prisma.stellarPaymentIntent.update({
        where: { id: paymentIntent.id },
        data: {
          status: 'completed',
          transactionId: transaction.hash,
        },
      });

      // Activate subscription
      await this.activateSubscription(paymentIntent.userId, paymentIntent.plan);

      this.logger.log(`Payment processed and subscription activated for user: ${paymentIntent.userId}`);
    } catch (error) {
      this.logger.error('Error processing payment:', error);
    }
  }

  /**
   * Activate subscription for user
   */
  private async activateSubscription(userId: number, plan: string): Promise<void> {
    const planDurations = {
      'pro': 30, // 30 days
      'agency': 30, // 30 days
    };

    const duration = planDurations[plan] || 30;
    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + duration * 24 * 60 * 60 * 1000);

    // Deactivate existing subscriptions
    await this.prisma.subscription.updateMany({
      where: {
        userId,
        status: 'active',
      },
      data: {
        status: 'cancelled',
        endDate: new Date(),
      },
    });

    // Create new subscription
    await this.prisma.subscription.create({
      data: {
        userId,
        plan,
        status: 'active',
        paymentMethod: 'stellar',
        startDate,
        endDate,
      },
    });
  }

  /**
   * Verify webhook signature (if using webhook authentication)
   */
  verifyWebhookSignature(payload: string, signature: string): boolean {
    // Implement webhook signature verification if needed
    // This would use your webhook secret
    return true; // Placeholder
  }
}
