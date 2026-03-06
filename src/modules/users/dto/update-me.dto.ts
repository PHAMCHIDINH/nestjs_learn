import { Type } from 'class-transformer';
import {
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class UpdateAvatarDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2048)
  url: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  publicId?: string;
}

export class UpdateMeDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsObject()
  @ValidateNested()
  @Type(() => UpdateAvatarDto)
  avatar?: UpdateAvatarDto | null;
}
