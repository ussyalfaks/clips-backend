import ffmpeg from 'fluent-ffmpeg';
import { Logger } from '@nestjs/common';

const logger = new Logger('FfmpegUtil');

export interface CutClipOptions {
  inputPath: string;
  outputPath: string;
  /** Start time in seconds — may be a float e.g. 12.5 */
  startTime: number;
  /** End time in seconds — may be a float e.g. 45.7 */
  endTime: number;
  /** Total duration of the source video in seconds (used for edge-case clamping) */
  videoDuration?: number;
  signal?: AbortSignal;
}

/**
 * Sanitises float startTime/endTime values before passing them to FFmpeg.
 *
 * Problem: FFmpeg's -ss / -t flags choke on raw JS floats that may carry
 * floating-point noise (e.g. 12.500000000001). We normalise to a fixed
 * 3-decimal-place string so FFmpeg always receives a clean value like "12.500".
 *
 * Rules applied:
 *  - startTime is clamped to >= 0
 *  - endTime is clamped to <= videoDuration (when provided)
 *  - endTime must be > startTime; throws otherwise
 *  - duration = endTime - startTime, formatted to 3 d.p.
 *
 * FFmpeg invocation uses:
 *  .seekInput(startSeconds)  — maps to -ss (input seek, frame-accurate)
 *  .duration(durationSeconds) — maps to -t (output duration)
 */
export function cutClip(options: CutClipOptions): Promise<string> {
  const { inputPath, outputPath, videoDuration } = options;

  // --- Sanitise & clamp ---
  const start = Math.max(0, options.startTime);
  const end = videoDuration != null
    ? Math.min(options.endTime, videoDuration)
    : options.endTime;

  if (end <= start) {
    throw new RangeError(
      `endTime (${end}) must be greater than startTime (${start})`,
    );
  }

  // Fixed-precision strings — avoids floating-point noise in FFmpeg args
  const startSeconds = parseFloat(start.toFixed(3));
  const durationSeconds = parseFloat((end - start).toFixed(3));

  logger.log(
    `Cutting clip: input=${inputPath} start=${startSeconds}s duration=${durationSeconds}s output=${outputPath}`,
  );

  return new Promise((resolve, reject) => {
    const cmd = ffmpeg(inputPath)
      .seekInput(startSeconds)
      .duration(durationSeconds)
      .output(outputPath)
      .on('end', () => {
        resolve(outputPath);
      })
      .on('error', (err: Error) => {
        reject(err);
      });

    if (options.signal) {
      const onAbort = () => {
        try {
          cmd.kill('SIGKILL');
        } catch {}
        reject(new Error('Aborted'));
      };
      if (options.signal.aborted) {
        onAbort();
        return;
      }
      options.signal.addEventListener('abort', onAbort, { once: true });
    }

    cmd.run();
  });
}
