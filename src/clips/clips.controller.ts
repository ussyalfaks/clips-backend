import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  NotFoundException,
} from '@nestjs/common';
import { ClipsService, ClipSortField, SortOrder } from './clips.service';
import { ClipGenerationJob } from './clip-generation.processor';

@Controller('clips')
export class ClipsController {
  constructor(private readonly clipsService: ClipsService) {}

  /**
   * POST /clips/generate
   * Trigger clip generation and virality scoring for a video segment.
   *
   * Body: { videoId, startTime, endTime, positionRatio, transcript? }
   */
  @Post('generate')
  generate(@Body() dto: ClipGenerationJob) {
    return this.clipsService.generateClip(dto);
  }

  /**
   * GET /clips
   * List clips, sorted by viralityScore descending by default.
   *
   * Query params:
   *   videoId  — filter to a specific source video
   *   sortBy   — viralityScore | createdAt | duration  (default: viralityScore)
   *   order    — asc | desc  (default: desc)
   *
   * Examples:
   *   GET /clips
   *   GET /clips?sortBy=viralityScore&order=desc
   *   GET /clips?videoId=abc123&sortBy=duration&order=asc
   */
  @Get()
  list(
    @Query('videoId') videoId?: string,
    @Query('sortBy') sortBy?: ClipSortField,
    @Query('order') order?: SortOrder,
  ) {
    return this.clipsService.listClips({ videoId, sortBy, order });
  }

  /** GET /clips/:id */
  @Get(':id')
  findOne(@Param('id') id: string) {
    const clip = this.clipsService.findById(id);
    if (!clip) throw new NotFoundException(`Clip ${id} not found`);
    return clip;
  }
}
