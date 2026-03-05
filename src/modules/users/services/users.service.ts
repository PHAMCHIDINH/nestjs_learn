import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { CreateUserDto } from '../dto/create-user.dto';
import { UsersRepository } from '../repositories/users.repository';
import { QueryFailedError } from 'typeorm';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  findAll() {
    return this.usersRepository.findAll();
  }

  async create(payload: CreateUserDto) {
    if (!payload?.name?.trim() || !payload?.email?.trim()) {
      throw new BadRequestException('name and email are required');
    }

    try {
      return await this.usersRepository.createAndSave(
        payload.name.trim(),
        payload.email.trim().toLowerCase(),
      );
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error as { code?: string }).code === '23505'
      ) {
        throw new ConflictException('email already exists');
      }

      throw error;
    }
  }
}
