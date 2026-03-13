import { Injectable } from '@nestjs/common';
import { ListingModerationInput } from './moderation.types';

@Injectable()
export class ModerationPolicyService {
  private readonly categories = [
    'hang_hoa_cam',
    'spam_lua_dao',
    'noi_dung_doc_hai',
    'dieu_huong_giao_dich_ngoai_nen_tang',
  ];

  getSystemPrompt() {
    return [
      'Ban la he thong kiem duyet bai dang cho san giao dich sinh vien.',
      'Nhiem vu cua ban la danh gia rui ro noi dung van ban cua bai dang.',
      'Chi xem xet title, description, category, department.',
      'Khong duoc tu tao them chinh sach ngoai cac rule da cho.',
      'Neu thong tin khong du de ket luan vi pham, uu tien manual_review thay vi approve manh tay.',
      'Chi de xuat approve khi bai dang sach, cu the, hop ly va khong co dau hieu vi pham.',
    ].join(' ');
  }

  getPolicyPrompt() {
    return [
      'Rule moderation v1:',
      '1. hang_hoa_cam: cam hang hoa, dich vu trai phep, vat pham bi cam, noi dung co dau hieu phi phap ro rang.',
      '2. spam_lua_dao: cam noi dung spam, quang cao lap lai, thong tin danh lua, hinh thuc dat coc dang ngo, gia tri phi thuc te ro rang.',
      '3. noi_dung_doc_hai: cam noi dung thuyet minh khiem nha, thu ghet, khieu dam, bao luc ro rang.',
      '4. dieu_huong_giao_dich_ngoai_nen_tang: cam dau hieu manh ve viec ep nguoi dung lien he/giao dich ben ngoai de tranh he thong.',
      'Tra ve violations theo dung key cua rule neu vi pham.',
      'riskLevel low chi khi khong co vi pham.',
      'riskLevel medium/high khi co vi pham hoac nghi ngo can nguoi that xem.',
      'recommendedAction chi duoc la approve hoac manual_review.',
    ].join('\n');
  }

  buildUserPrompt(input: ListingModerationInput) {
    return JSON.stringify(
      {
        listingId: input.id,
        title: input.title,
        description: input.description,
        category: input.category,
        department: input.department ?? null,
        allowedViolationKeys: this.categories,
      },
      null,
      2,
    );
  }
}
