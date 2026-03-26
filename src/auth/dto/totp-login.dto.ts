import { IsOptional, IsString, Length } from 'class-validator';

export class TotpLoginDto {
  @IsOptional()
  @IsString()
  @Length(6, 6, { message: 'TOTP code must be 6 digits' })
  totpCode?: string;
}
