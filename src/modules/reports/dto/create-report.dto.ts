import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateReportDto {
  @IsString()
  listingId: string;

  @IsString()
  @MinLength(5, { message: 'Vui lòng mô tả lý do báo cáo' })
  @MaxLength(500)
  reason: string;
}
