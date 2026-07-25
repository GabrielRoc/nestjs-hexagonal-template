import { Module } from '@nestjs/common';
import { STORAGE_SERVICE } from '../common/interfaces';
import { ImageProcessingService } from './image-processing.service';
import { S3StorageAdapter } from './s3-storage.adapter';
import { StorageController } from './storage.controller';

@Module({
  controllers: [StorageController],
  providers: [
    {
      provide: STORAGE_SERVICE,
      useClass: S3StorageAdapter,
    },
    ImageProcessingService,
  ],
  exports: [STORAGE_SERVICE],
})
export class StorageModule {}
