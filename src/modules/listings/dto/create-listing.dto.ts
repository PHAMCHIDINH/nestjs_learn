import {
  IsArray,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateListingDto {
  @IsString()
  @MinLength(5)
  @MaxLength(150)
  title: string;

  @IsString()
  @MinLength(20)
  @MaxLength(2000)
  description: string;

  @IsInt()
  @IsPositive()
  price: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  originalPrice?: number;

  @IsString()
  condition: string;

  @IsString()
  category: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsArray()
  @IsUrl({}, { each: true })
  images?: string[];
}
