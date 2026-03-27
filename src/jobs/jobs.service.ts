import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, Job } from 'bullmq';
import { CLIP_GENERATION_QUEUE } from '../clips/clip-generation.queue';

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    @InjectQueue(CLIP_GENERATION_QUEUE) private readonly clipQueue: Queue,
  ) {}

  /**
   * Returns failed jobs from the specified queue.
   */
  async getFailedJobs(type: string) {
    if (type !== 'clip-generation') {
      throw new BadRequestException(`Unsupported job type: ${type}`);
    }

    const failedJobs = await this.clipQueue.getFailed();

    return failedJobs.map((job) => ({
      id: job.id,
      name: job.name,
      data: job.data,
      failedReason: job.failedReason,
      stacktrace: job.stacktrace,
      attemptsMade: job.attemptsMade,
      finishedOn: job.finishedOn,
      processedOn: job.processedOn,
    }));
  }

  /**
   * Retries a specific job by ID.
   */
  async retryJob(jobId: string) {
    const job = await this.clipQueue.getJob(jobId);
    if (!job) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }

    const state = await job.getState();
    if (state !== 'failed') {
      throw new BadRequestException(
        `Job ${jobId} is not in failed state (current state: ${state})`,
      );
    }

    await job.retry();
    this.logger.log(`Job ${jobId} retried from DLQ`);
    return { message: `Job ${jobId} retried successfully` };
  }
}
