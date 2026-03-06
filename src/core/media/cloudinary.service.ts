import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';

type UploadResult = {
  secure_url?: string;
  public_id?: string;
};

@Injectable()
export class CloudinaryService {
  constructor() {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
  }

  async uploadImage(buffer: Buffer, folder?: string) {
    this.ensureConfig();

    const result = await new Promise<UploadResult>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: folder || process.env.CLOUDINARY_FOLDER || 'cho-sinh-vien/listings',
          resource_type: 'image',
        },
        (error, uploadResult) => {
          if (error) {
            reject(error);
            return;
          }

          resolve(uploadResult ?? {});
        },
      );

      stream.end(buffer);
    }).catch((error: unknown) => {
      throw new InternalServerErrorException(
        error instanceof Error ? error.message : 'Cloudinary upload failed',
      );
    });

    if (!result.secure_url || !result.public_id) {
      throw new InternalServerErrorException('Cloudinary upload failed');
    }

    return {
      url: result.secure_url,
      publicId: result.public_id,
    };
  }

  async destroyImage(publicId: string) {
    if (!publicId) {
      return;
    }

    this.ensureConfig();

    await cloudinary.uploader
      .destroy(publicId, {
        resource_type: 'image',
      })
      .catch((error: unknown) => {
        throw new InternalServerErrorException(
          error instanceof Error ? error.message : 'Cloudinary destroy failed',
        );
      });
  }

  private ensureConfig() {
    const missing = [
      ['CLOUDINARY_CLOUD_NAME', process.env.CLOUDINARY_CLOUD_NAME],
      ['CLOUDINARY_API_KEY', process.env.CLOUDINARY_API_KEY],
      ['CLOUDINARY_API_SECRET', process.env.CLOUDINARY_API_SECRET],
    ].filter(([, value]) => !value);

    if (missing.length > 0) {
      throw new BadRequestException(
        `Missing cloudinary config: ${missing.map(([key]) => key).join(', ')}`,
      );
    }
  }
}
