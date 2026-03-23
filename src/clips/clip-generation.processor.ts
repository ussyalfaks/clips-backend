import { Injectable, Logger } from '@nestjs/common';
import { Clip } from './clip.entity';
import { calculateViralityScore } from './virality-score.util';

export interface ClipGenerationJob {
  videoId: string;
  startTime: number;
  endTime: number;
  /** 0.0–1.0: where in the source video this clip starts */
  positionRatio: number;
  transcript?: string;
}

/**
 * Clip-generation processor.
 *
 * Currently runs synchronously as a plain NestJS provider.
 * When a queue is introduced, convert this to a BullMQ @Processor class
 * and decorate `process()` with @Process() — the scoring logic stays unchanged.
 */
@Injectable()
export class ClipGenerationProcessor {
  private readonly logger = new Logger(ClipGenerationProcessor.name);

  process(job: ClipGenerationJob): Clip {
    const durationSeconds = job.endTime - job.startTime;

    const viralityScore = calculateViralityScore({
      durationSeconds,
      positionRatio: job.positionRatio,
      transcript: job.transcript,
    });

    this.logger.log(
      `Clip scored — videoId=${job.videoId} ` +
        `duration=${durationSeconds}s ` +
        `position=${(job.positionRatio * 100).toFixed(0)}% ` +
        `viralityScore=${viralityScore}`,
    );

    return {
      id: `${job.videoId}-${job.startTime}-${job.endTime}`,
      videoId: job.videoId,
      startTime: job.startTime,
      endTime: job.endTime,
      positionRatio: job.positionRatio,
      transcript: job.transcript,
      viralityScore,
      createdAt: new Date(),
    };
  }
}
