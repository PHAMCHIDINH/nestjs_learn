INSERT INTO "categories" ("id", "name", "slug", "icon")
VALUES
  ('seed-category-textbook', 'Giao trinh', 'textbook', 'book'),
  ('seed-category-electronics', 'Dien tu', 'electronics', 'laptop'),
  ('seed-category-dorm', 'Do phong tro', 'dorm', 'home'),
  ('seed-category-study', 'Dung cu hoc tap', 'study', 'pen'),
  ('seed-category-other', 'Khac', 'other', 'box')
ON CONFLICT ("slug") DO UPDATE
SET
  "name" = EXCLUDED."name",
  "icon" = EXCLUDED."icon";
