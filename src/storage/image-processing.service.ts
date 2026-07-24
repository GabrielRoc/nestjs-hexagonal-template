import { Injectable } from '@nestjs/common';
import sharp from 'sharp';

export interface ProcessedImage {
  optimizedBuffer: Buffer;
  optimizedMimeType: string;
  thumbnailBuffer: Buffer;
  thumbnailMimeType: string;
}

/** Formatos que o sharp reprocessa para WebP. */
const PROCESSABLE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const OPTIMIZED_MAX_WIDTH = 1200;
const THUMBNAIL_WIDTH = 300;

@Injectable()
export class ImageProcessingService {
  isProcessable(mimeType: string): boolean {
    return PROCESSABLE_MIME_TYPES.includes(mimeType);
  }

  async process(buffer: Buffer): Promise<ProcessedImage> {
    const [optimizedBuffer, thumbnailBuffer] = await Promise.all([
      this.resizeToWebp(buffer, OPTIMIZED_MAX_WIDTH, 80),
      this.resizeToWebp(buffer, THUMBNAIL_WIDTH, 70),
    ]);

    return {
      optimizedBuffer,
      optimizedMimeType: 'image/webp',
      thumbnailBuffer,
      thumbnailMimeType: 'image/webp',
    };
  }

  private resizeToWebp(
    buffer: Buffer,
    width: number,
    quality: number,
  ): Promise<Buffer> {
    return sharp(buffer)
      .resize(width, undefined, { withoutEnlargement: true, fit: 'inside' })
      .webp({ quality })
      .toBuffer();
  }
}
