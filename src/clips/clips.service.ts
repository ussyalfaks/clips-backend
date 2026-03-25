import { Injectable, Logger, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { Clip, PostStatus } from './clip.entity';
import type { Video } from '../videos/video.entity';
import type { ClipGenerationJob } from './clip-generation.processor';
import { BulkUpdateClipsDto } from './dto/bulk-update-clips.dto';
import {
  ALL_CLIPS_PROCESSED_EVENT,
  AllClipsProcessedPayload,
  CLIP_GENERATION_FAILED_EVENT,
} from './clips.events';
import type { ClipGenerationFailedPayload } from './clips.events';
import { CLIP_GENERATION_QUEUE, CLIP_JOB_OPTIONS } from './clip-generation.queue';

export type ClipSortField = 'viralityScore' | 'createdAt' | 'duration';
export type SortOrder = 'asc' | 'desc';

export interface ListClipsOptions {
  videoId?: string;
  sortBy?: ClipSortField;
  order?: SortOrder;
  statusFilter?: Clip['status'];
}

export interface BulkUpdateResult {
  updatedCount: number;
  updates: { selected?: boolean; postStatus?: unknown };
  notFoundIds: string[];
  allClipsProcessed: boolean;
}

export interface BulkUpdateResult {
  updatedCount: number;
  /** Summary of the applied changes */
  updates: { selected?: boolean; postStatus?: unknown };
  /** IDs that were not found or did not belong to the user */
  notFoundIds: string[];
  /** True when every clip for the affected video(s) now has postStatus = 'posted' */
  allClipsProcessed: boolean;
}

@Injectable()
export class ClipsService {
  private readonly logger = new Logger(ClipsService.name);
  /** In-memory stores — only used for legacy methods or initial testing */
  private readonly videos: Map<string, Video> = new Map();
  private readonly videoJobs: Map<string, Set<string>> = new Map();
  private readonly jobControllers: Map<string, AbortController> = new Map();
  private readonly cancelledVideos: Set<string> = new Set();

  constructor(
    @InjectQueue(CLIP_GENERATION_QUEUE)
    private readonly clipQueue: Queue<ClipGenerationJob>,
    private readonly eventEmitter: EventEmitter2,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Enqueue a clip-generation job with retry + exponential backoff.
   */
  async enqueueClip(job: ClipGenerationJob): Promise<{ jobId: string | undefined }> {
    const bullJob = await this.clipQueue.add('generate', job, CLIP_JOB_OPTIONS);
    if (bullJob?.id && job.videoId) {
      const set = this.videoJobs.get(job.videoId) ?? new Set<string>();
      set.add(String(bullJob.id));
      this.videoJobs.set(job.videoId, set);
    }
    return { jobId: bullJob.id };
  }

  /**
   * Regenerate a single clip by re-running FFmpeg with original timestamps.
   */
  async regenerate(userId: number, clipId: number): Promise<{ jobId: string | undefined }> {
    const clip = await this.prisma.clip.findUnique({
      where: { id: clipId },
      include: { video: true },
    });

    if (!clip) {
      throw new BadRequestException(`Clip ${clipId} not found`);
    }

    if (clip.video.userId !== userId) {
      throw new ForbiddenException('You do not have permission to regenerate this clip');
    }

    // Update status to processing
    await this.prisma.clip.update({
      where: { id: clipId },
      data: { updatedAt: new Date() },
    });

    // Enqueue the job
    const job: ClipGenerationJob = {
      videoId: String(clip.videoId),
      inputPath: clip.video.sourceUrl, // Assuming sourceUrl is the local path or accessible URL
      outputPath: `/tmp/clip-${clipId}-regen-${Date.now()}.mp4`,
      startTime: clip.startTime,
      endTime: clip.endTime,
      positionRatio: (clip.startTime / (clip.video.duration || 1)), // Rough estimate if not stored
      transcript: clip.caption || '', // Use caption as transcript fallback
      title: clip.title || undefined,
      clipId: clip.id,
      existingViralityScore: clip.viralityScore || undefined,
    };

    return this.enqueueClip(job);
  }

  /**
   * Update a clip's metadata in the database.
   */
  async updateClip(id: number, data: Partial<any>): Promise<void> {
    await this.prisma.clip.update({
      where: { id },
      data: {
        ...data,
        updatedAt: new Date(),
      },
    });
    this.logger.log(`Clip ${id} updated in database`);
  }

  /**
   * Listener for the terminal clip-generation failure event.
   */
  @OnEvent(CLIP_GENERATION_FAILED_EVENT)
  handleClipGenerationFailed(payload: ClipGenerationFailedPayload): void {
    const video = this.videos.get(payload.videoId);
    if (video) {
      if (video.status !== 'cancelled') {
        video.status = 'failed';
        video.processingError = payload.failedReason;
        video.updatedAt = new Date();
      }
    }
  }

  /**
   * Bulk update clip status in a transaction.
   */
  async bulkUpdate(userId: number, dto: BulkUpdateClipsDto): Promise<BulkUpdateResult> {
    if (dto.selected === undefined && dto.postStatus === undefined) {
      throw new BadRequestException(
        'At least one of selected or postStatus must be provided',
      );
    }

    // ── Ownership validation ──────────────────────────────────────────────────
    const clips = await this.prisma.clip.findMany({
      where: {
        id: { in: dto.clipIds.map((id) => Number(id)) },
        video: { userId },
      },
      include: { video: true },
    });

    const foundIds = clips.map((c) => String(c.id));
    const notFoundIds = dto.clipIds.filter((id) => !foundIds.includes(id));

    if (clips.length === 0 && dto.clipIds.length > 0) {
      throw new ForbiddenException(
        'None of the provided clipIds belong to this user or exist',
      );
    }

    // ── Database transaction ─────────────────────────────────────────────────
    const patch: any = {
      updatedAt: new Date(),
    };
    if (dto.selected !== undefined) patch.selected = dto.selected;
    if (dto.postStatus !== undefined) patch.postStatus = dto.postStatus;
    if (dto.caption !== undefined) patch.caption = dto.caption;

    await this.prisma.$transaction(
      clips.map((clip) =>
        this.prisma.clip.update({
          where: { id: clip.id },
          data: patch,
        }),
      ),
    );

    // ── Video completion check ────────────────────────────────────────────────
    const affectedVideoIds = [...new Set(clips.map((c) => c.videoId))];
    let allClipsProcessed = false;

    for (const videoId of affectedVideoIds) {
      const videoClips = await this.prisma.clip.findMany({
        where: { videoId },
      });
      
      // Check if all clips for this video have postStatus = 'posted'
      // Note: postStatus in Prisma is Json, so we check if it's strictly 'posted'
      const allPosted = videoClips.every((c) => (c.postStatus as any) === 'posted');

      if (allPosted && videoClips.length > 0) {
        allClipsProcessed = true;
        const payload: AllClipsProcessedPayload = { videoId: String(videoId), clipCount: videoClips.length };
        this.eventEmitter.emit(ALL_CLIPS_PROCESSED_EVENT, payload);
      }
    }

    return {
      updatedCount: clips.length,
      updates: {
        ...(dto.selected !== undefined && { selected: dto.selected }),
        ...(dto.postStatus !== undefined && { postStatus: dto.postStatus }),
      },
      notFoundIds,
      allClipsProcessed,
    };
  }

  /**
   * Find clips for a specific video, or all clips.
   */
  async listClips(options: ListClipsOptions = {}): Promise<any[]> {
    const {
      videoId,
      sortBy = 'viralityScore',
      order = 'desc',
    } = options;

    const where: any = {};
    if (videoId) {
      where.videoId = Number(videoId);
    }

    const orderBy: any = [];
    if (sortBy === 'viralityScore') {
      orderBy.push({ viralityScore: order });
    } else if (sortBy === 'createdAt') {
      orderBy.push({ createdAt: order });
    } else if (sortBy === 'duration') {
      orderBy.push({ duration: order });
    }

    if (sortBy !== 'createdAt') {
      orderBy.push({ createdAt: 'desc' });
    }

    return this.prisma.clip.findMany({
      where,
      orderBy,
    });
  }

  /**
   * Find clip by ID
   */
  async findById(id: string | number): Promise<any | null> {
    return this.prisma.clip.findUnique({
      where: { id: Number(id) },
    });
  }

  /**
   * Update clip with Cloudinary URL and thumbnail (Legacy/Helper)
   */
  async updateClipUrls(
    id: string | number,
    clipUrl: string,
    thumbnail?: string,
  ): Promise<void> {
    await this.updateClip(Number(id), { clipUrl, thumbnail });
  }

  _registerJobController(videoId: string, jobId: string, controller: AbortController): void {
    if (jobId) {
      this.jobControllers.set(jobId, controller);
    }
    if (videoId) {
      const set = this.videoJobs.get(videoId) ?? new Set<string>();
      set.add(jobId);
      this.videoJobs.set(videoId, set);
    }
  }

  _clearJobController(jobId: string): void {
    this.jobControllers.delete(jobId);
  }

  _getVideo(id: string): any | undefined {
    return this.videos.get(id);
  }

  _isVideoCancelled(videoId: string): boolean {
    return this.cancelledVideos.has(videoId);
  }

  async cancelVideo(videoId: string): Promise<{ cancelled: boolean; removedJobs: number; abortedJobs: number }> {
    this.cancelledVideos.add(videoId);
    const jobIds = [...(this.videoJobs.get(videoId) ?? new Set<string>())];
    let removedJobs = 0;
    let abortedJobs = 0;
    for (const id of jobIds) {
      const controller = this.jobControllers.get(id);
      if (controller) {
        try {
          controller.abort();
          abortedJobs++;
        } catch {}
      }
      try {
        const job = await this.clipQueue.getJob(id);
        if (job) {
          await job.remove();
          removedJobs++;
        }
      } catch {}
    }
    return { cancelled: true, removedJobs, abortedJobs };
  }
}

