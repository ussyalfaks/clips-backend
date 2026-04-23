import { IsString, IsNotEmpty, IsOptional, IsUrl } from 'class-validator';

export class MintClipDto {
  /** ID of the clip being minted */
  @IsString()
  @IsNotEmpty()
  clipId: string;

  /** Creator's wallet address — receives the creator royalty share */
  @IsString()
  @IsNotEmpty()
  creatorWallet: string;

  /** Optional on-chain metadata URI (IPFS / Arweave) */
  @IsOptional()
  @IsUrl()
  metadataUri?: string;
}
