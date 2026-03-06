import { Module } from '@nestjs/common';
import { MediaModule } from '../../core/media/media.module';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';

@Module({
  imports: [MediaModule],
  controllers: [UploadsController],
  providers: [UploadsService],
})
export class UploadsModule {}
