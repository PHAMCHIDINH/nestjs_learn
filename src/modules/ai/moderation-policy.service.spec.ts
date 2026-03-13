import { ModerationPolicyService } from './moderation-policy.service';

describe('ModerationPolicyService', () => {
  const service = new ModerationPolicyService();

  it('includes the moderation rules in the policy prompt', () => {
    const prompt = service.getPolicyPrompt();

    expect(prompt).toContain('hang_hoa_cam');
    expect(prompt).toContain('spam_lua_dao');
    expect(prompt).toContain('noi_dung_doc_hai');
    expect(prompt).toContain('dieu_huong_giao_dich_ngoai_nen_tang');
  });

  it('serializes listing data for the model prompt', () => {
    const prompt = service.buildUserPrompt({
      id: 'listing-1',
      title: 'Laptop cu',
      description: 'Mo ta ro rang, khong spam.',
      category: 'electronics',
      department: 'cntt',
    });

    expect(prompt).toContain('"listingId": "listing-1"');
    expect(prompt).toContain('"category": "electronics"');
    expect(prompt).toContain('"allowedViolationKeys"');
  });
});
