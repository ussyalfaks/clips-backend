import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  ArrayNotEmpty,
  IsInt,
  Min,
  Max,
} from 'class-validator';

export class BulkUpdateClipsDto {
  /** IDs of clips to update — must all belong to the requesting user */
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  clipIds: string[];

  @IsOptional()
  @IsBoolean()
  selected?: boolean;

  /**
   * Freeform posting status.
   * Simple values: 'pending' | 'posted' | 'failed'
   * Or a platform-specific JSON object, e.g. { platform: 'tiktok', status: 'posted', postId: '...' }
   */
  @IsOptional()
  postStatus?: unknown;

  /**
   * User-editable caption. Auto-generated on clip creation from title + emojis.
   * Pass a new value here to override it.
   */
  @IsOptional()
  @IsString()
  caption?: string;

  /**
   * NFT royalty percentage in Basis Points (BPS).
   * 1000 BPS = 10%, range: 0–1500 BPS (0–15%).
   * Used when minting clips as NFTs on Soroban/Stellar.
   * If not provided, defaults to 1000 (10%) at mint time.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1500)
  royaltyBps?: number;
}
