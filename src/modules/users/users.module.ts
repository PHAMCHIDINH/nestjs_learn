import { Module } from '@nestjs/common';
import { MediaModule } from '../../core/media/media.module';
import { ListingsModule } from '../listings/listings.module';
import { UsersController } from './controllers/users.controller';
import { UsersService } from './services/users.service';

@Module({
  imports: [MediaModule, ListingsModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
