import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SampleTypeormEntity } from './persistence/sample.typeorm-entity';
import { SampleTypeormRepository } from './persistence/sample.typeorm-repository';
import { SAMPLE_REPOSITORY } from '../domain/ports/sample.repository.port';
import { SAMPLE_QUEUE } from '../domain/ports/sample-queue.port';
import { SampleController } from './http/sample.controller';
import { SampleQueueAdapter } from './queue/sample-queue.adapter';
import { SAMPLE_QUEUE_NAME } from './queue/sample-queue.constants';
import { SampleProcessor } from './queue/sample.processor';
import { CreateSampleUseCase } from '../application/use-cases/create-sample.use-case';
import { GetSampleUseCase } from '../application/use-cases/get-sample.use-case';
import { ListSamplesUseCase } from '../application/use-cases/list-samples.use-case';
import { UpdateSampleUseCase } from '../application/use-cases/update-sample.use-case';
import { DeleteSampleUseCase } from '../application/use-cases/delete-sample.use-case';
import { ScheduleSampleDeactivationUseCase } from '../application/use-cases/schedule-sample-deactivation.use-case';

@Module({
  imports: [
    TypeOrmModule.forFeature([SampleTypeormEntity]),
    // Conexao e opcoes vem do BullModule.forRootAsync do QueueModule.
    BullModule.registerQueue({ name: SAMPLE_QUEUE_NAME }),
  ],
  controllers: [SampleController],
  providers: [
    {
      provide: SAMPLE_REPOSITORY,
      useClass: SampleTypeormRepository,
    },
    {
      provide: SAMPLE_QUEUE,
      useClass: SampleQueueAdapter,
    },
    // O processor e um provider comum: o @nestjs/bullmq o descobre pelo
    // decorator @Processor e cria o Worker do BullMQ em volta dele.
    SampleProcessor,
    CreateSampleUseCase,
    GetSampleUseCase,
    ListSamplesUseCase,
    UpdateSampleUseCase,
    DeleteSampleUseCase,
    ScheduleSampleDeactivationUseCase,
  ],
  exports: [SAMPLE_REPOSITORY],
})
export class SampleModule {}
