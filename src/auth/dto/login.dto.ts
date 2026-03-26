import { IsEmail, IsOptional, IsString, MinLength, Length } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  password: string;

  @IsOptional()
  @IsString()
  @Length(6, 6, { message: 'TOTP code must be 6 digits' })
  totpCode?: string;
}
