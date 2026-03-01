-- Remove duplicate "Todos" category (id=0) - this is UI-only
DELETE FROM tv_categories WHERE id = 0;
-- Remove duplicate "Documentários" (id=3, keep id=13)
UPDATE tv_channels SET categories = array_replace(categories, 3, 13) WHERE 3 = ANY(categories);
DELETE FROM tv_categories WHERE id = 3 AND name = 'Documentários';
-- Remove duplicate "Variedades" (id=7, keep id=6)
UPDATE tv_channels SET categories = array_replace(categories, 7, 6) WHERE 7 = ANY(categories);
DELETE FROM tv_categories WHERE id = 7;
-- Fix sort orders
UPDATE tv_categories SET sort_order = 3 WHERE id = 3;
UPDATE tv_categories SET sort_order = 5 WHERE id = 5;