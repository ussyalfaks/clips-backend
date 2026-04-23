import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import type { Request } from 'express';

import { NftService, MintResult } from './nft.service';
import { MintClipDto } from './dto/mint-clip.dto';
import { PrepareMintDto } from './dto/prepare-mint.dto';
import { NftMintService } from '../clips/nft-mint.service';
import { RoyaltyQueryService, RoyaltyInfo } from './royalty-query.service';
import { LoginGuard } from '../auth/guards/login.guard';

@Controller('nfts')
export class NftController {
  constructor(
    private readonly nftService: NftService,
    private readonly nftMintService: NftMintService,
    private readonly royaltyQueryService: RoyaltyQueryService,
  ) {}

  /**
   * POST /nfts/mint
   * Mints a clip as an NFT with split royalties (legacy stub endpoint).
   */
  @Post('mint')
  @HttpCode(HttpStatus.CREATED)
  async mint(@Body() dto: MintClipDto): Promise<MintResult> {
    return this.nftService.mintClip(dto);
  }

  /**
   * POST /nfts/prepare-mint
   * Builds a Soroban mint transaction and returns the XDR for the frontend to sign.
   * The authenticated user must own the clip being minted.
   */
  @UseGuards(LoginGuard)
  @Post('prepare-mint')
  @HttpCode(HttpStatus.CREATED)
  async prepareMint(
    @Body() dto: PrepareMintDto,
    @Req() req: Request,
  ) {
    const userId = Number((req as any).user?.id ?? 0);
    await this.nftMintService.validateClipOwner(dto.clipId, userId);
    return this.nftMintService.prepareMintTx(dto.clipId, dto.walletAddress);
  }

  /**
   * GET /nfts/:mintAddress/royalty
   * Queries the on-chain royalty info for a minted NFT.
   * The mintAddress is the numeric token ID (= clip.id) assigned at mint time.
   * Result is cached in Redis for 5 minutes.
   *
   * Response: { royaltyBps: number, recipient: string }
   */
  @Get(':mintAddress/royalty')
  async getRoyalty(
    @Param('mintAddress') mintAddress: string,
  ): Promise<RoyaltyInfo> {
    return this.royaltyQueryService.getRoyaltyInfo(mintAddress);
  }
}
