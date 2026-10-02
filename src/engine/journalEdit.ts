import type {JournalEntry} from '../core/types';
import {dayNumber} from '../data/dates';

/**
 * Journal: one validate/apply path for adding and editing a note. Notes are context for the Coach and the athlete; they
 * never change a prescription. A note scoped to a workout or an exercise must say which one (`refId`); a "set" scope has
 * no picker in the app, so new notes are general, workout or exercise notes (existing set notes stay readable and editable).
 */
export const JOURNAL_LIMITS = {textMax: 2000, tagsMax: 8, tagMax: 24};
export const JOURNAL_SCOPES: readonly JournalEntry['scope'][] = ['general', 'workout', 'exercise'];

export interface JournalDraft {
  date: string;
  scope: string;
  refId: string;
  text: string;
  /** Free text: words separated by spaces or commas, optional leading #. */
  tags: string;
}

export type JournalErrors = Partial<Record<'date' | 'scope' | 'refId' | 'text' | 'tags', string>>;
export type JournalResult = {ok: true; entry: JournalEntry} | {ok: false; errors: JournalErrors};

/** Lower-case words of letters, digits, `_` and `-`; duplicates removed; at most `tagsMax`. */
export function parseTags(text: string): {tags: string[]; dropped: number} {
  const raw = text.split(/[\s,]+/).map(tag => tag.trim().replace(/^#+/, '').toLowerCase()).filter(Boolean);
  const valid = raw.filter(tag => tag.length <= JOURNAL_LIMITS.tagMax && /^[a-z0-9_-]+$/.test(tag));
  const unique = [...new Set(valid)];
  const tags = unique.slice(0, JOURNAL_LIMITS.tagsMax);
  return {tags, dropped: raw.length - tags.length};
}

export function validateJournalDraft(draft: JournalDraft, today: string, existing?: JournalEntry): JournalErrors {
  const errors: JournalErrors = {};
  const text = draft.text.trim();
  if (!text) errors.text = 'Write something first.';
  else if (text.length > JOURNAL_LIMITS.textMax) errors.text = `Keep a note under ${JOURNAL_LIMITS.textMax} characters.`;
  if (dayNumber(draft.date) === undefined) errors.date = 'Choose a real calendar date.';
  else if (draft.date > today) errors.date = 'A note cannot be dated in the future.';
  const allowed = existing?.scope === 'set' ? [...JOURNAL_SCOPES, 'set'] : [...JOURNAL_SCOPES];
  if (!allowed.includes(draft.scope)) errors.scope = 'Choose general, workout or exercise.';
  else if (draft.scope !== 'general' && draft.scope !== 'set' && !draft.refId.trim()) errors.refId = draft.scope === 'workout' ? 'Choose the workout this note is about.' : 'Choose the exercise this note is about.';
  const {dropped} = parseTags(draft.tags);
  if (dropped > 0) errors.tags = `Tags are single words (letters, digits, - or _), up to ${JOURNAL_LIMITS.tagMax} characters, at most ${JOURNAL_LIMITS.tagsMax}.`;
  return errors;
}

export function applyJournalDraft(existing: JournalEntry | undefined, draft: JournalDraft, ctx: {today: string; newId: () => string}): JournalResult {
  const errors = validateJournalDraft(draft, ctx.today, existing);
  if (Object.keys(errors).length) return {ok: false, errors};
  const scope = draft.scope as JournalEntry['scope'];
  const {refId: _refId, ...rest} = (existing ?? {}) as Partial<JournalEntry>;
  const entry = {
    ...(existing ? rest : {id: ctx.newId()}),
    date: draft.date,
    scope,
    ...(scope === 'general' ? {} : {refId: draft.refId.trim() || existing?.refId}),
    text: draft.text.trim(),
    tags: parseTags(draft.tags).tags
  } as JournalEntry;
  return {ok: true, entry};
}

export function removeJournalEntry(journal: readonly JournalEntry[], id: string): JournalEntry[] {
  return journal.filter(entry => entry.id !== id);
}

/** Newest day first; notes of the same day keep their stored order (newest added first). */
export function sortedJournal(journal: readonly JournalEntry[]): JournalEntry[] {
  return journal.map((entry, index) => ({entry, index})).sort((a, b) => b.entry.date.localeCompare(a.entry.date) || a.index - b.index).map(item => item.entry);
}

export function draftFromEntry(entry: JournalEntry): JournalDraft {
  return {date: entry.date, scope: entry.scope, refId: entry.refId ?? '', text: entry.text, tags: entry.tags.join(' ')};
}
