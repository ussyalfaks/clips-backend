import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { CLIP_GENERATION_QUEUE } from '../clips/clip-generation.queue';

@Module({
  imports: [BullModule.registerQueue({ name: CLIP_GENERATION_QUEUE })],
  controllers: [JobsController],
  providers: [JobsService],
})
export class JobsModule {}
