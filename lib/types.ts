export type ChecklistItem = {
  id: string;
  label: string;
  link_url?: string | null;
  category: 'daily' | 'variable';
  condition_question_id?: string | null;
  condition_value?: boolean | null;
  show_morning: boolean;
  show_afternoon: boolean;
  show_evening: boolean;
  reset_at_shift: boolean;
  sort_order: number;
  active: boolean;
};

export type DailyAnswer = {
  date_key: string;
  interviews_tomorrow: boolean | null;
  info_sessions_tomorrow: boolean | null;
  notes: string | null;
};

export type DailyQuestion = {
  id: string;
  prompt: string;
  active: boolean;
  sort_order: number;
};

export type DailyQuestionAnswer = {
  id: string;
  date_key: string;
  question_id: string;
  answer: boolean | null;
  updated_at: string;
};

export type ChecklistEntry = {
  id: string;
  date_key: string;
  item_id: string;
  shift_key: 'morning' | 'afternoon' | 'evening' | 'day';
  completed: boolean;
  updated_at: string;
};

export type ShiftNote = {
  id: string;
  date_key: string;
  shift_key: 'morning' | 'afternoon' | 'evening';
  note: string | null;
  updated_at: string;
};

export type DailySnapshot = {
  id: string;
  date_key: string;
  answers: Record<string, boolean | null>;
  shift_notes: Record<'morning' | 'afternoon' | 'evening', string>;
  created_at: string;
};
