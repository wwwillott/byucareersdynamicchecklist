# BYU Careers Dynamic Checklist

A real-time team checklist that refreshes nightly at midnight (Mountain Time). Built with Next.js + Supabase so it stays free/low-cost while syncing for everyone.

## Quick start

1. Create a Supabase project (free tier).
2. Run the SQL in the **Database Setup** section below.
3. Copy `.env.local.example` to `.env.local` and fill in your keys.
4. Install and run:

```bash
npm install
npm run dev
```

## Database setup (Supabase SQL editor)

```sql
-- Checklist items that persist across days
create table if not exists checklist_items (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  link_url text,
  category text not null check (category in ('daily', 'variable', 'today_only')),
  condition_question_id uuid null,
  condition_value boolean,
  condition_source text not null default 'today' check (condition_source in ('today', 'yesterday')),
  show_morning boolean not null default true,
  show_afternoon boolean not null default false,
  show_evening boolean not null default false,
  reset_at_shift boolean not null default false,
  one_time_date_key text,
  sort_order integer not null default 0,
  active boolean not null default true,
  inserted_at timestamptz not null default now()
);

-- Daily questions that unlock variable items
create table if not exists daily_questions (
  id uuid primary key default gen_random_uuid(),
  prompt text not null,
  active boolean not null default true,
  sort_order integer not null default 0,
  inserted_at timestamptz not null default now()
);

create table if not exists daily_question_answers (
  id uuid primary key default gen_random_uuid(),
  date_key text not null,
  question_id uuid not null references daily_questions(id) on delete cascade,
  answer boolean,
  updated_at timestamptz not null default now(),
  unique (date_key, question_id)
);

create table if not exists shift_notes (
  id uuid primary key default gen_random_uuid(),
  date_key text not null,
  shift_key text not null check (shift_key in ('morning', 'afternoon', 'evening')),
  note text,
  updated_at timestamptz not null default now(),
  unique (date_key, shift_key)
);

-- Daily snapshots (yesterday backup)
create table if not exists daily_snapshots (
  id uuid primary key default gen_random_uuid(),
  date_key text not null unique,
  answers jsonb not null default '{}'::jsonb,
  shift_notes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Shift-specific notes
create table if not exists shift_notes (
  id uuid primary key default gen_random_uuid(),
  date_key text not null,
  shift_key text not null check (shift_key in ('morning', 'afternoon', 'evening')),
  note text,
  updated_at timestamptz not null default now(),
  unique (date_key, shift_key)
);

-- Daily checklist completion state
create table if not exists checklist_entries (
  id uuid primary key default gen_random_uuid(),
  date_key text not null,
  item_id uuid not null references checklist_items(id) on delete cascade,
  shift_key text not null check (shift_key in ('morning', 'afternoon', 'evening', 'day')) default 'day',
  completed boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (date_key, item_id, shift_key)
);

create index if not exists checklist_entries_date_key_idx on checklist_entries(date_key);

-- Realtime changes
alter publication supabase_realtime add table checklist_items;
alter publication supabase_realtime add table daily_questions;
alter publication supabase_realtime add table daily_question_answers;
alter publication supabase_realtime add table shift_notes;
alter publication supabase_realtime add table daily_snapshots;
alter publication supabase_realtime add table checklist_entries;
```

### If you already created the tables

Run this to add multi-shift toggles and dynamic questions:

```sql
alter table checklist_items add column if not exists link_url text;
alter table checklist_items add column if not exists condition_question_id uuid;
alter table checklist_items add column if not exists condition_value boolean;
alter table checklist_items add column if not exists condition_source text not null default 'today';
alter table checklist_items add column if not exists show_morning boolean not null default true;
alter table checklist_items add column if not exists show_afternoon boolean not null default false;
alter table checklist_items add column if not exists show_evening boolean not null default false;
alter table checklist_items add column if not exists reset_at_shift boolean not null default false;
alter table checklist_items add column if not exists one_time_date_key text;

alter table checklist_entries add column if not exists shift_key text not null default 'day';
update checklist_entries set shift_key = 'day' where shift_key is null;

drop index if exists checklist_entries_date_key_idx;
create index if not exists checklist_entries_date_key_idx on checklist_entries(date_key);

alter table checklist_entries drop constraint if exists checklist_entries_date_key_item_id_key;
alter table checklist_entries add constraint checklist_entries_unique_shift unique (date_key, item_id, shift_key);

-- New tables for dynamic questions
create table if not exists daily_questions (
  id uuid primary key default gen_random_uuid(),
  prompt text not null,
  active boolean not null default true,
  sort_order integer not null default 0,
  inserted_at timestamptz not null default now()
);

create table if not exists daily_question_answers (
  id uuid primary key default gen_random_uuid(),
  date_key text not null,
  question_id uuid not null references daily_questions(id) on delete cascade,
  answer boolean,
  updated_at timestamptz not null default now(),
  unique (date_key, question_id)
);

create table if not exists shift_notes (
  id uuid primary key default gen_random_uuid(),
  date_key text not null,
  shift_key text not null check (shift_key in ('morning', 'afternoon', 'evening')),
  note text,
  updated_at timestamptz not null default now(),
  unique (date_key, shift_key)
);

create table if not exists daily_snapshots (
  id uuid primary key default gen_random_uuid(),
  date_key text not null unique,
  answers jsonb not null default '{}'::jsonb,
  shift_notes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
```

## Public access policies

This app is intentionally public (no login). Turn on Row Level Security and add these policies so the anon key can read/write.

```sql
alter table checklist_items enable row level security;
alter table daily_questions enable row level security;
alter table daily_question_answers enable row level security;
alter table shift_notes enable row level security;
alter table daily_snapshots enable row level security;
alter table checklist_entries enable row level security;

create policy "Public read items" on checklist_items for select using (true);
create policy "Public edit items" on checklist_items for insert with check (true);
create policy "Public update items" on checklist_items for update using (true);

create policy "Public read questions" on daily_questions for select using (true);
create policy "Public edit questions" on daily_questions for insert with check (true);
create policy "Public update questions" on daily_questions for update using (true);

create policy "Public read answers" on daily_question_answers for select using (true);
create policy "Public edit answers" on daily_question_answers for insert with check (true);
create policy "Public update answers" on daily_question_answers for update using (true);

create policy "Public read shift notes" on shift_notes for select using (true);
create policy "Public edit shift notes" on shift_notes for insert with check (true);
create policy "Public update shift notes" on shift_notes for update using (true);

create policy "Public read snapshots" on daily_snapshots for select using (true);
create policy "Public edit snapshots" on daily_snapshots for insert with check (true);
create policy "Public update snapshots" on daily_snapshots for update using (true);

create policy "Public read entries" on checklist_entries for select using (true);
create policy "Public edit entries" on checklist_entries for insert with check (true);
create policy "Public update entries" on checklist_entries for update using (true);
```

## Notes

- The app uses a Mountain Time date key (`yyyy-MM-dd`) so the checklist resets at midnight MT regardless of where users are.
- Variable checklist items can be tied to any daily question. They only appear once the question is answered for the day.
- Checklist items can be shown in multiple shifts. Items from earlier shifts carry forward as the day progresses.
- Items marked **Reset at shift change** will uncheck when the next shift starts.
- **Today only** items appear just for the current date and then disappear automatically.
- Variable items can optionally use **yesterday's** answers (snapshot) instead of today.
- Anyone can edit checklist items mid-day.
- Default shift times: Morning 6:00–11:59, Afternoon 12:00–17:59, Evening 18:00–5:59 (Mountain Time). Update `lib/date.ts` if you want different hours.

If you want richer roles later (editor vs viewer), we can add authentication and RLS policies without changing the UI much.
