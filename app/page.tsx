'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  currentMountainShift,
  formatMountainDate,
  mountainDateKey,
  nextBusinessDateKey,
  nextBusinessWeekday,
  shiftLabel,
  SHIFT_ORDER,
  type ShiftKey,
  yesterdayMountainDateKey,
  isMountainWeekend,
  isMountainFriday
} from '@/lib/date';
import type {
  ChecklistEntry,
  ChecklistItem,
  DailySnapshot,
  DailyQuestion,
  DailyQuestionAnswer,
  ShiftNote
} from '@/lib/types';

type ItemDraft = {
  label: string;
  link_url: string;
  category: 'daily' | 'variable' | 'today_only';
  condition_question_id: string;
  condition_value: boolean;
  condition_source: 'today' | 'yesterday';
  show_morning: boolean;
  show_afternoon: boolean;
  show_evening: boolean;
  reset_at_shift: boolean;
};
type QuestionDraft = {
  prompt: string;
};

export default function HomePage() {
  const dateKey = useMemo(() => mountainDateKey(), []);
  const nextBusinessKey = useMemo(() => nextBusinessDateKey(), []);
  const yesterdayKey = useMemo(() => yesterdayMountainDateKey(), []);
  const isWeekend = useMemo(() => isMountainWeekend(), []);
  const isFriday = useMemo(() => isMountainFriday(), []);
  const [activeShift, setActiveShift] = useState<ShiftKey>(() => currentMountainShift());
  const [manualShift, setManualShift] = useState(false);
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [questions, setQuestions] = useState<DailyQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, DailyQuestionAnswer>>({});
  const [entries, setEntries] = useState<Record<string, ChecklistEntry>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [shiftNotes, setShiftNotes] = useState<Record<ShiftKey, string>>({
    morning: '',
    afternoon: '',
    evening: ''
  });
  const [notesShift, setNotesShift] = useState<ShiftKey>('morning');
  const [savingNotes, setSavingNotes] = useState(false);
  const [snapshotExists, setSnapshotExists] = useState(true);
  const [snapshotDismissed, setSnapshotDismissed] = useState(false);
  const [savingSnapshot, setSavingSnapshot] = useState(false);
  const [yesterdayAnswers, setYesterdayAnswers] = useState<Record<string, boolean | null>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState<ItemDraft>({
    label: '',
    link_url: '',
    category: 'daily',
    condition_question_id: '',
    condition_value: true,
    condition_source: 'today',
    show_morning: true,
    show_afternoon: false,
    show_evening: false,
    reset_at_shift: false
  });
  const [questionDraft, setQuestionDraft] = useState<QuestionDraft>({ prompt: '' });

  const activeQuestions = useMemo(
    () => questions.filter((question) => question.active),
    [questions]
  );

  const unresolvedQuestions = activeQuestions.filter((question) => {
    const answer = answers[question.id];
    return !answer || answer.answer === null;
  });

  const nextBusinessLabel = useMemo(() => formatMountainDate(nextBusinessKey), [nextBusinessKey]);
  const nextBusinessWeekdayLabel = useMemo(() => nextBusinessWeekday(), []);

  useEffect(() => {
    document.body.dataset.shift = activeShift;
    return () => {
      delete document.body.dataset.shift;
    };
  }, [activeShift]);

  useEffect(() => {
    const dismissed = window.localStorage.getItem(`snapshot-dismissed-${yesterdayKey}`);
    setSnapshotDismissed(Boolean(dismissed));
  }, [yesterdayKey]);

  useEffect(() => {
    if (manualShift) return undefined;
    const interval = window.setInterval(() => {
      setActiveShift(currentMountainShift());
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [manualShift]);

  const visibleItems = useMemo(() => {
    return items
      .filter((item) => {
        if (!item.active) return false;
        if (item.one_time_date_key && item.one_time_date_key !== dateKey) return false;
        const enabledShifts: ShiftKey[] = [];
        if (item.show_morning) enabledShifts.push('morning');
        if (item.show_afternoon) enabledShifts.push('afternoon');
        if (item.show_evening) enabledShifts.push('evening');
        if (enabledShifts.length === 0) return false;

        if (item.category === 'variable') {
          if (!item.condition_question_id || item.condition_value === null) return false;
          const source = item.condition_source ?? 'today';
          const answer =
            source === 'yesterday'
              ? { answer: yesterdayAnswers[item.condition_question_id] ?? null }
              : answers[item.condition_question_id];
          if (!answer || answer.answer === null) return false;
          if (answer.answer !== item.condition_value) return false;
        }

        if (item.reset_at_shift) {
          return enabledShifts.includes(activeShift);
        }

        const earliestShiftOrder = Math.min(
          ...enabledShifts.map((shift) => SHIFT_ORDER[shift])
        );
        return earliestShiftOrder <= SHIFT_ORDER[activeShift];
      })
      .sort((a, b) => {
        const aShiftOrder = Math.min(
          ...(a.show_morning ? [SHIFT_ORDER.morning] : []),
          ...(a.show_afternoon ? [SHIFT_ORDER.afternoon] : []),
          ...(a.show_evening ? [SHIFT_ORDER.evening] : [])
        );
        const bShiftOrder = Math.min(
          ...(b.show_morning ? [SHIFT_ORDER.morning] : []),
          ...(b.show_afternoon ? [SHIFT_ORDER.afternoon] : []),
          ...(b.show_evening ? [SHIFT_ORDER.evening] : [])
        );
        const shiftSort = aShiftOrder - bShiftOrder;
        if (shiftSort !== 0) return shiftSort;
        return a.sort_order - b.sort_order;
      });
  }, [items, answers, activeShift]);

  const completedCount = visibleItems.filter((item) => {
    const entryKey = item.reset_at_shift ? `${item.id}:${activeShift}` : `${item.id}:day`;
    return entries[entryKey]?.completed;
  }).length;

  useEffect(() => {
    let mounted = true;

    async function loadData() {
      setLoading(true);

      const [
        { data: itemData, error: itemError },
        { data: questionData, error: questionError },
        { data: answerData, error: answerError },
        { data: entryData },
        { data: notesData, error: notesError },
        { data: snapshotData, error: snapshotError }
      ] = await Promise.all([
        supabase.from('checklist_items').select('*').order('sort_order', { ascending: true }),
        supabase.from('daily_questions').select('*').order('sort_order', { ascending: true }),
        supabase.from('daily_question_answers').select('*').eq('date_key', dateKey),
        supabase.from('checklist_entries').select('*').eq('date_key', dateKey),
        supabase.from('shift_notes').select('*').eq('date_key', dateKey),
        supabase.from('daily_snapshots').select('*').eq('date_key', yesterdayKey).maybeSingle()
      ]);

      if (!mounted) return;

      if (itemError) {
        console.error(itemError);
      }
      if (questionError) {
        console.error(questionError);
      }
      if (answerError) {
        console.error(answerError);
      }
      if (notesError) {
        console.error(notesError);
      }
      if (snapshotError) {
        console.error(snapshotError);
      }

      setItems(itemData || []);
      setQuestions(questionData || []);

      const answerMap: Record<string, DailyQuestionAnswer> = {};
      (answerData || []).forEach((answer) => {
        answerMap[answer.question_id] = answer;
      });
      setAnswers(answerMap);

      const map: Record<string, ChecklistEntry> = {};
      (entryData || []).forEach((entry) => {
        const key = `${entry.item_id}:${entry.shift_key}`;
        map[key] = entry;
      });
      setEntries(map);

      const notesMap: Record<ShiftKey, string> = {
        morning: '',
        afternoon: '',
        evening: ''
      };
      (notesData || []).forEach((note) => {
        notesMap[note.shift_key as ShiftKey] = note.note ?? '';
      });
      setShiftNotes(notesMap);
      setSnapshotExists(Boolean(snapshotData));
      setYesterdayAnswers((snapshotData?.answers as Record<string, boolean | null>) ?? {});
      setLoading(false);
    }

    loadData();

    const channel = supabase
      .channel('checklist')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'checklist_entries' },
        (payload) => {
          const entry = payload.new as ChecklistEntry;
          if (entry.date_key !== dateKey) return;
          const key = `${entry.item_id}:${entry.shift_key}`;
          setEntries((prev) => ({ ...prev, [key]: entry }));
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'daily_question_answers' },
        (payload) => {
          const next = payload.new as DailyQuestionAnswer;
          if (next.date_key !== dateKey) return;
          setAnswers((prev) => ({ ...prev, [next.question_id]: next }));
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'checklist_items' },
        (payload) => {
          const next = payload.new as ChecklistItem;
          setItems((prev) => {
            const existing = prev.find((item) => item.id === next.id);
            const updated = existing
              ? prev.map((item) => (item.id === next.id ? next : item))
              : [...prev, next];
            return updated.sort((a, b) => a.sort_order - b.sort_order);
          });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'daily_questions' },
        (payload) => {
          const next = payload.new as DailyQuestion;
          setQuestions((prev) => {
            const existing = prev.find((question) => question.id === next.id);
            const updated = existing
              ? prev.map((question) => (question.id === next.id ? next : question))
              : [...prev, next];
            return updated.sort((a, b) => a.sort_order - b.sort_order);
          });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shift_notes' },
        (payload) => {
          const next = payload.new as ShiftNote;
          if (next.date_key !== dateKey) return;
          setShiftNotes((prev) => ({
            ...prev,
            [next.shift_key]: next.note ?? ''
          }));
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [dateKey, yesterdayKey]);

  async function answerQuestion(questionId: string, value: boolean) {
    setSaving(true);

    const { data, error } = await supabase
      .from('daily_question_answers')
      .upsert(
        {
          date_key: dateKey,
          question_id: questionId,
          answer: value
        },
        { onConflict: 'date_key,question_id' }
      )
      .select()
      .single();

    if (error) {
      console.error(error);
    } else if (data) {
      setAnswers((prev) => ({ ...prev, [data.question_id]: data }));
    }
    setSaving(false);
  }

  async function toggleItem(item: ChecklistItem, checked: boolean) {
    const key = item.reset_at_shift ? `${item.id}:${activeShift}` : `${item.id}:day`;
    const shiftKey = item.reset_at_shift ? activeShift : 'day';

    setEntries((prev) => ({
      ...prev,
      [key]: prev[key]
        ? { ...prev[key], completed: checked }
        : {
            id: crypto.randomUUID(),
            item_id: item.id,
            date_key: dateKey,
            shift_key: shiftKey,
            completed: checked,
            updated_at: new Date().toISOString()
          }
    }));

    const { error } = await supabase
      .from('checklist_entries')
      .upsert(
        {
          item_id: item.id,
          date_key: dateKey,
          shift_key: shiftKey,
          completed: checked
        },
        { onConflict: 'date_key,item_id,shift_key' }
      );

    if (error) {
      console.error(error);
    }
  }

  async function addItem() {
    if (!draft.label.trim()) return;
    setSaving(true);
    setErrorMessage(null);

    const maxSort = items.length ? Math.max(...items.map((item) => item.sort_order)) : 0;
    const noShiftSelected = !draft.show_morning && !draft.show_afternoon && !draft.show_evening;
    const showMorning = noShiftSelected ? true : draft.show_morning;
    const showAfternoon = noShiftSelected ? false : draft.show_afternoon;
    const showEvening = noShiftSelected ? false : draft.show_evening;

    const { data, error } = await supabase
      .from('checklist_items')
      .insert({
        label: draft.label.trim(),
        link_url: draft.link_url.trim() ? draft.link_url.trim() : null,
        category: draft.category,
        one_time_date_key: draft.category === 'today_only' ? dateKey : null,
        condition_question_id:
          draft.category === 'daily' ||
          draft.category === 'today_only' ||
          draft.condition_question_id === ''
            ? null
            : draft.condition_question_id,
        condition_value:
          draft.category === 'daily' || draft.category === 'today_only'
            ? null
            : draft.condition_value,
        condition_source: draft.category === 'variable' ? draft.condition_source : 'today',
        show_morning: showMorning,
        show_afternoon: showAfternoon,
        show_evening: showEvening,
        reset_at_shift: draft.reset_at_shift,
        sort_order: maxSort + 1,
        active: true
      })
      .select()
      .single();

    if (error) {
      console.error(error);
      setErrorMessage(error.message ?? 'Failed to add checklist item.');
    } else if (data) {
      setItems((prev) => [...prev, data].sort((a, b) => a.sort_order - b.sort_order));
      setDraft({
        label: '',
        link_url: '',
        category: 'daily',
        condition_question_id: '',
        condition_value: true,
        condition_source: 'today',
        show_morning: true,
        show_afternoon: false,
        show_evening: false,
        reset_at_shift: false
      });
    }

    setSaving(false);
  }

  async function updateItem(itemId: string, changes: Partial<ChecklistItem>) {
    const nextChanges = {
      ...changes,
      link_url:
        typeof changes.link_url === 'string' && changes.link_url.trim() === ''
          ? null
          : changes.link_url
    };
    setItems((prev) => prev.map((item) => (item.id === itemId ? { ...item, ...nextChanges } : item)));
    const { error } = await supabase.from('checklist_items').update(nextChanges).eq('id', itemId);
    if (error) {
      console.error(error);
      setErrorMessage(error.message ?? 'Failed to update checklist item.');
    }
  }

  async function addQuestion() {
    if (!questionDraft.prompt.trim()) return;
    setSaving(true);
    setErrorMessage(null);

    const maxSort = questions.length
      ? Math.max(...questions.map((question) => question.sort_order))
      : 0;

    const { data, error } = await supabase
      .from('daily_questions')
      .insert({
        prompt: questionDraft.prompt.trim(),
        sort_order: maxSort + 1,
        active: true
      })
      .select()
      .single();

    if (error) {
      console.error(error);
      setErrorMessage(error.message ?? 'Failed to add question.');
    } else if (data) {
      setQuestions((prev) => [...prev, data].sort((a, b) => a.sort_order - b.sort_order));
      setQuestionDraft({ prompt: '' });
    }

    setSaving(false);
  }

  async function updateQuestion(questionId: string, changes: Partial<DailyQuestion>) {
    setQuestions((prev) =>
      prev.map((question) => (question.id === questionId ? { ...question, ...changes } : question))
    );
    const { error } = await supabase.from('daily_questions').update(changes).eq('id', questionId);
    if (error) {
      console.error(error);
      setErrorMessage(error.message ?? 'Failed to update question.');
    }
  }

  async function saveShiftNote() {
    setSavingNotes(true);
    setErrorMessage(null);
    const note = shiftNotes[notesShift] ?? '';
    const { error } = await supabase
      .from('shift_notes')
      .upsert(
        {
          date_key: dateKey,
          shift_key: notesShift,
          note: note.trim() ? note : null
        },
        { onConflict: 'date_key,shift_key' }
      );
    if (error) {
      console.error(error);
      setErrorMessage(error.message ?? 'Failed to save shift notes.');
    }
    setSavingNotes(false);
  }

  async function saveYesterdaySnapshot() {
    setSavingSnapshot(true);
    setErrorMessage(null);
    const [{ data: answersData, error: answersError }, { data: notesData, error: notesError }] =
      await Promise.all([
        supabase.from('daily_question_answers').select('*').eq('date_key', yesterdayKey),
        supabase.from('shift_notes').select('*').eq('date_key', yesterdayKey)
      ]);

    if (answersError) {
      console.error(answersError);
    }
    if (notesError) {
      console.error(notesError);
    }

    const answersPayload: Record<string, boolean | null> = {};
    (answersData || []).forEach((answer) => {
      answersPayload[answer.question_id] = answer.answer;
    });

    const notesPayload: Record<ShiftKey, string> = {
      morning: '',
      afternoon: '',
      evening: ''
    };
    (notesData || []).forEach((note) => {
      notesPayload[note.shift_key as ShiftKey] = note.note ?? '';
    });

    const { error } = await supabase
      .from('daily_snapshots')
      .upsert(
        {
          date_key: yesterdayKey,
          answers: answersPayload,
          shift_notes: notesPayload
        },
        { onConflict: 'date_key' }
      );

    if (error) {
      console.error(error);
      setErrorMessage(error.message ?? 'Failed to save yesterday snapshot.');
    } else {
      setSnapshotExists(true);
      setSnapshotDismissed(false);
      window.localStorage.removeItem(`snapshot-dismissed-${yesterdayKey}`);
    }

    await supabase.from('daily_snapshots').delete().lt('date_key', yesterdayKey);

    setSavingSnapshot(false);
  }

  function exportCsv() {
    const headers = [
      'Item',
      'Completed',
      'Shifts',
      'Reset at Shift Change',
      'Conditional'
    ];

    const rows = visibleItems.map((item) => {
      const entryKey = item.reset_at_shift ? `${item.id}:${activeShift}` : `${item.id}:day`;
      const completed = entries[entryKey]?.completed ?? false;
      const shifts = [
        item.show_morning ? 'Morning' : null,
        item.show_afternoon ? 'Afternoon' : null,
        item.show_evening ? 'Evening' : null
      ]
        .filter(Boolean)
        .join(' / ');

      return [
        item.label,
        completed ? 'Yes' : 'No',
        shifts,
        item.reset_at_shift ? 'Yes' : 'No',
        item.condition_question_id ? 'Yes' : 'No'
      ];
    });

    const csv = [headers, ...rows]
      .map((row) =>
        row
          .map((cell) => `"${String(cell).replaceAll('"', '""')}"`)
          .join(',')
      )
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `checklist-${dateKey}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }

  return (
    <main className="main">
      <section className="hero">
        <div className="badge">BYU Careers · Team Checklist</div>
        <h1>Daily Checklist</h1>
        <p>
          Refreshes nightly at midnight (Mountain Time). Today is{' '}
          <strong>{formatMountainDate(dateKey)}</strong>.
        </p>
        {errorMessage ? <div className="notice">{errorMessage}</div> : null}
        {!snapshotExists && !snapshotDismissed ? (
          <div className="notice">
            It looks like you haven&apos;t saved a copy of yesterday&apos;s responses yet. Would you
            like to do that now?
            <div className="hero-actions" style={{ marginTop: 10 }}>
              <button className="button" onClick={saveYesterdaySnapshot} disabled={savingSnapshot}>
                {savingSnapshot ? 'Saving...' : 'Save copy'}
              </button>
              <button
                className="button secondary"
                onClick={() => {
                  window.localStorage.setItem(`snapshot-dismissed-${yesterdayKey}`, 'true');
                  setSnapshotDismissed(true);
                }}
              >
                Not now
              </button>
            </div>
          </div>
        ) : null}
        <div className="notice">
          Team sync is live. Any edits or check-offs you make update in real time for everyone.
        </div>
        <div className="hero-actions no-print">
          <button
            className="button secondary"
            disabled={isWeekend}
            onClick={() => setShowEditor((prev) => !prev)}
          >
            {showEditor ? 'Close checklist editor' : 'Edit checklist'}
          </button>
          <button className="button secondary" onClick={exportCsv}>
            Export CSV
          </button>
          <button className="button secondary" onClick={() => window.print()}>
            Print
          </button>
        </div>
        {isWeekend ? <div className="meta">Editor and checklist resume on weekdays.</div> : null}
        <div className="shift-toggle">
          <div className="meta">Shift on the clock</div>
          <div className="toggle-row">
            {(['morning', 'afternoon', 'evening'] as ShiftKey[]).map((shift) => (
              <button
                key={shift}
                className={`button ${activeShift === shift ? '' : 'secondary'}`}
                onClick={() => {
                  setActiveShift(shift);
                  setManualShift(true);
                }}
              >
                {shiftLabel(shift)}
              </button>
            ))}
            <button
              className="button secondary"
              onClick={() => {
                setActiveShift(currentMountainShift());
                setManualShift(false);
              }}
            >
              Use clock
            </button>
          </div>
          <div className="meta">
            Morning → Afternoon → Evening. Earlier shift items carry forward until completed.
          </div>
          {manualShift ? (
            <div className="meta">Shift is manually set. Click “Use clock” to return to auto.</div>
          ) : null}
        </div>
      </section>

      {isWeekend ? (
        <section className="grid">
          <div className="card">
            <h2>Weekend Mode</h2>
            <div className="notice">
              The checklist doesn&apos;t run on Saturdays or Sundays. It will resume on{' '}
              <strong>{nextBusinessLabel}</strong>.
            </div>
          </div>
        </section>
      ) : (
        <section className="grid">
        {unresolvedQuestions.length > 0 ? (
          <div className="card">
            <h2>Start of Day Questions</h2>
            <div className="meta">Answer these once per day to unlock the right checklist items.</div>
            {isFriday ? <div className="meta">Tomorrow = {nextBusinessLabel}</div> : null}
            {unresolvedQuestions.map((question) => (
              <div className="check-item" key={question.id}>
                <div>
                  <strong>
                    {question.prompt}
                    {isFriday ? <span className="tag">{nextBusinessWeekdayLabel}</span> : null}
                  </strong>
                  <div className="meta">Your answers unlock the right checklist items.</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="button"
                    disabled={saving}
                    onClick={() => answerQuestion(question.id, true)}
                  >
                    Yes
                  </button>
                  <button
                    className="button secondary"
                    disabled={saving}
                    onClick={() => answerQuestion(question.id, false)}
                  >
                    No
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <div className="card">
          <h2>Today&apos;s Progress</h2>
          <div className="meta">
            <span className="count">{completedCount}</span> of {visibleItems.length} items done.
          </div>
          <div className="checklist">
            {loading && <div className="meta">Loading checklist...</div>}
            {!loading && visibleItems.length === 0 && (
              <div className="notice">No checklist items for today yet.</div>
            )}
            {visibleItems.map((item) => {
              const entryKey = item.reset_at_shift ? `${item.id}:${activeShift}` : `${item.id}:day`;
              const completed = entries[entryKey]?.completed ?? false;
              return (
                <label className={`check-item ${completed ? 'completed' : ''}`} key={item.id}>
                  <input
                    type="checkbox"
                    checked={completed}
                    onChange={(event) => toggleItem(item, event.target.checked)}
                  />
                  <div>
                    {item.link_url ? (
                      <a
                        className="item-link"
                        href={item.link_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {item.label}
                      </a>
                    ) : (
                      <div>{item.label}</div>
                    )}
                    <div className="meta">
                      {item.category === 'daily'
                        ? 'Daily'
                        : item.category === 'today_only'
                        ? 'Today only'
                        : 'Variable'}
                      {item.show_morning ? <span className="tag">Morning</span> : null}
                      {item.show_afternoon ? <span className="tag">Afternoon</span> : null}
                      {item.show_evening ? <span className="tag">Evening</span> : null}
                      {item.reset_at_shift ? <span className="tag">Resets</span> : null}
                      {item.condition_question_id ? (
                        <span className="tag">
                          {item.condition_source === 'yesterday' ? 'Yesterday' : 'Today'}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        <div className="card">
          <h2>Shift Notes</h2>
          <div className="meta">Keep handoff notes by shift. Everyone sees updates live.</div>
          <div className="toggle-row">
            {(['morning', 'afternoon', 'evening'] as ShiftKey[]).map((shift) => (
              <button
                key={shift}
                className={`button ${notesShift === shift ? '' : 'secondary'}`}
                onClick={() => setNotesShift(shift)}
              >
                {shiftLabel(shift)}
              </button>
            ))}
          </div>
          <textarea
            className="textarea"
            rows={6}
            placeholder={`Notes for ${shiftLabel(notesShift)} shift`}
            value={shiftNotes[notesShift]}
            onChange={(event) =>
              setShiftNotes((prev) => ({ ...prev, [notesShift]: event.target.value }))
            }
          />
          <button className="button" onClick={saveShiftNote} disabled={savingNotes}>
            Save notes
          </button>
        </div>
      </section>
      )}

      {showEditor ? (
        <>
          <section className="grid no-print">
            <div className="card">
              <div className="row-between">
                <div>
                  <h2>Add Checklist Item</h2>
                  <div className="meta">Use the plus to add a new item.</div>
                </div>
                <button
                  className="icon-button"
                  aria-label="Add checklist item"
                  onClick={() => setShowAddForm((prev) => !prev)}
                >
                  +
                </button>
              </div>
              {showAddForm ? (
                <>
                  <div className="split">
                    <div>
                      <label className="meta">Item label</label>
                      <input
                        className="input"
                        placeholder="Follow up with XYZ"
                        value={draft.label}
                        onChange={(event) =>
                          setDraft((prev) => ({ ...prev, label: event.target.value }))
                        }
                      />
                    </div>
                    <div>
                      <label className="meta">Link (optional)</label>
                      <input
                        className="input"
                        placeholder="https://..."
                        value={draft.link_url}
                        onChange={(event) =>
                          setDraft((prev) => ({ ...prev, link_url: event.target.value }))
                        }
                      />
                    </div>
                  </div>
                  <div className="split">
                    <div>
                      <label className="meta">Category</label>
                  <select
                    className="select"
                    value={draft.category}
                    onChange={(event) =>
                      setDraft((prev) => ({
                        ...prev,
                        category: event.target.value as ItemDraft['category']
                      }))
                    }
                  >
                    <option value="daily">Daily (always)</option>
                    <option value="variable">Variable (conditional)</option>
                    <option value="today_only">Today only (one-time)</option>
                  </select>
                </div>
              </div>
                  <div className="split">
                    <div>
                      <label className="meta">Show in shifts</label>
                      <div className="shift-toggles">
                        <label className="check-item">
                          <input
                            type="checkbox"
                            checked={draft.show_morning}
                            onChange={(event) =>
                              setDraft((prev) => ({
                                ...prev,
                                show_morning: event.target.checked
                              }))
                            }
                          />
                          <span>Morning</span>
                        </label>
                        <label className="check-item">
                          <input
                            type="checkbox"
                            checked={draft.show_afternoon}
                            onChange={(event) =>
                              setDraft((prev) => ({
                                ...prev,
                                show_afternoon: event.target.checked
                              }))
                            }
                          />
                          <span>Afternoon</span>
                        </label>
                        <label className="check-item">
                          <input
                            type="checkbox"
                            checked={draft.show_evening}
                            onChange={(event) =>
                              setDraft((prev) => ({
                                ...prev,
                                show_evening: event.target.checked
                              }))
                            }
                          />
                          <span>Evening</span>
                        </label>
                      </div>
                    </div>
                    <div>
                      <label className="meta">Reset at shift change?</label>
                      <label className="check-item">
                        <input
                          type="checkbox"
                          checked={draft.reset_at_shift}
                          onChange={(event) =>
                            setDraft((prev) => ({
                              ...prev,
                              reset_at_shift: event.target.checked
                            }))
                          }
                        />
                        <span>Uncheck when shift changes</span>
                      </label>
                    </div>
                  </div>
                  {draft.category === 'variable' && (
                    <div className="split">
                      <div>
                        <label className="meta">Show when question...</label>
                        <select
                          className="select"
                          value={draft.condition_question_id}
                          onChange={(event) =>
                            setDraft((prev) => ({
                              ...prev,
                              condition_question_id: event.target.value
                            }))
                          }
                        >
                          <option value="">Select a question</option>
                          {questions.map((question) => (
                            <option key={question.id} value={question.id}>
                              {question.prompt}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="meta">Answer is...</label>
                        <select
                          className="select"
                          value={draft.condition_value ? 'yes' : 'no'}
                          onChange={(event) =>
                            setDraft((prev) => ({
                              ...prev,
                              condition_value: event.target.value === 'yes'
                            }))
                          }
                        >
                          <option value="yes">Yes</option>
                          <option value="no">No</option>
                        </select>
                      </div>
                      <div>
                        <label className="meta">Use answers from...</label>
                        <select
                          className="select"
                          value={draft.condition_source}
                          onChange={(event) =>
                            setDraft((prev) => ({
                              ...prev,
                              condition_source: event.target.value as ItemDraft['condition_source']
                            }))
                          }
                        >
                          <option value="today">Today</option>
                          <option value="yesterday">Yesterday</option>
                        </select>
                      </div>
                    </div>
                  )}
                  {draft.category === 'today_only' ? (
                    <div className="notice">
                      This item will appear only for <strong>{formatMountainDate(dateKey)}</strong>.
                    </div>
                  ) : null}
                  <button
                    className="button"
                    onClick={async () => {
                      await addItem();
                      setShowAddForm(false);
                    }}
                    disabled={saving}
                  >
                    Add item
                  </button>
                </>
              ) : null}
            </div>

            <div className="card">
              <h2>Add Daily Questions</h2>
              <div className="meta">Anyone can add or deactivate questions.</div>
              <div className="split">
                <div>
                  <label className="meta">Question prompt</label>
                  <input
                    className="input"
                    placeholder="Are any companies coming for an info session tomorrow?"
                    value={questionDraft.prompt}
                    onChange={(event) =>
                      setQuestionDraft((prev) => ({ ...prev, prompt: event.target.value }))
                    }
                  />
                </div>
              </div>
              <button className="button" onClick={addQuestion} disabled={saving}>
                Add question
              </button>
              <div className="checklist">
                {questions.map((question) => (
                  <div className="check-item" key={question.id}>
                    <div>
                      <input
                        className="input"
                        value={question.prompt}
                        onChange={(event) =>
                          updateQuestion(question.id, { prompt: event.target.value })
                        }
                      />
                      <div className="meta">Daily question</div>
                    </div>
                    <button
                      className="button secondary"
                      onClick={() =>
                        updateQuestion(question.id, { active: !question.active })
                      }
                    >
                      {question.active ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </div>
                ))}
              </div>
              <div className="meta">Today&apos;s answers</div>
              <div className="checklist">
                {activeQuestions.map((question) => {
                  const answer = answers[question.id]?.answer;
                  return (
                    <div className="check-item" key={question.id}>
                      <div>
                        <strong>{question.prompt}</strong>
                        <div className="meta">
                          Current: {answer === null || answer === undefined ? 'Not set' : answer ? 'Yes' : 'No'}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          className="button"
                          disabled={saving}
                          onClick={() => answerQuestion(question.id, true)}
                        >
                          Yes
                        </button>
                        <button
                          className="button secondary"
                          disabled={saving}
                          onClick={() => answerQuestion(question.id, false)}
                        >
                          No
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="grid no-print">
            <div className="card">
              <h2>Manage Existing Items</h2>
              <div className="checklist">
                {items.map((item) => (
                  <div className="check-item" key={item.id}>
                    <div>
                      <input
                        className="input"
                        value={item.label}
                        onChange={(event) => updateItem(item.id, { label: event.target.value })}
                      />
                      <input
                        className="input"
                        placeholder="https://..."
                        value={item.link_url ?? ''}
                        onChange={(event) => updateItem(item.id, { link_url: event.target.value })}
                      />
                      <div className="meta">
                        <select
                          className="select"
                          value={item.category}
                          onChange={(event) =>
                            updateItem(item.id, {
                              category: event.target.value as ChecklistItem['category'],
                              condition_question_id:
                                event.target.value === 'daily' || event.target.value === 'today_only'
                                  ? null
                                  : item.condition_question_id,
                              condition_value:
                                event.target.value === 'daily' || event.target.value === 'today_only'
                                  ? null
                                  : item.condition_value,
                              one_time_date_key:
                                event.target.value === 'today_only' ? dateKey : null,
                              condition_source: 'today'
                            })
                          }
                        >
                          <option value="daily">Daily</option>
                          <option value="variable">Variable</option>
                          <option value="today_only">Today only</option>
                        </select>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gap: 8 }}>
                      <div className="shift-toggles">
                        <label className="check-item">
                          <input
                            type="checkbox"
                            checked={item.show_morning}
                            onChange={(event) =>
                              updateItem(item.id, { show_morning: event.target.checked })
                            }
                          />
                          <span>Morning</span>
                        </label>
                        <label className="check-item">
                          <input
                            type="checkbox"
                            checked={item.show_afternoon}
                            onChange={(event) =>
                              updateItem(item.id, { show_afternoon: event.target.checked })
                            }
                          />
                          <span>Afternoon</span>
                        </label>
                        <label className="check-item">
                          <input
                            type="checkbox"
                            checked={item.show_evening}
                            onChange={(event) =>
                              updateItem(item.id, { show_evening: event.target.checked })
                            }
                          />
                          <span>Evening</span>
                        </label>
                      </div>
                      <label className="check-item">
                        <input
                          type="checkbox"
                          checked={item.reset_at_shift}
                          onChange={(event) =>
                            updateItem(item.id, { reset_at_shift: event.target.checked })
                          }
                        />
                        <span>Reset at shift change</span>
                      </label>
                      {item.category === 'variable' && (
                        <>
                          <select
                            className="select"
                            value={item.condition_question_id ?? ''}
                            onChange={(event) =>
                              updateItem(item.id, {
                                condition_question_id: event.target.value || null
                              })
                            }
                          >
                            <option value="">Select question</option>
                            {questions.map((question) => (
                              <option key={question.id} value={question.id}>
                                {question.prompt}
                              </option>
                            ))}
                          </select>
                          <select
                            className="select"
                            value={item.condition_value ? 'yes' : 'no'}
                            onChange={(event) =>
                              updateItem(item.id, {
                                condition_value: event.target.value === 'yes'
                              })
                            }
                          >
                            <option value="yes">Answer is Yes</option>
                            <option value="no">Answer is No</option>
                          </select>
                          <select
                            className="select"
                            value={item.condition_source ?? 'today'}
                            onChange={(event) =>
                              updateItem(item.id, {
                                condition_source: event.target.value as ChecklistItem['condition_source']
                              })
                            }
                          >
                            <option value="today">Use today</option>
                            <option value="yesterday">Use yesterday</option>
                          </select>
                        </>
                      )}
                      <button
                        className="button secondary"
                        onClick={() => updateItem(item.id, { active: !item.active })}
                      >
                        {item.active ? 'Deactivate' : 'Reactivate'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </>
      ) : null}

      <div className="footer">
        This checklist resets automatically at midnight Mountain Time. Shift-based items carry
        forward as the day progresses, and some can be set to reset at shift change.
      </div>
    </main>
  );
}
