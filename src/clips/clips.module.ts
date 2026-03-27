import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ClipsController } from './clips.controller';
import { ClipsService } from './clips.service';
import { ClipGenerationProcessor } from './clip-generation.processor';
import { CloudinaryService } from './cloudinary.service';
import { CLIP_GENERATION_QUEUE } from './clip-generation.queue';
import { ClipsGateway } from './clips.gateway';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: CLIP_GENERATION_QUEUE }),
    PrismaModule,
  ],
  controllers: [ClipsController],
  providers: [
    ClipsService,
    ClipGenerationProcessor,
    CloudinaryService,
    ClipsGateway,
  ],
  exports: [ClipsService, CloudinaryService, ClipsGateway],
})
export class ClipsModule {}
