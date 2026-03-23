import { Injectable } from '@nestjs/common';
import { Clip } from './clip.entity';
import { ClipGenerationProcessor, ClipGenerationJob } from './clip-generation.processor';

export type ClipSortField = 'viralityScore' | 'createdAt' | 'duration';
export type SortOrder = 'asc' | 'desc';

export interface ListClipsOptions {
  videoId?: string;
  sortBy?: ClipSortField;
  order?: SortOrder;
}

@Injectable()
export class ClipsService {
  /** In-memory store — swap for a TypeORM/Prisma repository when DB is wired up */
  private readonly clips: Clip[] = [];

  constructor(private readonly processor: ClipGenerationProcessor) {}

  generateClip(job: ClipGenerationJob): Clip {
    const clip = this.processor.process(job);
    this.clips.push(clip);
    return clip;
  }

  /**
   * List clips with optional filtering and sorting.
   *
   * sortBy options:
   *   viralityScore (default) — highest viral potential first
   *   createdAt               — newest first by default
   *   duration                — longest first by default
   */
  listClips(options: ListClipsOptions = {}): Clip[] {
    const { videoId, sortBy = 'viralityScore', order = 'desc' } = options;

    const result = videoId
      ? this.clips.filter((c) => c.videoId === videoId)
      : [...this.clips];

    return result.sort((a, b) => {
      let aVal: number;
      let bVal: number;

      switch (sortBy) {
        case 'viralityScore':
          aVal = a.viralityScore ?? -1;
          bVal = b.viralityScore ?? -1;
          break;
        case 'createdAt':
          aVal = a.createdAt.getTime();
          bVal = b.createdAt.getTime();
          break;
        case 'duration':
          aVal = a.endTime - a.startTime;
          bVal = b.endTime - b.startTime;
          break;
        default:
          return 0;
      }

      return order === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }

  findById(id: string): Clip | undefined {
    return this.clips.find((c) => c.id === id);
  }
}
