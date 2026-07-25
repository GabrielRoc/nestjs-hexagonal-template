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

/**
 * Teto de pixels do decode. O padrao do sharp (268 MP) permite bombas de
 * descompressao: um PNG de cor solida 16000x16000 ocupa menos de 1 MB no disco,
 * passa em todas as validacoes de upload e custa centenas de MB de RAM ao
 * decodificar. 50 MP cobre com folga qualquer foto real.
 */
const MAX_INPUT_PIXELS = 50_000_000;

const SHARP_OPTIONS: sharp.SharpOptions = {
  limitInputPixels: MAX_INPUT_PIXELS,
};

@Injectable()
export class ImageProcessingService {
  isProcessable(mimeType: string): boolean {
    return PROCESSABLE_MIME_TYPES.includes(mimeType);
  }

  async process(buffer: Buffer): Promise<ProcessedImage> {
    // O arquivo original e decodificado uma unica vez: a miniatura deriva do
    // WebP ja otimizado, e nao de um segundo decode da imagem em tamanho cheio.
    const optimizedBuffer = await this.resizeToWebp(
      buffer,
      OPTIMIZED_MAX_WIDTH,
      80,
    );
    const thumbnailBuffer = await this.resizeToWebp(
      optimizedBuffer,
      THUMBNAIL_WIDTH,
      70,
    );

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
    return (
      sharp(buffer, SHARP_OPTIONS)
        // Sem .rotate() o sharp ignora a orientacao EXIF e o .webp() descarta a
        // tag: toda foto de celular em retrato e gravada deitada, sem retorno.
        // No-op na segunda passada (o WebP otimizado ja nao carrega EXIF).
        .rotate()
        .resize(width, undefined, { withoutEnlargement: true, fit: 'inside' })
        .webp({ quality })
        .toBuffer()
    );
  }
}
