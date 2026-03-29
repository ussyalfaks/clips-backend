import {
  Controller,
  Get,
  Param,
  BadRequestException,
  HttpCode,
} from '@nestjs/common';
import { NftRoyaltyService } from './nft-royalty.service';

/**
 * NFT-related endpoints for querying on-chain data
 */
@Controller('nfts')
export class NftController {
  constructor(private readonly nftRoyaltyService: NftRoyaltyService) {}

  /**
   * GET /nfts/:mintAddress/royalty
   *
   * Query the on-chain royalty percentage and recipient address for an NFT.
   * Data is cached for 5 minutes in Redis to minimize RPC calls.
   *
   * @param mintAddress Token ID / contract mint address (numeric or string identifier)
   * @returns { royaltyBps: number, recipient: string }
   *
   * Example Response:
   * {
   *   "royaltyBps": 1000,
   *   "recipient": "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
   * }
   *
   * Status Codes:
   * - 200: Successfully retrieved royalty data
   * - 400: Invalid token ID format
   * - 404: Token not found on contract
   * - 503: Soroban RPC unavailable
   */
  @Get(':mintAddress/royalty')
  @HttpCode(200)
  async getRoyalty(@Param('mintAddress') mintAddress: string) {
    if (!mintAddress || mintAddress.trim() === '') {
      throw new BadRequestException('mintAddress parameter is required');
    }

    const royaltyData = await this.nftRoyaltyService.queryRoyalty(
      mintAddress.trim(),
    );

    return {
      royaltyBps: royaltyData.royaltyBps,
      recipient: royaltyData.recipient,
    };
  }
}
