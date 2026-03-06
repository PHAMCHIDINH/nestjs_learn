import { IsEmail, IsIn, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(64)
  password: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @IsString()
  @MinLength(4)
  @MaxLength(20)
  studentId: string;

  @IsString()
  @IsIn([
    'cntt',
    'kinhtoe',
    'marketing',
    'ngoaingu',
    'luat',
    'quanly',
    'kythuat',
  ])
  department: string;
}
