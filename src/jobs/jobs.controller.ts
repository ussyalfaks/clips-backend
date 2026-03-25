import { Controller, Get, Post, Query, Param, UseGuards } from '@nestjs/common';
import { JobsService } from './jobs.service';

/**
 * Controller for managing BullMQ jobs.
 */
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  /**
   * GET /jobs/failed?type=clip-generation
   * Lists failed jobs in the specified queue.
   */
  @Get('failed')
  async getFailedJobs(@Query('type') type: string) {
    return this.jobsService.getFailedJobs(type || 'clip-generation');
  }

  /**
   * POST /jobs/retry/:jobId
   * Retries a specific failed job.
   */
  @Post('retry/:jobId')
  async retryJob(@Param('jobId') jobId: string) {
    return this.jobsService.retryJob(jobId);
  }
}
