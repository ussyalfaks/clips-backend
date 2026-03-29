import {
  Controller,
  Post,
  Param,
  Body,
  BadRequestException,
} from '@nestjs/common';
import { NftMintService, MintTransactionResponse } from './nft-mint.service';

export class PrepareMintDto {
  walletAddress: string;
}

/**
 * NFT minting endpoints
 */
@Controller('nfts')
export class NftMintController {
  constructor(private readonly nftMintService: NftMintService) {}

  /**
   * POST /nfts/:clipId/prepare-mint
   *
   * Prepares an unsigned Soroban transaction for minting a clip as an NFT.
   * The returned XDR can be signed using Freighter or other Stellar wallets.
   *
   * @param clipId The clip ID to mint
   * @param body { walletAddress: string } The Stellar address that will receive the NFT
   * @returns MintTransactionResponse containing XDR and transaction details
   *
   * Status Codes:
   * - 200: Transaction prepared successfully
   * - 400: Invalid input or clip not ready for minting
   * - 404: Clip not found
   * - 409: Clip already minted
   */
  @Post(':clipId/prepare-mint')
  async prepareMint(
    @Param('clipId') clipId: string,
    @Body() body: PrepareMintDto,
  ): Promise<MintTransactionResponse> {
    const id = parseInt(clipId, 10);

    if (isNaN(id)) {
      throw new BadRequestException('clipId must be a valid number');
    }

    if (!body.walletAddress) {
      throw new BadRequestException('walletAddress is required in request body');
    }

    return this.nftMintService.prepareMintTx(id, body.walletAddress);
  }

  /**
   * POST /nfts/:clipId/confirm-mint
   *
   * Records a successful mint after the transaction is confirmed on-chain.
   *
   * @param clipId The clip ID
   * @param body { txHash: string, mintAddress: string }
   */
  @Post(':clipId/confirm-mint')
  async confirmMint(
    @Param('clipId') clipId: string,
    @Body() body: { txHash: string; mintAddress: string },
  ): Promise<{ success: boolean; message: string }> {
    const id = parseInt(clipId, 10);

    if (isNaN(id)) {
      throw new BadRequestException('clipId must be a valid number');
    }

    if (!body.txHash || !body.mintAddress) {
      throw new BadRequestException('txHash and mintAddress are required');
    }

    await this.nftMintService.recordMint(id, body.txHash, body.mintAddress);

    return {
      success: true,
      message: `Mint recorded for clip ${id}`,
    };
  }
}
