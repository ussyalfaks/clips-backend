import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  Res,
  Query,
  UseGuards,
  ValidationPipe,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthGuard } from '@nestjs/passport';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { CookieService } from './cookie.service';
import { DeviceFingerprintService } from './device-fingerprint.service';
import { BruteForceGuard } from './guards/brute-force.guard';
import { SignupDto } from './dto/signup.dto';
import { MagicLinkRequestDto } from './dto/magic-link.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly cookieService: CookieService,
    private readonly deviceFingerprintService: DeviceFingerprintService,
  ) {}

  @Post('signup')
  @Throttle({ auth: { limit: 10, ttl: 60000 } })
  async signup(
    @Body(new ValidationPipe({ transform: true })) signupDto: SignupDto,
    @Res({ passthrough: true }) res: Response,
    @Query('use_cookies') useCookies?: string,
  ) {
    try {
      const result = await this.authService.signup(signupDto);
      if (useCookies === 'true') {
        this.cookieService.setTokenCookies(res, result.tokens);
        return { user: result.user };
      }
      return result;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Signup failed');
    }
  }

  @Post('login')
  @UseGuards(BruteForceGuard)
  @Throttle({ auth: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(new ValidationPipe({ transform: true })) dto: LoginDto,
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
    @Query('use_cookies') useCookies?: string,
  ) {
    const deviceFingerprint =
      this.deviceFingerprintService.extractFromRequest(req);
    const fingerprint =
      this.deviceFingerprintService.generateFingerprint(deviceFingerprint);
    const result = await this.authService.login(dto, fingerprint);
    if (useCookies === 'true') {
      this.cookieService.setTokenCookies(res, result.tokens);
      return { user: result.user };
    }
    return result;
  }

  @Get('google')
  @UseGuards(AuthGuard('google'))
  googleAuth() {
    return;
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleCallback(@Req() req: any, @Res({ passthrough: true }) res: Response) {
    const user = req.user;
    const deviceFingerprint =
      this.deviceFingerprintService.extractFromRequest(req);
    const fingerprint =
      this.deviceFingerprintService.generateFingerprint(deviceFingerprint);
    const tokens = await this.authService.issueTokensWithRefresh(
      {
        id: user.id,
        email: user.email ?? null,
      },
      fingerprint,
    );
    // Google OAuth always uses cookies (redirect flow — no JS to read a JSON body)
    this.cookieService.setTokenCookies(res, tokens);
    return { user };
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
  async verifyMagicLink(
    @Query('token') token: string,
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
    @Query('use_cookies') useCookies?: string,
  ) {
    if (!token) {
      throw new BadRequestException('Token is required');
    }
    const deviceFingerprint =
      this.deviceFingerprintService.extractFromRequest(req);
    const fingerprint =
      this.deviceFingerprintService.generateFingerprint(deviceFingerprint);
    const result = await this.authService.verifyMagicLink(token, fingerprint);
    if (useCookies === 'true') {
      this.cookieService.setTokenCookies(res, result.tokens);
      return { user: result.user };
    }
    return result;
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body(new ValidationPipe({ transform: true })) dto: RefreshTokenDto,
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
    @Query('use_cookies') useCookies?: string,
  ) {
    const deviceFingerprint =
      this.deviceFingerprintService.extractFromRequest(req);
    const fingerprint =
      this.deviceFingerprintService.generateFingerprint(deviceFingerprint);
    // Support cookie-based refresh: fall back to cookie if body token absent
    const rawToken = dto.refreshToken ?? req.cookies?.['refresh_token'];
    if (!rawToken) {
      throw new BadRequestException('Refresh token is required');
    }
    const result = await this.authService.refreshTokens(rawToken, fingerprint);
    if (useCookies === 'true') {
      this.cookieService.setTokenCookies(res, result);
      return {};
    }
    return result;
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Body(new ValidationPipe({ transform: true })) dto: RefreshTokenDto,
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rawToken = dto.refreshToken ?? req.cookies?.['refresh_token'];
    if (rawToken) {
      await this.authService.logout(rawToken);
    }
    this.cookieService.clearTokenCookies(res);
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
