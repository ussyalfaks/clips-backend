import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StellarService } from '../stellar/stellar.service';
import * as StellarSdk from 'stellar-sdk';

@Injectable()
export class NftMintService {
  private readonly logger = new Logger(NftMintService.name);
  
  // This would typically be stored in config or env
  private readonly CONTRACT_ID = process.env.SOROBAN_NFT_CONTRACT_ID || 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEU4';

  constructor(
    private readonly prisma: PrismaService,
    private readonly stellarService: StellarService,
  ) {}

  /**
   * Prepares a Soroban transaction for minting a clip as an NFT.
   * Following OpenZeppelin Soroban NFT template: mint(to: Address, token_id: u128, uri: String)
   */
  async prepareMintTx(clipId: number, userId: number) {
    this.logger.log(`Preparing mint transaction for clipId=${clipId}, userId=${userId}`);

    // 1. Fetch clip and validate ownership/status
    const clip = await this.prisma.clip.findUnique({
      where: { id: clipId },
      include: { video: true },
    });

    if (!clip) {
      throw new NotFoundException(`Clip with ID ${clipId} not found`);
    }

    if (clip.video.userId !== userId) {
      throw new BadRequestException('You do not own the video this clip belongs to');
    }

    // Basic error handling: clip not ready
    if (!clip.clipUrl) {
      throw new BadRequestException('Clip is not ready for minting (missing URL)');
    }

    // 2. Fetch user's Stellar wallet
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { 
        wallets: { 
          where: { 
            chain: {
              equals: 'stellar',
              mode: 'insensitive'
            } 
          } 
        } 
      },
    });

    if (!user || !user.wallets || user.wallets.length === 0) {
      throw new BadRequestException('User has no Stellar wallet connected');
    }

    const userWallet = user.wallets[0].address;

    try {
      // 3. Build Soroban transaction
      const networkPassphrase = this.stellarService.networkPassphrase;
      const rpcUrl = this.stellarService.rpcUrl;
      const server = new StellarSdk.rpc.Server(rpcUrl);

      // Load source account to get sequence number
      const sourceAccount = await server.getAccount(userWallet);
      
      const contract = new StellarSdk.Contract(this.CONTRACT_ID);
      
      // Metadata URI pointer (IPFS placeholder as requested)
      const metadataUri = `ipfs://placeholder-for-clip-${clip.id}`;

      // Build the operation using contract.call
      const op = contract.call(
        'mint',
        StellarSdk.Address.fromString(userWallet).toScVal(), // to: Address
        StellarSdk.nativeToScVal(BigInt(clip.id), { type: 'u128' }),        // token_id: u128
        StellarSdk.nativeToScVal(metadataUri, { type: 'string' }),          // uri: String
      );

      const tx = new StellarSdk.TransactionBuilder(sourceAccount, {
        fee: '10000', // Base fee for Soroban transactions
        networkPassphrase,
      })
        .addOperation(op)
        .setTimeout(StellarSdk.TimeoutInfinite)
        .build();

      const xdr = tx.toXDR();
      
      // Log transaction XDR for debugging as requested
      this.logger.log(`Transaction XDR for clip ${clipId}: ${xdr}`);

      return {
        xdr,
        clipId: clip.id,
        tokenId: clip.id,
        to: userWallet,
        contractId: this.CONTRACT_ID,
        network: this.stellarService.network,
      };
    } catch (error) {
      this.logger.error(`Failed to prepare mint transaction: ${error.message}`, error.stack);
      throw new BadRequestException(`Stellar transaction preparation failed: ${error.message}`);
    }
  }
}
