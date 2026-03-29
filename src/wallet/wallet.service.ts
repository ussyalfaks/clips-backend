import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StrKey } from '@stellar/stellar-sdk';
import { ConnectWalletDto } from './dto/connect-wallet.dto';

@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Mask a wallet address for privacy, showing only the last 6 characters.
   * e.g. "GBXZFVGP3QW5NXVZ4KPRQ" → "******NXVZ4KPRQ" → "******KPRQ"  (last 6)
   */
  maskAddress(address: string): string {
    if (!address) return '';
    if (address.length <= 6) return address;
    return `******${address.slice(-6)}`;
  }

  private applyMask(wallet: any) {
    return { ...wallet, address: this.maskAddress(wallet.address) };
  }

  async getWalletsByUserId(userId: number) {
    const wallets = await this.prisma.wallet.findMany({ 
      where: { userId, deletedAt: null } 
    });
    return wallets.map((w) => this.applyMask(w));
  }

  async getWalletById(id: number, userId: number) {
    const wallet = await this.prisma.wallet.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!wallet) throw new NotFoundException(`Wallet ${id} not found`);
    return this.applyMask(wallet);
  }

  /**
   * Connect a Stellar wallet.
   * Validates address, checks for duplicates, and upserts.
   */
  async connectWallet(userId: number, dto: ConnectWalletDto) {
    // 1. Validate address based on chain
    if (dto.chain === 'stellar') {
      if (!StrKey.isValidEd25519PublicKey(dto.address)) {
        throw new BadRequestException('Invalid Stellar address');
      }
    } else if (dto.chain === 'base') {
      // Basic EVM address validation (0x followed by 40 hex characters)
      const evmRegex = /^0x[a-fA-F0-9]{40}$/;
      if (!evmRegex.test(dto.address)) {
        throw new BadRequestException('Invalid Base address');
      }
    }

    // 2. Upsert logic (check for existing userId + address)
    // Since the schema doesn't have a composite unique index, we check first.
    let wallet = await this.prisma.wallet.findFirst({
      where: { userId, address: dto.address },
    });

    if (wallet) {
      // Update existing
      wallet = await this.prisma.wallet.update({
        where: { id: wallet.id },
        data: {
          chain: dto.chain,
          type: dto.type,
          updatedAt: new Date(),
        },
      });
    } else {
      // Create new
      wallet = await this.prisma.wallet.create({
        data: {
          userId,
          address: dto.address,
          chain: dto.chain,
          type: dto.type,
        },
      });
    }

    return this.applyMask(wallet);
  }
  async getWalletBalance(id: number, userId: number, stellarService: any) {
    const wallet = await this.prisma.wallet.findFirst({
      where: { id, userId },
    });
    if (!wallet) throw new NotFoundException(`Wallet ${id} not found`);

    if (wallet.chain !== 'stellar') {
      throw new BadRequestException(
        'Balance check only supported for Stellar wallets',
      );
    }

    const balance = await stellarService.getAccountBalance(wallet.address);
    const warning =
      balance < 2
        ? 'Warning: Low XLM balance (below 2 XLM). Minting may fail.'
        : null;

    return {
      address: wallet.address,
      balance,
      asset: 'XLM',
      warning,
    };
  }

  /**
   * Disconnect a wallet with ownership & dependency checks
   * Prevents disconnect if active NFTs or pending payouts exist
   */
  async disconnectWallet(id: number, userId: number) {
    // 1. Find wallet with ownership check
    const wallet = await this.prisma.wallet.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!wallet) throw new NotFoundException(`Wallet ${id} not found`);

    // 2. Check for active payouts (status not final)
    const activePayout = await this.prisma.payout.findFirst({
      where: {
        walletId: id,
        status: { notIn: ['completed', 'failed', 'cancelled'] },
      },
    });
    if (activePayout) {
      throw new BadRequestException(
        'Cannot disconnect wallet with pending payouts. Please wait for pending transactions to complete.',
      );
    }

    // 3. Check for active NFTs (status not "none" or "failed")
    const activeNft = await this.prisma.clip.findFirst({
      where: {
        video: { userId },
        nftStatus: { notIn: ['none', 'failed'] },
      },
    });
    if (activeNft) {
      throw new BadRequestException(
        'Cannot disconnect wallet with active NFTs. Please wait for minting to complete or cancel pending NFT operations.',
      );
    }

    // 4. Soft delete
    await this.prisma.wallet.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return { success: true, message: 'Wallet disconnected successfully' };
  }
}
