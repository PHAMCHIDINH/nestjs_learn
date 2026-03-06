import {
  BadRequestException,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '../../common/guards/auth.guard';
import { UploadsService } from './uploads.service';

const MAX_FILES = 5;
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const SUPPORTED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

type UploadedBinaryFile = {
  mimetype: string;
  buffer: Buffer;
};

@ApiTags('Uploads')
@ApiBearerAuth('bearer')
@Controller('uploads')
@UseGuards(AuthGuard)
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post('images')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Upload listing images' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
      required: ['files'],
    },
  })
  @UseInterceptors(
    FilesInterceptor('files', MAX_FILES, {
      limits: {
        fileSize: MAX_FILE_SIZE,
        files: MAX_FILES,
      },
    }),
  )
  uploadImages(@UploadedFiles() files: UploadedBinaryFile[] = []) {
    if (files.length === 0) {
      throw new BadRequestException('files is required');
    }

    this.ensureSupportedMimeTypes(files);

    return this.uploadsService.uploadImages(files);
  }

  @Post('avatar')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Upload avatar image' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
      required: ['file'],
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: MAX_FILE_SIZE,
        files: 1,
      },
    }),
  )
  uploadAvatar(@UploadedFile() file?: UploadedBinaryFile) {
    if (!file) {
      throw new BadRequestException('file is required');
    }

    this.ensureSupportedMimeTypes([file]);

    return this.uploadsService.uploadAvatar(file);
  }

  private ensureSupportedMimeTypes(files: UploadedBinaryFile[]) {
    const invalid = files.find(
      (file) => !SUPPORTED_MIME_TYPES.has(file.mimetype),
    );

    if (invalid) {
      throw new BadRequestException(
        'Unsupported file type. Allowed: image/jpeg, image/png, image/webp',
      );
    }
  }
}
