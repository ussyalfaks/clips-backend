import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { StellarService } from '../stellar/stellar.service';
import { PAYOUT_STATUS_QUEUE } from './payout-status.queue';

@Injectable()
@Processor(PAYOUT_STATUS_QUEUE)
export class PayoutStatusProcessor extends WorkerHost {
  private readonly logger = new Logger(PayoutStatusProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stellarService: StellarService,
  ) {
    super();
  }

  async process(_job: Job): Promise<void> {
    const payouts = await this.prisma.payout.findMany({
      where: {
        onChainTxHash: { not: null },
        confirmedAt: null,
        status: { in: ['pending', 'processing'] },
      },
      select: { id: true, onChainTxHash: true },
      take: 100,
      orderBy: { createdAt: 'asc' },
    });

    if (!payouts.length) {
      return;
    }

    for (const payout of payouts) {
      const hash = payout.onChainTxHash;
      if (!hash) {
        continue;
      }

      try {
        const tx = await this.stellarService.getTransactionStatus(hash);
        if (!tx.found) {
          continue;
        }

        const status = tx.successful ? 'completed' : 'failed';
        const confirmedAt = tx.confirmedAt ?? new Date();

        await this.prisma.payout.update({
          where: { id: payout.id },
          data: {
            status,
            confirmedAt,
            paidAt: tx.successful ? confirmedAt : undefined,
          },
        });

        this.logger.log(
          `Payout ${payout.id} confirmed from Horizon as ${status} (tx=${hash})`,
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'unknown error';
        this.logger.warn(
          `Failed Horizon status check for payout ${payout.id} (tx=${hash}): ${message}`,
        );
      }
    }
  }
}
