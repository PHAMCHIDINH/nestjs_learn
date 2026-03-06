import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateReportDto {
  @IsString()
  listingId: string;

  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason: string;
}
