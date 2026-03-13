import { Module } from '@nestjs/common';
import { MediaModule } from '../../core/media/media.module';
import { AiModule } from '../ai/ai.module';
import { ListingsController } from './listings.controller';
import { ListingsService } from './listings.service';

@Module({
  imports: [MediaModule, AiModule],
  controllers: [ListingsController],
  providers: [ListingsService],
  exports: [ListingsService],
})
export class ListingsModule {}
