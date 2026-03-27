import { Injectable, Logger } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import * as streamifier from 'streamifier';
import * as fs from 'fs';

export interface CloudinaryUploadResult {
  secure_url: string;
  thumbnail_url?: string;
  public_id: string;
  error?: string;
}

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);

  constructor() {
    // Initialize Cloudinary with environment variables
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
  }

  /**
   * Upload video clip from buffer to Cloudinary with retry logic
   * @param buffer - Video buffer from FFmpeg
   * @param publicId - Cloudinary public ID for the clip
   * @param options - Upload options
   * @param retries - Number of retry attempts (default: 2)
   * @returns Upload result with secure_url and thumbnail_url
   */
  async uploadVideoFromBuffer(
    buffer: Buffer,
    publicId: string,
    options: {
      folder?: string;
      resourceType?: 'video' | 'image' | 'raw' | 'auto';
      autoTagging?: number;
    } = {},
    retries: number = 2,
  ): Promise<CloudinaryUploadResult> {
    const maxAttempts = retries + 1;
    let lastError: string = '';

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        this.logger.log(
          `Cloudinary upload attempt ${attempt}/${maxAttempts} for ${publicId}`,
        );

        const result = await this.performUpload(buffer, publicId, options);

        if (result.error) {
          lastError = result.error;
          this.logger.warn(
            `Cloudinary upload attempt ${attempt}/${maxAttempts} failed for ${publicId}: ${result.error}`,
          );

          if (attempt < maxAttempts) {
            // Wait before retry with exponential backoff
            const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
            this.logger.log(`Retrying in ${delayMs}ms...`);
            await this.delay(delayMs);
            continue;
          }
        } else {
          // Success
          this.logger.log(
            `Clip uploaded successfully on attempt ${attempt}: ${publicId} (${result.secure_url})`,
          );
          return result;
        }
      } catch (error) {
        lastError = error.message;
        this.logger.error(
          `Cloudinary upload attempt ${attempt}/${maxAttempts} threw error for ${publicId}: ${lastError}`,
        );

        if (attempt < maxAttempts) {
          const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          this.logger.log(`Retrying in ${delayMs}ms...`);
          await this.delay(delayMs);
          continue;
        }
      }
    }

    // All attempts failed
    this.logger.error(
      `All ${maxAttempts} Cloudinary upload attempts failed for ${publicId}. Last error: ${lastError}`,
    );
    return {
      secure_url: '',
      public_id: publicId,
      error: lastError || 'Upload failed after all retry attempts',
    };
  }

  /**
   * Perform a single upload attempt to Cloudinary
   * @private
   */
  private async performUpload(
    buffer: Buffer,
    publicId: string,
    options: {
      folder?: string;
      resourceType?: 'video' | 'image' | 'raw' | 'auto';
      autoTagging?: number;
    },
  ): Promise<CloudinaryUploadResult> {
    return new Promise((resolve) => {
      const {
        folder = 'clips',
        resourceType = 'video',
        autoTagging = 0.6,
      } = options;

      const uploadStream = cloudinary.uploader.upload_stream(
        {
          public_id: publicId,
          folder,
          resource_type: resourceType as any,
          auto_tagging: autoTagging,
          eager: [
            {
              streaming_profile: 'hd',
              format: 'mp4',
            },
          ],
        },
        (error: any, result: any) => {
          if (error) {
            resolve({
              secure_url: '',
              public_id: publicId,
              error: error.message,
            });
          } else if (result) {
            resolve({
              secure_url: result.secure_url,
              public_id: result.public_id,
              thumbnail_url: this.generateThumbnailUrl(
                result.public_id,
                result.resource_type,
              ),
            });
          } else {
            resolve({
              secure_url: '',
              public_id: publicId,
              error: 'Unknown error',
            });
          }
        },
      );

      streamifier.createReadStream(buffer).pipe(uploadStream);
    });
  }

  /**
   * Delay helper for retry backoff
   * @private
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Generate thumbnail URL from uploaded video
   * Uses time-based thumbnail generation (0.5 = 50% into video)
   * @param publicId - Cloudinary public ID
   * @param resourceType - Resource type (video)
   * @param timeRatio - Time ratio (0-1) where to capture thumbnail
   */
  private generateThumbnailUrl(
    publicId: string,
    resourceType: string,
    timeRatio: number = 0.5,
  ): string {
    if (resourceType !== 'video') {
      return '';
    }

    // Cloudinary URL format for video thumbnails
    // Using v_offset with percentage-based time
    return `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/video/upload/so_${Math.round(timeRatio * 100)}p/${publicId}.jpg`;
  }

  /**
   * Delete a clip from Cloudinary
   * @param publicId - Cloudinary public ID
   */
  async deleteClip(publicId: string): Promise<void> {
    try {
      await cloudinary.uploader.destroy(publicId, { resource_type: 'video' });
      this.logger.log(`Clip deleted from Cloudinary: ${publicId}`);
    } catch (error) {
      this.logger.error(`Failed to delete clip ${publicId}: ${error.message}`);
    }
  }

  /**
   * Delete local temporary file
   * @param filePath - Path to local file
   */
  async deleteLocalFile(filePath: string): Promise<void> {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        this.logger.log(`Local file deleted: ${filePath}`);
      }
    } catch (error) {
      this.logger.error(
        `Failed to delete local file ${filePath}: ${error.message}`,
      );
    }
  }

  /**
   * Read file into buffer
   * @param filePath - Path to file
   */
  async readFileToBuffer(filePath: string): Promise<Buffer> {
    return fs.promises.readFile(filePath);
  }
}
