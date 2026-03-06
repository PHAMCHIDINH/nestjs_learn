import { Injectable } from '@nestjs/common';
import { CloudinaryService } from '../../core/media/cloudinary.service';

type UploadedFile = {
  buffer: Buffer;
};

@Injectable()
export class UploadsService {
  constructor(private readonly cloudinaryService: CloudinaryService) {}

  async uploadImages(files: UploadedFile[]) {
    const uploads = await Promise.all(
      files.map((file) => this.cloudinaryService.uploadImage(file.buffer)),
    );

    return {
      data: uploads,
    };
  }

  async uploadAvatar(file: UploadedFile) {
    const folder =
      process.env.CLOUDINARY_AVATAR_FOLDER || 'cho-sinh-vien/avatars';
    const upload = await this.cloudinaryService.uploadImage(
      file.buffer,
      folder,
    );

    return {
      data: upload,
    };
  }
}
