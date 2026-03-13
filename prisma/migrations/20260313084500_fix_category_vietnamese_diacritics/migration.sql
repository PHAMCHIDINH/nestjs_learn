UPDATE "categories"
SET "name" = CASE "slug"
  WHEN 'textbook' THEN 'Giáo trình'
  WHEN 'electronics' THEN 'Điện tử'
  WHEN 'dorm' THEN 'Đồ phòng trọ'
  WHEN 'study' THEN 'Dụng cụ học tập'
  WHEN 'other' THEN 'Khác'
  ELSE "name"
END
WHERE "slug" IN ('textbook', 'electronics', 'dorm', 'study', 'other');
