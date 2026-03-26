import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  Query,
  UseGuards,
  ValidationPipe,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { MagicLinkRequestDto } from './dto/magic-link.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  async signup(@Body(new ValidationPipe({ transform: true })) signupDto: SignupDto) {
    try {
      return await this.authService.signup(signupDto);
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Signup failed');
    }
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body(new ValidationPipe({ transform: true })) dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get('google')
  @UseGuards(AuthGuard('google'))
  googleAuth() {
    return;
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleCallback(@Req() req: any) {
    const user = req.user;
    const tokens = await this.authService.issueTokensWithRefresh({
      id: user.id,
      email: user.email ?? null,
    });
    return { user, tokens };
  }

  @Post('magic-link')
  async requestMagicLink(
    @Body(new ValidationPipe({ transform: true })) dto: MagicLinkRequestDto,
  ) {
    await this.authService.requestMagicLink(dto.email);
    // Always return 200 to avoid email enumeration
    return { message: 'If that email exists, a magic link has been sent.' };
  }

  @Get('verify-magic')
  async verifyMagicLink(@Query('token') token: string) {
    if (!token) {
      throw new BadRequestException('Token is required');
    }
    return this.authService.verifyMagicLink(token);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body(new ValidationPipe({ transform: true })) dto: RefreshTokenDto,
  ) {
    return this.authService.refreshTokens(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Body(new ValidationPipe({ transform: true })) dto: RefreshTokenDto,
  ) {
    await this.authService.logout(dto.refreshToken);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(
    @Body(new ValidationPipe({ transform: true })) dto: ForgotPasswordDto,
  ) {
    await this.authService.forgotPassword(dto.email);
    return { message: 'If that email exists, a reset link has been sent.' };
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(
    @Body(new ValidationPipe({ transform: true })) dto: ResetPasswordDto,
  ) {
    await this.authService.resetPassword(dto.token, dto.newPassword);
    return { message: 'Password reset successful.' };
  }

  @Post('mfa/setup')
  @HttpCode(HttpStatus.OK)
  async setupMfa(@Req() req: any) {
    const userId = Number(req.user?.id ?? req.headers['x-user-id']);
    return this.authService.setupMfa(userId);
  }

  @Post('mfa/enable')
  @HttpCode(HttpStatus.OK)
  async enableMfa(@Req() req: any, @Body('code') code: string) {
    const userId = Number(req.user?.id ?? req.headers['x-user-id']);
    await this.authService.enableMfa(userId, code);
    return { enabled: true };
  }

  @Post('mfa/disable')
  @HttpCode(HttpStatus.OK)
  async disableMfa(@Req() req: any) {
    const userId = Number(req.user?.id ?? req.headers['x-user-id']);
    await this.authService.disableMfa(userId);
    return { enabled: false };
  }
}
