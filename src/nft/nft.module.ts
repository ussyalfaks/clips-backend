import { Module } from '@nestjs/common';
import { NftRoyaltyService } from './nft-royalty.service';
import { NftController } from './nft.controller';
import { StellarModule } from '../stellar/stellar.module';

@Module({
  imports: [StellarModule],
  controllers: [NftController],
  providers: [NftRoyaltyService],
  exports: [NftRoyaltyService],
})
export class NftModule {}
