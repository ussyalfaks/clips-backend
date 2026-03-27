import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  NotFoundException,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ClipsService } from './clips.service.js';
import type { ClipSortField, SortOrder } from './clips.service.js';
import type { ClipGenerationJob } from './clip-generation.processor.js';
import type { BulkUpdateClipsDto } from './dto/bulk-update-clips.dto.js';
import { LoginGuard } from '../auth/guards/login.guard.js';
import { BulkDeleteClipsDto } from './dto/bulk-delete-clips.dto.js';

@UseGuards(LoginGuard)
@Controller('clips')
export class ClipsController {
  constructor(private readonly clipsService: ClipsService) {}

  /**
   * POST /clips/generate
   * Enqueue a clip-generation job with automatic retry + exponential backoff.
   * Returns the BullMQ job ID immediately; processing happens asynchronously.
   *
   * Body: { videoId, inputPath, outputPath, startTime, endTime, positionRatio, transcript? }
   */
  @Post('generate')
  generate(@Body() dto: ClipGenerationJob) {
    return this.clipsService.enqueueClip(dto);
  }

  /**
   * GET /clips
   * List clips, sorted by viralityScore descending by default.
   *
   * Query params:
   *   videoId  — filter to a specific source video
   *   sort     — field:order (e.g., viralityScore:desc, createdAt:asc)
   *   sortBy   — legacy support for viralityScore | createdAt | duration
   *   order    — legacy support for asc | desc
   *
   * Examples:
   *   GET /clips?sort=viralityScore:desc
   *   GET /clips?videoId=abc123&sort=duration:asc
   */
  @Get()
  list(
    @Query('videoId') videoId?: string,
    @Query('sort') sort?: string,
    @Query('sortBy') sortBy?: ClipSortField,
    @Query('order') order?: SortOrder,
  ) {
    let finalSortBy = sortBy;
    let finalOrder = order;

    if (sort) {
      const [field, dir] = sort.split(':');
      if (field) finalSortBy = field as ClipSortField;
      if (dir) finalOrder = dir as SortOrder;
    }

    return this.clipsService.listClips({
      videoId,
      sortBy: finalSortBy,
      order: finalOrder,
    });
  }

  /** GET /clips/:id */
  @Get(':id')
  async findOne(@Param('id') id: string) {
    const clip = await this.clipsService.findById(id);
    if (!clip) throw new NotFoundException(`Clip ${id} not found`);
    return clip;
  }

  /**
   * POST /clips/bulk-update
   * Bulk update selected and/or postStatus for multiple clips in one transaction.
   *
   * Body:
   *   {
   *     clipIds:    string[]              — IDs to update (must belong to the requesting user)
   *     selected?:  boolean               — mark clips as curated/selected
   *     postStatus?: string | object      — e.g. 'posted', 'failed', or { platform, postId, ... }
   *   }
   *
   * Response:
   *   {
   *     updatedCount:      number   — how many clips were actually updated
   *     updates:           object   — the patch that was applied
   *     notFoundIds:       string[] — IDs that were missing or belonged to another user
   *     allClipsProcessed: boolean  — true when every clip in the affected video(s) is 'posted'
   *   }
   *
   * Note: userId is read from req.user.id (populated by your auth guard).
   * Until auth is wired up, falls back to the 'x-user-id' header for local testing.
   */
  @Post('bulk-update')
  bulkUpdate(@Body() dto: BulkUpdateClipsDto, @Req() req: Request) {
    const userId: number = Number(
      (req as any).user?.id ?? (req.headers['x-user-id'] as string) ?? 0,
    );
    return this.clipsService.bulkUpdate(userId, dto);
  }

  @Post('bulk-delete')
  bulkDelete(@Body() dto: BulkDeleteClipsDto, @Req() req: Request) {
    const userId: number = Number(
      (req as any).user?.id ?? (req.headers['x-user-id'] as string) ?? 0,
    );
    return this.clipsService.bulkDeleteRejected(userId, dto.clipIds);
  }

  /**
   * POST /clips/:id/regenerate
   * Re-run FFmpeg cut for a single clip using original timestamps.
   */
  @Post(':id/regenerate')
  regenerate(@Param('id') id: string, @Req() req: Request) {
    const userId: number = Number(
      (req as any).user?.id ?? (req.headers['x-user-id'] as string) ?? 0,
    );
    return this.clipsService.regenerate(userId, Number(id));
  }
}
