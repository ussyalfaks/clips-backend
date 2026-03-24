import { Controller, UseGuards, Get } from '@nestjs/common';
import { LoginGuard } from '../auth/guards/login.guard.js';

@UseGuards(LoginGuard)
@Controller('videos')
export class VideosController {
    @Get()
    getVideos() {
        return { message: 'Videos endpoint' };
    }
}
