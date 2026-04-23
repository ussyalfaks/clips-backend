import { IsInt, IsString, IsNotEmpty, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class PrepareMintDto {
  @IsInt()
  @Min(1)
  @Type(() => Number)
  clipId: number;

  @IsString()
  @IsNotEmpty()
  walletAddress: string;
}
