import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags, ApiQuery } from '@nestjs/swagger';
import type { Request } from 'express';
import { WalletService } from './wallet.service';
import { StellarService } from '../stellar/stellar.service';
import { LoginGuard } from '../auth/guards/login.guard';
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
}
