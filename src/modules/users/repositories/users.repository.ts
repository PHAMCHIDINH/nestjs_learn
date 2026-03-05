import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';

export class UsersRepository {
  constructor(
    @InjectRepository(User)
    private readonly repository: Repository<User>,
  ) {}

  findAll(): Promise<User[]> {
    return this.repository.find({
      order: {
        createdAt: 'DESC',
      },
    });
  }

  async createAndSave(name: string, email: string): Promise<User> {
    const entity = this.repository.create({ name, email });
    return this.repository.save(entity);
  }
}
