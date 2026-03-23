import { Module } from '@nestjs/common';
import { ClipsController } from './clips.controller';
import { ClipsService } from './clips.service';
import { ClipGenerationProcessor } from './clip-generation.processor';

@Module({
  controllers: [ClipsController],
  providers: [ClipsService, ClipGenerationProcessor],
  exports: [ClipsService],
})
export class ClipsModule {}
