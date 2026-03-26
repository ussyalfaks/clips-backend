import { Controller, Post, Param, UseGuards, Get } from '@nestjs/common';
import { ClipsService } from '../clips/clips.service';
import { LoginGuard } from '../auth/guards/login.guard.js';

@UseGuards(LoginGuard)
@Controller('videos')
export class VideosController {
  constructor(private readonly clipsService: ClipsService) {}

  @Get()
  getVideos() {
    return { message: 'Videos endpoint' };
  }

  @Post(':id/cancel')
  async cancel(@Param('id') id: string) {
    return this.clipsService.cancelVideo(id);
  }
}
