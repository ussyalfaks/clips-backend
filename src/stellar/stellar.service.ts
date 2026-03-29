import { Injectable, Logger } from '@nestjs/common';
import { StrKey, Horizon } from '@stellar/stellar-sdk';

export type StellarNetwork = 'testnet' | 'public';

@Injectable()
export class StellarService {
  private readonly logger = new Logger(StellarService.name);

  readonly network: StellarNetwork;
  readonly rpcUrl: string;
  readonly horizonUrl: string;
  readonly networkPassphrase: string;

  constructor() {
    const raw = (process.env.STELLAR_NETWORK ?? 'testnet').toLowerCase();
    this.network = raw === 'public' ? 'public' : 'testnet';

    if (this.network === 'public') {
      this.rpcUrl = 'https://soroban-rpc.stellar.org';
      this.horizonUrl = 'https://horizon.stellar.org';
      this.networkPassphrase = 'Public Global Stellar Network ; September 2015';
    } else {
      this.rpcUrl = 'https://soroban-testnet.stellar.org';
      this.horizonUrl = 'https://horizon-testnet.stellar.org';
      this.networkPassphrase = 'Test SDF Network ; September 2015';
    }

    this.logger.log(
      `Stellar SDK configured for network="${this.network}" rpc="${this.rpcUrl}"`,
    );
  }

  isTestnet(): boolean {
    return this.network === 'testnet';
  }

  isMainnet(): boolean {
    return this.network === 'public';
  }

  async getTransactionStatus(txHash: string): Promise<{
    found: boolean;
    successful?: boolean;
    confirmedAt?: Date;
  }> {
    const response = await fetch(
      `${this.horizonUrl}/transactions/${encodeURIComponent(txHash)}`,
    );

    if (response.status === 404) {
      return { found: false };
    }

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Horizon lookup failed (${response.status}): ${body.slice(0, 300)}`,
      );
    }

    const payload = (await response.json()) as {
      successful?: boolean;
      created_at?: string;
    };

    return {
      found: true,
      successful: Boolean(payload.successful),
      confirmedAt: payload.created_at
        ? new Date(payload.created_at)
        : undefined,
    };
  }

  async getAccountBalance(address: string): Promise<number> {
    const server = new Horizon.Server(this.horizonUrl);
    try {
      const account = await server.loadAccount(address);
      const nativeBalance = account.balances.find(
        (b) => b.asset_type === 'native',
      );
      return nativeBalance ? parseFloat(nativeBalance.balance) : 0;
    } catch (error) {
      this.logger.error(
        `Failed to fetch balance for ${address}: ${error.message}`,
      );
      return 0;
    }
  }

  /**
   * Validates a Stellar public address format and checksum
   * @param address Stellar public address (G...)
   */
  validateAddress(address: string): { valid: boolean; message?: string } {
    if (!address) {
      return { valid: false, message: 'Address is required' };
    }

    try {
      const isValid = StrKey.isValidEd25519PublicKey(address);
      if (isValid) {
        return { valid: true };
      }
      return { valid: false, message: 'Invalid Stellar address format' };
    } catch (error) {
      return {
        valid: false,
        message:
          error instanceof Error ? error.message : 'Invalid Stellar address',
      };
    }
  }
}
