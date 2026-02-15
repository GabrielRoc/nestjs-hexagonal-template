import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SampleTypeormEntity } from './persistence/sample.typeorm-entity';
import { SampleTypeormRepository } from './persistence/sample.typeorm-repository';
import { SAMPLE_REPOSITORY } from '../domain/ports/sample.repository.port';
import { SampleController } from './http/sample.controller';
import { CreateSampleUseCase } from '../application/use-cases/create-sample.use-case';
import { GetSampleUseCase } from '../application/use-cases/get-sample.use-case';
import { ListSamplesUseCase } from '../application/use-cases/list-samples.use-case';
import { UpdateSampleUseCase } from '../application/use-cases/update-sample.use-case';
import { DeleteSampleUseCase } from '../application/use-cases/delete-sample.use-case';

@Module({
  imports: [TypeOrmModule.forFeature([SampleTypeormEntity])],
  controllers: [SampleController],
  providers: [
    {
      provide: SAMPLE_REPOSITORY,
      useClass: SampleTypeormRepository,
    },
    CreateSampleUseCase,
    GetSampleUseCase,
    ListSamplesUseCase,
    UpdateSampleUseCase,
    DeleteSampleUseCase,
  ],
  exports: [SAMPLE_REPOSITORY],
})
export class SampleModule {}
