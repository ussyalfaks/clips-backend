import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { StellarService } from '../stellar/stellar.service';
import * as StellarSdk from 'stellar-sdk';
import Redis from 'ioredis';

export interface RoyaltyData {
  royaltyBps: number;
  recipient: string;
}

@Injectable()
export class NftRoyaltyService {
  private readonly logger = new Logger(NftRoyaltyService.name);
  private readonly redis: Redis;
  private readonly CACHE_TTL = 300; // 5 minutes in seconds
  private readonly CACHE_KEY_PREFIX = 'royalty:';
  private readonly CONTRACT_ID = process.env.SOROBAN_NFT_CONTRACT_ID;

  constructor(private readonly stellarService: StellarService) {
    this.redis = new Redis({
      host: process.env.REDIS_HOST ?? 'localhost',
      port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    this.redis.on('error', (err) => {
      this.logger.error(`Redis connection error: ${err.message}`);
    });
  }

  /**
   * Query the on-chain royalty percentage and recipient address for an NFT.
   * Results are cached for 5 minutes in Redis.
   *
   * @param tokenId Token ID / mintAddress on the Soroban contract
   * @returns RoyaltyData with royaltyBps (in basis points) and recipient address
   */
  async queryRoyalty(tokenId: string): Promise<RoyaltyData> {
    // Validate token ID format (should be a valid contract ID or token identifier)
    if (!tokenId) {
      throw new BadRequestException('Token ID is required');
    }

    // Check cache first
    const cacheKey = `${this.CACHE_KEY_PREFIX}${tokenId}`;
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        this.logger.debug(`Cache hit for royalty query: ${tokenId}`);
        const data = JSON.parse(cached) as RoyaltyData;
        return data;
      }
    } catch (error) {
      this.logger.warn(`Cache read failed for ${tokenId}: ${error.message}`);
      // Continue to query despite cache failure
    }

    // Query on-chain data
    const royaltyData = await this.fetchRoyaltyFromContract(tokenId);

    // Cache the result
    try {
      await this.redis.setex(
        cacheKey,
        this.CACHE_TTL,
        JSON.stringify(royaltyData),
      );
      this.logger.debug(`Cached royalty data for ${tokenId}`);
    } catch (error) {
      this.logger.warn(`Cache write failed for ${tokenId}: ${error.message}`);
      // Don't fail the request, just log the warning
    }

    return royaltyData;
  }

  /**
   * Fetch royalty data directly from the Soroban smart contract.
   * Uses a read-only simulation to avoid gas costs.
   *
   * @param tokenId Token ID on the contract
   * @returns RoyaltyData with royaltyBps and recipient address
   */
  private async fetchRoyaltyFromContract(tokenId: string): Promise<RoyaltyData> {
    if (!this.CONTRACT_ID) {
      throw new BadRequestException(
        'SOROBAN_NFT_CONTRACT_ID not configured in environment',
      );
    }

    try {
      const rpcUrl = this.stellarService.rpcUrl;
      const server = new StellarSdk.rpc.Server(rpcUrl);
      const contract = new StellarSdk.Contract(this.CONTRACT_ID);

      // Parse tokenId to u128
      let tokenIdScVal: StellarSdk.xdr.ScVal;
      try {
        const tokenIdNum = BigInt(tokenId);
        tokenIdScVal = StellarSdk.nativeToScVal(tokenIdNum, { type: 'u128' });
      } catch (error) {
        throw new BadRequestException(
          `Invalid token ID format: ${tokenId}. Must be a valid integer.`,
        );
      }

      // Build the contract call for get_royalty(token_id: u128) -> (u32, Address)
      const op = contract.call(
        'get_royalty',
        tokenIdScVal,
      );

      // Create a dummy account for simulation
      const dummyAccount = new StellarSdk.Account(
        'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
        '0',
      );

      const tx = new StellarSdk.TransactionBuilder(dummyAccount, {
        fee: '100',
        networkPassphrase: this.stellarService.networkPassphrase,
      })
        .addOperation(op)
        .setTimeout(StellarSdk.TimeoutInfinite)
        .build();

      // Simulate the transaction
      const simulation = await server.simulateTransaction(tx);

      if (simulation.error) {
        this.logger.error(
          `Contract simulation error for token ${tokenId}: ${simulation.error}`,
        );
        throw new NotFoundException(
          `Failed to query royalty for token ${tokenId}: ${simulation.error}`,
        );
      }

      if (!simulation.results || simulation.results.length === 0) {
        throw new NotFoundException(
          `No results returned from contract for token ${tokenId}`,
        );
      }

      const result = simulation.results[0];
      if (!result.xdr) {
        throw new ServiceUnavailableException(
          'Invalid contract response: missing XDR data',
        );
      }

      // Parse the result - expecting (u32, Address)
      const returnValue = StellarSdk.xdr.ScVal.fromXDR(result.xdr, 'base64');
      const parsed = StellarSdk.scValToNative(returnValue);

      // Handle tuple/vec return (royaltyBps: u32, recipient: Address)
      let royaltyBps: number;
      let recipient: string;

      if (Array.isArray(parsed) && parsed.length >= 2) {
        royaltyBps = Number(parsed[0]) || 0;
        recipient = String(parsed[1]) || '';
      } else if (typeof parsed === 'object' && parsed !== null) {
        // Handle object response
        royaltyBps = Number((parsed as any).royaltyBps ?? (parsed as any)[0]) || 0;
        recipient = String((parsed as any).recipient ?? (parsed as any)[1]) || '';
      } else {
        throw new ServiceUnavailableException(
          `Unexpected contract response format: ${typeof parsed}`,
        );
      }

      if (!recipient) {
        throw new NotFoundException(
          `Token ${tokenId} does not exist or has no royalty configuration`,
        );
      }

      return {
        royaltyBps,
        recipient,
      };
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException ||
        error instanceof ServiceUnavailableException
      ) {
        throw error;
      }

      const message =
        error instanceof Error ? error.message : 'Unknown error querying contract';
      this.logger.error(
        `Failed to fetch royalty from contract for token ${tokenId}: ${message}`,
      );

      // Determine appropriate error based on the error message
      if (message.includes('404') || message.includes('not found')) {
        throw new NotFoundException(
          `Token ${tokenId} not found on contract`,
        );
      } else if (
        message.includes('timeout') ||
        message.includes('unavailable')
      ) {
        throw new ServiceUnavailableException(
          'Soroban RPC service temporarily unavailable',
        );
      }

      throw new ServiceUnavailableException(
        `Failed to query royalty: ${message}`,
      );
    }
  }

  /**
   * Invalidate the cache for a specific token
   */
  async invalidateCache(tokenId: string): Promise<void> {
    const cacheKey = `${this.CACHE_KEY_PREFIX}${tokenId}`;
    try {
      await this.redis.del(cacheKey);
      this.logger.debug(`Invalidated cache for token ${tokenId}`);
    } catch (error) {
      this.logger.warn(
        `Failed to invalidate cache for ${tokenId}: ${error.message}`,
      );
    }
  }

  /**
   * Close Redis connection (for graceful shutdown)
   */
  async onModuleDestroy(): Promise<void> {
    try {
      await this.redis.quit();
    } catch (error) {
      this.logger.error(`Error closing Redis connection: ${error.message}`);
    }
  }
}
