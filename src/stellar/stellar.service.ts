import { Injectable, Logger } from '@nestjs/common';
import { StrKey } from '@stellar/stellar-sdk';

export type StellarNetwork = 'testnet' | 'public';

@Injectable()
export class StellarService {
  private readonly logger = new Logger(StellarService.name);

  readonly network: StellarNetwork;
  readonly rpcUrl: string;
  readonly networkPassphrase: string;

  constructor() {
    const raw = (process.env.STELLAR_NETWORK ?? 'testnet').toLowerCase();
    this.network = raw === 'public' ? 'public' : 'testnet';

    if (this.network === 'public') {
      this.rpcUrl = 'https://soroban-rpc.stellar.org';
      this.networkPassphrase = 'Public Global Stellar Network ; September 2015';
    } else {
      this.rpcUrl = 'https://soroban-testnet.stellar.org';
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
