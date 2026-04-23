import { Module } from '@nestjs/common';
import { NftConfig } from './nft.config';
import { NftService } from './nft.service';
import { NftController } from './nft.controller';
import { RoyaltyQueryService } from './royalty-query.service';
import { NftMintService } from '../clips/nft-mint.service';
import { PrismaModule } from '../prisma/prisma.module';
import { StellarModule } from '../stellar/stellar.module';

@Module({
  imports: [PrismaModule, StellarModule],
  providers: [NftConfig, NftService, NftMintService, RoyaltyQueryService],
  controllers: [NftController],
  exports: [NftService, NftMintService, RoyaltyQueryService],
})
export class NftModule {}
