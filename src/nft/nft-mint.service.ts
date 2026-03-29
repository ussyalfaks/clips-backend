import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StellarService } from '../stellar/stellar.service';
import * as StellarSdk from '@stellar/stellar-sdk';

export interface MintTransactionResponse {
  xdr: string;
  clipId: number;
  tokenId: number;
  metadataUri: string;
  to: string;
  contractId: string;
  network: string;
}

@Injectable()
export class NftMintService {
  private readonly logger = new Logger(NftMintService.name);

  private readonly CONTRACT_ID =
    process.env.SOROBAN_NFT_CONTRACT_ID ||
    'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEU4';

  private readonly PLATFORM_WALLET =
    process.env.PLATFORM_WALLET ||
    'GDV76E6XN6A3Q3WXVZ4KPRQ7L6E6XN6A3Q3WXVZ4KPRQ7L6E6XN6';
  private readonly PLATFORM_ROYALTY_BPS = parseInt(
    process.env.PLATFORM_ROYALTY_BPS || '100',
    10,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly stellarService: StellarService,
  ) {}

  /**
   * Prepares an unsigned Soroban transaction for minting a clip as an NFT.
   * The transaction is ready to be signed by the user's wallet.
   *
   * @param clipId The ID of the clip to mint
   * @param walletAddress The Stellar wallet address that will receive the NFT (G...)
   * @returns MintTransactionResponse containing the XDR and transaction details
   * @throws NotFoundException if clip not found
   * @throws BadRequestException if wallet address is invalid or clip is not ready
   * @throws ConflictException if clip has already been minted
   */
  async prepareMintTx(
    clipId: number,
    walletAddress: string,
  ): Promise<MintTransactionResponse> {
    this.logger.log(
      `Preparing mint transaction for clipId=${clipId}, wallet=${walletAddress}`,
    );

    // Validate wallet address format
    if (!walletAddress) {
      throw new BadRequestException('Wallet address is required');
    }

    const addressValidation = this.stellarService.validateAddress(walletAddress);
    if (!addressValidation.valid) {
      throw new BadRequestException(
        `Invalid wallet address: ${addressValidation.message}`,
      );
    }

    // 1. Fetch and validate clip
    const clip = await this.prisma.clip.findUnique({
      where: { id: clipId },
      include: { video: true },
    });

    if (!clip) {
      throw new NotFoundException(`Clip with ID ${clipId} not found`);
    }

    // Check if already minted
    if (clip.mintAddress) {
      throw new ConflictException(
        `Clip ${clipId} has already been minted at address ${clip.mintAddress}`,
      );
    }

    // Verify clip has required data for minting
    if (!clip.clipUrl) {
      throw new BadRequestException(
        'Clip is not ready for minting (missing video URL)',
      );
    }

    if (!clip.metadataUri) {
      throw new BadRequestException(
        'Clip metadata URI not available. Metadata must be uploaded before minting.',
      );
    }

    try {
      // 2. Build Soroban transaction
      const networkPassphrase = this.stellarService.networkPassphrase;
      const rpcUrl = this.stellarService.rpcUrl;
      const server = new StellarSdk.rpc.Server(rpcUrl);

      // Load source account to get sequence number
      const sourceAccount = await server.getAccount(walletAddress);

      const contract = new StellarSdk.Contract(this.CONTRACT_ID);

      // Get royalty BPS from clip (default to 1000 = 10% if not set)
      const creatorRoyaltyBps = clip.royaltyBps ?? 1000;

      // Validate royalty BPS is within acceptable range (0-1500 = 0-15%)
      if (creatorRoyaltyBps < 0 || creatorRoyaltyBps > 1500) {
        throw new BadRequestException(
          `Invalid royaltyBps: ${creatorRoyaltyBps}. Must be between 0 and 1500.`,
        );
      }

      // 3. Build Royalty Map ScVal
      const royaltyMapEntries = [
        {
          key: StellarSdk.Address.fromString(walletAddress).toScVal(),
          value: StellarSdk.nativeToScVal(creatorRoyaltyBps, {
            type: 'u32',
          }),
        },
        {
          key: StellarSdk.Address.fromString(this.PLATFORM_WALLET).toScVal(),
          value: StellarSdk.nativeToScVal(this.PLATFORM_ROYALTY_BPS, {
            type: 'u32',
          }),
        },
      ];

      // 4. Build contract call
      const op = contract.call(
        'mint',
        StellarSdk.Address.fromString(walletAddress).toScVal(), // to: Address
        StellarSdk.nativeToScVal(BigInt(clip.id), { type: 'u128' }), // token_id: u128
        StellarSdk.nativeToScVal(clip.metadataUri, { type: 'string' }), // uri: String
        StellarSdk.nativeToScVal(royaltyMapEntries, { type: 'map' }), // royalties: Map<Address, u32>
      );

      // 5. Build transaction
      const tx = new StellarSdk.TransactionBuilder(sourceAccount, {
        fee: '10000',
        networkPassphrase,
      })
        .addOperation(op)
        .setTimeout(StellarSdk.TimeoutInfinite)
        .build();

      const xdr = tx.toXDR();

      this.logger.log(
        `Successfully prepared mint transaction for clip ${clipId}: XDR length=${xdr.length}`,
      );

      return {
        xdr,
        clipId: clip.id,
        tokenId: clip.id,
        metadataUri: clip.metadataUri,
        to: walletAddress,
        contractId: this.CONTRACT_ID,
        network: this.stellarService.network,
      };
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException ||
        error instanceof ConflictException
      ) {
        throw error;
      }

      const message =
        error instanceof Error ? error.message : 'Unknown error preparing transaction';
      this.logger.error(
        `Failed to prepare mint transaction: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );

      throw new BadRequestException(
        `Failed to prepare mint transaction: ${message}`,
      );
    }
  }

  /**
   * Records a successful mint on-chain.
   * Updates the clip's mintAddress and other minting metadata.
   *
   * @param clipId The clip ID
   * @param txHash The confirmed transaction hash
   * @param mintAddress The on-chain NFT/token address
   */
  async recordMint(
    clipId: number,
    txHash: string,
    mintAddress: string,
  ): Promise<void> {
    try {
      await this.prisma.clip.update({
        where: { id: clipId },
        data: {
          mintAddress,
          updatedAt: new Date(),
        },
      });

      this.logger.log(
        `Recorded mint for clip ${clipId}. Transaction: ${txHash}, Mint Address: ${mintAddress}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to record mint for clip ${clipId}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      throw error;
    }
  }
}
