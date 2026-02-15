import { Module } from '@nestjs/common';
import { STORAGE_SERVICE } from '../common/interfaces';
import { S3StorageAdapter } from './s3-storage.adapter';

@Module({
  providers: [
    {
      provide: STORAGE_SERVICE,
      useClass: S3StorageAdapter,
    },
  ],
  exports: [STORAGE_SERVICE],
})
export class StorageModule {}
