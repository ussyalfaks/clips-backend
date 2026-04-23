import { Module } from '@nestjs/common';
import { NftConfig } from './nft.config';
import { NftService } from './nft.service';
import { NftController } from './nft.controller';

@Module({
  providers: [NftConfig, NftService],
  controllers: [NftController],
  exports: [NftService],
})
export class NftModule {}
