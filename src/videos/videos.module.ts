import { Module } from '@nestjs/common';
import { VideosController } from './videos.controller';
import { ClipsModule } from '../clips/clips.module';

@Module({
  imports: [ClipsModule],
  controllers: [VideosController],
})
export class VideosModule {}
