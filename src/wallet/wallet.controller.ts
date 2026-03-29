
import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags, ApiQuery } from '@nestjs/swagger';

import type { Request } from 'express';
import { WalletService } from './wallet.service';
import { StellarService } from '../stellar/stellar.service';
import { LoginGuard } from '../auth/guards/login.guard';
import { ConnectWalletDto } from './dto/connect-wallet.dto';

import { Public } from '../auth/decorators/public.decorator';

@ApiTags('wallets')
@UseGuards(LoginGuard)
@Controller('wallets')
export class WalletController {
  constructor(
    private readonly walletService: WalletService,
    private readonly stellarService: StellarService,
  ) {}

  /** GET /wallets/validate — validate a Stellar public address */
  @Public()
  @Get('validate')
  @ApiOperation({ summary: 'Validate a Stellar public address format' })
  @ApiQuery({ name: 'address', description: 'Stellar public address (G...)' })
  @ApiResponse({
    status: 200,
    description: 'Validation result',
    schema: {
      type: 'object',
      properties: {
        valid: { type: 'boolean' },
        message: { type: 'string', nullable: true },
      },
    },
  })
  validateWallet(@Query('address') address: string) {
    return this.stellarService.validateAddress(address);
  }

  /** POST /wallets/connect — connect a new wallet */
  @Post('connect')
  connectWallet(@Body() dto: ConnectWalletDto, @Req() req: Request) {
    const userId = Number((req as any).user?.id ?? 0);
    return this.walletService.connectWallet(userId, dto);
  }

  /** GET /wallets — list current user's wallets (addresses masked) */
  @Get()
  @ApiOperation({ summary: "List current user's wallets (addresses masked)" })
  getWallets(@Req() req: Request) {
    const userId = Number((req as any).user?.id ?? 0);
    return this.walletService.getWalletsByUserId(userId);
  }

  /** GET /wallets/:id — get a single wallet by ID (address masked) */
  @Get(':id')
  @ApiOperation({
    summary: 'Get a single wallet by ID (address masked)',
  })
  getWallet(@Param('id') id: string, @Req() req: Request) {
    const userId = Number((req as any).user?.id ?? 0);
    return this.walletService.getWalletById(Number(id), userId);
  }
  /** GET /wallets/:id/balance — get XLM balance for a wallet */
  @Get(':id/balance')
  @ApiOperation({ summary: 'Get XLM balance for a specific wallet' })
  @ApiResponse({
    status: 200,
    description: 'Wallet balance and warnings',
  })
  getWalletBalance(@Param('id') id: string, @Req() req: Request) {
    const userId = Number((req as any).user?.id ?? 0);
    return this.walletService.getWalletBalance(
      Number(id),
      userId,
      this.stellarService,
    );
  }

  /** DELETE /wallets/:id — disconnect a wallet */
  @Delete(':id')
  @ApiOperation({ summary: 'Disconnect a wallet with dependency checks' })
  @ApiResponse({
    status: 200,
    description: 'Wallet disconnected successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Cannot disconnect wallet with pending payouts or active NFTs',
  })
  @ApiResponse({
    status: 404,
    description: 'Wallet not found',
  })
  disconnectWallet(@Param('id') id: string, @Req() req: Request) {
    const userId = Number((req as any).user?.id ?? 0);
    return this.walletService.disconnectWallet(Number(id), userId);
  }
}
