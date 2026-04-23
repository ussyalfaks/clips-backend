import {
  Injectable,
  Logger,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StellarService } from '../stellar/stellar.service';
import StellarSdk from '@stellar/stellar-sdk';

interface NftAttribute {
  trait_type: string;
  value: string | number;
}

interface NftMetadata {
  name: string;
  description: string;
  image: string;
  animation_url: string;
  external_url?: string;
  attributes: NftAttribute[];
}

interface UploadMetadataResult {
  clipId: number;
  cid: string;
  metadataUri: string;
}

@Injectable()
export class NftMintService {
  private readonly logger = new Logger(NftMintService.name);

  // This would typically be stored in config or env
  private readonly CONTRACT_ID =
    process.env.SOROBAN_NFT_CONTRACT_ID ||
    'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEU4';

  private readonly PLATFORM_WALLET =
    process.env.PLATFORM_WALLET ||
    'GDV76E6XN6A3Q3WXVZ4KPRQ7L6E6XN6A3Q3WXVZ4KPRQ7L6E6XN6'; // Placeholder if not set
  private readonly PLATFORM_ROYALTY_BPS = parseInt(
    process.env.PLATFORM_ROYALTY_BPS || '100',
    10,
  );
  private readonly CREATOR_ROYALTY_BPS = 1000; // Requirement: 1000 bps for creator

  constructor(
    private readonly prisma: PrismaService,
    private readonly stellarService: StellarService,
  ) {}

  async uploadMetadataToIPFS(clipId: number): Promise<UploadMetadataResult> {
    const clip = await this.prisma.clip.findUnique({
      where: { id: clipId },
    });

    if (!clip) {
      throw new NotFoundException(`Clip with ID ${clipId} not found`);
    }

    if (!clip.clipUrl) {
      throw new BadRequestException(
        'Clip is not ready for metadata upload (missing clipUrl)',
      );
    }

    const metadata = this.buildMetadata({
      id: clip.id,
      title: clip.title,
      caption: clip.caption,
      clipUrl: clip.clipUrl,
      thumbnail: clip.thumbnail,
      duration: clip.duration,
      viralityScore: clip.viralityScore,
      createdAt: clip.createdAt,
      postStatus: clip.postStatus,
      royaltyBps: this.CREATOR_ROYALTY_BPS,
    });

    const metadataUri = await this.uploadMetadataToIpfs(metadata, clip.id);
    const cid = metadataUri.replace('ipfs://', '');

    await this.prisma.clip.update({
      where: { id: clip.id },
      data: { metadataUri },
    });

    return {
      clipId: clip.id,
      cid,
      metadataUri,
    };
  }

  /**
   * Verify that a clip belongs to the given user before allowing a mint.
   * Throws ForbiddenException if the clip doesn't exist or isn't owned by userId.
   */
  async validateClipOwner(clipId: number, userId: number): Promise<void> {
    const clip = await this.prisma.clip.findUnique({
      where: { id: clipId },
      include: { video: true },
    });
    if (!clip) {
      throw new NotFoundException(`Clip with ID ${clipId} not found`);
    }
    if (clip.video.userId !== userId) {
      throw new ForbiddenException('You do not own this clip');
    }
  }

  /**
   * Prepares (but does not sign) a Soroban transaction for minting a clip as an NFT.
   * Following OpenZeppelin Soroban NFT template: mint(to: Address, token_id: u128, uri: String)
   *
   * @param clipId - ID of the clip to mint
   * @param walletAddress - Stellar wallet address that will receive the NFT
   * @returns XDR string for the frontend to sign
   */
  async prepareMintTx(clipId: number, walletAddress: string) {
    this.logger.log(
      `Preparing mint transaction for clipId=${clipId}, wallet=${walletAddress}`,
    );

    // Validate Stellar wallet address format
    const addressCheck = this.stellarService.validateAddress(walletAddress);
    if (!addressCheck.valid) {
      throw new BadRequestException(
        `Invalid wallet address: ${addressCheck.message}`,
      );
    }

    // Fetch clip
    const clip = await this.prisma.clip.findUnique({ where: { id: clipId } });

    if (!clip) {
      throw new NotFoundException(`Clip with ID ${clipId} not found`);
    }

    // Prevent double minting
    if (clip.nftStatus !== 'none' && clip.nftStatus !== 'failed') {
      throw new BadRequestException(
        `Clip is already minted or minting in progress (status: ${clip.nftStatus})`,
      );
    }

    if (!clip.clipUrl) {
      throw new BadRequestException(
        'Clip is not ready for minting (missing URL)',
      );
    }

    try {
      const metadataUri =
        clip.metadataUri ?? (await this.uploadMetadataToIPFS(clip.id)).metadataUri;

      const networkPassphrase = this.stellarService.networkPassphrase;
      const rpcUrl = this.stellarService.rpcUrl;
      const server = new StellarSdk.rpc.Server(rpcUrl);

      // Load source account to get current sequence number
      const sourceAccount = await server.getAccount(walletAddress);

      const contract = new StellarSdk.Contract(this.CONTRACT_ID);

      // Use custom royaltyBps from clip, default to 1000 bps (10%)
      const creatorRoyaltyBps = clip.royaltyBps ?? this.CREATOR_ROYALTY_BPS;

      if (creatorRoyaltyBps < 0 || creatorRoyaltyBps > 1500) {
        throw new BadRequestException(
          `Invalid royaltyBps: ${creatorRoyaltyBps}. Must be between 0 and 1500.`,
        );
      }

      const royaltyMapEntries = [
        {
          key: StellarSdk.Address.fromString(walletAddress).toScVal(),
          value: StellarSdk.nativeToScVal(creatorRoyaltyBps, { type: 'u32' }),
        },
        {
          key: StellarSdk.Address.fromString(this.PLATFORM_WALLET).toScVal(),
          value: StellarSdk.nativeToScVal(this.PLATFORM_ROYALTY_BPS, { type: 'u32' }),
        },
      ];

      const op = contract.call(
        'mint',
        StellarSdk.Address.fromString(walletAddress).toScVal(),   // to: Address
        StellarSdk.nativeToScVal(BigInt(clip.id), { type: 'u128' }), // token_id: u128
        StellarSdk.nativeToScVal(metadataUri, { type: 'string' }),   // uri: String
        StellarSdk.nativeToScVal(royaltyMapEntries, { type: 'map' }), // royalties: Map<Address, u32>
      );

      const tx = new StellarSdk.TransactionBuilder(sourceAccount, {
        fee: '10000',
        networkPassphrase,
      })
        .addOperation(op)
        .setTimeout(StellarSdk.TimeoutInfinite)
        .build();

      const xdr = tx.toXDR();

      this.logger.log(`Transaction XDR prepared for clip ${clipId}`);

      return {
        xdr,
        clipId: clip.id,
        tokenId: clip.id,
        metadataUri,
        to: walletAddress,
        contractId: this.CONTRACT_ID,
        network: this.stellarService.network,
      };
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }
      const message =
        error instanceof Error ? error.message : 'unknown minting error';
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Failed to prepare mint transaction: ${message}`,
        stack,
      );
      throw new BadRequestException(
        `Stellar transaction preparation failed: ${message}`,
      );
    }
  }

  private buildMetadata(clip: {
    id: number;
    title: string | null;
    caption: string | null;
    clipUrl: string;
    thumbnail: string | null;
    duration: number;
    viralityScore: number | null;
    createdAt: Date;
    postStatus: unknown;
    royaltyBps: number;
  }): NftMetadata {
    const platforms = this.extractPlatforms(clip.postStatus);
    const attributes: NftAttribute[] = [
      { trait_type: 'clipDuration', value: clip.duration },
      { trait_type: 'viralityScore', value: clip.viralityScore ?? 0 },
      { trait_type: 'createdAt', value: clip.createdAt.toISOString() },
      { trait_type: 'royaltyBps', value: clip.royaltyBps },
      { trait_type: 'royaltyPercent', value: clip.royaltyBps / 100 },
      {
        trait_type: 'platformsPosted',
        value: platforms.length ? platforms.join(',') : 'none',
      },
    ];

    return {
      name: clip.title?.trim() || `Clip #${clip.id}`,
      description: clip.caption?.trim() || `Generated clip ${clip.id}`,
      image: clip.thumbnail || clip.clipUrl,
      animation_url: clip.clipUrl,
      attributes,
    };
  }

  private extractPlatforms(postStatus: unknown): string[] {
    if (!postStatus || typeof postStatus !== 'object') {
      return [];
    }

    if (Array.isArray(postStatus)) {
      return postStatus.filter((v): v is string => typeof v === 'string');
    }

    return Object.entries(postStatus as Record<string, unknown>)
      .filter(([, value]) => Boolean(value))
      .map(([platform]) => platform);
  }

  private async uploadMetadataToIpfs(
    metadata: NftMetadata,
    clipId: number,
  ): Promise<string> {
    const pinataJwt = process.env.PINATA_JWT ?? process.env.IPFS_JWT;
    const ipfsApiUrl =
      process.env.IPFS_API_URL ??
      'https://api.pinata.cloud/pinning/pinJSONToIPFS';

    if (!pinataJwt) {
      throw new BadRequestException(
        'Missing PINATA_JWT or IPFS_JWT for NFT metadata upload',
      );
    }

    const body = ipfsApiUrl.includes('pinata.cloud')
      ? {
          pinataMetadata: { name: `clip-${clipId}-metadata` },
          pinataContent: metadata,
        }
      : metadata;

    const response = await fetch(ipfsApiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${pinataJwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const message = await response.text();
      throw new BadRequestException(
        `IPFS metadata upload failed (${response.status}): ${message.slice(0, 300)}`,
      );
    }

    const payload = (await response.json()) as {
      IpfsHash?: string;
      cid?: string;
      hash?: string;
    };

    const cid = payload.IpfsHash ?? payload.cid ?? payload.hash;
    if (!cid) {
      throw new BadRequestException(
        'IPFS metadata upload response missing CID',
      );
    }

    return `ipfs://${cid}`;
  }
  /**
   * Verified on-chain NFT ownership for a specific token and wallet.
   * Query Soroban contract 'owner_of' and compare with walletAddress.
   */
  async verifyNFTOwnership(
    tokenId: string,
    walletAddress: string,
  ): Promise<{
    owned: boolean;
    error?: string;
  }> {
    this.logger.log(
      `Verifying ownership: tokenId=${tokenId}, wallet=${walletAddress}`,
    );

    try {
      const rpcUrl = this.stellarService.rpcUrl;
      const server = new StellarSdk.rpc.Server(rpcUrl);
      const contract = new StellarSdk.Contract(this.CONTRACT_ID);

      // Prepare simulation
      const op = contract.call(
        'owner_of',
        StellarSdk.nativeToScVal(BigInt(tokenId), { type: 'u128' }),
      );

      // Create a dummy transaction for simulation (requires a valid source account format, but not necessarily funded for simulation only)
      // Using a known neutral address or the walletAddress itself
      const dummySource = walletAddress;
      const sourceAccount = new StellarSdk.Account(dummySource, '0');

      const tx = new StellarSdk.TransactionBuilder(sourceAccount, {
        fee: '100',
        networkPassphrase: this.stellarService.networkPassphrase,
      })
        .addOperation(op)
        .setTimeout(StellarSdk.TimeoutInfinite)
        .build();

      const simulation = await server.simulateTransaction(tx);

      if (simulation.error) {
        return {
          owned: false,
          error: `Simulation failed: ${simulation.error}`,
        };
      }

      if (!simulation.results || simulation.results.length === 0) {
        return {
          owned: false,
          error: 'No simulation results returned',
        };
      }

      const result = simulation.results[0];
      if (!result.xdr) {
        return {
          owned: false,
          error: 'Missing result XDR',
        };
      }

      // Parse the return value
      const returnValue = StellarSdk.xdr.ScVal.fromXDR(result.xdr, 'base64');
      const ownerAddress = StellarSdk.scValToNative(returnValue);

      const isOwner = ownerAddress === walletAddress;

      return {
        owned: isOwner,
        error: isOwner ? undefined : 'Caller does not own the NFT on-chain',
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Ownership verification failed';
      this.logger.error(`Ownership verification failed: ${message}`);
      return {
        owned: false,
        error: message,
      };
    }
  }
}
