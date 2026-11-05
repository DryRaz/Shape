-- Activity level — needed as the TDEE multiplier when suggesting calorie and
-- protein targets (see src/lib/nutritionGoals.ts) from the user's profile.

create type activity_level as enum ('sedentary', 'light', 'moderate', 'active', 'very_active');

alter table public.users add column activity_level activity_level;
