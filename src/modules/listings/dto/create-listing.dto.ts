import {
  IsArray,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export type ListingImageInputDto =
  | string
  | {
      url: string;
      publicId?: string;
    };

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
  images?: ListingImageInputDto[];
}
