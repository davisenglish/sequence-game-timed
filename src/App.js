// Required dependencies: react, an-array-of-english-words; UI comes from the Stringlish brand kit in ./brand
// Drop this file into your React project and import/use <WordPuzzleGame />
// 
// VERSION: TIMED EDITION - Uses isolated localStorage keys to prevent stats conflicts with other versions
// Storage: sequenceGameTimedStats, currentRoundTimeTimed, stringlich_timed_daily* (completion / abandon / snapshot / in-progress)
import React, { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import words from 'an-array-of-english-words';
import {
  INK,
  WHITE,
  LINE,
  HAIR,
  PLACEHOLDER,
  KEY_TINTS,
  DEEP,
  NUNITO,
  nun,
  center,
  TopBar,
  ModeLabel,
  StatusRow,
  ProvidedLetters,
  inputLineStyle,
  desktopInputStyle,
  splitUnderline,
  SubmitButton,
  HintButton,
  RoundsRow,
  Mistakes,
  ErrorSlot,
  providedIndexes,
  keyFaceStyle,
  KeyUnderlines,
  ShiftGlyph,
  DeleteGlyph,
  GuessChip,
  AnswerChips,
  Disclosure,
  RoundCard,
  RoundBadge,
  HomeButton,
  ModalScrim,
  ModalCard,
  ModalButton,
  RulesCard,
  GiveUpCard,
  ContactCard,
  ResultBanner,
  StatGrid,
  Distribution,
  useCountUp,
  Confetti,
  IntroScreen,
  GameIcon,
  Wordmark,
  Icon,
  IconButton,
  Footer,
} from './brand';

// Preprocess the word list once for performance, excluding certain suffixes
const EXCLUDED_SUFFIXES = [
  'ING', 'ED', 'S', 'ER', 'EST', 'LY', 'ISH'
];
const suffixRegex = new RegExp(`(${EXCLUDED_SUFFIXES.join('|')})$`, 'i');
const PREPROCESSED_WORDS = words
  .filter(w =>
    w.length >= 3 &&
    /^[A-Za-z]+$/.test(w) &&
    !suffixRegex.test(w.toUpperCase())
  )
  .map(w => w.toUpperCase());

// CSV data storage
let tripletsData = null;
let tripletsDataPromise = null;

// Load and parse CSV file
async function loadTripletsData() {
  if (tripletsData) return tripletsData;
  if (tripletsDataPromise) return tripletsDataPromise;
  
  tripletsDataPromise = (async () => {
    try {
      const response = await fetch(`${process.env.PUBLIC_URL}/triplets_lessrestrictive.csv`);
      const text = await response.text();
      const lines = text.trim().split('\n');
      
      const data = [];
      for (const line of lines) {
        const columns = line.split(',');
        if (columns.length >= 3) {
          const frequency = parseInt(columns[0], 10);
          const letters = columns[1].toUpperCase();
          const answers = columns.slice(2, 12).filter(a => a && a.trim()).map(a => a.trim().toUpperCase());
          
          if (!isNaN(frequency) && letters.length === 3 && answers.length > 0) {
            data.push({
              frequency,
              letters,
              answers
            });
          }
        }
      }
      
      tripletsData = data;
      return data;
    } catch (error) {
      console.error('Error loading triplets CSV:', error);
      return [];
    }
  })();
  
  return tripletsDataPromise;
}

// Word list from SCOWL/Wordnik CSV for guess validation
let wordListSet = null;
let wordListPromise = null;

async function loadWordList() {
  if (wordListSet) return wordListSet;
  if (wordListPromise) return wordListPromise;

  wordListPromise = (async () => {
    try {
      const response = await fetch(`${process.env.PUBLIC_URL}/words-enable.scowl.wordnik.csv`);
      const text = await response.text();
      const lines = text.trim().split('\n');
      const set = new Set();
      for (let i = 0; i < lines.length; i++) {
        const w = lines[i].trim().toLowerCase();
        if (!w || (i === 0 && w === 'word')) continue;
        set.add(w);
      }
      wordListSet = set;
      return set;
    } catch (error) {
      console.error('Error loading word list CSV:', error);
      wordListSet = new Set();
      return wordListSet;
    }
  })();

  return wordListPromise;
}

/** Timed edition — one shared daily puzzle per local calendar day (same triplet set for all players that day). */
const LS_DAILY = {
  completedUtc: 'stringlich_timed_dailyCompletedUtc_v4',
  abandonedUtc: 'stringlich_timed_dailyAbandonedUtc_v4',
  snapshot: 'stringlich_timed_dailySnapshot_v4',
  inProgress: 'stringlich_timed_dailyInProgress_v4',
};

/** Which Time Distribution bar (0–4) was incremented on the last win (green highlight in Statistics). */
const LS_TIMED_LAST_DIST_BUCKET = 'stringlich_timed_lastDistBucket_v4';

/** Wrong guesses allowed per level before the game ends. Only "real" mistakes count (see handleSubmit). */
const MISTAKES_PER_LEVEL = 4;

const TIME_DISTRIBUTION_TIERS = [
  { label: '< 30s' },
  { label: '30–60s' },
  { label: '1–2 min' },
  { label: '2–3 min' },
  { label: '> 3 min' },
];

const PLAIN_BUTTON = {
  appearance: 'none',
  WebkitAppearance: 'none',
  background: 'none',
  border: 'none',
  margin: 0,
  padding: 0,
  font: 'inherit',
  color: 'inherit',
  cursor: 'pointer',
  WebkitTapHighlightColor: 'transparent',
};

/** How many full-win times we keep and show under Fastest Times. */
const FASTEST_TIMES_COUNT = 4;

/** Win time in whole seconds → bucket index for Time Distribution. */
function bucketIndexForWinSeconds(totalSeconds) {
  const t = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  if (t < 30) return 0;
  if (t < 60) return 1;
  if (t < 120) return 2;
  if (t < 180) return 3;
  return 4;
}

function normalizeStatsTimeDistribution(raw) {
  const out = { ...raw };
  let td = out.timeDistribution;
  if (!Array.isArray(td) || td.length !== 5) {
    td = [0, 0, 0, 0, 0];
  } else {
    td = td.map((n) => Math.max(0, Math.floor(Number(n) || 0)));
  }
  out.timeDistribution = td;
  if (!Array.isArray(out.winTimes)) out.winTimes = [];
  return out;
}

function normalizeFastestTimes(raw) {
  const out = { ...raw };
  let ft = out.fastestTimes;
  if (!Array.isArray(ft)) {
    out.fastestTimes = [];
    return out;
  }
  out.fastestTimes = ft
    .map((t) => Number(t))
    .filter((t) => Number.isFinite(t) && t > 0)
    .sort((a, b) => a - b)
    .slice(0, FASTEST_TIMES_COUNT);
  return out;
}

function clearLastTimeDistBucketHighlight() {
  try {
    localStorage.removeItem(LS_TIMED_LAST_DIST_BUCKET);
  } catch (_) {}
}

/** Local calendar YYYY-MM-DD — daily letters, completion, abandon, rollover. */
function getLocalDateString(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** True if `prevYmd` is exactly one local calendar day before `nextYmd` (YYYY-MM-DD). */
function isLocalYmdImmediatelyBefore(prevYmd, nextYmd) {
  const [py, pm, pd] = prevYmd.split('-').map(Number);
  const [ny, nm, nd] = nextYmd.split('-').map(Number);
  const p = new Date(py, pm - 1, pd);
  const n = new Date(ny, nm - 1, nd);
  return (n.getTime() - p.getTime()) / 86400000 === 1;
}

/** Sorted, de-duplicated list of valid YYYY-MM-DD strings. */
function sortedUniqueYmd(arr) {
  return [...new Set((arr || []).filter((d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)))].sort();
}

/** Longest run of consecutive calendar days within a sorted, unique date list. */
function longestConsecutiveRun(sortedDates) {
  if (!sortedDates || sortedDates.length === 0) return 0;
  let best = 1;
  let run = 1;
  for (let i = 1; i < sortedDates.length; i++) {
    if (isLocalYmdImmediatelyBefore(sortedDates[i - 1], sortedDates[i])) run += 1;
    else run = 1;
    if (run > best) best = run;
  }
  return best;
}

/**
 * Active streak = consecutive wins ending at the most recent win. It only counts
 * if that win is today or yesterday (no missed day), and today wasn't already lost.
 */
function currentRunFromWinDates(sortedDates, todayStr, lastLossDate) {
  if (!sortedDates || sortedDates.length === 0) return 0;
  if (lastLossDate && lastLossDate === todayStr) return 0;
  const last = sortedDates[sortedDates.length - 1];
  if (last !== todayStr && !isLocalYmdImmediatelyBefore(last, todayStr)) return 0;
  let run = 1;
  for (let i = sortedDates.length - 1; i > 0; i--) {
    if (isLocalYmdImmediatelyBefore(sortedDates[i - 1], sortedDates[i])) run += 1;
    else break;
  }
  return run;
}

/** Rebuild the `count` consecutive dates ending at `endYmd` — seeds the ledger from legacy saves. */
function seedWinDatesFromStreak(endYmd, count) {
  if (!endYmd || !count || count < 1) return [];
  const [y, m, d] = endYmd.split('-').map(Number);
  const out = [];
  for (let i = count - 1; i >= 0; i--) {
    out.push(getLocalDateString(new Date(y, m - 1, d - i)));
  }
  return out;
}

/**
 * The win-date ledger (`winDates`) is the source of truth for streaks. This derives
 * currentStreak/maxStreak from it, seeding from legacy fields the first time so existing
 * streaks are preserved. maxStreak keeps any previously stored value as a floor.
 */
function recomputeStreakFields(s) {
  let winDates = sortedUniqueYmd(s.winDates);
  if (winDates.length === 0 && s.lastWinPuzzleDate && (s.currentStreak || 0) > 0) {
    winDates = seedWinDatesFromStreak(s.lastWinPuzzleDate, s.currentStreak || 0);
  }
  s.winDates = winDates;
  const today = getLocalDateString();
  s.currentStreak = currentRunFromWinDates(winDates, today, s.lastLossDate || null);
  s.maxStreak = Math.max(Number(s.maxStreak) || 0, longestConsecutiveRun(winDates));
  s.lastWinPuzzleDate = winDates.length ? winDates[winDates.length - 1] : (s.lastWinPuzzleDate || null);
  return s;
}

/** Record a win on `puzzleDateStr` in the ledger and recompute streaks. */
function recordWinDate(s, puzzleDateStr) {
  s.winDates = sortedUniqueYmd([...(s.winDates || []), puzzleDateStr]);
  if (s.lastLossDate === puzzleDateStr) s.lastLossDate = null;
  return recomputeStreakFields(s);
}

/** Record a loss on `puzzleDateStr` (breaks the active streak) and recompute. */
function recordLossDate(s, puzzleDateStr) {
  s.lastLossDate = puzzleDateStr;
  return recomputeStreakFields(s);
}

/** If the player missed any calendar day after their last win, current streak is no longer active. */
function normalizeTimedStatsStreak(raw) {
  const s = { ...raw };
  return recomputeStreakFields(s);
}

function hashStringToInt(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Wang hash — good avalanche properties so adjacent integers scatter widely. */
function wangHash(n) {
  n = ((n ^ 61) ^ (n >>> 16)) >>> 0;
  n = (n + (n << 3)) >>> 0;
  n = (n ^ (n >>> 4)) >>> 0;
  n = Math.imul(n, 0x27d4eb2d) >>> 0;
  n = (n ^ (n >>> 15)) >>> 0;
  return n;
}

/** Convert "YYYY-MM-DD" to days since Unix epoch (integer). */
function dateStrToEpochDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

/** Weighted select using a pre-computed integer seed (skips hashStringToInt). */
function deterministicWeightedSelectByInt(items, seedInt) {
  if (!items || items.length === 0) return null;
  const totalWeight = items.reduce((sum, it) => sum + Math.max(0, Number(it.frequency) || 0), 0);
  if (totalWeight <= 0) return items[0] ?? null;
  let r = seedInt % totalWeight;
  for (const it of items) {
    const w = Math.max(0, Number(it.frequency) || 0);
    if (r < w) return it;
    r -= w;
  }
  return items[items.length - 1];
}

/** Same seed ⇒ same order for all players sharing this calendar day + triplet (matches daily puzzle identity). */
function sortAnswersDeterministic(answers, seedKey) {
  return [...answers].sort((a, b) => {
    const sa = String(a).toUpperCase();
    const sb = String(b).toUpperCase();
    const ha = hashStringToInt(`${seedKey}|${sa}`);
    const hb = hashStringToInt(`${seedKey}|${sb}`);
    if (ha !== hb) return ha - hb;
    return sa.localeCompare(sb);
  });
}

/** Display #1 = July 15, 2026 local; #2 = July 16, 2026 local, … */
function getLocalStringlishNumber() {
  const now = new Date();
  const todayLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const epochLocal = new Date(2026, 6, 15);
  const dayIndex = Math.floor((todayLocal.getTime() - epochLocal.getTime()) / 86400000);
  return Math.max(1, dayIndex + 1);
}

function formatLocalDateLong(d = new Date()) {
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function readDailyCompletedUtc() {
  try {
    return localStorage.getItem(LS_DAILY.completedUtc);
  } catch (_) {
    return null;
  }
}

function readDailyAbandonedUtc() {
  try {
    return localStorage.getItem(LS_DAILY.abandonedUtc);
  } catch (_) {
    return null;
  }
}

function saveDailyCompletionSnapshot(snapshot) {
  try {
    localStorage.setItem(LS_DAILY.snapshot, JSON.stringify(snapshot));
    localStorage.setItem(LS_DAILY.completedUtc, snapshot.puzzleDate);
    localStorage.removeItem(LS_DAILY.abandonedUtc);
    localStorage.removeItem(LS_DAILY.inProgress);
  } catch (_) {}
}

function markDailyAbandonedForLocalDate(dateStr) {
  try {
    localStorage.setItem(LS_DAILY.abandonedUtc, dateStr);
    localStorage.removeItem(LS_DAILY.inProgress);
  } catch (_) {}
}

/** Same weighting as weightedRandomSelect, but deterministic from seedStr (daily puzzle). */
// eslint-disable-next-line no-unused-vars
function deterministicWeightedSelect(items, seedStr) {
  if (!items || items.length === 0) return null;
  const totalWeight = items.reduce((sum, it) => sum + Math.max(0, Number(it.frequency) || 0), 0);
  if (totalWeight <= 0) return items[0] ?? null;
  let r = hashStringToInt(seedStr) % totalWeight;
  for (const it of items) {
    const w = Math.max(0, Number(it.frequency) || 0);
    if (r < w) return it;
    r -= w;
  }
  return items[items.length - 1];
}

/**
 * One triplet for round `level` (1–3) using the same buckets / odds as getRandomLetters.
 * attemptSalt breaks ties when the weighted pick collides with an earlier round’s letters.
 */
function deterministicDailyTripletPickForLevel(data, level, puzzleDateStr, attemptSalt, usedLetters) {
  const filteredData = data.filter((item) => item.frequency >= 5);
  if (filteredData.length === 0) {
    const row = data[0];
    if (!row) return null;
    return usedLetters.has(row.letters) ? null : row.letters;
  }

  const highFreqGroup = data.filter((item) => item.frequency >= 56);
  const midFreqGroup = data.filter((item) => item.frequency >= 20 && item.frequency <= 56);
  const lowFreqGroup = data.filter((item) => item.frequency >= 5 && item.frequency <= 20);

  // Wang-hash the epoch day so adjacent dates scatter widely rather than walking
  // the frequency-weighted pool one step at a time (the old djb2 string hash bug).
  const epochDay = dateStrToEpochDay(puzzleDateStr);
  const base = wangHash(epochDay);

  // Derive per-purpose seeds by mixing in level, attemptSalt, and a unique offset.
  const mkSeed = (offset) => wangHash(base + level * 100003 + attemptSalt * 9973 + offset);

  const coin1 = mkSeed(1) % 2;
  const coin3 = mkSeed(3) % 2;

  let selected = null;
  if (level === 1) {
    if (coin1 === 0 && highFreqGroup.length > 0) {
      selected = deterministicWeightedSelectByInt(highFreqGroup, mkSeed(10));
    } else if (midFreqGroup.length > 0) {
      selected = deterministicWeightedSelectByInt(midFreqGroup, mkSeed(20));
    } else if (highFreqGroup.length > 0) {
      selected = deterministicWeightedSelectByInt(highFreqGroup, mkSeed(11));
    }
  } else if (level === 2) {
    if (midFreqGroup.length > 0) {
      selected = deterministicWeightedSelectByInt(midFreqGroup, mkSeed(20));
    }
  } else {
    if (coin3 === 0 && midFreqGroup.length > 0) {
      selected = deterministicWeightedSelectByInt(midFreqGroup, mkSeed(20));
    } else if (lowFreqGroup.length > 0) {
      selected = deterministicWeightedSelectByInt(lowFreqGroup, mkSeed(30));
    } else if (midFreqGroup.length > 0) {
      selected = deterministicWeightedSelectByInt(midFreqGroup, mkSeed(21));
    }
  }

  if (!selected) {
    selected = deterministicWeightedSelectByInt(filteredData, mkSeed(99));
  }
  if (!selected) return null;
  const letters = selected.letters;
  if (usedLetters.has(letters)) return null;
  return letters;
}

function firstUnusedLettersInPool(pool, usedLetters) {
  for (const row of pool) {
    if (row && row.letters && !usedLetters.has(row.letters)) return row.letters;
  }
  return pool[0]?.letters ?? null;
}

/** Three distinct triplets for this calendar day — per-round difficulty matches getRandomLetters. */
async function getDailyTripletsForDay(puzzleDateStr) {
  const data = await loadTripletsData();
  if (!data || data.length === 0) {
    return ['ABC', 'DEF', 'GHI'];
  }
  const filteredData = data.filter((item) => item.frequency >= 5);
  const pool = filteredData.length > 0 ? filteredData : data;
  const result = [];
  const used = new Set();

  for (let level = 1; level <= 3; level++) {
    let letters = null;
    for (let attemptSalt = 0; attemptSalt < 5000 && !letters; attemptSalt++) {
      letters = deterministicDailyTripletPickForLevel(data, level, puzzleDateStr, attemptSalt, used);
    }
    if (!letters) {
      letters = firstUnusedLettersInPool(pool, used) ?? pool[result.length % pool.length].letters;
    }
    used.add(letters);
    result.push(letters);
  }

  return result;
}

// Weighted random selection based on frequency
function weightedRandomSelect(data) {
  if (!data || data.length === 0) return null;
  
  // Calculate total weight
  const totalWeight = data.reduce((sum, item) => sum + item.frequency, 0);
  
  // Generate random number between 0 and totalWeight
  let random = Math.random() * totalWeight;
  
  // Find the item that corresponds to this random number
  for (const item of data) {
    random -= item.frequency;
    if (random <= 0) {
      return item;
    }
  }
  
  // Fallback to last item (shouldn't happen)
  return data[data.length - 1];
}

// eslint-disable-next-line no-unused-vars
async function getRandomLetters(level = 1) {
  // Load CSV data if not already loaded
  const data = await loadTripletsData();
  
  if (!data || data.length === 0) {
    // Fallback to old method if CSV fails to load
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let letters = '';
  while (letters.length < 3) {
    const randomLetter = alphabet[Math.floor(Math.random() * alphabet.length)];
    if (!letters.includes(randomLetter)) letters += randomLetter;
  }
  return letters;
  }
  
  // Minimum frequency 5 so level 3 can use 5–20 bucket
  const filteredData = data.filter(item => item.frequency >= 5);
  
  if (filteredData.length === 0) {
    return data[0] ? data[0].letters : 'ABC';
  }
  
  // Frequency buckets: high (>=56), mid (20–56), low (5–20)
  const highFreqGroup = data.filter(item => item.frequency >= 56);
  const midFreqGroup = data.filter(item => item.frequency >= 20 && item.frequency <= 56);
  const lowFreqGroup = data.filter(item => item.frequency >= 5 && item.frequency <= 20);
  
  const random = Math.random();
  let selected = null;
  
  if (level === 1) {
    // Level 1: 50% freq >= 56, 50% freq 20–56
    if (random < 0.5 && highFreqGroup.length > 0) {
      selected = weightedRandomSelect(highFreqGroup);
    } else if (midFreqGroup.length > 0) {
      selected = weightedRandomSelect(midFreqGroup);
    } else if (highFreqGroup.length > 0) {
      selected = weightedRandomSelect(highFreqGroup);
    }
  } else if (level === 2) {
    // Level 2: 100% freq 20–56
    if (midFreqGroup.length > 0) {
      selected = weightedRandomSelect(midFreqGroup);
    }
  } else {
    // Level 3: 50% freq 20–56, 50% freq 5–20
    if (random < 0.5 && midFreqGroup.length > 0) {
      selected = weightedRandomSelect(midFreqGroup);
    } else if (lowFreqGroup.length > 0) {
      selected = weightedRandomSelect(lowFreqGroup);
    } else if (midFreqGroup.length > 0) {
      selected = weightedRandomSelect(midFreqGroup);
    }
  }
  
  return selected ? selected.letters : filteredData[0].letters;
}

function isSequential(word, letters) {
  let idx = 0;
  const target = letters.toUpperCase();
  for (let char of word.toUpperCase()) {
    if (char === target[idx]) idx++;
    if (idx === target.length) return true;
  }
  return false;
}

function toTitleCase(str) {
  if (!str || typeof str !== 'string') return str;
  return str.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Profanity blocklist — whole-word match only; all entries are 5+ letters. */
const SWEAR_WORDS = new Set([
  'arsehole',
  'assbandit',
  'assclown',
  'assface',
  'asshat',
  'asshole',
  'assholes',
  'asswipe',
  'badass',
  'bastard',
  'bastards',
  'beaner',
  'beaners',
  'bitch',
  'bitches',
  'bitching',
  'bitchy',
  'bitchass',
  'bollocks',
  'bullshit',
  'chink',
  'chinks',
  'clusterfuck',
  'cockbite',
  'cockhead',
  'cocksucker',
  'cocksmoker',
  'cumdump',
  'cumguzzler',
  'cumshot',
  'cuntface',
  'cunthole',
  'damnit',
  'dickbag',
  'dickface',
  'dickhead',
  'dickwad',
  'dickweed',
  'dickweasel',
  'dipshit',
  'douche',
  'douchebag',
  'douchebags',
  'dumbass',
  'dumbasses',
  'faggot',
  'faggots',
  'fuckboy',
  'fucked',
  'fucker',
  'fuckers',
  'fucking',
  'fuckface',
  'fuckhead',
  'fuckoff',
  'fuckstick',
  'fucktard',
  'fuckwad',
  'fuckwit',
  'goddam',
  'goddammit',
  'goddamn',
  'goddamned',
  'gooks',
  'honkey',
  'honky',
  'horseshit',
  'jackass',
  'jackasses',
  'jackoff',
  'jerkoff',
  'knobjockey',
  'motherfucker',
  'motherfuckers',
  'motherfucking',
  'nigga',
  'niggas',
  'nigger',
  'niggers',
  'pissant',
  'pissed',
  'pisser',
  'pissing',
  'pisshead',
  'pussies',
  'pussy',
  'raghead',
  'shitbag',
  'shitbox',
  'shitface',
  'shithead',
  'shitkicker',
  'shitless',
  'shitting',
  'shitstorm',
  'shitty',
  'skank',
  'skanks',
  'skanky',
  'sluts',
  'slutty',
  'smartass',
  'spics',
  'titfuck',
  'titty',
  'tranny',
  'twats',
  'wanker',
  'wankers',
  'wetback',
  'wetbacks',
  'whore',
  'whores',
  'whoring',
  'whorehouse',
]);

function isSwearWord(word) {
  const lower = String(word || '').trim().toLowerCase();
  return lower.length >= 5 && SWEAR_WORDS.has(lower);
}

async function isValidWord(word) {
  // Reject hyphenated words
  if (word.includes('-')) return false;

  if (isSwearWord(word)) return false;

  const wordSet = await loadWordList();
  return wordSet.has(String(word || '').trim().toLowerCase());
}

/** Raw answer list for a triplet (CSV or PREPROCESSED fallback). */
async function loadAnswerPoolForLetters(letters) {
  if (!letters || letters.length !== 3) return [];
  const data = await loadTripletsData();

  if (!data || data.length === 0) {
    const regex = new RegExp(letters.split('').join('.*'), 'i');
    let candidates = PREPROCESSED_WORDS.filter((w) => regex.test(w) && w.length >= 5);
    candidates = candidates.filter((w) => w.length <= 10);
    candidates.sort((a, b) => a.length - b.length);
    return candidates;
  }

  const normalizedLetters = letters.toUpperCase();
  const entry = data.find((item) => item.letters === normalizedLetters);

  if (entry && entry.answers && entry.answers.length > 0) {
    return entry.answers.filter((a) => a && a.trim());
  }

  const regex = new RegExp(letters.split('').join('.*'), 'i');
  let candidates = PREPROCESSED_WORDS.filter((w) => regex.test(w) && w.length >= 5);
  candidates = candidates.filter((w) => w.length <= 10);
  candidates.sort((a, b) => a.length - b.length);
  return candidates;
}

/** Sorted answer list for `letters`, deterministic per calendar day + triplet. */
async function getSortedCsvAnswersForLetters(letters, puzzleDateStr) {
  const dayKey = puzzleDateStr ?? getLocalDateString();
  const seedKey = `${dayKey}|${letters.toUpperCase()}`;
  const pool = await loadAnswerPoolForLetters(letters);
  if (!pool.length) return [];
  return sortAnswersDeterministic(pool, seedKey);
}

/** Canonical hint word for this calendar day + triplet (same for every player). */
async function getDailyHintWord(letters, puzzleDateStr) {
  const dayKey = puzzleDateStr ?? getLocalDateString();
  const seedKey = `${dayKey}|${letters.toUpperCase()}`;
  const sorted = await getSortedCsvAnswersForLetters(letters, dayKey);
  if (!sorted.length) return null;
  const n = Math.min(20, sorted.length);
  const hintPool = sorted.slice(0, n);
  const idx = hashStringToInt(`${seedKey}|hint-target`) % hintPool.length;
  return hintPool[idx] ?? null;
}

/** Possible answers for display: daily hint word first, then others (same list for all players). */
async function getPossibleAnswersFromCsv(letters, max = 3, puzzleDateStr) {
  const dayKey = puzzleDateStr ?? getLocalDateString();
  const sorted = await getSortedCsvAnswersForLetters(letters, dayKey);
  const dailyHint = await getDailyHintWord(letters, dayKey);
  const normalized = (w) => String(w || '').trim().toUpperCase();
  let rest = sorted.map(normalized).filter(Boolean);
  const hint = dailyHint ? normalized(dailyHint) : null;
  if (hint) {
    rest = rest.filter((w) => w !== hint);
    return [hint, ...rest].slice(0, max);
  }
  return rest.slice(0, max);
}

// Component to display possible answers asynchronously
function PossibleAnswers({ letters, max = 3, puzzleDate }) {
  const [answers, setAnswers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    
    (async () => {
      const dayKey = puzzleDate ?? getLocalDateString();
      const result = await getPossibleAnswersFromCsv(letters, max, dayKey);
      if (!isMounted) return;
      setAnswers((result || []).map((w) => String(w || '').trim().toUpperCase()).filter(Boolean));
      setLoading(false);
    })();
    
    return () => {
      isMounted = false;
    };
  }, [letters, max, puzzleDate]);

  if (loading) {
    return <span style={nun(14, 600, { color: PLACEHOLDER })}>Loading...</span>;
  }

  if (answers.length === 0) {
    return <span style={nun(14, 600, { color: PLACEHOLDER })}>No answers found</span>;
  }

  return <AnswerChips answers={answers.map((word) => toTitleCase(word))} />;
}

const ICON_MODAL_ANIM_MS = 300;

function computeIconModalShrinkStyle(iconEl, cardEl) {
  if (!iconEl || !cardEl) {
    return {
      cardTransform: 'translate(0px, 0px) scale(0.08)',
      overlayOpacity: 0,
    };
  }
  const icon = iconEl.getBoundingClientRect();
  const card = cardEl.getBoundingClientRect();
  const iconCx = icon.left + icon.width / 2;
  const iconCy = icon.top + icon.height / 2;
  const cardCx = card.left + card.width / 2;
  const cardCy = card.top + card.height / 2;
  const scale = Math.min(icon.width / card.width, icon.height / card.height);
  return {
    cardTransform: `translate(${iconCx - cardCx}px, ${iconCy - cardCy}px) scale(${Math.max(scale, 0.05)})`,
    overlayOpacity: 0,
  };
}

/** 3-step rules wizard — state is internal so it cannot reference an undefined parent binding */
function TimedRulesModal({
  showRules,
  isMobile,
  onClose,
  showRulesOnStart,
  onToggleShowRulesOnStart,
  modalCardRef,
  modalAnim,
}) {
  const [step, setStep] = useState(0);
  const touchStartRef = useRef(null);

  useEffect(() => {
    if (showRules) {
      setStep(0);
    }
  }, [showRules]);

  const onTouchStart = (e) => {
    if (!isMobile) return;
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY };
  };

  const onTouchEnd = (e) => {
    if (!isMobile || !touchStartRef.current) return;
    const t = e.changedTouches[0];
    const start = touchStartRef.current;
    touchStartRef.current = null;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    const minSwipe = 48;
    if (Math.abs(dx) < minSwipe) return;
    if (Math.abs(dy) > Math.abs(dx) * 1.15) return;
    if (dx < 0) {
      setStep((s) => Math.min(2, s + 1));
    } else {
      setStep((s) => Math.max(0, s - 1));
    }
  };

  const transition = (prop) => (modalAnim.transitionEnabled ? `${prop} ${ICON_MODAL_ANIM_MS}ms ease-out` : 'none');

  return (
    <ModalScrim zIndex={9999} style={{ opacity: modalAnim.overlayOpacity, transition: transition('opacity') }}>
      <RulesCard
        step={step}
        onStep={setStep}
        modes={['Timed']}
        onClose={onClose}
        showCheckbox
        checked={showRulesOnStart}
        onCheck={onToggleShowRulesOnStart}
        cardRef={modalCardRef}
        style={{ transform: modalAnim.cardTransform, transformOrigin: 'center center', transition: transition('transform') }}
        bodyProps={{ onTouchStart, onTouchEnd, style: { touchAction: isMobile ? 'pan-y' : undefined } }}
      />
    </ModalScrim>
  );
}

/** Statistics result banner; on the winning open the final time counts up and the banner celebrates. */
function TimedResultBanner({ won, seconds, trend, celebrate, format }) {
  const shown = useCountUp(seconds, celebrate && won);
  if (!won) return <ResultBanner mode="Timed" emoji={['🍀', '🍀']} message="Better Luck Next Time!" />;
  return <ResultBanner mode="Timed" emoji={['🥳', '🎉']} message="Congratulations!" label="Final Time:" value={format(shown)} trend={trend} celebrate={celebrate} />;
}

export default function WordPuzzleGame() {
  const [currentLevel, setCurrentLevel] = useState(1);
  const [letters, setLetters] = useState('');
  const [allLevelLetters, setAllLevelLetters] = useState([]); // Store all 3 sets of letters
  const [roundStarted, setRoundStarted] = useState(false);
  const [input, setInput] = useState('');
  const [levelResults, setLevelResults] = useState([]); // [{ letters, word, time, gaveUp, hintWordUsed? }]
  const [error, setError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [gameTime, setGameTime] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [showRevealAnimation, setShowRevealAnimation] = useState(false);
  const [revealAnimationPlayedThisRound, setRevealAnimationPlayedThisRound] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isPageVisible, setIsPageVisible] = useState(true);
  const [viewportWidth, setViewportWidth] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 375));
  const [viewportHeight, setViewportHeight] = useState(() => (typeof window !== 'undefined' ? window.innerHeight : 667));
  const [mobileShiftActive, setMobileShiftActive] = useState(false);
  const [mobileCapsLock, setMobileCapsLock] = useState(false);
  const [stats, setStats] = useState({
    gamesPlayed: 0,
    gamesWon: 0,
    currentStreak: 0,
    maxStreak: 0,
    winDates: [], // Ledger of YYYY-MM-DD dates won; streaks are derived from this
    lastWinPuzzleDate: null,
    lastLossDate: null,
    fastestTimes: [],
    averageTimes: [],
    winTimes: [],
    timeDistribution: [0, 0, 0, 0, 0]
  });
  const [showRules, setShowRules] = useState(false);
  const [showContact, setShowContact] = useState(false);
  /** Which entry point opened the shared contact form — header title + icon only. */
  const [contactModalMode, setContactModalMode] = useState('contact');
  const [contactModalClosing, setContactModalClosing] = useState(false);
  const [contactEmail, setContactEmail] = useState('');
  const [contactSubject, setContactSubject] = useState('');
  const [contactMessage, setContactMessage] = useState('');
  const [rulesModalClosing, setRulesModalClosing] = useState(false);
  const rulesIconRef = useRef(null);
  const rulesModalCardRef = useRef(null);
  const rulesModalAnimTokenRef = useRef(0);
  const [rulesModalAnim, setRulesModalAnim] = useState({
    cardTransform: 'translate(0px, 0px) scale(1)',
    overlayOpacity: 1,
    transitionEnabled: false,
  });
  const [statsModalClosing, setStatsModalClosing] = useState(false);
  const statsIconRef = useRef(null);
  const statsModalCardRef = useRef(null);
  const statsModalAnimTokenRef = useRef(0);
  const [statsModalAnim, setStatsModalAnim] = useState({
    cardTransform: 'translate(0px, 0px) scale(1)',
    overlayOpacity: 1,
    transitionEnabled: false,
  });
  /** Hidden by default; click chart icon in Statistics modal to show (testing) */
  const [showClearStatsButton, setShowClearStatsButton] = useState(false);
  /** Bump when daily localStorage (completed/abandoned) changes so home UI re-reads */
  const [dailyUiEpoch, setDailyUiEpoch] = useState(0);
  const lastLocalDateRef = useRef(getLocalDateString());
  const roundStartedRef = useRef(false);
  const gameOverRef = useRef(false);
  const [showRulesOnStart, setShowRulesOnStart] = useState(() => {
    try {
      const stored = localStorage.getItem('sequenceGameTimedShowRulesOnStart');
      return stored !== 'false';
    } catch (_) {
      return true;
    }
  });
  const [showGiveUpConfirm, setShowGiveUpConfirm] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  /** Confetti plus the Final Time count-up in Statistics; plays once, on a full 3-level win. */
  const [showConfetti, setShowConfetti] = useState(false);
  const [bannerCelebrating, setBannerCelebrating] = useState(false);
  /** Bumped when a round is cleared so the clock chip pops. */
  const [clockPop, setClockPop] = useState(0);
  /** Intro before a fresh game: 'off' | 'playing' | 'done' (held on screen until the round starts). */
  const [introPhase, setIntroPhase] = useState('off');
  const [wordListReady, setWordListReady] = useState(false);
  /** Wrong guesses left on the current level (resets to MISTAKES_PER_LEVEL each level). At 0 → game over. */
  const [mistakesRemaining, setMistakesRemaining] = useState(MISTAKES_PER_LEVEL);
  /** Index of the dot currently playing the shrink-out animation, or null. */
  const [mistakeAnimIndex, setMistakeAnimIndex] = useState(null);
  const mistakesRemainingRef = useRef(MISTAKES_PER_LEVEL);
  /** Lowercased words already counted as a mistake this level → re-guessing shows "Already guessed" (no penalty). */
  const guessedMistakeWordsRef = useRef([]);
  /** True during the 0.3s dot shrink animation; blocks new submits so decrements can't race. */
  const mistakeAnimatingRef = useRef(false);
  const [pressedKey, setPressedKey] = useState(null);
  const [hintWord, setHintWord] = useState(null); // full hint word once any hint used (game over / give up)
  /** Full word chosen for this level’s progressive hints (first possible answer); loaded when `letters` changes */
  const [hintTargetWord, setHintTargetWord] = useState(null);
  /** How many characters of hintTargetWord are currently revealed (0 = none yet; then 3,4,… until full length) */
  const [hintCharsRevealed, setHintCharsRevealed] = useState(0);
  const [hintRevealAnimating, setHintRevealAnimating] = useState(false);
  const [hintAvailable, setHintAvailable] = useState(false);
  const [hintFillProgress, setHintFillProgress] = useState(0);
  const hintUnlockTimeoutRef = useRef(null);
  const hintFillIntervalRef = useRef(null);
  /** True after the 30s hint timer has been started this level; prevents starting while rules modal is open at round start. */
  const hintTimerStartedThisRoundRef = useRef(false);
  const hintStartGameTimeRef = useRef(null);
  const startTimeRef = useRef(null);
  const inputRef = useRef(null);
  /** When the round ends (win), this is the single source of truth for the final time (avoids timer race). */
  const finalGameTimeRef = useRef(null);
  /** Tracks current timer value for use after async work (e.g. isValidWord); keeps modal time in sync with gameplay display. */
  const gameTimeRef = useRef(0);
  const gameElapsedMsRef = useRef(0);
  const gameLastTickTimestampRef = useRef(null);
  /** True after the user closes the rules modal the first time this round; reopening rules then does not pause the timer. */
  const rulesDismissedOnceRef = useRef(false);
  const inputValueRef = useRef(''); // on mobile, stays in sync with input so Submit sees latest value
  const backspaceHoldTimeoutRef = useRef(null);
  const backspaceHoldIntervalRef = useRef(null);
  const mobileShiftOnAtRef = useRef(0);
  const mobileShiftActiveRef = useRef(false);
  const mobileCapsLockRef = useRef(false);
  const handleKeyboardLetterRef = useRef(null);
  const isSubmittingRef = useRef(false);
  // Mobile Submit commits on release: armed on pointerdown, cancelled if the finger lifts outside the key.
  const submitArmedRef = useRef(false);
  const submitInsideRef = useRef(false);
  const contentAboveKeyboardRef = useRef(null);

  useEffect(() => {
    roundStartedRef.current = roundStarted;
  }, [roundStarted]);
  useEffect(() => {
    gameOverRef.current = gameOver;
  }, [gameOver]);

  /** One global puzzle per local day: three deterministic triplets from CSV. */
  // eslint-disable-next-line no-unused-vars
  const generateAllLevelLetters = async () => getDailyTripletsForDay(getLocalDateString());

  useEffect(() => {
    loadWordList().then(() => setWordListReady(true));
    (async () => {
      const puzzleDay = getLocalDateString();
      lastLocalDateRef.current = puzzleDay;
      const params = new URLSearchParams(window.location.search);
      const completedToday = readDailyCompletedUtc() === puzzleDay;
      const abandonedToday = readDailyAbandonedUtc() === puzzleDay;

      // 1) Resume an in-progress session first so a refresh never drops a game.
      if (!completedToday && !abandonedToday) {
        const raw = localStorage.getItem(LS_DAILY.inProgress);
        if (raw) {
          try {
            const o = JSON.parse(raw);
            const savedDay = o.puzzleDate || o.utcDate;
            if (savedDay === puzzleDay && Array.isArray(o.allLevelLetters) && o.allLevelLetters.length === 3) {
              setAllLevelLetters(o.allLevelLetters);
              setLetters(o.letters);
              setCurrentLevel(o.currentLevel ?? 1);
              setLevelResults(o.levelResults || []);
              const gt = o.gameTime ?? 0;
              setGameTime(gt);
              gameTimeRef.current = gt;
              gameElapsedMsRef.current = o.gameElapsedMs != null ? o.gameElapsedMs : gt * 1000;
              gameLastTickTimestampRef.current = performance.now();
              finalGameTimeRef.current = o.finalGameTime != null ? o.finalGameTime : null;
              setInput(o.input ?? '');
              inputValueRef.current = o.input ?? '';
              setHintWord(o.hintWord ?? null);
              setHintTargetWord(o.hintTargetWord ?? null);
              setHintCharsRevealed(o.hintCharsRevealed ?? 0);
              const savedMistakes = Math.max(0, Math.min(MISTAKES_PER_LEVEL, Number(o.mistakesRemaining ?? MISTAKES_PER_LEVEL)));
              mistakesRemainingRef.current = savedMistakes;
              setMistakesRemaining(savedMistakes);
              guessedMistakeWordsRef.current = Array.isArray(o.guessedMistakeWords) ? o.guessedMistakeWords : [];
              setRoundStarted(true);
              setRevealAnimationPlayedThisRound(true);
              setShowRevealAnimation(false);
              rulesDismissedOnceRef.current = true;
              return;
            }
          } catch (_) {}
        }
      }

      // 2) Finished today → jump straight to the results / stats view.
      if (completedToday) {
        if (localStorage.getItem(LS_DAILY.snapshot)) {
          const allLetters = await getDailyTripletsForDay(puzzleDay);
          setAllLevelLetters(allLetters);
          setLetters(allLetters[0]);
          handleBeholdYourWork();
          return;
        }
        if (process.env.NODE_ENV !== 'development') {
          window.location.replace('/');
          return;
        }
      }

      // 3) Explicit play intent from the hub → begin now, skipping the landing.
      // The intro plays while the letters load; it calls handleBegin when it finishes.
      if (params.get('play') === '1' && !abandonedToday) {
        startIntro();
        const allLetters = await getDailyTripletsForDay(puzzleDay);
        setAllLevelLetters(allLetters);
        setLetters(allLetters[0]);
        return;
      }

      // 4) In production, redirect to the hub if reached without going through it.
      // In development, load the daily triplets and show the landing screen so the
      // game is testable locally (npm start) without the hub running.
      if (process.env.NODE_ENV !== 'development') {
        window.location.replace('/');
        return;
      }
      const allLetters = await getDailyTripletsForDay(puzzleDay);
      setAllLevelLetters(allLetters);
      setLetters(allLetters[0]);
    })();
    const savedStats = localStorage.getItem('sequenceGameTimedStats');
    if (savedStats) {
      try {
        const norm = normalizeStatsTimeDistribution(
          normalizeFastestTimes(normalizeTimedStatsStreak(JSON.parse(savedStats)))
        );
        setStats(norm);
        localStorage.setItem('sequenceGameTimedStats', JSON.stringify(norm));
      } catch (_) {}
    }

    const checkMobile = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      setIsMobile(w <= 1024);
      setViewportWidth(w);
      setViewportHeight(h);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);

    return () => window.removeEventListener('resize', checkMobile);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track page visibility so we can pause timers when the tab/app is backgrounded
  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsPageVisible(document.visibilityState !== 'hidden');
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (!roundStarted || gameOver) return;
    if (!isPageVisible) return;
    // Pause the timer whenever the rules modal is open (including re-opens mid-game).
    if (showRules) return;

    const now = performance.now();
    gameLastTickTimestampRef.current = now;

    const timer = setInterval(() => {
      const t = performance.now();
      const delta = Math.max(0, t - (gameLastTickTimestampRef.current ?? t));
      gameLastTickTimestampRef.current = t;
      gameElapsedMsRef.current += delta;
      const seconds = Math.floor(gameElapsedMsRef.current / 1000);
      if (seconds !== gameTimeRef.current) {
        gameTimeRef.current = seconds;
        setGameTime(seconds);
      }
    }, 100); // 10 fps; smooth enough while still cheap

    return () => clearInterval(timer);
  }, [roundStarted, gameOver, showRules, isPageVisible]);

  const startHintFillTimer = (resetAnchor = false) => {
    // Start or resume the 30s hint fill with smooth visual progress.
    // Progress is based on real elapsed time (ms), but timers pause when the page is hidden.
    // resetAnchor: after a partial hint is used, start the next 30s from now.
    setHintAvailable(false);
    if (hintUnlockTimeoutRef.current) clearTimeout(hintUnlockTimeoutRef.current);
    if (hintFillIntervalRef.current) clearInterval(hintFillIntervalRef.current);
    // Record the game elapsed ms at which this level's hint started, so unlock
    // is aligned exactly with 30s of *game timer*.
    if (resetAnchor || hintStartGameTimeRef.current == null) {
      hintStartGameTimeRef.current = gameElapsedMsRef.current;
    }
    hintFillIntervalRef.current = setInterval(() => {
      const startMs = hintStartGameTimeRef.current ?? gameElapsedMsRef.current;
      const elapsedMs = Math.max(0, gameElapsedMsRef.current - startMs);
      const progress = Math.min(100, (elapsedMs / 30000) * 100);
      setHintFillProgress(progress);
      if (elapsedMs >= 30000) {
        if (hintFillIntervalRef.current) {
          clearInterval(hintFillIntervalRef.current);
          hintFillIntervalRef.current = null;
        }
        setHintAvailable(true);
      }
    }, 100); // 10 fps; smooth and in lockstep with gameElapsedMsRef
  };

  const clearHintTimers = () => {
    if (hintUnlockTimeoutRef.current) {
      clearTimeout(hintUnlockTimeoutRef.current);
      hintUnlockTimeoutRef.current = null;
    }
    if (hintFillIntervalRef.current) {
      clearInterval(hintFillIntervalRef.current);
      hintFillIntervalRef.current = null;
    }
  };

  // Persist in-progress daily game so refresh can resume the same local-calendar-day puzzle
  useEffect(() => {
    if (!roundStarted || gameOver) return;
    const puzzleDay = getLocalDateString();
    if (readDailyCompletedUtc() === puzzleDay) return;
    const payload = {
      puzzleDate: puzzleDay,
      allLevelLetters,
      letters,
      currentLevel,
      levelResults,
      gameTime,
      gameElapsedMs: gameElapsedMsRef.current,
      finalGameTime: finalGameTimeRef.current,
      input,
      hintWord,
      hintTargetWord,
      hintCharsRevealed,
      mistakesRemaining,
      guessedMistakeWords: guessedMistakeWordsRef.current,
    };
    try {
      localStorage.setItem(LS_DAILY.inProgress, JSON.stringify(payload));
    } catch (_) {}
  }, [
    roundStarted,
    gameOver,
    allLevelLetters,
    letters,
    currentLevel,
    levelResults,
    gameTime,
    input,
    hintWord,
    hintTargetWord,
    hintCharsRevealed,
    mistakesRemaining,
  ]);

  // New puzzle when the user's local calendar day changes
  useEffect(() => {
    const handleLocalDayTick = async () => {
      const puzzleDay = getLocalDateString();
      if (puzzleDay === lastLocalDateRef.current) return;
      const prevDay = lastLocalDateRef.current;
      lastLocalDateRef.current = puzzleDay;
      setDailyUiEpoch((e) => e + 1);
      if (roundStartedRef.current && !gameOverRef.current) {
        markDailyAbandonedForLocalDate(prevDay);
      }
      setStats((prev) => {
        let n = normalizeStatsTimeDistribution(normalizeFastestTimes(normalizeTimedStatsStreak({ ...prev })));
        if (roundStartedRef.current && !gameOverRef.current) {
          // Left a game unfinished across the day boundary → that day counts as a miss.
          n = recordLossDate({ ...n }, prevDay);
        }
        try {
          localStorage.setItem('sequenceGameTimedStats', JSON.stringify(n));
        } catch (_) {}
        return n;
      });
      setRoundStarted(false);
      setGameOver(false);
      setShowRevealAnimation(false);
      setShowStats(false);
      setShowClearStatsButton(false);
      setCurrentLevel(1);
      setLevelResults([]);
      setGameTime(0);
      finalGameTimeRef.current = null;
      gameTimeRef.current = 0;
      gameElapsedMsRef.current = 0;
      gameLastTickTimestampRef.current = null;
      setInput('');
      inputValueRef.current = '';
      setError(false);
      setErrorMessage('');
      resetMistakesForLevel();
      setHintWord(null);
      setHintTargetWord(null);
      setHintCharsRevealed(0);
      setHintAvailable(false);
      setHintFillProgress(0);
      clearHintTimers();
      hintTimerStartedThisRoundRef.current = false;
      rulesDismissedOnceRef.current = false;
      setIsTransitioning(false);
      localStorage.removeItem('currentRoundTimeTimed');
      const triplets = await getDailyTripletsForDay(puzzleDay);
      setAllLevelLetters(triplets);
      setLetters(triplets[0]);
      // New day: route back through the hub rather than showing a landing screen.
      if (process.env.NODE_ENV !== 'development') {
        window.location.replace('/');
      }
    };
    const id = setInterval(handleLocalDayTick, 60000);
    const onVis = () => {
      handleLocalDayTick();
    };
    document.addEventListener('visibilitychange', onVis);
    handleLocalDayTick();
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  // Reset hint progress when triplet/level changes so next level gets a fresh 30s timer
  useEffect(() => {
    setHintWord(null);
    setHintCharsRevealed(0);
    setHintAvailable(false);
    setHintFillProgress(0);
    hintStartGameTimeRef.current = null;
    clearHintTimers();
    hintTimerStartedThisRoundRef.current = false;
    return clearHintTimers;
  }, [letters]);

  // Canonical hint word for today's triplet — same for every player on this calendar day.
  useEffect(() => {
    let cancelled = false;
    if (!letters) {
      setHintTargetWord(null);
      return undefined;
    }
    (async () => {
      const w = await getDailyHintWord(letters, getLocalDateString());
      if (!cancelled) setHintTargetWord(w);
    })();
    return () => {
      cancelled = true;
    };
  }, [letters]);

  // Hint: start 30s timer when game timer would run (after rules closed first time).
  // Reopening rules mid-game OR backgrounding the tab pauses (but does not reset) the hint timer.
  useEffect(() => {
    // If round ends or letters change, fully reset the hint.
    if (!roundStarted || gameOver || !letters) {
      setHintAvailable(false);
      setHintFillProgress(0);
      hintStartGameTimeRef.current = null;
      clearHintTimers();
      hintTimerStartedThisRoundRef.current = false;
      setHintWord(null);
      setHintCharsRevealed(0);
      return clearHintTimers;
    }
    // If page is not visible, just pause timers without resetting progress.
    if (!isPageVisible) {
      clearHintTimers();
      return clearHintTimers;
    }
    // One hint per level: once used (hintWord set), the timer stops and never restarts this level.
    const hintExhausted = hintWord != null;
    // Defer start to the next task so sibling [letters] effects can schedule setHintFillProgress(0) / setHintAvailable(false)
    // first — otherwise we often read stale hintFillProgress === 100 and never start the interval.
    let startTimerToken = null;
    if (
      (rulesDismissedOnceRef.current || !showRules) &&
      !hintExhausted &&
      !hintFillIntervalRef.current &&
      !hintAvailable
    ) {
      startTimerToken = setTimeout(() => {
        if (!roundStarted || gameOver || !letters) return;
        if (!isPageVisible) return;
        if (hintFillIntervalRef.current) return;
        if (hintWord != null) return;
        if (!(rulesDismissedOnceRef.current || !showRules)) return;
        startHintFillTimer(false);
        hintTimerStartedThisRoundRef.current = true;
      }, 0);
    }
    return () => {
      if (startTimerToken != null) clearTimeout(startTimerToken);
    };
  }, [
    roundStarted,
    gameOver,
    letters,
    showRules,
    isPageVisible,
    hintAvailable,
    hintTargetWord,
    hintWord
  ]);

  // Keep inputValueRef in sync with input state so mobile Submit always has a source of truth
  useEffect(() => {
    inputValueRef.current = input;
  }, [input]);

  // Ensure input field gets focus when game is active and rules are not covering it (so user can always type)
  useEffect(() => {
    if (roundStarted && !gameOver && !isTransitioning && !showRules && inputRef.current) {
      const focusTimer = setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          const pos = inputRef.current.value.length;
          inputRef.current.setSelectionRange(pos, pos);
        }
      }, 100);
      return () => clearTimeout(focusTimer);
    }
  }, [roundStarted, gameOver, isTransitioning, showRules]);

  // The count-up only plays on the Statistics open that follows the win, not when it is reopened.
  useEffect(() => {
    if (!showStats) setBannerCelebrating(false);
  }, [showStats]);

  const handleBeholdYourWork = async () => {
    const raw = localStorage.getItem(LS_DAILY.snapshot);
    if (!raw) return;
    let snap;
    try {
      snap = JSON.parse(raw);
    } catch {
      return;
    }
    const snapDay = snap.puzzleDate || snap.utcDate;
    if (snapDay !== getLocalDateString()) return;
    let triplets = snap.allLevelLetters;
    if (!Array.isArray(triplets) || triplets.length < 3) {
      triplets = await getDailyTripletsForDay(getLocalDateString());
    }
    setAllLevelLetters(triplets);
    setLetters(snap.letters);
    setCurrentLevel(snap.currentLevel ?? 3);
    setLevelResults(snap.levelResults || []);
    const finalT = snap.finalGameTime != null ? snap.finalGameTime : snap.gameTime ?? 0;
    setGameTime(finalT);
    gameTimeRef.current = finalT;
    gameElapsedMsRef.current = finalT * 1000;
    finalGameTimeRef.current = finalT;
    gameLastTickTimestampRef.current = performance.now();
    setHintWord(snap.hintWord ?? null);
    setHintTargetWord(snap.hintTargetWord ?? null);
    setHintCharsRevealed(snap.hintCharsRevealed ?? 0);
    setGameOver(true);
    setRoundStarted(true);
    setShowRevealAnimation(false);
    setRevealAnimationPlayedThisRound(true);
    const replayLevelResults = snap.levelResults || [];
    const replayIsFullWin =
      replayLevelResults.length === 3 &&
      replayLevelResults.every((r) => r.word && !r.gaveUp);
    try {
      if (replayIsFullWin && finalT > 0) {
        localStorage.setItem('currentRoundTimeTimed', String(finalT));
      } else {
        localStorage.removeItem('currentRoundTimeTimed');
      }
    } catch (_) {}
    setTimeout(() => openStatsModal(), 500);
  };

  const handleBegin = () => {
    const puzzleDay = getLocalDateString();
    if (readDailyCompletedUtc() === puzzleDay) return;
    if (readDailyAbandonedUtc() === puzzleDay) return;
    clearLastTimeDistBucketHighlight();
    setShowRevealAnimation(true);
    setRevealAnimationPlayedThisRound(false);
    setError(false);
    setErrorMessage('');
    resetMistakesForLevel();
    // Start the game after the reveal animation completes
    setTimeout(() => {
      rulesDismissedOnceRef.current = false;
      setRoundStarted(true);
      if (showRulesOnStart) {
        openRulesModal();
      } else {
        rulesDismissedOnceRef.current = true;
        // No rules modal: letters appear immediately with reveal; mark animation played after duration
        setTimeout(() => setRevealAnimationPlayedThisRound(true), 500);
      }
      startTimeRef.current = performance.now();
      // Focus the input field when the game starts (after they close rules)
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, 200); // Slightly longer delay to ensure the input field is fully rendered
    }, 500); // Match the animation duration
  };

  /** Fresh game: the intro plays first and handleBegin runs when it ends, so the clock can't start under it. */
  const startIntro = () => {
    const puzzleDay = getLocalDateString();
    if (readDailyCompletedUtc() === puzzleDay) return;
    if (readDailyAbandonedUtc() === puzzleDay) return;
    setIntroPhase('playing');
  };

  const handleIntroDone = () => {
    const puzzleDay = getLocalDateString();
    const canBegin = readDailyCompletedUtc() !== puzzleDay && readDailyAbandonedUtc() !== puzzleDay;
    setIntroPhase(canBegin ? 'done' : 'off');
    handleBegin();
  };

  const toggleShowRulesOnStart = () => {
    const next = !showRulesOnStart;
    setShowRulesOnStart(next);
    try {
      localStorage.setItem('sequenceGameTimedShowRulesOnStart', String(next));
    } catch (_) {}
  };

  const openRulesModal = () => {
    rulesModalAnimTokenRef.current += 1;
    setRulesModalClosing(false);
    setRulesModalAnim({
      cardTransform: 'translate(0px, 0px) scale(1)',
      overlayOpacity: 0,
      transitionEnabled: false,
    });
    setShowRules(true);
  };

  useLayoutEffect(() => {
    if (!showRules || rulesModalClosing) return undefined;

    const token = rulesModalAnimTokenRef.current;
    const shrunk = computeIconModalShrinkStyle(
      rulesIconRef.current,
      rulesModalCardRef.current
    );

    setRulesModalAnim({
      ...shrunk,
      transitionEnabled: false,
    });

    let innerFrame = null;
    const outerFrame = requestAnimationFrame(() => {
      innerFrame = requestAnimationFrame(() => {
        if (token !== rulesModalAnimTokenRef.current) return;
        setRulesModalAnim({
          cardTransform: 'translate(0px, 0px) scale(1)',
          overlayOpacity: 1,
          transitionEnabled: true,
        });
      });
    });

    return () => {
      cancelAnimationFrame(outerFrame);
      if (innerFrame != null) cancelAnimationFrame(innerFrame);
    };
  }, [showRules, rulesModalClosing]);

  const closeRulesModal = () => {
    rulesDismissedOnceRef.current = true;
    const token = ++rulesModalAnimTokenRef.current;
    const shrunk = computeIconModalShrinkStyle(
      rulesIconRef.current,
      rulesModalCardRef.current
    );

    setRulesModalClosing(true);
    setRulesModalAnim({
      ...shrunk,
      transitionEnabled: true,
    });

    setTimeout(() => {
      if (token !== rulesModalAnimTokenRef.current) return;
      setShowRules(false);
      setRulesModalClosing(false);
      setRulesModalAnim({
        cardTransform: 'translate(0px, 0px) scale(1)',
        overlayOpacity: 1,
        transitionEnabled: false,
      });
      setTimeout(() => setRevealAnimationPlayedThisRound(true), 500);
      setTimeout(() => inputRef.current?.focus(), 100);
    }, ICON_MODAL_ANIM_MS);
  };

  const openStatsModal = () => {
    statsModalAnimTokenRef.current += 1;
    setStatsModalClosing(false);
    setStatsModalAnim({
      cardTransform: 'translate(0px, 0px) scale(1)',
      overlayOpacity: 0,
      transitionEnabled: false,
    });
    setShowStats(true);
  };

  useLayoutEffect(() => {
    if (!showStats || statsModalClosing) return undefined;

    const token = statsModalAnimTokenRef.current;
    const shrunk = computeIconModalShrinkStyle(
      statsIconRef.current,
      statsModalCardRef.current
    );

    setStatsModalAnim({
      ...shrunk,
      transitionEnabled: false,
    });

    let innerFrame = null;
    const outerFrame = requestAnimationFrame(() => {
      innerFrame = requestAnimationFrame(() => {
        if (token !== statsModalAnimTokenRef.current) return;
        setStatsModalAnim({
          cardTransform: 'translate(0px, 0px) scale(1)',
          overlayOpacity: 1,
          transitionEnabled: true,
        });
      });
    });

    return () => {
      cancelAnimationFrame(outerFrame);
      if (innerFrame != null) cancelAnimationFrame(innerFrame);
    };
  }, [showStats, statsModalClosing]);

  const closeStatsModal = () => {
    const token = ++statsModalAnimTokenRef.current;
    const shrunk = computeIconModalShrinkStyle(
      statsIconRef.current,
      statsModalCardRef.current
    );

    setStatsModalClosing(true);
    setStatsModalAnim({
      ...shrunk,
      transitionEnabled: true,
    });
    setShowClearStatsButton(false);
    clearLastTimeDistBucketHighlight();

    setTimeout(() => {
      if (token !== statsModalAnimTokenRef.current) return;
      setShowStats(false);
      setStatsModalClosing(false);
      setStatsModalAnim({
        cardTransform: 'translate(0px, 0px) scale(1)',
        overlayOpacity: 1,
        transitionEnabled: false,
      });
    }, ICON_MODAL_ANIM_MS);
  };

  const closeContactModal = () => {
    setContactModalClosing(true);
    setShowContact(false);
    setTimeout(() => {
      setContactModalClosing(false);
      setContactEmail('');
      setContactSubject('');
      setContactMessage('');
      setContactModalMode('contact');
    }, 200);
  };

  /** Opens the user’s mail client with messages addressed to this inbox */
  const handleContactSend = () => {
    const msg = contactMessage.trim();
    if (!msg) return;
    const recipient = 'info@stringlish.com';
    const subject = encodeURIComponent(
      (contactSubject.trim() || 'Stringlish — contact').slice(0, 200)
    );
    let bodyText = 'Version: Stringlish Timed\n\n';
    if (contactEmail.trim()) {
      bodyText += `From: ${contactEmail.trim()}\n\n`;
    }
    bodyText += msg;
    const body = encodeURIComponent(bodyText);
    window.location.href = `mailto:${recipient}?subject=${subject}&body=${body}`;
    closeContactModal();
  };

  /** Fresh set of mistakes at the start of a level (or on restore, pass the saved value). */
  const resetMistakesForLevel = (remaining = MISTAKES_PER_LEVEL) => {
    const val = Math.max(0, Math.min(MISTAKES_PER_LEVEL, Number(remaining)));
    mistakesRemainingRef.current = val;
    setMistakesRemaining(val);
    guessedMistakeWordsRef.current = [];
    mistakeAnimatingRef.current = false;
    setMistakeAnimIndex(null);
  };

  /** Record a wrong guess: remember the word, animate a dot away, then decrement (ending the game at 0). */
  const registerMistake = (word) => {
    guessedMistakeWordsRef.current = [...guessedMistakeWordsRef.current, word];
    mistakeAnimatingRef.current = true;
    setMistakeAnimIndex(mistakesRemainingRef.current - 1);
    setTimeout(() => {
      const remaining = Math.max(0, mistakesRemainingRef.current - 1);
      mistakesRemainingRef.current = remaining;
      setMistakesRemaining(remaining);
      setMistakeAnimIndex(null);
      mistakeAnimatingRef.current = false;
      if (remaining <= 0) {
        // Small beat after the last dot vanishes before the end screen takes over.
        setTimeout(() => handleEndGame(), 500);
      }
    }, 300);
  };

  const handleSubmit = async (e, valueFromMobile) => {
    e.preventDefault();
    if (!roundStarted || gameOver || isTransitioning) return;
    if (mistakeAnimatingRef.current) return;
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    try {
      // On mobile, use value passed from the tap handler (captured at tap time); otherwise use state/ref/DOM
      const currentInput = isMobile && valueFromMobile !== undefined
      ? valueFromMobile
      : isMobile
        ? ((inputRef.current && inputRef.current.value != null ? String(inputRef.current.value) : '') || (typeof inputValueRef.current === 'string' ? inputValueRef.current : '') || input)
        : input;
      const word = currentInput.trim().toLowerCase();
      if (!word) { setError(true); setErrorMessage('Please enter a word'); return; }
      // A word that already cost a mistake this level can't cost another — just flag it.
      if (guessedMistakeWordsRef.current.includes(word)) { setError(true); setErrorMessage('Already guessed'); return; }
      if (word.length < 5) { setError(true); setErrorMessage('Must be 5+ letters long'); return; }
      // Wrong letter order → counts as a mistake (uses a guess).
      if (!isSequential(word, letters)) { setError(true); setErrorMessage(`Word must contain '${letters}' in order`); registerMistake(word); return; }
      // Swear words with letters in order don't count and don't cost a guess.
      if (isSwearWord(word)) { setError(true); setErrorMessage('Cuss words do not count'); return; }
      // Not a real word → counts as a mistake (uses a guess).
      if (!(await isValidWord(word))) { setError(true); setErrorMessage('Word not found in list'); registerMistake(word); return; }

      const timeToRecord = gameTimeRef.current;
      const levelResult = {
        letters: letters,
        word: word,
        time: timeToRecord,
        gaveUp: false,
        hintWordUsed: hintWord || null
      };

      const mergedResults = [...levelResults, levelResult];
      setLevelResults(mergedResults);
      setClockPop((n) => n + 1);

      setInput('');
      inputValueRef.current = '';
      setError(false);
      setErrorMessage('');

      if (currentLevel === 3) {
        finalGameTimeRef.current = timeToRecord;
        setGameOver(true);
        updateStats(timeToRecord, mergedResults);
        saveDailyCompletionSnapshot({
          puzzleDate: getLocalDateString(),
          allLevelLetters,
          letters,
          currentLevel: 3,
          levelResults: mergedResults,
          gameTime: timeToRecord,
          finalGameTime: timeToRecord,
          hintWord: hintWord || null,
          hintTargetWord: hintTargetWord || null,
          hintCharsRevealed,
        });
        setDailyUiEpoch((e) => e + 1);
        const fullWin = mergedResults.length === 3 && mergedResults.every((r) => r.word && !r.gaveUp);
        setTimeout(() => {
          openStatsModal();
          if (fullWin) {
            setBannerCelebrating(true);
            setShowConfetti(true);
          }
        }, 500);
      } else {
        setIsTransitioning(true);

        setTimeout(async () => {
          const nextLevel = currentLevel + 1;
          setLetters(allLevelLetters[nextLevel - 1]);
          setCurrentLevel(nextLevel);
          resetMistakesForLevel();

          setTimeout(() => {
            setIsTransitioning(false);
            setError(false);
            setErrorMessage('');
            setTimeout(() => {
              if (inputRef.current) {
                inputRef.current.focus();
              }
            }, 50);
          }, 100);
        }, 300);
      }
    } finally {
      isSubmittingRef.current = false;
    }
  };



  const handleEndGame = () => {
    if (!roundStarted || gameOver) return;
    const unsolvedLevels = [];
    if (levelResults.length < currentLevel) {
      const mistakes = guessedMistakeWordsRef.current;
      unsolvedLevels.push({
        letters: letters,
        word: null,
        // Their last wrong guess stands in for the answer they never found.
        lastGuess: mistakes.length ? mistakes[mistakes.length - 1] : null,
        time: gameTime,
        gaveUp: true,
        hintWordUsed: hintWord || null
      });
    }
    for (let i = currentLevel + 1; i <= 3; i++) {
      const levelLetters = allLevelLetters[i - 1];
      unsolvedLevels.push({
        letters: levelLetters,
        word: null,
        lastGuess: null,
        time: gameTime,
        gaveUp: true
      });
    }
    const mergedResults = [...levelResults, ...unsolvedLevels];
    const t = gameTimeRef.current;
    setLevelResults(mergedResults);
    finalGameTimeRef.current = t;
    setGameOver(true);
    updateStats(t, mergedResults);
    saveDailyCompletionSnapshot({
      puzzleDate: getLocalDateString(),
      allLevelLetters,
      letters,
      currentLevel,
      levelResults: mergedResults,
      gameTime: t,
      finalGameTime: t,
      hintWord: hintWord || null,
      hintTargetWord: hintTargetWord || null,
      hintCharsRevealed,
      gaveUp: true,
    });
    setDailyUiEpoch((e) => e + 1);
    localStorage.removeItem('currentRoundTimeTimed');
    setTimeout(() => openStatsModal(), 500);
  };

  // eslint-disable-next-line no-unused-vars
  const resetGame = () => {
    if (roundStarted && !gameOver) {
      const newStats = recordLossDate({ ...stats }, getLocalDateString());
      setStats(newStats);
      try {
        localStorage.setItem('sequenceGameTimedStats', JSON.stringify(newStats));
      } catch (_) {}
      markDailyAbandonedForLocalDate(getLocalDateString());
      setDailyUiEpoch((e) => e + 1);
    }

    localStorage.removeItem('currentRoundTimeTimed');
    finalGameTimeRef.current = null;
    gameTimeRef.current = 0;
    gameElapsedMsRef.current = 0;
    gameLastTickTimestampRef.current = null;
    rulesDismissedOnceRef.current = false;

    setRoundStarted(false);
    setShowRevealAnimation(false);
    setShowStats(false);
    clearLastTimeDistBucketHighlight();
    setShowGiveUpConfirm(false);
    setShowClearStatsButton(false);
    setCurrentLevel(1);
    setLevelResults([]);
    setGameTime(0);
    setGameOver(false);
    setIsTransitioning(false);
    setError(false);
    setErrorMessage('');
    resetMistakesForLevel();
    setHintWord(null);
    setHintTargetWord(null);
    setHintCharsRevealed(0);
    setHintAvailable(false);
    setHintFillProgress(0);
    clearHintTimers();
    hintTimerStartedThisRoundRef.current = false;

    (async () => {
      const triplets = await getDailyTripletsForDay(getLocalDateString());
      setAllLevelLetters(triplets);
      setLetters(triplets[0]);
    })();
    inputValueRef.current = '';
    setInput('');
  };

  const updateStats = (recordedTime, resultsOverride) => {
    const results = resultsOverride ?? levelResults;
    const newStats = { ...stats };
    const timeForThisRound = recordedTime != null ? recordedTime : gameTime;

    newStats.gamesPlayed = newStats.gamesPlayed || 0;
    newStats.gamesWon = newStats.gamesWon || 0;
    newStats.currentStreak = newStats.currentStreak || 0;
    newStats.maxStreak = newStats.maxStreak || 0;
    newStats.fastestTimes = newStats.fastestTimes || [];
    newStats.averageTimes = newStats.averageTimes || [];
    newStats.winTimes = Array.isArray(newStats.winTimes) ? newStats.winTimes : [];
    if (!Array.isArray(newStats.timeDistribution) || newStats.timeDistribution.length !== 5) {
      newStats.timeDistribution = [0, 0, 0, 0, 0];
    } else {
      newStats.timeDistribution = newStats.timeDistribution.map((n) => Math.max(0, Math.floor(Number(n) || 0)));
    }

    const hasGiveUps = results.some((r) => r.gaveUp);
    const isFullWin =
      results.length === 3 && results.every((r) => r.word && !r.gaveUp);

    newStats.gamesPlayed += 1;

    if (!hasGiveUps) {
      newStats.gamesWon += 1;
    }

    if (isFullWin) {
      recordWinDate(newStats, getLocalDateString());
    } else {
      recordLossDate(newStats, getLocalDateString());
    }

    if (isFullWin && timeForThisRound > 0) {
      newStats.winTimes = [...newStats.winTimes, timeForThisRound];
      newStats.fastestTimes = newStats.fastestTimes.filter((t) => t !== timeForThisRound);
      newStats.fastestTimes.push(timeForThisRound);
      newStats.fastestTimes.sort((a, b) => a - b);
      newStats.fastestTimes = newStats.fastestTimes.slice(0, FASTEST_TIMES_COUNT);
      try {
        localStorage.setItem('currentRoundTimeTimed', timeForThisRound.toString());
      } catch (_) {}
      const bIdx = bucketIndexForWinSeconds(timeForThisRound);
      newStats.timeDistribution[bIdx] = (newStats.timeDistribution[bIdx] || 0) + 1;
      try {
        localStorage.setItem(LS_TIMED_LAST_DIST_BUCKET, String(bIdx));
      } catch (_) {}
    } else {
      try {
        localStorage.removeItem('currentRoundTimeTimed');
      } catch (_) {}
    }

    setStats(newStats);
    localStorage.setItem('sequenceGameTimedStats', JSON.stringify(newStats));
  };

  const handleInputChange = (e) => {
    if (!roundStarted || gameOver || isTransitioning) return;
    const v = e.target.value;
    const lettersOnly = v.replace(/[^a-zA-Z]/g, '');
    const cleaned = lettersOnly.slice(0, 45);
    if (v !== lettersOnly) {
      setError(true);
      setErrorMessage('Letters only, please');
    } else {
      setError(false);
      setErrorMessage('');
    }
    inputValueRef.current = cleaned;
    setInput(cleaned);
  };

  // Virtual keyboard handlers
  const handleKeyboardLetter = (letter) => {
    if (!roundStarted || gameOver || isTransitioning) return;
    if (!/^[a-zA-Z]$/.test(letter)) {
      setError(true);
      setErrorMessage('Letters only, please');
      return;
    }

    const inputEl = inputRef.current;
    if (inputEl) {
      if (document.activeElement !== inputEl) inputEl.focus();
      let start = inputEl.selectionStart;
      const end = inputEl.selectionEnd || 0;
      const currentValue = inputEl.value;
      if (start === 0 && currentValue.length > 0 && document.activeElement !== inputEl) start = currentValue.length;
      else if (start === null || start === undefined) start = currentValue.length;
      const newValue = currentValue.slice(0, start) + letter + currentValue.slice(end);
      if (newValue.length > 45) {
        setError(true);
        setErrorMessage('Character limit reached (45)');
        return;
      }
      inputValueRef.current = newValue;
      setInput(newValue);
      setTimeout(() => {
        if (inputRef.current) inputRef.current.setSelectionRange(start + 1, start + 1);
      }, 0);
    } else {
      const next = (inputValueRef.current || '') + letter;
      if (next.length > 45) {
        setError(true);
        setErrorMessage('Character limit reached (45)');
        return;
      }
      inputValueRef.current = next;
      setInput(next);
    }
    if (error) { setError(false); setErrorMessage(''); }
  };
  handleKeyboardLetterRef.current = handleKeyboardLetter;

  const handleKeyboardBackspace = () => {
    if (!roundStarted || gameOver || isTransitioning) return;
    
    const input = inputRef.current;
    if (input) {
      const start = input.selectionStart || 0;
      const end = input.selectionEnd || 0;
      const currentValue = input.value;
      
      if (start !== end) {
        // Delete selected text
        const newValue = currentValue.slice(0, start) + currentValue.slice(end);
        inputValueRef.current = newValue;
        setInput(newValue);
        setTimeout(() => {
          if (inputRef.current) {
            inputRef.current.setSelectionRange(start, start);
          }
        }, 0);
      } else if (start > 0) {
        // Delete character before cursor
        const newValue = currentValue.slice(0, start - 1) + currentValue.slice(start);
        inputValueRef.current = newValue;
        setInput(newValue);
        setTimeout(() => {
          if (inputRef.current) {
            inputRef.current.setSelectionRange(start - 1, start - 1);
          }
        }, 0);
      }
    } else {
      // Fallback if input ref is not available
      const next = (inputValueRef.current || '').slice(0, -1);
      inputValueRef.current = next;
      setInput(next);
    }
    
    if (error) { setError(false); setErrorMessage(''); }
  };

  // Keep typing feeling snappy on touch devices by ensuring the input keeps focus.
  // We call this after virtual-key presses.
  const refocusInputSoon = () => {
    if (inputRef.current) {
      requestAnimationFrame(() => {
        if (inputRef.current && roundStarted && !gameOver && !isTransitioning && !showRules) {
          inputRef.current.focus();
          // Always position cursor at end when typing starts
          const pos = inputRef.current.value.length;
          inputRef.current.setSelectionRange(pos, pos);
          // On mobile, force cursor visibility with a slight delay
          if (isMobile) {
            setTimeout(() => {
              if (inputRef.current) {
                inputRef.current.focus();
                inputRef.current.setSelectionRange(pos, pos);
              }
            }, 50);
          }
        }
      });
    }
  };

  // On mobile, suppress the native keyboard by making the input readOnly + inputMode="none",
  // but still allow physical keyboards (e.g., bluetooth) by listening for keydown events.
  // Use handleKeyboardLetterRef so the latest handler runs (error clearing, 45-char limit, etc.).
  useEffect(() => {
    if (!isMobile || !roundStarted || gameOver) return;

    const onKeyDown = (e) => {
      if (isTransitioning) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === 'Enter') {
        if (e.repeat) return;
        e.preventDefault();
        const val = (inputValueRef.current ?? inputRef.current?.value ?? input ?? '') || '';
        handleSubmit(e, val);
        return;
      }

      if (e.key === 'Backspace') {
        e.preventDefault();
        handleKeyboardBackspace();
        return;
      }

      if (/^[a-zA-Z]$/.test(e.key)) {
        e.preventDefault();
        handleKeyboardLetterRef.current?.(e.key);
      } else if (e.key.length === 1) {
        e.preventDefault();
        setError(true);
        setErrorMessage('Letters only, please');
      }
    };

    window.addEventListener('keydown', onKeyDown, { passive: false });
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile, roundStarted, gameOver, isTransitioning]);

  const clearStats = () => {
    // Clear all statistical data
    localStorage.removeItem('sequenceGameTimedStats');
    clearLastTimeDistBucketHighlight();

    // Reset stats to initial state
    setStats({
      gamesPlayed: 0,
      gamesWon: 0,
      currentStreak: 0,
      maxStreak: 0,
      winDates: [],
      lastWinPuzzleDate: null,
      lastLossDate: null,
      fastestTimes: [],
      averageTimes: [],
      winTimes: [],
      timeDistribution: [0, 0, 0, 0, 0]
    });
  };

  const handleHint = async () => {
    if (isTransitioning || !letters) return;
    // One hint per level: once used, it's inactive and re-clicking just reminds them of the letters shown.
    if (hintWord) {
      setError(true);
      setErrorMessage(`Hint already used - ${hintWord.slice(0, 3).toUpperCase()}`);
      return;
    }
    if (!hintAvailable) {
      setError(true);
      setErrorMessage('Hint available after 30 seconds');
      return;
    }
    let target = hintTargetWord;
    if (!target) {
      target = await getDailyHintWord(letters, getLocalDateString());
      if (target) setHintTargetWord(target);
    }
    if (!target) return;

    const revealLen = Math.min(3, target.length);
    const hintVal = target.slice(0, revealLen).toLowerCase();
    setHintCharsRevealed(revealLen);
    setHintWord(target);

    inputValueRef.current = hintVal;
    setInput(hintVal);
    setError(false);
    setErrorMessage('');
    setHintRevealAnimating(true);
    setTimeout(() => setHintRevealAnimating(false), 300);

    clearHintTimers();
    setHintAvailable(false);
    setHintFillProgress(100);
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const dailyHomeMeta = useMemo(() => {
    void dailyUiEpoch;
    const puzzleDay = getLocalDateString();
    return {
      puzzleDay,
      completedToday: readDailyCompletedUtc() === puzzleDay,
      abandonedToday: readDailyAbandonedUtc() === puzzleDay,
      puzzleNumber: getLocalStringlishNumber(),
      dateLabel: formatLocalDateLong(new Date()),
    };
  }, [dailyUiEpoch]);

  /** Footer (Contact + copyright); hidden only during mobile in-round play, and stays put under How to Play */
  const footerBarVisible = !(isMobile && roundStarted && !gameOver);
  /** Tablet/desktop sizing for the brand pieces. */
  const big = viewportWidth >= 600;
  const typedLine = splitUnderline(
    isMobile
      ? { ...inputLineStyle(input.length, big ? 38 : 28), WebkitTapHighlightColor: 'transparent', cursor: 'text' }
      : desktopInputStyle(input.length),
  );

  if (introPhase === 'playing' || (introPhase === 'done' && !roundStarted)) {
    const introReady = allLevelLetters.length === 3 && !!letters && wordListReady;
    return <IntroScreen mode="Timed" ready={introReady} onDone={handleIntroDone} big={big} />;
  }

  // In production the hub handles all entry points, so suppress the in-app landing
  // screen. In development (npm start) show it so the game is testable locally.
  if (!roundStarted && !gameOver && process.env.NODE_ENV !== 'development') {
    return <div className="w-full min-h-[100dvh]" />;
  }

  // A guess is only gradeable at 5+ letters. Submit stays pressable below that but renders
  // inactive, so the error still teaches the rule.
  const submitReady = (((typeof input === 'string' ? input : inputValueRef.current) || '').trim()).length >= 5;
  const clockSeconds = gameOver && finalGameTimeRef.current != null ? finalGameTimeRef.current : gameTime;
  const roundIndex = gameOver ? 3 : Math.min(3, Math.max(currentLevel - 1, levelResults.length));
  const hintState = hintWord ? 'used' : hintAvailable ? 'ready' : 'loading';

  return (
    <div
      className={isMobile ? 'w-full overflow-x-hidden' : ''}
      style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}
    >
      <div
        style={{
          flex: '1 0 auto',
          width: '100%',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: big ? '18px 24px 0' : gameOver ? '8px 12px 0' : '10px 12px 8px',
          animation: introPhase === 'done' ? 'sl-fade 0.35s ease-out' : undefined,
        }}
      >
        <div style={{ width: '100%', maxWidth: big ? (gameOver ? 520 : 560) : undefined, flex: '1 0 auto', display: 'flex', flexDirection: 'column' }}>
      {!roundStarted ? (
        <div style={{ flex: '1 0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: '24px 0', textAlign: 'center' }}>
          <GameIcon size={84} />
          <Wordmark width={big ? 220 : 180} />
          <ModeLabel mode="Timed" big={big} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={nun(16, 800)}>#{dailyHomeMeta.puzzleNumber}</span>
            <span style={nun(14, 600)}>{dailyHomeMeta.dateLabel}</span>
          </div>
          <div style={{ display: 'flex', width: '100%', maxWidth: 260, marginTop: 4 }}>
            {dailyHomeMeta.completedToday ? (
              <ModalButton wide onClick={handleBeholdYourWork}>
                <span aria-hidden="true">🤩</span>
                Behold Your Work
              </ModalButton>
            ) : dailyHomeMeta.abandonedToday ? (
              <p style={{ ...nun(14, 600), margin: 0, textAlign: 'center' }}>
                You left today&apos;s puzzle unfinished. Come back tomorrow for the next one.
              </p>
            ) : (
              <ModalButton wide onClick={startIntro}>
                Begin
              </ModalButton>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <IconButton name="home" label="Home" href="/" />
            <IconButton name="stats" label="Statistics" onClick={openStatsModal} buttonRef={statsIconRef} />
            <IconButton name="help" label="How to play" onClick={openRulesModal} buttonRef={rulesIconRef} />
          </div>
        </div>
      ) : (
        <>
          <TopBar big={big} homeHref="/" onStats={openStatsModal} onHelp={openRulesModal} statsRef={statsIconRef} helpRef={rulesIconRef} />
          <ModeLabel mode="Timed" big={big} />
          <StatusRow left={formatTime(clockSeconds)} pop={clockPop} big={big} onGiveUp={() => setShowGiveUpConfirm(true)} showGiveUp={!gameOver} />

          {/* Game Over — one block per round: letters, the guess, then that round's possible answers */}
          {gameOver && (
            <>
              <div className="slide-up" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8, flexShrink: 0 }}>
                <RoundCard gap={8}>
                  {levelResults.map((result, index) => {
                    const solved = !result.gaveUp;
                    const guess = solved ? toTitleCase(result.word) : result.lastGuess ? toTitleCase(result.lastGuess) : 'No guess';
                    return (
                      <div key={index} style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                        {index > 0 && <div style={{ height: 1, background: HAIR, margin: '1px 0 2px' }} />}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                          <div style={{ ...center, gap: 12, width: '100%' }}>
                            <RoundBadge n={index + 1} ok={solved} />
                            <ProvidedLetters letters={result.letters} size={big ? 44 : 38} />
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', maxWidth: '100%' }}>
                            <GuessChip word={guess} ok={solved} />
                          </div>
                        </div>
                        <Disclosure defaultOpen={!solved}>
                          <PossibleAnswers letters={result.letters} max={3} puzzleDate={getLocalDateString()} />
                        </Disclosure>
                      </div>
                    );
                  })}
                </RoundCard>
              </div>
              <HomeButton href="/" />
            </>
          )}

          {/* Current Letters Display - hidden while rules modal is open to avoid flash before modal appears */}
          {!gameOver && !showRules && (
            <div
              className={`transition-opacity duration-300 ${isTransitioning ? 'opacity-0' : 'opacity-100'} ${
                showRevealAnimation && !revealAnimationPlayedThisRound ? 'reveal-content' : ''
              }`}
              style={{ ...center, paddingTop: 8, flexShrink: 0 }}
            >
              <ProvidedLetters letters={letters} size={big ? 78 : 56} />
            </div>
          )}

          {/* Input Section */}
          {roundStarted && !gameOver && !showRules && (
            <div
              ref={contentAboveKeyboardRef}
              className={showRevealAnimation && !revealAnimationPlayedThisRound ? 'reveal-content' : undefined}
              style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}
            >
                <div style={typedLine.frame}>
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={handleInputChange}
                  maxLength={45}
                  onPaste={(e) => {
                    const pasted = (e.clipboardData && e.clipboardData.getData('text')) || '';
                    if (input.length + pasted.length > 45) {
                      setTimeout(() => {
                        setError(true);
                        setErrorMessage('Character limit reached (45)');
                      }, 0);
                    }
                  }}
                  className={hintRevealAnimating ? 'sl-input hint-reveal-anim' : 'sl-input'}
                  style={typedLine.field}
                  placeholder="start typing..."
                  disabled={!roundStarted || gameOver || isTransitioning}
                  readOnly={isMobile}
                  inputMode={isMobile ? 'none' : undefined}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  onTouchStart={(e) => {
                    if (isMobile && inputRef.current) {
                      e.preventDefault();
                      const inputEl = inputRef.current;
                      inputEl.removeAttribute('readonly');
                      inputEl.focus();
                      const pos = inputEl.value.length;
                      inputEl.setSelectionRange(pos, pos);
                      setTimeout(() => {
                        inputEl.setAttribute('readonly', 'readonly');
                        inputEl.focus();
                        inputEl.setSelectionRange(pos, pos);
                      }, 100);
                      setTimeout(() => {
                        inputEl.focus();
                        inputEl.setSelectionRange(pos, pos);
                      }, 200);
                    }
                  }}
                  onFocus={(e) => {
                    if (e.target) {
                      const inputEl = e.target;
                      let pos = inputEl.selectionStart;
                      if ((pos === 0 || pos === null || pos === undefined) && inputEl.value.length > 0) pos = inputEl.value.length;
                      else if (pos === null || pos === undefined) pos = inputEl.value.length;
                      setTimeout(() => inputEl.setSelectionRange(pos, pos), 0);
                      if (isMobile) {
                        setTimeout(() => { inputEl.setSelectionRange(pos, pos); inputEl.focus(); }, 10);
                        setTimeout(() => inputEl.setSelectionRange(pos, pos), 50);
                      }
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
                      if (!/^[a-zA-Z]$/.test(e.key)) {
                        e.preventDefault();
                        setError(true);
                        setErrorMessage('Letters only, please');
                        return;
                      }
                      if (input.length >= 45) {
                        setError(true);
                        setErrorMessage('Character limit reached (45)');
                      }
                    }
                    if (e.key === 'Enter' && !e.repeat) {
                      e.stopPropagation();
                      handleSubmit(e, isMobile ? (inputValueRef.current ?? inputRef.current?.value ?? input ?? '') : undefined);
                    }
                  }}
                  onClick={(e) => {
                    if (isMobile && inputRef.current) {
                      const inputEl = inputRef.current;
                      const rect = inputEl.getBoundingClientRect();
                      const clickX = e.clientX - rect.left;
                      const clickPosition = Math.round(clickX / 8);
                      const newPosition = Math.max(0, Math.min(inputEl.value.length, clickPosition));
                      inputEl.setSelectionRange(newPosition, newPosition);
                      inputEl.focus();
                      setTimeout(() => inputEl.setSelectionRange(newPosition, newPosition), 10);
                      setTimeout(() => inputEl.setSelectionRange(newPosition, newPosition), 50);
                    }
                  }}
                  onBlur={() => {
                    if (roundStarted && !gameOver && !isTransitioning) {
                      setTimeout(() => {
                        if (inputRef.current && document.activeElement !== inputRef.current) {
                          inputRef.current.focus();
                        }
                      }, 150);
                    }
                  }}
                />
                </div>
              {/* Submit button - hidden on mobile */}
              {!isMobile && <SubmitButton ready={submitReady} onClick={handleSubmit} disabled={!roundStarted || gameOver || isTransitioning} />}
              <RoundsRow round={roundIndex} hint={<HintButton state={hintState} progress={hintFillProgress / 100} onClick={handleHint} pop={hintRevealAnimating} />} />
              {/* While a lost dot's 0.3s beat runs (new guesses blocked), show the count it is about to drop to. */}
              <Mistakes left={mistakeAnimIndex != null ? mistakeAnimIndex : mistakesRemaining} total={MISTAKES_PER_LEVEL} />
              <ErrorSlot text={error ? errorMessage : ''} big={big} />
        </div>
      )}

              {/* Virtual Keyboard - only on mobile; fixed at bottom; scales to viewport with 8px edge margin (matches ver2) */}
              {isMobile && roundStarted && !gameOver && !showRules && (() => {
                const edgeMargin = 8;
                const originalKeyBaseWidth = 35;
                const originalGapBase = 8;
                const keyCountTopRow = 10;
                const gapCountTopRow = keyCountTopRow - 1;
                const originalDesignRowWidth = keyCountTopRow * originalKeyBaseWidth + gapCountTopRow * originalGapBase;
                const keyBaseWidth = originalKeyBaseWidth + 3;
                const keyBaseHeight = 45 + 3;
                const gapBase = (originalDesignRowWidth - keyCountTopRow * keyBaseWidth) / gapCountTopRow;
                // Tablets: cap the keyboard at about 470px wide, centered.
                const availableWidth = Math.max(0, Math.min(viewportWidth - 2 * edgeMargin, 470));
                const designRowWidth = originalDesignRowWidth;
                let scale = availableWidth / designRowWidth;
                let gapPx = gapBase * scale;
                const gapMax = 10;
                const gapMin = 4;
                if (gapPx > gapMax && keyCountTopRow * keyBaseWidth > 0) {
                  scale = (availableWidth - gapCountTopRow * gapMax) / (keyCountTopRow * keyBaseWidth);
                  gapPx = gapMax;
                }
                gapPx = Math.max(gapMin, Math.min(gapMax, Math.round(gapPx)));
                const rowGapPx = Math.round(gapPx * 1.6);
                // Fixed (unscaled) gutter isolating Submit from the Z-M row so a low tap on a letter can't reach it.
                const submitGapPx = 14;
                const letterW = Math.round(keyBaseWidth * scale);
                const keyPadding = 4;
                const containerPaddingH = 8;
                const containerPaddingB = 8;
                const maxKeyboardHeight = typeof viewportHeight === 'number' && viewportHeight > 0 ? Math.min(viewportHeight * 0.4, 350) : 350;
                const nonKeyVertical = 8 + containerPaddingB + 2 * rowGapPx + submitGapPx;
                const maxLetterHeightFromContainer = Math.floor((maxKeyboardHeight - nonKeyVertical) / 4);
                const unconstrainedLetterH = Math.round(keyBaseHeight * scale);
                const letterH = Math.max(30, Math.min(60, unconstrainedLetterH, maxLetterHeightFromContainer));
                const bottomLettersCount = 7;
                const bottomKeysTotalWidth = bottomLettersCount * letterW;
                const bottomGapCount = bottomLettersCount + 2 - 1;
                const bottomGapsTotalWidth = bottomGapCount * gapPx;
                const specialWidth = Math.max(0, Math.round((availableWidth - bottomKeysTotalWidth - bottomGapsTotalWidth) / 2));
                const submitWidth = bottomKeysTotalWidth + (bottomLettersCount - 1) * gapPx;
                const specialHeight = letterH;
                const popupScale = 1.2;
                const popupW = Math.round(letterW * popupScale);
                const popupH = Math.round(letterH * popupScale);
                const popupGap = 4;
                // Submit stays pressable under 5 letters so handleSubmit can explain why it can't grade yet.
                const submitEnabled = roundStarted && !gameOver && !isTransitioning;
                const keyRadius = Math.round(letterH * 0.19);
                const keyFontPx = letterW >= 40 ? 18 : 16;
                const glyphPx = Math.round(letterH * 0.55);
                const underlineScale = letterH / 36;
                const shiftGlyphState = mobileCapsLock ? 'lock' : mobileShiftActive ? 'on' : 'off';
                const letterKeyStyle = (indexes) => ({ ...keyFaceStyle({ indexes, radius: keyRadius }), fontSize: keyFontPx });
                // Pressed-letter bubble: 1.2x the key, in the key's first tint; the bridge hides the seam into the key.
                const renderKeyPopup = (letter, indexes) => {
                  const popBg = indexes.length ? KEY_TINTS[indexes[0]] : WHITE;
                  return (
                    <>
                      <div style={{ position: 'absolute', left: 1.2, right: 1.2, bottom: 'calc(100% - 1.5px)', height: popupGap + 3, background: popBg, zIndex: 11 }} />
                      <div style={{ position: 'absolute', left: '50%', marginLeft: -popupW / 2, bottom: `calc(100% + ${popupGap}px)`, width: popupW, height: popupH, boxSizing: 'border-box', background: popBg, border: `1.2px solid ${LINE}`, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: NUNITO, fontSize: 23, fontWeight: 800, color: INK, zIndex: 10, pointerEvents: 'none' }}>{letter}</div>
                    </>
                  );
                };
                const isPointerOverTarget = (event) => {
                  const r = event.currentTarget.getBoundingClientRect();
                  return event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom;
                };
                const findNearestIndexByCenters = (x, widths, gap) => {
                  let cursor = 0;
                  let bestIndex = 0;
                  let bestDist = Infinity;
                  for (let i = 0; i < widths.length; i++) {
                    const center = cursor + widths[i] / 2;
                    const dist = Math.abs(x - center);
                    if (dist < bestDist) { bestDist = dist; bestIndex = i; }
                    cursor += widths[i] + gap;
                  }
                  return bestIndex;
                };
                const handleTopRowBackgroundPointerDown = (event) => {
                  if (!roundStarted || gameOver || isTransitioning) return;
                  if (event.target && event.target.closest && event.target.closest('button')) return;
                  const rect = event.currentTarget.getBoundingClientRect();
                  const x = event.clientX - rect.left;
                  const letters = ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'];
                  const widths = new Array(letters.length).fill(letterW);
                  const idx = findNearestIndexByCenters(x, widths, gapPx);
                  const letter = letters[idx] || letters[0];
                  event.preventDefault();
                  event.stopPropagation();
                  setPressedKey(letter);
                  const useCapital = mobileShiftActiveRef.current;
                  handleKeyboardLetter(useCapital ? letter : letter.toLowerCase());
                  if (useCapital && !mobileCapsLockRef.current) {
                    mobileShiftActiveRef.current = false;
                    setMobileShiftActive(false);
                  }
                  refocusInputSoon();
                };
                const handleTopRowPointerUpOrCancel = () => { setPressedKey(null); };
                const handleMiddleRowBackgroundPointerDown = (event) => {
                  if (!roundStarted || gameOver || isTransitioning) return;
                  if (event.target && event.target.closest && event.target.closest('button')) return;
                  const rect = event.currentTarget.getBoundingClientRect();
                  const x = event.clientX - rect.left;
                  const letters = ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'];
                  const widths = new Array(letters.length).fill(letterW);
                  const idx = findNearestIndexByCenters(x, widths, gapPx);
                  const letter = letters[idx] || letters[0];
                  event.preventDefault();
                  event.stopPropagation();
                  setPressedKey(letter);
                  const useCapital = mobileShiftActiveRef.current;
                  handleKeyboardLetter(useCapital ? letter : letter.toLowerCase());
                  if (useCapital && !mobileCapsLockRef.current) {
                    mobileShiftActiveRef.current = false;
                    setMobileShiftActive(false);
                  }
                  refocusInputSoon();
                };
                const handleMiddleRowPointerUpOrCancel = () => { setPressedKey(null); };
                const handleBottomRowBackgroundPointerDown = (event) => {
                  if (!roundStarted || gameOver || isTransitioning) return;
                  if (event.target && event.target.closest && event.target.closest('button')) return;
                  const rect = event.currentTarget.getBoundingClientRect();
                  const x = event.clientX - rect.left;
                  const keys = [
                    { type: 'shift' },
                    { type: 'letter', value: 'Z' }, { type: 'letter', value: 'X' }, { type: 'letter', value: 'C' },
                    { type: 'letter', value: 'V' }, { type: 'letter', value: 'B' }, { type: 'letter', value: 'N' }, { type: 'letter', value: 'M' },
                    { type: 'backspace' },
                  ];
                  const widths = [specialWidth, letterW, letterW, letterW, letterW, letterW, letterW, letterW, specialWidth];
                  const idx = findNearestIndexByCenters(x, widths, gapPx);
                  const key = keys[idx] || keys[0];
                  event.preventDefault();
                  event.stopPropagation();
                  if (key.type === 'letter') {
                    const letter = key.value;
                    setPressedKey(letter);
                    const useCapital = mobileShiftActiveRef.current;
                    handleKeyboardLetter(useCapital ? letter : letter.toLowerCase());
                    if (useCapital && !mobileCapsLockRef.current) {
                      mobileShiftActiveRef.current = false;
                      setMobileShiftActive(false);
                    }
                    refocusInputSoon();
                  } else if (key.type === 'shift') {
                    setPressedKey('shift');
                    const now = Date.now();
                    if (!mobileShiftActive) {
                      mobileShiftActiveRef.current = true;
                      mobileCapsLockRef.current = false;
                      setMobileShiftActive(true);
                      setMobileCapsLock(false);
                      mobileShiftOnAtRef.current = now;
                    } else if (mobileCapsLock) {
                      mobileShiftActiveRef.current = false;
                      mobileCapsLockRef.current = false;
                      setMobileShiftActive(false);
                      setMobileCapsLock(false);
                    } else {
                      if (now - mobileShiftOnAtRef.current < 450) {
                        mobileCapsLockRef.current = true;
                        setMobileCapsLock(true);
                      } else {
                        mobileShiftActiveRef.current = false;
                        setMobileShiftActive(false);
                      }
                    }
                    refocusInputSoon();
                  } else if (key.type === 'backspace') {
                    setPressedKey('backspace');
                    handleKeyboardBackspace();
                    refocusInputSoon();
                  }
                };
                const handleBottomRowPointerUpOrCancel = () => { setPressedKey(null); };
                return (
                <>
                  <div style={{ marginTop: 15, minHeight: 260 }} aria-hidden />
                  <div
                    className={isMobile ? "" : "mt-4"}
                    style={isMobile ? { position: 'fixed', bottom: 0, left: 0, right: 0, padding: `8px ${containerPaddingH}px ${containerPaddingB}px`, background: 'transparent', zIndex: 20 } : { padding: '0 10px' }}
                  >
            {/* Top row: Q-P */}
            <div className="flex justify-center relative flex-nowrap" style={{ gap: gapPx, marginBottom: rowGapPx }} onPointerDown={handleTopRowBackgroundPointerDown} onPointerUp={handleTopRowPointerUpOrCancel} onPointerCancel={handleTopRowPointerUpOrCancel}>
              {['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'].map((letter) => {
                const provIdx = providedIndexes(letters, letter);
                return (
                <div key={letter} style={{ position: 'relative', width: letterW, height: letterH, flexShrink: 0, overflow: 'visible' }}>
                  <button
                    type="button"
                    onPointerDown={(e) => {
                      e.preventDefault(); e.stopPropagation();
                      setPressedKey(letter);
                      const useCapital = mobileShiftActiveRef.current;
                      handleKeyboardLetter(useCapital ? letter : letter.toLowerCase());
                      if (useCapital && !mobileCapsLockRef.current) { mobileShiftActiveRef.current = false; setMobileShiftActive(false); }
                      refocusInputSoon();
                    }}
                    onPointerUp={(e) => { e.preventDefault(); e.stopPropagation(); setPressedKey(null); }}
                    onPointerCancel={(e) => { e.preventDefault(); e.stopPropagation(); setPressedKey(null); }}
                    className="touch-manipulation"
                    disabled={!roundStarted || gameOver || isTransitioning}
                    style={{
                      ...letterKeyStyle(provIdx),
                      touchAction: 'manipulation',
                      width: '100%',
                      height: '100%',
                      padding: keyPadding,
                      boxSizing: 'border-box',
                      userSelect: 'none',
                      WebkitUserSelect: 'none',
                      WebkitTapHighlightColor: 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minHeight: letterH,
                      position: 'relative',
                      zIndex: 2,
                      pointerEvents: 'auto',
                    }}
                  >
                    {pressedKey === letter ? '' : letter}
                    <KeyUnderlines indexes={provIdx} scale={underlineScale} />
                  </button>
                  {pressedKey === letter && renderKeyPopup(letter, provIdx)}
                </div>
                );
              })}
            </div>
            {/* Middle row: A-L */}
            <div className="flex justify-center relative flex-nowrap" style={{ gap: gapPx, marginBottom: rowGapPx }} onPointerDown={handleMiddleRowBackgroundPointerDown} onPointerUp={handleMiddleRowPointerUpOrCancel} onPointerCancel={handleMiddleRowPointerUpOrCancel}>
              {['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'].map((letter) => {
                const provIdx = providedIndexes(letters, letter);
                return (
                <div key={letter} style={{ position: 'relative', width: letterW, height: letterH, flexShrink: 0, overflow: 'visible' }}>
                  <button
                    type="button"
                    onPointerDown={(e) => {
                      e.preventDefault(); e.stopPropagation();
                      setPressedKey(letter);
                      const useCapital = mobileShiftActiveRef.current;
                      handleKeyboardLetter(useCapital ? letter : letter.toLowerCase());
                      if (useCapital && !mobileCapsLockRef.current) { mobileShiftActiveRef.current = false; setMobileShiftActive(false); }
                      refocusInputSoon();
                    }}
                    onPointerUp={(e) => { e.preventDefault(); e.stopPropagation(); setPressedKey(null); }}
                    onPointerCancel={(e) => { e.preventDefault(); e.stopPropagation(); setPressedKey(null); }}
                    className="touch-manipulation"
                    disabled={!roundStarted || gameOver || isTransitioning}
                    style={{
                      ...letterKeyStyle(provIdx),
                      touchAction: 'manipulation',
                      width: '100%',
                      height: '100%',
                      padding: keyPadding,
                      boxSizing: 'border-box',
                      userSelect: 'none',
                      WebkitUserSelect: 'none',
                      WebkitTapHighlightColor: 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minHeight: letterH,
                      position: 'relative',
                      zIndex: 2,
                      pointerEvents: 'auto',
                    }}
                  >
                    {pressedKey === letter ? '' : letter}
                    <KeyUnderlines indexes={provIdx} scale={underlineScale} />
                  </button>
                  {pressedKey === letter && renderKeyPopup(letter, provIdx)}
                </div>
                );
              })}
            </div>
            {/* Bottom row: Shift + Z-M + Backspace */}
            <div className="flex justify-center relative flex-nowrap" style={{ gap: gapPx }} onPointerDown={handleBottomRowBackgroundPointerDown} onPointerUp={handleBottomRowPointerUpOrCancel} onPointerCancel={handleBottomRowPointerUpOrCancel}>
              <div style={{ position: 'relative', width: specialWidth, height: specialHeight, flexShrink: 0 }}>
                <button
                  type="button"
                  onPointerDown={(e) => {
                    e.preventDefault(); e.stopPropagation();
                    setPressedKey('shift');
                    const now = Date.now();
                    if (!mobileShiftActive) {
                      mobileShiftActiveRef.current = true;
                      mobileCapsLockRef.current = false;
                      setMobileShiftActive(true);
                      setMobileCapsLock(false);
                      mobileShiftOnAtRef.current = now;
                    } else if (mobileCapsLock) {
                      mobileShiftActiveRef.current = false;
                      mobileCapsLockRef.current = false;
                      setMobileShiftActive(false);
                      setMobileCapsLock(false);
                    } else {
                      if (now - mobileShiftOnAtRef.current < 450) {
                        mobileCapsLockRef.current = true;
                        setMobileCapsLock(true);
                      } else {
                        mobileShiftActiveRef.current = false;
                        setMobileShiftActive(false);
                      }
                    }
                    refocusInputSoon();
                  }}
                  onPointerUp={(e) => { e.preventDefault(); e.stopPropagation(); setPressedKey(null); }}
                  onPointerCancel={(e) => { e.preventDefault(); e.stopPropagation(); setPressedKey(null); }}
                  className="touch-manipulation"
                  disabled={!roundStarted || gameOver || isTransitioning}
                  style={{ ...keyFaceStyle({ special: true, down: pressedKey === 'shift', active: mobileShiftActive, radius: keyRadius }), touchAction: 'manipulation', width: '100%', padding: keyPadding, boxSizing: 'border-box', userSelect: 'none', WebkitUserSelect: 'none', WebkitTapHighlightColor: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: specialHeight, height: specialHeight, position: 'relative', zIndex: pressedKey === 'shift' ? 10 : 2, transform: pressedKey === 'shift' ? 'scale(1.3)' : 'scale(1)', transition: 'transform 0.1s ease-out' }}
                  title={mobileCapsLock ? 'Caps lock on (tap to turn off)' : mobileShiftActive ? 'Next letter capital (double-tap for caps lock)' : 'Tap for one capital letter; double-tap for caps lock'}
                  aria-label={mobileCapsLock ? 'Caps lock on' : mobileShiftActive ? 'Next letter will be capital' : 'Shift'}
                >
                  <ShiftGlyph state={shiftGlyphState} size={glyphPx} />
                </button>
              </div>
              {['Z', 'X', 'C', 'V', 'B', 'N', 'M'].map((letter) => {
                const provIdx = providedIndexes(letters, letter);
                return (
                <div key={letter} style={{ position: 'relative', width: letterW, height: letterH, flexShrink: 0, overflow: 'visible' }}>
                  <button
                    type="button"
                    onPointerDown={(e) => {
                      e.preventDefault(); e.stopPropagation();
                      setPressedKey(letter);
                      const useCapital = mobileShiftActiveRef.current;
                      handleKeyboardLetter(useCapital ? letter : letter.toLowerCase());
                      if (useCapital && !mobileCapsLockRef.current) { mobileShiftActiveRef.current = false; setMobileShiftActive(false); }
                      refocusInputSoon();
                    }}
                    onPointerUp={(e) => { e.preventDefault(); e.stopPropagation(); setPressedKey(null); }}
                    onPointerCancel={(e) => { e.preventDefault(); e.stopPropagation(); setPressedKey(null); }}
                    className="touch-manipulation"
                    disabled={!roundStarted || gameOver || isTransitioning}
                    style={{
                      ...letterKeyStyle(provIdx),
                      touchAction: 'manipulation',
                      width: '100%',
                      height: '100%',
                      padding: keyPadding,
                      boxSizing: 'border-box',
                      userSelect: 'none',
                      WebkitUserSelect: 'none',
                      WebkitTapHighlightColor: 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minHeight: letterH,
                      position: 'relative',
                      zIndex: 2,
                      pointerEvents: 'auto',
                    }}
                  >
                    {pressedKey === letter ? '' : letter}
                    <KeyUnderlines indexes={provIdx} scale={underlineScale} />
                  </button>
                  {pressedKey === letter && renderKeyPopup(letter, provIdx)}
                </div>
                );
              })}
              <div style={{ position: 'relative', width: specialWidth, height: specialHeight, flexShrink: 0 }}>
                <button
                  type="button"
                  onPointerDown={(e) => {
                    e.preventDefault(); e.stopPropagation();
                    setPressedKey('backspace');
                    handleKeyboardBackspace();
                    refocusInputSoon();
                    backspaceHoldTimeoutRef.current = setTimeout(() => {
                      backspaceHoldIntervalRef.current = setInterval(() => handleKeyboardBackspace(), 50);
                    }, 300);
                  }}
                  onPointerUp={(e) => {
                    e.preventDefault(); e.stopPropagation(); setPressedKey(null);
                    if (backspaceHoldTimeoutRef.current) { clearTimeout(backspaceHoldTimeoutRef.current); backspaceHoldTimeoutRef.current = null; }
                    if (backspaceHoldIntervalRef.current) { clearInterval(backspaceHoldIntervalRef.current); backspaceHoldIntervalRef.current = null; }
                  }}
                  onPointerCancel={(e) => {
                    e.preventDefault(); e.stopPropagation(); setPressedKey(null);
                    if (backspaceHoldTimeoutRef.current) { clearTimeout(backspaceHoldTimeoutRef.current); backspaceHoldTimeoutRef.current = null; }
                    if (backspaceHoldIntervalRef.current) { clearInterval(backspaceHoldIntervalRef.current); backspaceHoldIntervalRef.current = null; }
                  }}
                  className="touch-manipulation"
                  disabled={!roundStarted || gameOver || isTransitioning}
                  aria-label="Delete"
                  style={{ ...keyFaceStyle({ special: true, down: pressedKey === 'backspace', radius: keyRadius }), touchAction: 'manipulation', width: '100%', padding: keyPadding, boxSizing: 'border-box', userSelect: 'none', WebkitUserSelect: 'none', WebkitTapHighlightColor: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: specialHeight, height: specialHeight, position: 'relative', zIndex: pressedKey === 'backspace' ? 10 : 2, transform: pressedKey === 'backspace' ? 'scale(1.3)' : 'scale(1)', transition: 'transform 0.1s ease-out' }}
                >
                  <DeleteGlyph size={glyphPx} />
                </button>
              </div>
            </div>
            {/* Submit: spans Z to M, sits below a fixed gutter, and commits on release so a finger that
                lands here by mistake can slide off to cancel. Whole key is tappable. */}
            <div className="w-full flex justify-center" style={{ marginTop: submitGapPx }}>
              <button
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault(); e.stopPropagation();
                  submitArmedRef.current = true;
                  submitInsideRef.current = true;
                  setPressedKey('submit');
                }}
                onPointerMove={(e) => {
                  if (!submitArmedRef.current) return;
                  const inside = isPointerOverTarget(e);
                  if (inside === submitInsideRef.current) return;
                  submitInsideRef.current = inside;
                  setPressedKey(inside ? 'submit' : null);
                }}
                onPointerUp={(e) => {
                  e.preventDefault(); e.stopPropagation();
                  setPressedKey(null);
                  if (!submitArmedRef.current) return;
                  submitArmedRef.current = false;
                  // Lifted outside the key: the press was cancelled, so don't spend a mistake.
                  if (!isPointerOverTarget(e)) { refocusInputSoon(); return; }
                  mobileShiftActiveRef.current = false;
                  mobileCapsLockRef.current = false;
                  setMobileShiftActive(false);
                  setMobileCapsLock(false);
                  const val = (inputRef.current?.value ?? inputValueRef.current ?? input) ?? '';
                  handleSubmit(e, val);
                  refocusInputSoon();
                }}
                onPointerCancel={(e) => {
                  e.preventDefault(); e.stopPropagation();
                  submitArmedRef.current = false;
                  setPressedKey(null);
                }}
                className="touch-manipulation"
                disabled={!submitEnabled}
                aria-label={submitReady ? 'Submit' : 'Submit (enter at least 5 letters)'}
                style={{
                  touchAction: 'manipulation',
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  WebkitTapHighlightColor: 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                  zIndex: pressedKey === 'submit' ? 10 : 2,
                  transform: pressedKey === 'submit' ? 'scale(1.02)' : 'scale(1)',
                  transition: 'transform 0.1s ease-out, background-color 0.1s ease-out',
                  width: submitWidth,
                  height: letterH,
                  minHeight: letterH,
                  boxSizing: 'border-box',
                  borderRadius: keyRadius,
                  border: `1.2px solid ${submitReady ? INK : LINE}`,
                  background: submitReady ? (pressedKey === 'submit' ? '#47484A' : INK) : '#FFFFFF80',
                  ...nun(keyFontPx, 800, { color: submitReady ? WHITE : INK }),
                }}
              >
                <span style={{ opacity: submitReady ? 1 : 0.4 }}>Submit</span>
              </button>
            </div>
          </div>
        </>
        );
              })()}

          <div style={{ flex: '1 1 0', minHeight: gameOver ? 8 : 0 }} />
        </>
      )}
        </div>
      </div>

      {/* Footer - hidden on mobile during gameplay when keyboard is shown */}
      {footerBarVisible && (
        <Footer
          onContact={() => {
            setContactModalMode('contact');
            setShowContact(true);
          }}
          onBug={() => {
            setContactModalMode('bug');
            setShowContact(true);
          }}
        />
      )}

      {/* Give Up confirmation modal */}
      {showGiveUpConfirm && roundStarted && !gameOver && (
        <ModalScrim zIndex={10000}>
          <GiveUpCard
            onKeep={() => setShowGiveUpConfirm(false)}
            onEnd={() => {
              setShowGiveUpConfirm(false);
              handleEndGame();
            }}
          />
        </ModalScrim>
      )}

      {/* Statistics Modal */}
      {(showStats || statsModalClosing) && (
        <ModalScrim
          zIndex={9999}
          style={{
            opacity: statsModalAnim.overlayOpacity,
            transition: statsModalAnim.transitionEnabled
              ? `opacity ${ICON_MODAL_ANIM_MS}ms ease-out`
              : 'none',
          }}
        >
          <ModalCard
            gap={8}
            cardRef={statsModalCardRef}
            labelledBy="timed-stats-title"
            style={{
              transform: statsModalAnim.cardTransform,
              transformOrigin: 'center center',
              transition: statsModalAnim.transitionEnabled
                ? `transform ${ICON_MODAL_ANIM_MS}ms ease-out`
                : 'none',
            }}
          >
            {/* Header — the chart icon toggles the hidden Clear Stats link (testing) */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 28, flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setShowClearStatsButton((v) => !v)}
                  style={{ ...PLAIN_BUTTON, display: 'flex', cursor: 'default', outline: 'none' }}
                  aria-label="Toggle Clear Stats visibility (testing)"
                >
                  <Icon name="stats" size={20} />
                </button>
                <span id="timed-stats-title" style={nun(18, 800)}>
                  Statistics
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {showClearStatsButton && (
                  <button
                    type="button"
                    onClick={clearStats}
                    className="sl-tap"
                    style={{ ...PLAIN_BUTTON, ...nun(12.5, 700), textDecoration: 'underline', textUnderlineOffset: 3 }}
                  >
                    Clear Stats
                  </button>
                )}
                <button
                  type="button"
                  onClick={closeStatsModal}
                  aria-label="Close"
                  className="sl-tap"
                  style={{ ...PLAIN_BUTTON, ...nun(24, 600, { lineHeight: 1, padding: '0 4px' }) }}
                >
                  {'\u00d7'}
                </button>
              </div>
            </div>

            {/* Game Result Message — only after full round (3 stages), not mid-game */}
            {levelResults.length === 3 && (() => {
              const won = levelResults.every((result) => !result.gaveUp);
              const currentTime = gameOver && finalGameTimeRef.current != null ? finalGameTimeRef.current : gameTime;
              let trend = null;
              const winTimes = Array.isArray(stats.winTimes) ? stats.winTimes : [];
              if (won && winTimes.length >= 2) {
                const prevTimes = winTimes.slice(0, -1);
                const avg = Math.round(prevTimes.reduce((s, t) => s + t, 0) / prevTimes.length);
                const diff = Math.abs(currentTime - avg);
                const faster = currentTime < avg;
                trend = (
                  <>
                    <span style={{ fontWeight: 800 }}>
                      {formatTime(diff)} {faster ? 'faster' : 'slower'}
                    </span>{' '}
                    than average
                  </>
                );
              }
              return <TimedResultBanner won={won} seconds={currentTime} trend={trend} celebrate={bannerCelebrating} format={formatTime} />;
            })()}

            <StatGrid
              items={[
                [stats.gamesPlayed, 'Games Played'],
                [stats.gamesPlayed > 0 ? Math.round((stats.gamesWon / stats.gamesPlayed) * 100) : 0, 'Win %'],
                [stats.currentStreak, 'Current Streak'],
                [stats.maxStreak || 0, 'Max Streak'],
              ]}
            />

            {(() => {
              const td =
                stats.timeDistribution && stats.timeDistribution.length === 5
                  ? stats.timeDistribution.map((n) => Math.max(0, Math.floor(Number(n) || 0)))
                  : [0, 0, 0, 0, 0];
              let lastB = NaN;
              try {
                const raw = localStorage.getItem(LS_TIMED_LAST_DIST_BUCKET);
                if (raw != null) lastB = parseInt(raw, 10);
              } catch (_) {}
              return (
                <Distribution
                  mode="Timed"
                  title="Time Distribution"
                  top="🔥"
                  bottom="🐢"
                  labels={TIME_DISTRIBUTION_TIERS.map(({ label }) => label)}
                  counts={td}
                  highlight={Number.isNaN(lastB) ? -1 : lastB}
                />
              );
            })()}

            <div style={{ ...center, gap: 6, flexShrink: 0, ...nun(13, 600) }}>
              Fastest Time
              <span style={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                {Array.isArray(stats.fastestTimes) && stats.fastestTimes.length ? formatTime(Math.min(...stats.fastestTimes)) : '–'}
              </span>
            </div>

            <div style={{ borderTop: `1px solid ${LINE}`, paddingTop: 10, display: 'flex', flexShrink: 0 }}>
              <ModalButton
                wide
                bg={DEEP.Timed}
                onClick={async () => {
                  const d = new Date();
                  const monthName = d.toLocaleDateString('en-US', { month: 'long' });
                  const dayNum = d.getDate();
                  const year = d.getFullYear();
                  const completed = levelResults.length === 3 && levelResults.every(r => !r.gaveUp);
                  const lastRoundTime = finalGameTimeRef.current != null
                    ? finalGameTimeRef.current
                    : parseInt(localStorage.getItem('currentRoundTimeTimed') || '0', 10);
                  const text = completed && lastRoundTime > 0
                    ? `Stringlish ⏰ Timed\nTime: ${formatTime(lastRoundTime)}\n${monthName} ${dayNum}, ${year}\nSee if you can beat me at:\nhttps://stringlish.com/`
                    : `Stringlish ⏰ Timed\nI tried my best...\n${monthName} ${dayNum}, ${year}\nSee if you can get it at:\nhttps://stringlish.com/`;
                  if (typeof navigator.share === 'function') {
                    try {
                      await navigator.share({ text });
                    } catch (err) {
                      if (err.name !== 'AbortError') {
                        try {
                          await navigator.clipboard.writeText(text);
                        } catch (_) {}
                      }
                    }
                  } else {
                    try {
                      await navigator.clipboard.writeText(text);
                    } catch (_) {}
                  }
                }}
              >
                Share <Icon name="share" size={17} color={WHITE} />
              </ModalButton>
            </div>
          </ModalCard>
        </ModalScrim>
      )}

      {/* Contact / Report a Bug */}
      {(showContact || contactModalClosing) && (
        <ModalScrim zIndex={9999} className={contactModalClosing ? 'modal-fade-out' : 'modal-fade-in'} onClose={closeContactModal}>
          <ContactCard
            bug={contactModalMode === 'bug'}
            email={contactEmail}
            subject={contactSubject}
            message={contactMessage}
            onEmail={(e) => setContactEmail(e.target.value)}
            onSubject={(e) => setContactSubject(e.target.value)}
            onMessage={(e) => setContactMessage(e.target.value)}
            onCancel={closeContactModal}
            onSend={handleContactSend}
          />
        </ModalScrim>
      )}

      {/* Rules Modal — 3-step wizard */}
      {(showRules || rulesModalClosing) && (
        <TimedRulesModal
          showRules={showRules}
          isMobile={isMobile}
          onClose={closeRulesModal}
          showRulesOnStart={showRulesOnStart}
          onToggleShowRulesOnStart={toggleShowRulesOnStart}
          modalCardRef={rulesModalCardRef}
          modalAnim={rulesModalAnim}
        />
      )}

      <style>{`
        @keyframes reveal-from-top {
          0% {
            opacity: 0;
            transform: translateY(-30px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        .reveal-content {
          animation: reveal-from-top 0.5s ease-out forwards;
        }
        
        @keyframes modal-fade-in {
          0% {
            opacity: 0;
          }
          100% {
            opacity: 1;
          }
        }
        
        .modal-fade-in {
          animation: modal-fade-in 0.2s ease-out forwards;
        }
        
        @keyframes modal-fade-out {
          0% { opacity: 1; }
          100% { opacity: 0; }
        }
        .modal-fade-out {
          animation: modal-fade-out 0.2s ease-out forwards;
        }

        .slide-up {
          animation: slideUp 0.4s ease-in-out forwards;
        }

        @keyframes slideUp {
          from { 
            opacity: 0;
            transform: translateY(20px);
          }
          to { 
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        @keyframes hintReveal {
          0% { transform: scale(1); }
          50% { transform: scale(1.2); }
          100% { transform: scale(1); }
        }
        .hint-reveal-anim {
          animation: hintReveal 0.3s ease-out;
        }
      `}</style>

      {/* Full-screen confetti — plays once on a full 3-level win, above the stats modal */}
      {showConfetti && <Confetti onDone={() => setShowConfetti(false)} />}
    </div>
  );
}