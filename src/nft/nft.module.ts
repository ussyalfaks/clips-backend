import { Module } from '@nestjs/common';
import { NftMintService } from './nft-mint.service';
import { NftMintController } from './nft-mint.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { StellarModule } from '../stellar/stellar.module';

@Module({
  imports: [PrismaModule, StellarModule],
  controllers: [NftMintController],
  providers: [NftMintService],
  exports: [NftMintService],
})
export class NftModule {}
