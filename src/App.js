// Required dependencies: react, @fortawesome/react-fontawesome, @fortawesome/free-solid-svg-icons
// Tailwind CSS is used for styling (optional, or replace with your own CSS)
// Drop this file into your React project and import/use <WordPuzzleGame />
// 
// VERSION: TIMED EDITION - Uses isolated localStorage keys to prevent stats conflicts with other versions
// Storage: sequenceGameTimedStats, currentRoundTimeTimed, stringlich_timed_daily* (completion / abandon / snapshot / in-progress)
import React, { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faStopwatch, faCircleInfo, faChartSimple, faCheckCircle, faTimesCircle, faCircleQuestion, faHouseChimney, faShareNodes, faChevronDown, faEnvelope } from '@fortawesome/free-solid-svg-icons';
import words from 'an-array-of-english-words';

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

/** Timed edition — one shared daily puzzle per local calendar day (same triplet set for all players that day). */
const LS_DAILY = {
  completedUtc: 'stringlich_timed_dailyCompletedUtc_v4',
  abandonedUtc: 'stringlich_timed_dailyAbandonedUtc_v4',
  snapshot: 'stringlich_timed_dailySnapshot_v4',
  inProgress: 'stringlich_timed_dailyInProgress_v4',
};

/** Local calendar YYYY-MM-DD — daily letters, completion, abandon, rollover. */
function getLocalDateString(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function hashStringToInt(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Display #1 = March 22, 2026 local; #2 = Mar 23 local, … */
function getLocalStringlishNumber() {
  const now = new Date();
  const todayLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const epochLocal = new Date(2026, 2, 22);
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

/** Three distinct triplets for this calendar day (deterministic global puzzle). */
async function getDailyTripletsForDay(puzzleDateStr) {
  const data = await loadTripletsData();
  if (!data || data.length === 0) {
    return ['ABC', 'DEF', 'GHI'];
  }
  const filteredData = data.filter((item) => item.frequency >= 5);
  const pool = filteredData.length > 0 ? filteredData : data;
  const result = [];
  const used = new Set();
  let salt = 0;
  while (result.length < 3 && salt < 5000) {
    const h = hashStringToInt(`stringlich-timed-daily-${puzzleDateStr}-${salt}`);
    const idx = h % pool.length;
    const letters = pool[idx].letters;
    if (!used.has(letters)) {
      used.add(letters);
      result.push(letters);
    }
    salt++;
  }
  while (result.length < 3) {
    result.push(pool[result.length % pool.length].letters);
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

async function isValidWord(word) {
  // Reject hyphenated words
  if (word.includes('-')) return false;
  
  // Reject swear words and inappropriate content
  const swearWords = [
    'fuck', 'shit', 'bitch', 'ass', 'damn', 'hell', 'crap', 'piss', 'cock', 'dick', 'pussy', 'cunt',
    'fucking', 'shitting', 'bitching', 'asshole', 'damned', 'hellish', 'crappy', 'pissing',
    'fucker', 'shitty', 'bitchy', 'asshat', 'damnit', 'hellfire', 'crapper', 'pisser',
    'motherfucker', 'bullshit', 'horseshit', 'dumbass', 'jackass', 'smartass', 'badass',
    'fuckin', 'shitty', 'bitchin', 'asswipe', 'damnit', 'hellish', 'crappy', 'pissy'
  ];
  
  const lowerWord = word.toLowerCase();
  if (swearWords.includes(lowerWord)) return false;
  
  try {
    const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`);
    if (!response.ok) return false;
    const data = await response.json();
    return Array.isArray(data) && data[0]?.word?.toLowerCase() === word.toLowerCase();
  } catch {
    return false;
  }
}

// Helper to find possible answers for a given sequence from CSV
async function findPossibleAnswers(letters, max = 3) {
  if (!letters || letters.length !== 3) return [];
  
  // Load CSV data if not already loaded
  const data = await loadTripletsData();
  
  if (!data || data.length === 0) {
    // Fallback to old method if CSV fails to load
    const regex = new RegExp(letters.split('').join('.*'), 'i');
    let candidates = PREPROCESSED_WORDS.filter(w => regex.test(w) && w.length >= 5);
  candidates = candidates.filter(w => w.length <= 10);
    candidates.sort((a, b) => a.length - b.length);
    return candidates.slice(0, max);
  }
  
  // Find the entry for this letter combination
  const normalizedLetters = letters.toUpperCase();
  const entry = data.find(item => item.letters === normalizedLetters);
  
  if (entry && entry.answers && entry.answers.length > 0) {
    // Filter out any empty answers (shouldn't be any, but just in case)
    const availableAnswers = entry.answers.filter(a => a && a.trim());
    
    if (availableAnswers.length === 0) {
      // Fallback if somehow all answers are empty
      return [];
    }
    
    // Randomly shuffle and select up to max answers
    // Create a shuffled copy of the array
    const shuffled = [...availableAnswers].sort(() => Math.random() - 0.5);
    
    // Return up to max answers (or all available if fewer than max)
    return shuffled.slice(0, Math.min(max, shuffled.length));
  }
  
  // Fallback if not found in CSV
  const regex = new RegExp(letters.split('').join('.*'), 'i');
  let candidates = PREPROCESSED_WORDS.filter(w => regex.test(w) && w.length >= 5);
  candidates = candidates.filter(w => w.length <= 10);
  candidates.sort((a, b) => a.length - b.length);
  return candidates.slice(0, max);
}

// Get a single possible answer for the given triplet (for hint system)
async function getOnePossibleAnswer(letters) {
  const answers = await findPossibleAnswers(letters, 20);
  if (!answers || answers.length === 0) return null;
  return answers[Math.floor(Math.random() * answers.length)];
}

// Component to display possible answers asynchronously
// variant "inline" = single muted line (less busy); "chips" = gray pills
function PossibleAnswers({ letters, max = 3, ensureIncluded, className = '', variant = 'chips' }) {
  const [answers, setAnswers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    
    (async () => {
      const result = await findPossibleAnswers(letters, max);
      if (!isMounted) return;
      let display = result || [];
      if (ensureIncluded && typeof ensureIncluded === 'string' && ensureIncluded.trim()) {
        const included = ensureIncluded.trim().toUpperCase();
        if (!display.includes(included)) {
          display = [included, ...display].slice(0, max);
        }
      }
      setAnswers(display);
      setLoading(false);
    })();
    
    return () => {
      isMounted = false;
    };
  }, [letters, max, ensureIncluded]);

  if (loading) {
    return <div className="text-xs text-gray-400">Loading...</div>;
  }

  if (answers.length === 0) {
    return <div className="text-xs text-gray-400">No answers found</div>;
  }

  const inlineFs = 'calc(0.875rem * 0.45 + 6pt * 0.45)';
  if (variant === 'inline') {
    return (
      <p
        className={`text-gray-600 leading-snug w-full min-w-0 ${className}`}
        style={{ fontSize: inlineFs }}
      >
        {answers.map((w, i) => (
          <span key={`${w}-${i}`}>
            {i > 0 ? <span className="text-gray-300"> · </span> : null}
            {toTitleCase(w)}
          </span>
        ))}
      </p>
    );
  }

  const wordFs = 'calc(0.875rem * 0.48 + 6pt * 0.48)';
  return (
    <div className={`flex flex-wrap gap-1.5 w-full max-w-full min-w-0 ${className || 'justify-center mx-auto'}`}>
      {answers.map((word, idx) => (
        <div
          key={`${word}-${idx}`}
          className="rounded-md px-2 py-0.5 flex items-center bg-gray-100 border border-gray-200"
        >
          <span className="font-medium text-gray-800" style={{ fontSize: wordFs }}>
            {toTitleCase(word)}
          </span>
        </div>
      ))}
    </div>
  );
}

/** L–I–N in game colors (rules wizard steps 1–3) */
function RulesWizardLinShapes() {
  return (
    <div className="flex justify-center space-x-2 mb-4">
      <div
        style={{
          width: 44,
          height: 44,
          background: '#c85f31',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontWeight: 600,
          fontSize: '1.35rem',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        }}
      >
        L
      </div>
      <div
        style={{
          width: 44,
          height: 44,
          background: '#195b7c',
          borderRadius: 8,
          transform: 'rotate(45deg) scale(0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontWeight: 600,
          fontSize: '1.35rem',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        }}
      >
        <span style={{ transform: 'rotate(-45deg) scale(1.176)', display: 'inline-block', width: '100%', textAlign: 'center' }}>I</span>
      </div>
      <div
        style={{
          width: 44,
          height: 44,
          background: '#1c6d2a',
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontWeight: 600,
          fontSize: '1.35rem',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        }}
      >
        N
      </div>
    </div>
  );
}

/** 4-step rules wizard — state is internal so it cannot reference an undefined parent binding */
function TimedRulesModal({
  showRules,
  rulesModalClosing,
  isMobile,
  onClose,
  showRulesOnStart,
  onToggleShowRulesOnStart,
}) {
  const [step, setStep] = useState(0);
  const prevStepRef = useRef(0);
  const touchStartRef = useRef(null);

  useEffect(() => {
    if (showRules) {
      setStep(0);
      prevStepRef.current = 0;
    }
  }, [showRules]);

  const slideDir = useMemo(() => {
    const prev = prevStepRef.current;
    if (step > prev) return 'next';
    if (step < prev) return 'prev';
    return 'next';
  }, [step]);

  useLayoutEffect(() => {
    prevStepRef.current = step;
  }, [step]);

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
      setStep((s) => Math.min(3, s + 1));
    } else {
      setStep((s) => Math.max(0, s - 1));
    }
  };

  return (
    <div className={`fixed top-0 left-0 right-0 bottom-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] ${rulesModalClosing ? 'modal-fade-out' : 'modal-fade-in'}`} style={{ width: '100vw', height: '100vh', margin: 0, padding: 0 }}>
      <div className="bg-white rounded-lg w-full max-w-xs sm:max-w-sm md:max-w-md mx-4 sm:mx-6 flex flex-col max-h-[min(90vh,90dvh)] overflow-hidden shadow-xl">
        <div className="flex items-center justify-between flex-shrink-0 p-4 sm:p-6 pb-3 border-b border-gray-200 bg-white z-10 gap-2">
          <h2 className="text-lg font-bold text-left flex items-center gap-2 min-w-0">
            <FontAwesomeIcon icon={faCircleQuestion} className="text-gray-600 flex-shrink-0" />
            How to Play
          </h2>
          {step === 3 && (
            <button
              type="button"
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 text-lg sm:text-xl font-bold leading-none p-1 -mr-1 flex-shrink-0"
              aria-label="Close"
            >
              ×
            </button>
          )}
        </div>
        <div
          className="flex-1 min-h-0 overflow-y-auto text-left touch-pan-y"
          style={{ touchAction: isMobile ? 'pan-y' : undefined }}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <div
            key={step}
            className={`px-4 sm:px-6 py-4 rules-wizard-slide-${slideDir}`}
          >
            {step === 0 && (
              <div>
                <p className="text-center text-base font-medium text-gray-800 leading-snug mb-4">
                  Create words using 3 provided letters:
                </p>
                <RulesWizardLinShapes />
              </div>
            )}
            {step === 1 && (
              <div>
                <RulesWizardLinShapes />
                <ul className="list-none space-y-2 pl-0 text-sm text-gray-800 leading-relaxed">
                  <li className="flex gap-2 items-start">
                    <span className="flex-shrink-0 select-none leading-snug" aria-hidden>💯</span>
                    <span>Use all provided letters</span>
                  </li>
                  <li className="flex gap-2 items-start">
                    <span className="flex-shrink-0 select-none leading-snug" aria-hidden>🔤</span>
                    <span>Keep them in the same order shown</span>
                  </li>
                  <li className="flex gap-2 items-start">
                    <span className="flex-shrink-0 select-none leading-snug" aria-hidden>🤹</span>
                    <span>You can add extra letters before, after, or between them</span>
                  </li>
                </ul>
              </div>
            )}
            {step === 2 && (
              <div>
                <RulesWizardLinShapes />
                <div className="mb-1 text-xs font-medium text-gray-600">Example guesses</div>
                <div className="flex flex-wrap items-center gap-x-1 gap-y-1 mb-1">
                  <span>P</span>
                  <div style={{ width: 24, height: 24, background: '#c85f31', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 600, fontSize: '0.95rem', boxShadow: '0 1px 3px rgba(0,0,0,0.10)' }}>L</div>
                  <span>A</span>
                  <span>C</span>
                  <div style={{ width: 24, height: 24, background: '#195b7c', borderRadius: 6, transform: 'rotate(45deg) scale(0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 600, fontSize: '0.95rem', boxShadow: '0 1px 3px rgba(0,0,0,0.10)' }}>
                    <span style={{ transform: 'rotate(-45deg) scale(1.176)', display: 'inline-block', width: '100%', textAlign: 'center' }}>I</span>
                  </div>
                  <div style={{ width: 24, height: 24, background: '#1c6d2a', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 600, fontSize: '0.95rem', boxShadow: '0 1px 3px rgba(0,0,0,0.10)' }}>N</div>
                  <span>G</span>
                </div>
                <div className="flex items-start mb-3 text-xs" style={{ color: '#1c6d2a' }}>
                  <FontAwesomeIcon icon={faCheckCircle} className="mr-1 mt-0.5 flex-shrink-0" /> Valid guess—letters between provided letters
                </div>
                <div className="flex flex-wrap items-center gap-x-1 gap-y-1 mb-1">
                  <div style={{ width: 24, height: 24, background: '#c85f31', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 600, fontSize: '0.95rem', boxShadow: '0 1px 3px rgba(0,0,0,0.10)' }}>L</div>
                  <div style={{ width: 24, height: 24, background: '#195b7c', borderRadius: 6, transform: 'rotate(45deg) scale(0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 600, fontSize: '0.95rem', boxShadow: '0 1px 3px rgba(0,0,0,0.10)' }}>
                    <span style={{ transform: 'rotate(-45deg) scale(1.176)', display: 'inline-block', width: '100%', textAlign: 'center' }}>I</span>
                  </div>
                  <div style={{ width: 24, height: 24, background: '#1c6d2a', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 600, fontSize: '0.95rem', boxShadow: '0 1px 3px rgba(0,0,0,0.10)' }}>N</div>
                  <span>K</span>
                  <span>S</span>
                </div>
                <div className="flex items-start mb-3 text-xs" style={{ color: '#1c6d2a' }}>
                  <FontAwesomeIcon icon={faCheckCircle} className="mr-1 mt-0.5 flex-shrink-0" /> Valid guess—consecutive provided letters
                </div>
                <div className="flex flex-wrap items-center gap-x-1 gap-y-1 mb-1">
                  <div style={{ width: 24, height: 24, background: '#1c6d2a', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 600, fontSize: '0.95rem', boxShadow: '0 1px 3px rgba(0,0,0,0.10)' }}>N</div>
                  <span>A</span>
                  <div style={{ width: 24, height: 24, background: '#195b7c', borderRadius: 6, transform: 'rotate(45deg) scale(0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 600, fontSize: '0.95rem', boxShadow: '0 1px 3px rgba(0,0,0,0.10)' }}>
                    <span style={{ transform: 'rotate(-45deg) scale(1.176)', display: 'inline-block', width: '100%', textAlign: 'center' }}>I</span>
                  </div>
                  <div style={{ width: 24, height: 24, background: '#c85f31', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 600, fontSize: '0.95rem', boxShadow: '0 1px 3px rgba(0,0,0,0.10)' }}>L</div>
                  <span>S</span>
                </div>
                <div className="flex items-start text-xs" style={{ color: '#992108' }}>
                  <FontAwesomeIcon icon={faTimesCircle} className="mr-1 mt-0.5 flex-shrink-0" /> Invalid guess—provided letters not in order
                </div>
              </div>
            )}
            {step === 3 && (
              <ul className="list-none space-y-4 pl-0 text-base text-gray-800 leading-relaxed">
                <li className="flex gap-2 items-start">
                  <span className="flex-shrink-0 select-none leading-snug" aria-hidden>🖐️</span>
                  <span>Guesses must contain 5+ letters</span>
                </li>
                <li className="flex gap-2 items-start">
                  <span className="flex-shrink-0 select-none leading-snug" aria-hidden>🤬</span>
                  <span>Proper nouns and cuss words do not count</span>
                </li>
                <li className="flex gap-2 items-start">
                  <span className="flex-shrink-0 select-none leading-snug" aria-hidden>🎉</span>
                  <span className="font-medium">Complete all 3 levels to win!</span>
                </li>
              </ul>
            )}
          </div>
        </div>
        <div className="flex-shrink-0 border-t border-gray-200 bg-white">
          <div className="flex justify-center items-center gap-2 py-3 px-4" role="tablist" aria-label="How to play steps">
            {[0, 1, 2, 3].map((i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={step === i}
                aria-label={`Step ${i + 1} of 4`}
                onClick={() => setStep(i)}
                className={`rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-gray-400 ${
                  step === i ? 'w-2.5 h-2.5 bg-gray-800' : 'w-2 h-2 bg-gray-300 hover:bg-gray-400'
                }`}
              />
            ))}
          </div>
          {step < 3 && (
            <div className="flex justify-between gap-3 px-4 pb-4">
              <button
                type="button"
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                disabled={step === 0}
                className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => setStep((s) => Math.min(3, s + 1))}
                className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800"
              >
                Next
              </button>
            </div>
          )}
          {step === 3 && (
            <>
              <div className="px-4 pb-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full bg-white border border-gray-400 text-black py-3 rounded-lg text-lg font-semibold hover:bg-gray-50"
                >
                  Let&apos;s Go!
                </button>
              </div>
              <div className="border-t border-gray-200 p-4 sm:p-6 pt-3 bg-gray-50/80">
                <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={showRulesOnStart}
                    onChange={onToggleShowRulesOnStart}
                    className="w-4 h-4 rounded border-gray-300"
                  />
                  Show Rules on Game Start
                </label>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function WordPuzzleGame() {
  const [currentLevel, setCurrentLevel] = useState(1);
  const [letters, setLetters] = useState('');
  const [allLevelLetters, setAllLevelLetters] = useState([]); // Store all 3 sets of letters
  const [roundStarted, setRoundStarted] = useState(false);
  const [input, setInput] = useState('');
  const [inputFontSizePx, setInputFontSizePx] = useState(30);
  const [levelResults, setLevelResults] = useState([]); // [{ letters, word, time, gaveUp, hintWordUsed? }]
  const [error, setError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [gameTime, setGameTime] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [letterPopup, setLetterPopup] = useState(null);
  const [showRevealAnimation, setShowRevealAnimation] = useState(false);
  const [revealAnimationPlayedThisRound, setRevealAnimationPlayedThisRound] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
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
    fastestTimes: [],
    averageTimes: []
  });
  const [showRules, setShowRules] = useState(false);
  const [showContact, setShowContact] = useState(false);
  const [contactModalClosing, setContactModalClosing] = useState(false);
  const [contactEmail, setContactEmail] = useState('');
  const [contactSubject, setContactSubject] = useState('');
  const [contactMessage, setContactMessage] = useState('');
  const [rulesModalClosing, setRulesModalClosing] = useState(false);
  const [statsModalClosing, setStatsModalClosing] = useState(false);
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
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [pressedKey, setPressedKey] = useState(null);
  const [hintWord, setHintWord] = useState(null); // full hint word once any hint used (game over / give up)
  /** Full word chosen for this level’s progressive hints (first possible answer); loaded when `letters` changes */
  const [hintTargetWord, setHintTargetWord] = useState(null);
  /** How many characters of hintTargetWord are currently revealed (0 = none yet; then 3,4,… until full length) */
  const [hintCharsRevealed, setHintCharsRevealed] = useState(0);
  const [hintRevealAnimating, setHintRevealAnimating] = useState(false);
  const [hintAvailable, setHintAvailable] = useState(false);
  const [hintFillProgress, setHintFillProgress] = useState(0);
  const [hintReadyPop, setHintReadyPop] = useState(false);
  const hintUnlockTimeoutRef = useRef(null);
  const hintFillIntervalRef = useRef(null);
  /** True after the 30s hint timer has been started this level; prevents starting while rules modal is open at round start. */
  const hintTimerStartedThisRoundRef = useRef(false);
  const hintStartGameTimeRef = useRef(null);
  const startTimeRef = useRef(null);
  const inputRef = useRef(null);
  const inputContainerRef = useRef(null);
  const inputMeasureRef = useRef(null);
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
  const lastKeyPressRef = useRef({ key: null, time: 0 });
  const mobileShiftOnAtRef = useRef(0);
  const mobileShiftActiveRef = useRef(false);
  const mobileCapsLockRef = useRef(false);
  const handleKeyboardLetterRef = useRef(null);
  const isSubmittingRef = useRef(false);
  const contentAboveKeyboardRef = useRef(null);

  useEffect(() => {
    roundStartedRef.current = roundStarted;
  }, [roundStarted]);
  useEffect(() => {
    gameOverRef.current = gameOver;
  }, [gameOver]);

  /** One global puzzle per local day: three deterministic triplets from CSV. */
  const generateAllLevelLetters = async () => getDailyTripletsForDay(getLocalDateString());

  useEffect(() => {
    (async () => {
      const puzzleDay = getLocalDateString();
      lastLocalDateRef.current = puzzleDay;
      if (readDailyCompletedUtc() !== puzzleDay && readDailyAbandonedUtc() !== puzzleDay) {
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
              setRoundStarted(true);
              setRevealAnimationPlayedThisRound(true);
              setShowRevealAnimation(false);
              rulesDismissedOnceRef.current = true;
              return;
            }
          } catch (_) {}
        }
      }
      const allLetters = await getDailyTripletsForDay(puzzleDay);
      setAllLevelLetters(allLetters);
      setLetters(allLetters[0]);
    })();
    const savedStats = localStorage.getItem('sequenceGameTimedStats');
    if (savedStats) {
      setStats(JSON.parse(savedStats));
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
    if (showRules && !rulesDismissedOnceRef.current) return;

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
    setHintReadyPop(false);
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
        setHintReadyPop(true);
        setTimeout(() => setHintReadyPop(false), 200);
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
        setStats((prev) => {
          const next = { ...prev, currentStreak: 0 };
          try {
            localStorage.setItem('sequenceGameTimedStats', JSON.stringify(next));
          } catch (_) {}
          return next;
        });
      }
      setRoundStarted(false);
      setGameOver(false);
      setShowRevealAnimation(false);
      setShowStats(false);
      setShowClearStatsButton(false);
      setShowInstructions(false);
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
      setHintWord(null);
      setHintTargetWord(null);
      setHintCharsRevealed(0);
      setHintAvailable(false);
      setHintFillProgress(0);
      setHintReadyPop(false);
      clearHintTimers();
      hintTimerStartedThisRoundRef.current = false;
      rulesDismissedOnceRef.current = false;
      setIsTransitioning(false);
      localStorage.removeItem('currentRoundTimeTimed');
      const triplets = await getDailyTripletsForDay(puzzleDay);
      setAllLevelLetters(triplets);
      setLetters(triplets[0]);
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

  // Reset hint when triplet/level changes so next level gets a fresh 30s timer
  useEffect(() => {
    setHintWord(null);
    setHintCharsRevealed(0);
    setHintTargetWord(null);
    setHintAvailable(false);
    setHintFillProgress(0);
    hintStartGameTimeRef.current = null;
    clearHintTimers();
    hintTimerStartedThisRoundRef.current = false;
    return clearHintTimers;
  }, [letters]);

  // Load one possible answer for this triplet (same source as game-over “first answer”; used for progressive hints)
  useEffect(() => {
    let cancelled = false;
    if (!letters) {
      setHintTargetWord(null);
      return undefined;
    }
    setHintTargetWord(null);
    (async () => {
      const w = await getOnePossibleAnswer(letters);
      if (!cancelled && w) setHintTargetWord(w);
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
      setHintTargetWord(null);
      return clearHintTimers;
    }
    // If page is not visible, just pause timers without resetting progress.
    if (!isPageVisible) {
      clearHintTimers();
      return clearHintTimers;
    }
    // More partial hints remain until the full hint word has been revealed (timer can run while target is still loading).
    const hintExhausted =
      hintTargetWord != null &&
      hintCharsRevealed >= hintTargetWord.length;
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
        const exhausted =
          hintTargetWord != null &&
          hintCharsRevealed >= hintTargetWord.length;
        if (exhausted) return;
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
    hintCharsRevealed
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

  // Scale input font down only once text width exceeds ~15 letters (container-based max width)
  const measureInputFontSize = () => {
    if (!input) {
      setInputFontSizePx(30);
      return;
    }
    const container = inputContainerRef.current;
    const measure = inputMeasureRef.current;
    if (!container || !measure) return;
    const containerWidth = container.clientWidth;
    const textWidthAt30 = measure.offsetWidth;
    const maxContentWidth = Math.min(280, containerWidth * 0.85);
    if (textWidthAt30 > maxContentWidth && textWidthAt30 > 0) {
      const scaled = (30 * maxContentWidth) / textWidthAt30;
      setInputFontSizePx(Math.max(12, scaled));
    } else {
      setInputFontSizePx(30);
    }
  };
  useEffect(() => {
    if (!input) {
      setInputFontSizePx(30);
      return;
    }
    const raf = requestAnimationFrame(measureInputFontSize);
    const onResize = () => requestAnimationFrame(measureInputFontSize);
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, [input]);

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
    localStorage.setItem('currentRoundTimeTimed', String(finalT));
    setTimeout(() => setShowStats(true), 500);
  };

  const handleBegin = () => {
    const puzzleDay = getLocalDateString();
    if (readDailyCompletedUtc() === puzzleDay) return;
    if (readDailyAbandonedUtc() === puzzleDay) return;
    setShowRevealAnimation(true);
    setRevealAnimationPlayedThisRound(false);
    setError(false);
    setErrorMessage('');
    // Start the game after the reveal animation completes
    setTimeout(() => {
      rulesDismissedOnceRef.current = false;
      setRoundStarted(true);
      if (showRulesOnStart) {
        setShowRules(true);
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

  const toggleShowRulesOnStart = () => {
    const next = !showRulesOnStart;
    setShowRulesOnStart(next);
    try {
      localStorage.setItem('sequenceGameTimedShowRulesOnStart', String(next));
    } catch (_) {}
  };

  const closeRulesModal = () => {
    rulesDismissedOnceRef.current = true;
    setRulesModalClosing(true);
    setShowRules(false);
    setTimeout(() => {
      setRulesModalClosing(false);
      setTimeout(() => setRevealAnimationPlayedThisRound(true), 500);
      setTimeout(() => inputRef.current?.focus(), 100);
    }, 200);
  };

  const closeContactModal = () => {
    setContactModalClosing(true);
    setShowContact(false);
    setTimeout(() => {
      setContactModalClosing(false);
      setContactEmail('');
      setContactSubject('');
      setContactMessage('');
    }, 200);
  };

  /** Opens the user’s mail client with messages addressed to this inbox */
  const handleContactSend = () => {
    const msg = contactMessage.trim();
    if (!msg) return;
    const recipient = 'davisenglishco@gmail.com';
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

  const handleSubmit = async (e, valueFromMobile) => {
    e.preventDefault();
    if (!roundStarted || gameOver || isTransitioning) return;
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
      if (word.length < 5) { setError(true); setErrorMessage('Must be 5+ letters long'); return; }
      if (!isSequential(word, letters)) { setError(true); setErrorMessage(`Word must contain '${letters}' in order`); return; }
      if (!(await isValidWord(word))) { setError(true); setErrorMessage('Not a valid English word'); return; }

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
        setTimeout(() => setShowStats(true), 500);
      } else {
        setIsTransitioning(true);

        setTimeout(async () => {
          const nextLevel = currentLevel + 1;
          setLetters(allLevelLetters[nextLevel - 1]);
          setCurrentLevel(nextLevel);

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



  const resetGame = () => {
    if (roundStarted && !gameOver) {
      const newStats = { ...stats, currentStreak: 0 };
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
    setShowClearStatsButton(false);
    setShowInstructions(false);
    setCurrentLevel(1);
    setLevelResults([]);
    setGameTime(0);
    setGameOver(false);
    setLetterPopup(null);
    setIsTransitioning(false);
    setError(false);
    setErrorMessage('');
    setHintWord(null);
    setHintTargetWord(null);
    setHintCharsRevealed(0);
    setHintAvailable(false);
    setHintFillProgress(0);
    setHintReadyPop(false);
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

    const hasValidAnswer = results.some((r) => r.word && !r.gaveUp);
    const hasGiveUps = results.some((r) => r.gaveUp);

    newStats.gamesPlayed += 1;

    if (!hasGiveUps) {
      newStats.gamesWon += 1;
    }

    if (hasValidAnswer && !hasGiveUps) {
      newStats.currentStreak += 1;
      if (newStats.currentStreak > newStats.maxStreak) {
        newStats.maxStreak = newStats.currentStreak;
      }
    } else {
      newStats.currentStreak = 0;
    }

    if (timeForThisRound > 0) {
      newStats.fastestTimes = newStats.fastestTimes.filter((t) => t !== timeForThisRound);
      newStats.fastestTimes.push(timeForThisRound);
      newStats.fastestTimes.sort((a, b) => a - b);
      newStats.fastestTimes = newStats.fastestTimes.slice(0, 5);
      localStorage.setItem('currentRoundTimeTimed', timeForThisRound.toString());
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
  }, [isMobile, roundStarted, gameOver, isTransitioning]);

  const clearStats = () => {
    // Clear all statistical data
    localStorage.removeItem('sequenceGameTimedStats');
    
    // Reset stats to initial state
    setStats({
      gamesPlayed: 0,
      gamesWon: 0,
      currentStreak: 0,
      maxStreak: 0,
      fastestTimes: [],
      averageTimes: []
    });
  };

  const handleHint = async () => {
    if (isTransitioning || !letters) return;
    let target = hintTargetWord;
    if (!target) {
      target = await getOnePossibleAnswer(letters);
      if (target) setHintTargetWord(target);
    }
    if (!target) return;

    const len = target.length;
    if (hintCharsRevealed >= len) {
      setError(true);
      setErrorMessage(`Hint is a valid word - ${target.toUpperCase()}`);
      return;
    }
    if (!hintAvailable) {
      setError(true);
      setErrorMessage('Hint available after 30 seconds');
      return;
    }

    const nextLen =
      hintCharsRevealed === 0
        ? Math.min(3, len)
        : Math.min(hintCharsRevealed + 1, len);

    const hintVal = target.slice(0, nextLen).toLowerCase();
    setHintCharsRevealed(nextLen);
    if (!hintWord) setHintWord(target);

    inputValueRef.current = hintVal;
    setInput(hintVal);
    setError(false);
    setErrorMessage('');
    setHintRevealAnimating(true);
    setTimeout(() => setHintRevealAnimating(false), 300);

    clearHintTimers();
    if (nextLen < len) {
      setHintAvailable(false);
      setHintFillProgress(0);
      startHintFillTimer(true);
    } else {
      setHintAvailable(false);
      setHintFillProgress(100);
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const shapes = [
    { shape: 'circle', color: '#c85f31' },
    { shape: 'diamond', color: '#195b7c' },
    { shape: 'square', color: '#1c6d2a' }
  ];
  /** Main “provided letters” shapes — slightly larger for hierarchy vs input / secondary UI */
  const size = 92;

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

  /** Fixed footer bar (Contact + copyright); hidden only during mobile in-round play or rules modal */
  const footerBarVisible =
    !(isMobile && roundStarted && !gameOver) && !(showRules || rulesModalClosing);
  /** Mobile-only: small pb for keyboard; footer is hidden in this state */
  const mobileGameplayKeyboardPadding =
    isMobile && roundStarted && !gameOver && !showRules;

  return (
    <div className={isMobile ? "w-full" : ""}>
      {/* Mobile: no min-h-[100dvh] — avoids a full-screen-tall box with empty scrollable whitespace below short content. */}
      <div
        className={
          isMobile
            ? `w-full overflow-x-hidden ${
                mobileGameplayKeyboardPadding
                  ? 'pb-[max(12px,env(safe-area-inset-bottom,0px))]'
                  : footerBarVisible
                    ? 'pb-[calc(env(safe-area-inset-bottom,0px)+5.5rem)]'
                    : ''
              }`
            : footerBarVisible
              ? 'pb-[5.5rem]'
              : ''
        }
      >
        <div
          className={`max-w-xl mx-auto text-center space-y-6 relative game-transition ${
            !roundStarted
              ? 'p-6'
              : gameOver
                ? 'pt-16 pb-6 pl-[max(5px,env(safe-area-inset-left))] pr-[max(5px,env(safe-area-inset-right))] sm:px-6'
                : 'pt-16 pb-6 px-6'
          }`}
        >
      <div className="flex justify-center items-center relative flex-col">
        {!roundStarted && (
          <>
            <a 
              href="https://stringlish.com"
              target="_self"
              rel="noopener noreferrer"
            >
              <img 
                src={process.env.PUBLIC_URL + "/letter-game-logo2.png"} 
                alt="Stringlish Game Logo" 
                className="w-24 h-24 mb-4 object-contain cursor-pointer hover:opacity-80 transition-opacity"
                onError={(e) => {
                  e.target.style.display = 'none';
                }}
              />
            </a>
            <h1 className="text-3xl font-bold">Stringlish</h1>
            <p className="text-lg font-medium text-gray-600 mt-1">Timed</p>
          </>
        )}
        {!roundStarted && (
          <div className="mt-4 text-center space-y-1">
            <p className="text-base font-semibold text-gray-800">Stringlish #{dailyHomeMeta.puzzleNumber}</p>
            <p className="text-sm text-gray-500">{dailyHomeMeta.dateLabel}</p>
          </div>
        )}
        {roundStarted && (
          <div className="fixed top-0 left-0 right-0 z-30 bg-white border-b border-gray-200">
            <div
              className={`max-w-xl mx-auto py-2 flex items-center ${
                gameOver
                  ? 'pl-[max(5px,env(safe-area-inset-left))] pr-[max(5px,env(safe-area-inset-right))] sm:px-6'
                  : 'px-6'
              }`}
            >
            <div className="flex-1 min-w-0 flex items-center">
              <span className="text-base font-semibold text-gray-600 tabular-nums border border-gray-300 rounded px-2 py-1 bg-gray-50">
                {formatTime(gameOver && finalGameTimeRef.current != null ? finalGameTimeRef.current : gameTime)}
              </span>
            </div>
            <div className="flex items-center justify-center flex-shrink-0 space-x-3">
              <a 
                href="https://stringlish.com"
                className="text-gray-600 hover:text-gray-800 transition-colors"
                title="Home"
              >
                <FontAwesomeIcon icon={faHouseChimney} className="text-lg" />
              </a>
              <button 
                onClick={() => setShowStats(true)}
                className="text-gray-600 hover:text-gray-800 transition-colors"
                title="Statistics"
              >
                <FontAwesomeIcon icon={faChartSimple} className="text-lg" />
              </button>
              <button 
                onClick={() => setShowRules(true)}
                className="text-gray-500 hover:text-gray-700 transition-colors"
                title="Rules"
              >
                <FontAwesomeIcon icon={faCircleQuestion} className="text-xl" />
              </button>
            </div>
            <div className="flex-1 min-w-0 flex items-center justify-end">
              {!gameOver && (
                <button
                  type="button"
                  onClick={() => {
                    if (!roundStarted || gameOver) return;
                    const unsolvedLevels = [];
                    if (levelResults.length < currentLevel) {
                      unsolvedLevels.push({
                        letters: letters,
                        word: null,
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
                    setTimeout(() => setShowStats(true), 500);
                  }}
                  className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
                >
                  Give Up?
                </button>
              )}
            </div>
            </div>
          </div>
        )}
      </div>

      {!roundStarted ? (
        <div className="flex flex-col items-center space-y-3">
          {dailyHomeMeta.completedToday ? (
            <button
              type="button"
              onClick={handleBeholdYourWork}
              className="bg-white border border-gray-400 text-black w-52 h-16 text-xl font-semibold rounded flex items-center justify-center gap-2"
            >
              <span className="select-none" aria-hidden>
                🤩
              </span>
              Behold Your Work
            </button>
          ) : dailyHomeMeta.abandonedToday ? (
            <p className="text-sm text-gray-600 text-center max-w-xs px-2">
              You left today&apos;s puzzle unfinished. Come back tomorrow for the next one.
            </p>
          ) : (
            <button
              type="button"
              onClick={handleBegin}
              className="bg-white border border-gray-400 text-black w-52 h-16 text-xl font-semibold rounded"
            >
              BEGIN
            </button>
          )}
          <div className="flex flex-row items-center space-x-4">
            <a 
              href="https://stringlish.com"
              className="text-gray-600 hover:text-gray-800 transition-colors"
              title="Home"
            >
              <FontAwesomeIcon icon={faHouseChimney} className="text-lg" />
            </a>
            <button onClick={() => setShowStats(true)} className="text-gray-600 hover:text-gray-800 transition-colors" title="Statistics">
              <FontAwesomeIcon icon={faChartSimple} className="text-lg" />
            </button>
            <button onClick={() => setShowRules(true)} className="text-gray-500 hover:text-gray-700 transition-colors" title="Rules">
              <FontAwesomeIcon icon={faCircleQuestion} className="text-xl" />
            </button>
          </div>
        </div>
      ) : (
        <>


          {/* Game Over — one row per level; left: letters + guess, right: possible answers (compact) */}
          {gameOver && (
            <div className="w-full min-w-0 max-w-full mx-auto text-center mb-4 slide-up">
              <div className="flex flex-col w-full gap-2 sm:gap-2.5">
                {levelResults.map((result, index) => (
                  <div
                    key={index}
                    className="w-full min-w-0 rounded-lg border border-gray-200/80 bg-gray-50/60 px-2.5 py-2 sm:px-3 sm:py-2.5"
                  >
                    <div className="grid w-full grid-cols-1 min-[400px]:grid-cols-2 gap-2 min-[400px]:gap-3 min-[400px]:items-start text-left">
                      {/* Left: round # in fixed left column; letters centered in middle column; matching right column for true center */}
                      <div className="flex min-w-0 w-full flex-col gap-1.5 min-[400px]:items-stretch">
                        <div className="grid w-full min-w-0 grid-cols-[2rem_minmax(0,1fr)_2rem] items-center">
                          <div className="flex justify-start items-center">
                            <div
                              className={`w-7 h-6 rounded-md flex items-center justify-center text-xs font-bold leading-none ${
                                result.gaveUp 
                                  ? 'bg-orange-500 bg-opacity-70 text-orange-800'
                                  : 'bg-green-500 bg-opacity-70 text-green-800'
                              }`}
                              title={`Round ${index + 1}`}
                            >
                              {index + 1}
                            </div>
                          </div>
                          <div className="flex min-w-0 justify-center items-center space-x-1 min-[400px]:space-x-1.5">
                          {result.letters.split('').map((char, idx) => {
                            const { shape, color } = shapes[idx];
                            const smallSize = 26;
                            const common = { 
                              width: `${smallSize}px`, 
                              height: `${smallSize}px`, 
                              display: 'flex', 
                              alignItems: 'center', 
                              justifyContent: 'center', 
                              color: 'white', 
                              fontSize: '0.8rem', 
                              fontWeight: '600',
                              boxShadow: '0 1px 4px rgba(0, 0, 0, 0.12)',
                              opacity: 0.85
                            };
                            const style = shape === 'circle' ? {
                              ...common, 
                              backgroundColor: color, 
                              borderRadius: '50%'
                            } : shape === 'diamond' ? {
                              ...common, 
                              backgroundColor: color, 
                              borderRadius: '6px',
                              transform: 'rotate(45deg) scale(0.85)'
                            } : {
                              ...common, 
                              backgroundColor: color,
                              borderRadius: '6px'
                            };
                            return (
                              <div key={idx} style={style} className="relative">
                                {shape === 'diamond' ? (
                                  <span style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    width: '100%',
                                    height: '100%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '0.8rem',
                                    fontWeight: 600,
                                    color: 'white',
                                    transform: 'rotate(-45deg) scale(1.176)',
                                  }}>
                                    {char}
                                  </span>
                                ) : (
                                  <span>{char}</span>
                                )}
                              </div>
                            );
                          })}
                          </div>
                          <div className="min-w-0" aria-hidden />
                        </div>
                        <div className="flex flex-wrap justify-center gap-1.5 w-full min-w-0 px-0.5">
                          {result.gaveUp ? (
                            <div
                              className="rounded-md px-2 py-0.5 flex items-center"
                              style={{
                                backgroundColor: 'rgba(200, 95, 49, 0.15)',
                                border: '1px solid rgba(200, 95, 49, 0.3)'
                              }}
                            >
                              <span
                                className="font-medium leading-tight"
                                style={{ color: '#c85f31', fontSize: 'calc(0.875rem * 0.62 + 6pt * 0.62)' }}
                              >
                                No guess
                              </span>
                            </div>
                          ) : (
                            <div
                              className="rounded-md px-2 py-0.5 flex items-center"
                              style={{
                                backgroundColor: 'rgba(28, 109, 42, 0.15)',
                                border: '1px solid rgba(28, 109, 42, 0.3)'
                              }}
                            >
                              <span
                                className="font-medium leading-tight"
                                style={{ color: '#1c6d2a', fontSize: 'calc(0.875rem * 0.62 + 6pt * 0.62)' }}
                              >
                                {toTitleCase(result.word)}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Right: possible answers — collapsed by default to keep endgame calm (esp. mobile) */}
                      <div className="min-w-0 w-full border-t border-gray-200/90 pt-2 min-[400px]:border-t-0 min-[400px]:border-l min-[400px]:border-gray-200/90 min-[400px]:pt-0 min-[400px]:pl-3">
                        <details className="group rounded-md border border-transparent px-3 py-2.5 open:border-gray-200/70 open:bg-white/50 transition-colors">
                          <summary
                            className="flex cursor-pointer list-none items-center justify-between gap-2 text-left [&::-webkit-details-marker]:hidden"
                            style={{ fontSize: 'calc(0.875rem * 0.48 + 6pt * 0.48)' }}
                          >
                            <span className="font-medium text-gray-500">Possible answers</span>
                            <FontAwesomeIcon
                              icon={faChevronDown}
                              className="text-gray-400 text-[10px] shrink-0 transition-transform duration-200 group-open:rotate-180"
                              aria-hidden
                            />
                          </summary>
                          <div className="mt-2.5 border-t border-gray-100/90 pt-2.5">
                            <PossibleAnswers
                              letters={result.letters}
                              max={3}
                              ensureIncluded={result.hintWordUsed || undefined}
                              className="justify-start"
                            />
                          </div>
                        </details>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Current Letters Display - hidden while rules modal is open to avoid flash before modal appears */}
          {!gameOver && !showRules && (
            <div className={`flex justify-center space-x-3 items-center transition-opacity duration-300 ${
              isTransitioning ? 'opacity-0' : 'opacity-100'
            } ${showRevealAnimation && !revealAnimationPlayedThisRound ? 'reveal-content' : ''}`}>
          {letters.split('').map((char, idx) => {
            const { shape, color } = shapes[idx];
            const common = { 
              width:`${size}px`, 
              height:`${size}px`, 
              display:'flex', 
              alignItems:'center', 
              justifyContent:'center', 
              color:'white', 
              fontSize:'1.95rem', 
              fontWeight:'600',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
              transition: 'all 0.2s ease-in-out'
            };
            const style = shape==='circle' ? {
              ...common, 
              backgroundColor:color, 
              borderRadius:'50%',
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)'
            } : shape==='diamond' ? {
              ...common, 
              backgroundColor:color, 
              borderRadius:'12px',
              transform: 'rotate(45deg) scale(0.85)',
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)'
            } : {
              ...common, 
              backgroundColor:color,
              borderRadius:'12px',
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)'
            };
            return (
              <div key={idx} style={style} className="hover:scale-105 transition-transform duration-200 relative">
                {shape === 'diamond' ? (
                  <span style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.75rem',
                    fontWeight: 600,
                    color: 'white',
                    transform: 'rotate(-45deg) scale(1.176)', // Compensate for parent scale(0.85)
                  }}>
                    {char}
                  </span>
                ) : (
                  <span>{char}</span>
                )}
              </div>
            );
          })}
        </div>
      )}

          {/* Input Section */}
          {roundStarted && !gameOver && !showRules && (
            <div ref={contentAboveKeyboardRef} className={`space-y-4 ${showRevealAnimation && !revealAnimationPlayedThisRound ? 'reveal-content' : ''}`}>
              <div
                ref={inputContainerRef}
                className={`border-0 border-b rounded-none ${error ? 'border-red-600' : 'border-gray-200'}`}
              >
                <div
                  className={`w-full relative ${hintRevealAnimating ? 'hint-reveal-anim' : ''}`}
                  style={{ transformOrigin: 'center center' }}
                >
                <span
                  ref={inputMeasureRef}
                  aria-hidden
                  className="absolute left-0 font-semibold whitespace-nowrap pointer-events-none invisible"
                  style={{ fontSize: '30px' }}
                >
                  {input || ' '}
                </span>
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
                  className="border-0 rounded-none px-0 py-2 w-full font-semibold focus:ring-0 focus:outline-none bg-transparent placeholder:font-normal placeholder:text-gray-400 text-center"
                  style={{
                    fontSize: `${inputFontSizePx}px`,
                    ...(error ? { color: '#c85f31' } : {}),
                    caretColor: 'transparent',
                    ...(isMobile ? { WebkitTapHighlightColor: 'transparent', cursor: 'text' } : {})
                  }}
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
              </div>
              {/* Level Progress Indicators + Hint (same size/shape and spacing) */}
              <div className="flex justify-center items-center space-x-4">
                {[1, 2, 3].map((level) => {
                  const levelResult = levelResults[level - 1];
                  const isCompleted = levelResults.length >= level;
                  const isCurrent = currentLevel === level && !gameOver;
                  const gaveUp = levelResult && levelResult.gaveUp;
                  return (
                    <div
                      key={level}
                      className={`w-12 h-8 rounded-lg flex items-center justify-center text-sm font-bold transition-all duration-300 ${
                        gaveUp
                          ? 'bg-orange-500 bg-opacity-70 text-orange-800'
                          : isCompleted 
                            ? 'bg-green-500 bg-opacity-70 text-green-800' 
                            : isCurrent 
                              ? 'bg-gray-400 text-gray-700' 
                              : 'bg-gray-300 text-gray-500'
                      }`}
                    >
                      {level}
                    </div>
                  );
                })}
                <button
                  type="button"
                  onClick={handleHint}
                  disabled={!roundStarted || gameOver || isTransitioning}
                  className={`flex-shrink-0 w-12 h-8 rounded-lg relative flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed overflow-visible border-0 ${
                    hintTargetWord && hintCharsRevealed >= hintTargetWord.length
                      ? 'text-white'
                      : hintAvailable
                        ? 'text-white hover:opacity-90'
                        : 'bg-white text-gray-400'
                  }`}
                  style={
                    hintTargetWord && hintCharsRevealed >= hintTargetWord.length
                      ? { backgroundColor: 'rgba(28, 109, 42, 0.4)' }
                      : hintAvailable
                        ? { backgroundColor: '#1c6d2a' }
                        : undefined
                  }
                  title={
                    hintTargetWord && hintCharsRevealed >= hintTargetWord.length
                      ? 'Hint fully used'
                      : hintAvailable
                        ? 'Hint'
                        : 'Hint available in 30 seconds'
                  }
                  aria-label={
                    hintTargetWord && hintCharsRevealed >= hintTargetWord.length
                      ? 'Hint fully used'
                      : hintAvailable
                        ? 'Hint'
                        : 'Hint loading'
                  }
                >
                  {!(
                    hintTargetWord &&
                    hintCharsRevealed >= hintTargetWord.length
                  ) &&
                    !hintAvailable && (
                    <svg
                      className="absolute inset-0 w-full h-full pointer-events-none rounded-lg"
                      viewBox="0 0 100 100"
                      preserveAspectRatio="none"
                      aria-hidden
                    >
                      <path
                        d="M 50 2 L 84 2 A 14 14 0 0 1 98 16 L 98 84 A 14 14 0 0 1 84 98 L 16 98 A 14 14 0 0 1 2 84 L 2 16 A 14 14 0 0 1 16 2 L 50 2"
                        fill="none"
                        stroke="#1c6d2a"
                        strokeWidth="5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        pathLength={1}
                        strokeDasharray="1 1"
                        style={{ strokeDashoffset: 1 - hintFillProgress / 100, transition: 'stroke-dashoffset 0.25s linear' }}
                      />
                    </svg>
                  )}
                  <span className={`relative z-10 text-sm font-medium ${hintReadyPop ? 'hint-ready-pop' : ''}`}>
                    Hint
                  </span>
                </button>
              </div>
              {/* Error message container — fixed min height (matches ver2) so Submit stays aligned when errors toggle */}
              <div className="min-h-[1.5rem] flex items-center justify-center">
                {error && (
                  <p
                    className="text-sm text-center px-2 leading-snug"
                    style={{
                      color: '#c85f31',
                      animation: 'fadeIn 0.2s ease-in-out'
                    }}
                    role="alert"
                  >
                    {errorMessage}
                  </p>
                )}
              </div>
              
              {/* Submit button - hidden on mobile */}
              {!isMobile && (
              <div className="relative inline-block">
                <button 
                  onClick={handleSubmit} 
                  style={{backgroundColor:'#195b7c'}} 
                  className="text-white px-4 py-2 rounded text-lg disabled:opacity-50" 
                  disabled={!roundStarted || gameOver || isTransitioning}
                >
                  Submit
                </button>
              </div>
              )}

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
                const availableWidth = Math.max(0, viewportWidth - 2 * edgeMargin);
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
                const letterW = Math.round(keyBaseWidth * scale);
                const keyPadding = 4;
                const containerPaddingH = 8;
                const containerPaddingB = 8;
                const maxKeyboardHeight = typeof viewportHeight === 'number' && viewportHeight > 0 ? Math.min(viewportHeight * 0.4, 350) : 350;
                const nonKeyVertical = 8 + containerPaddingB + 2 * rowGapPx;
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
                const keyBg = '#e5e7eb';
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
                    style={isMobile ? { position: 'fixed', bottom: 0, left: 0, right: 0, padding: `8px ${containerPaddingH}px ${containerPaddingB}px`, borderTop: '1px solid #e5e7eb', backgroundColor: '#ffffff', zIndex: 20 } : { padding: '0 10px' }}
                  >
            {/* Top row: Q-P */}
            <div className="flex justify-center relative flex-nowrap" style={{ gap: gapPx, marginBottom: rowGapPx }} onPointerDown={handleTopRowBackgroundPointerDown} onPointerUp={handleTopRowPointerUpOrCancel} onPointerCancel={handleTopRowPointerUpOrCancel}>
              {['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'].map((letter) => (
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
                    className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold rounded-lg text-base sm:text-lg transition-colors touch-manipulation"
                    disabled={!roundStarted || gameOver || isTransitioning}
                    style={{ touchAction: 'manipulation', width: '100%', height: '100%', padding: keyPadding, boxSizing: 'border-box', userSelect: 'none', WebkitUserSelect: 'none', WebkitTapHighlightColor: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: letterH, position: 'relative', zIndex: 2, pointerEvents: 'auto' }}
                  >
                    {pressedKey === letter ? '' : letter}
                  </button>
                  {pressedKey === letter && (
                    <>
                      <div style={{ position: 'absolute', left: 0, right: 0, bottom: '100%', height: popupGap, backgroundColor: keyBg, borderTopLeftRadius: 6, borderTopRightRadius: 6, zIndex: 10 }} />
                      <div style={{ position: 'absolute', left: '50%', marginLeft: -popupW / 2, bottom: `calc(100% + ${popupGap}px)`, width: popupW, height: popupH, backgroundColor: keyBg, borderRadius: 8, boxShadow: '0 2px 6px rgba(0,0,0,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2em', fontWeight: 600, color: '#1f2937', zIndex: 10, pointerEvents: 'none' }}>{letter}</div>
                    </>
                  )}
                </div>
              ))}
            </div>
            {/* Middle row: A-L */}
            <div className="flex justify-center relative flex-nowrap" style={{ gap: gapPx, marginBottom: rowGapPx }} onPointerDown={handleMiddleRowBackgroundPointerDown} onPointerUp={handleMiddleRowPointerUpOrCancel} onPointerCancel={handleMiddleRowPointerUpOrCancel}>
              {['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'].map((letter) => (
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
                    className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold rounded-lg text-base sm:text-lg transition-colors touch-manipulation"
                    disabled={!roundStarted || gameOver || isTransitioning}
                    style={{ touchAction: 'manipulation', width: '100%', height: '100%', padding: keyPadding, boxSizing: 'border-box', userSelect: 'none', WebkitUserSelect: 'none', WebkitTapHighlightColor: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: letterH, position: 'relative', zIndex: 2, pointerEvents: 'auto' }}
                  >
                    {pressedKey === letter ? '' : letter}
                  </button>
                  {pressedKey === letter && (
                    <>
                      <div style={{ position: 'absolute', left: 0, right: 0, bottom: '100%', height: popupGap, backgroundColor: keyBg, borderTopLeftRadius: 6, borderTopRightRadius: 6, zIndex: 10 }} />
                      <div style={{ position: 'absolute', left: '50%', marginLeft: -popupW / 2, bottom: `calc(100% + ${popupGap}px)`, width: popupW, height: popupH, backgroundColor: keyBg, borderRadius: 8, boxShadow: '0 2px 6px rgba(0,0,0,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2em', fontWeight: 600, color: '#1f2937', zIndex: 10, pointerEvents: 'none' }}>{letter}</div>
                    </>
                  )}
                </div>
              ))}
            </div>
            {/* Bottom row: Shift + Z-M + Backspace */}
            <div className="flex justify-center relative flex-nowrap" style={{ gap: gapPx, marginBottom: rowGapPx }} onPointerDown={handleBottomRowBackgroundPointerDown} onPointerUp={handleBottomRowPointerUpOrCancel} onPointerCancel={handleBottomRowPointerUpOrCancel}>
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
                  className="bg-gray-200 hover:bg-gray-300 active:bg-gray-400 text-gray-800 font-semibold rounded-lg text-base disabled:opacity-50 touch-manipulation"
                  disabled={!roundStarted || gameOver || isTransitioning}
                  style={{ touchAction: 'manipulation', width: '100%', height: '100%', padding: keyPadding, boxSizing: 'border-box', userSelect: 'none', WebkitUserSelect: 'none', WebkitTapHighlightColor: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: specialHeight, height: specialHeight, position: 'relative', zIndex: pressedKey === 'shift' ? 10 : 2, transform: pressedKey === 'shift' ? 'scale(1.3)' : 'scale(1)', transition: 'transform 0.1s ease-out', backgroundColor: pressedKey === 'shift' ? 'rgb(156, 163, 175)' : mobileShiftActive ? 'rgb(156, 163, 175)' : undefined }}
                  title={mobileCapsLock ? 'Caps lock on (tap to turn off)' : mobileShiftActive ? 'Next letter capital (double-tap for caps lock)' : 'Tap for one capital letter; double-tap for caps lock'}
                  aria-label={mobileCapsLock ? 'Caps lock on' : mobileShiftActive ? 'Next letter will be capital' : 'Shift'}
                >
                  <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
                    <span>⇧</span>
                    {mobileCapsLock && <span style={{ width: '1em', borderBottom: '2px solid currentColor', marginTop: '-1px' }} aria-hidden />}
                  </span>
                </button>
              </div>
              {['Z', 'X', 'C', 'V', 'B', 'N', 'M'].map((letter) => (
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
                    className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold rounded-lg text-base sm:text-lg transition-colors touch-manipulation"
                    disabled={!roundStarted || gameOver || isTransitioning}
                    style={{ touchAction: 'manipulation', width: '100%', height: '100%', padding: keyPadding, boxSizing: 'border-box', userSelect: 'none', WebkitUserSelect: 'none', WebkitTapHighlightColor: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: letterH, position: 'relative', zIndex: 2, pointerEvents: 'auto' }}
                  >
                    {pressedKey === letter ? '' : letter}
                  </button>
                  {pressedKey === letter && (
                    <>
                      <div style={{ position: 'absolute', left: 0, right: 0, bottom: '100%', height: popupGap, backgroundColor: keyBg, borderTopLeftRadius: 6, borderTopRightRadius: 6, zIndex: 10 }} />
                      <div style={{ position: 'absolute', left: '50%', marginLeft: -popupW / 2, bottom: `calc(100% + ${popupGap}px)`, width: popupW, height: popupH, backgroundColor: keyBg, borderRadius: 8, boxShadow: '0 2px 6px rgba(0,0,0,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2em', fontWeight: 600, color: '#1f2937', zIndex: 10, pointerEvents: 'none' }}>{letter}</div>
                    </>
                  )}
                </div>
              ))}
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
                  className="bg-gray-200 hover:bg-gray-300 active:bg-gray-400 text-gray-800 font-semibold rounded-lg text-base disabled:opacity-50 touch-manipulation"
                  disabled={!roundStarted || gameOver || isTransitioning}
                  style={{ touchAction: 'manipulation', width: '100%', height: '100%', padding: keyPadding, boxSizing: 'border-box', userSelect: 'none', WebkitUserSelect: 'none', WebkitTapHighlightColor: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: specialHeight, height: specialHeight, position: 'relative', zIndex: pressedKey === 'backspace' ? 10 : 2, transform: pressedKey === 'backspace' ? 'scale(1.3)' : 'scale(1)', transition: 'transform 0.1s ease-out', backgroundColor: pressedKey === 'backspace' ? 'rgb(156, 163, 175)' : undefined }}
                >
                  ⌫
                </button>
              </div>
            </div>
            {/* Submit: span from Z to M, same height as keys; only clickable within button */}
            <div className="w-full mt-0.5 flex justify-center">
              <button
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault(); e.stopPropagation();
                  setPressedKey('submit');
                  mobileShiftActiveRef.current = false;
                  mobileCapsLockRef.current = false;
                  setMobileShiftActive(false);
                  setMobileCapsLock(false);
                  const val = (inputRef.current?.value ?? inputValueRef.current ?? input) ?? '';
                  handleSubmit(e, val);
                  refocusInputSoon();
                }}
                onPointerUp={(e) => { e.preventDefault(); e.stopPropagation(); setPressedKey(null); }}
                onPointerCancel={(e) => { e.preventDefault(); e.stopPropagation(); setPressedKey(null); }}
                className="text-white rounded-lg text-base font-semibold disabled:opacity-50 touch-manipulation"
                disabled={!roundStarted || gameOver || isTransitioning}
                style={{ backgroundColor: '#195b7c', touchAction: 'manipulation', userSelect: 'none', WebkitUserSelect: 'none', WebkitTapHighlightColor: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: pressedKey === 'submit' ? 10 : 2, transform: pressedKey === 'submit' ? 'scale(1.02)' : 'scale(1)', transition: 'transform 0.1s ease-out', width: submitWidth, height: letterH, minHeight: letterH }}
              >
                Submit
              </button>
            </div>
          </div>
        </>
        );
              })()}
              
          {/* Game Controls */}
          <div className="flex flex-col items-center space-y-3 fade-in">
            {gameOver && (
              <button
                type="button"
                onClick={resetGame}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold rounded border border-gray-400 bg-white text-black"
              >
                <FontAwesomeIcon icon={faHouseChimney} className="text-base shrink-0" />
                Home
              </button>
            )}
          </div>
        </>
      )}

      {/* Statistics Modal */}
      {(showStats || statsModalClosing) && (
        <div className={`fixed top-0 left-0 right-0 bottom-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] ${statsModalClosing ? 'modal-fade-out' : 'modal-fade-in'}`} style={{ width: '100vw', height: '100vh', margin: 0, padding: 0 }}>
          <div className="bg-white rounded-lg p-4 sm:p-6 w-full max-w-xs sm:max-w-sm md:max-w-md mx-4 sm:mx-6 max-h-[85vh] sm:max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex justify-between items-center mb-4 sm:mb-6">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowClearStatsButton((v) => !v)}
                  className="border-0 bg-transparent p-0.5 -m-0.5 text-gray-600 cursor-default outline-none focus:outline-none focus-visible:outline-none active:outline-none focus:ring-0 ring-0 [-webkit-tap-highlight-color:transparent]"
                  aria-label="Toggle Clear Stats visibility (testing)"
                >
                  <FontAwesomeIcon icon={faChartSimple} className="text-gray-600" />
                </button>
                Statistics
              </h2>
              <div className="flex items-center space-x-2">
                {showClearStatsButton && (
                  <button
                    type="button"
                    onClick={clearStats}
                    className="text-xs text-red-500 hover:text-red-700 px-2 py-1 border border-red-300 rounded"
                  >
                    Clear Stats
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setShowClearStatsButton(false);
                    setStatsModalClosing(true);
                    setShowStats(false); // hide immediately so content underneath can animate in
                    setTimeout(() => setStatsModalClosing(false), 200);
                  }}
                  className="text-gray-500 hover:text-gray-700 text-lg sm:text-xl font-bold"
                >
                  ×
                </button>
              </div>
            </div>
            
            {/* Game Result Message — only after full round (3 stages), not mid-game */}
            {levelResults.length === 3 && (
              <div className="text-center mb-6 p-4 bg-gray-50 rounded-lg">
                {levelResults.every(result => !result.gaveUp) ? (
                  <div>
                    <div className="text-lg font-semibold text-green-700 mb-2 flex items-center justify-center gap-2 flex-wrap">
                      <span aria-hidden className="select-none">🥳</span>
                      <span>Congratulations!</span>
                      <span aria-hidden className="select-none">🎉</span>
                    </div>
                    <div className="text-sm text-gray-600 mb-1">You completed this Stringlish in:</div>
                    <div className="text-2xl font-bold text-green-700">{formatTime(gameOver && finalGameTimeRef.current != null ? finalGameTimeRef.current : gameTime)}</div>
                  </div>
                ) : (
                  <div className="text-lg font-semibold text-gray-600 flex items-center justify-center gap-2 flex-wrap">
                    <span aria-hidden className="select-none">☘️</span>
                    <span>Better Luck Next Time!</span>
                    <span aria-hidden className="select-none">☘️</span>
                  </div>
                )}
              </div>
            )}
            
            {/* Stats Grid */}
            <div className="grid grid-cols-5 gap-2 mb-6 sm:mb-8">
              <div className="text-center">
                <div className="text-xl sm:text-2xl font-bold">{stats.gamesPlayed}</div>
                <div className="text-xs text-gray-600 leading-tight">
                  <span className="block">Games Played</span>
                </div>
              </div>
              <div className="text-center">
                <div className="text-xl sm:text-2xl font-bold">{stats.gamesWon}</div>
                <div className="text-xs text-gray-600 leading-tight">
                  <span className="block">Games</span>
                  <span className="block">Won</span>
                </div>
              </div>
              <div className="text-center">
                <div className="text-xl sm:text-2xl font-bold">
                  {stats.gamesPlayed > 0 ? Math.round((stats.gamesWon / stats.gamesPlayed) * 100) : 0}%
                </div>
                <div className="text-xs text-gray-600">Win %</div>
              </div>
              <div className="text-center">
                <div className="text-xl sm:text-2xl font-bold">{stats.currentStreak}</div>
                <div className="text-xs text-gray-600">Streak</div>
              </div>
              <div className="text-center">
                <div className="text-xl sm:text-2xl font-bold">{stats.maxStreak || 0}</div>
                <div className="text-xs text-gray-600 leading-tight">
                  <span className="block">Max</span>
                  <span className="block">Streak</span>
                </div>
              </div>
            </div>
            
            {/* Fastest Times */}
            <div className="mb-6 sm:mb-8">
              <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 flex items-center gap-2">
                <span aria-hidden className="select-none">⚡</span>
                Fastest Times
              </h3>
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((position) => {
                  const time = (stats.fastestTimes && stats.fastestTimes[position - 1]) || 0;
                  const currentRoundTime = parseInt(localStorage.getItem('currentRoundTimeTimed') || '0');
                  const isCurrentRound = time === currentRoundTime && time > 0;
                  const maxTime = Math.max(...(stats.fastestTimes || []), 1);
                  const barWidth = time > 0 ? (time / maxTime) * 100 : 10;
                  
                  return (
                    <div key={position} className="flex items-center space-x-3">
                      <span className="text-sm font-medium w-4">{position}</span>
                      <div className="flex-1 bg-gray-300 rounded-full h-4 relative">
                        <div 
                          className={`h-4 rounded-full ${isCurrentRound ? 'bg-green-600' : 'bg-gray-500'}`}
                          style={{ 
                            width: `${barWidth}%`,
                            backgroundColor: isCurrentRound ? '#1c6d2a' : undefined
                          }}
                        ></div>
                        <span className="absolute right-2 top-1/2 transform -translate-y-1/2 text-xs font-medium text-white">
                          {time > 0 ? formatTime(time) : '-'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Share button - same green as gameplay square (#1c6d2a) */}
            <div className="mt-4 pt-3 border-t border-gray-200">
              <button
                type="button"
                onClick={async () => {
                  const d = new Date();
                  const mm = String(d.getMonth() + 1).padStart(2, '0');
                  const dd = String(d.getDate()).padStart(2, '0');
                  const yy = String(d.getFullYear()).slice(-2);
                  const dateStr = `${mm}/${dd}/${yy}`;
                  const completed = levelResults.length === 3 && levelResults.every(r => !r.gaveUp);
                  const lastRoundTime = finalGameTimeRef.current != null
                    ? finalGameTimeRef.current
                    : parseInt(localStorage.getItem('currentRoundTimeTimed') || '0', 10);
                  const text = completed && lastRoundTime > 0
                    ? `Stringlish, ${dateStr} - Time: ${formatTime(lastRoundTime)}. See if you can beat me at https://www.stringlish.com/`
                    : `Stringlish, ${dateStr} - Didn't quite get it this time. See if you can beat me at https://www.stringlish.com/`;
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
                className="w-full py-3 px-4 rounded-lg font-semibold text-white flex items-center justify-center gap-2"
                style={{ backgroundColor: '#1c6d2a' }}
              >
                Share <span className="ml-2"><FontAwesomeIcon icon={faShareNodes} /></span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Contact — same shell as Rules modal: sticky header / scroll body / sticky footer (ver2 layout) */}
      {(showContact || contactModalClosing) && (
        <div
          className={`fixed top-0 left-0 right-0 bottom-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] ${contactModalClosing ? 'modal-fade-out' : 'modal-fade-in'}`}
          style={{ width: '100vw', height: '100vh', margin: 0, padding: 0 }}
          onClick={closeContactModal}
          role="presentation"
        >
          <div
            className="bg-white rounded-lg w-full max-w-xs sm:max-w-sm md:max-w-md mx-4 sm:mx-6 flex flex-col max-h-[min(90vh,90dvh)] overflow-hidden shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="contact-modal-title"
            aria-modal="true"
          >
            <div className="flex items-center justify-between flex-shrink-0 p-4 sm:p-6 pb-3 border-b border-gray-200 bg-white z-10">
              <h2 id="contact-modal-title" className="text-lg font-bold text-left flex items-center gap-2">
                <FontAwesomeIcon icon={faEnvelope} className="text-gray-600" />
                Contact
              </h2>
              <button
                type="button"
                onClick={closeContactModal}
                className="text-gray-500 hover:text-gray-700 text-lg sm:text-xl font-bold leading-none p-1 -mr-1 -mt-1"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto text-left px-4 sm:px-6 py-4 space-y-4">
              <div>
                <label htmlFor="contact-email" className="block text-sm font-medium text-gray-700 mb-1">
                  Your email
                </label>
                <input
                  id="contact-email"
                  type="email"
                  autoComplete="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  placeholder="you@example.com"
                />
              </div>
              <div>
                <label htmlFor="contact-subject" className="block text-sm font-medium text-gray-700 mb-1">
                  Subject
                </label>
                <input
                  id="contact-subject"
                  type="text"
                  value={contactSubject}
                  onChange={(e) => setContactSubject(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  placeholder="What is this about?"
                />
              </div>
              <div>
                <label htmlFor="contact-message" className="block text-sm font-medium text-gray-700 mb-1">
                  Message
                </label>
                <textarea
                  id="contact-message"
                  value={contactMessage}
                  onChange={(e) => setContactMessage(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm min-h-[140px] resize-y"
                  placeholder="Your message…"
                />
              </div>
            </div>
            <div className="flex-shrink-0 border-t border-gray-200 bg-white p-4 sm:px-6 flex flex-row justify-between items-center gap-3 w-full">
              <button
                type="button"
                onClick={closeContactModal}
                className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleContactSend}
                disabled={!contactMessage.trim()}
                className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rules Modal — 4-step wizard */}
      {(showRules || rulesModalClosing) && (
        <TimedRulesModal
          showRules={showRules}
          rulesModalClosing={rulesModalClosing}
          isMobile={isMobile}
          onClose={closeRulesModal}
          showRulesOnStart={showRulesOnStart}
          onToggleShowRulesOnStart={toggleShowRulesOnStart}
        />
      )}

      <style>{`
        @keyframes float-up {0%{opacity:1;transform:translate(-50%,0)}100%{opacity:0;transform:translate(-50%,-40px)}}
        .animate-float-up{animation:float-up 1.5s ease-out}
        
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

        @keyframes rulesWizardSlideInNext {
          from {
            opacity: 0.65;
            transform: translateX(22px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        @keyframes rulesWizardSlideInPrev {
          from {
            opacity: 0.65;
            transform: translateX(-22px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        .rules-wizard-slide-next {
          animation: rulesWizardSlideInNext 0.32s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
        }
        .rules-wizard-slide-prev {
          animation: rulesWizardSlideInPrev 0.32s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
        }
        
        /* Smooth transitions for game state changes */
        .game-transition {
          transition: all 0.3s ease-in-out;
        }
        
        .fade-in {
          animation: fadeIn 0.4s ease-in-out forwards;
        }
        
        .fade-out {
          animation: fadeOut 0.3s ease-in-out forwards;
        }
        
        .slide-up {
          animation: slideUp 0.4s ease-in-out forwards;
        }
        
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes keyPop {
          0% { transform: scale(1); }
          50% { transform: scale(1.15); }
          100% { transform: scale(1); }
        }
        .key-pop-animation {
          animation: keyPop 0.15s ease-out;
        }
        
        @keyframes fadeOut {
          from { opacity: 1; }
          to { opacity: 0; }
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
        @keyframes hintReadyPop {
          0% { transform: scale(1); }
          50% { transform: scale(1.1); }
          100% { transform: scale(1); }
        }
        .hint-ready-pop {
          animation: hintReadyPop 0.2s ease-out;
        }
      `}</style>
      
      {/* Footer - hidden on mobile during gameplay when keyboard is shown */}
      {footerBarVisible && (
        <footer
          className="text-center flex flex-col items-center gap-1.5 fixed bottom-0 left-0 right-0 z-[15] bg-white border-t border-gray-200 pt-2 pb-[max(8px,env(safe-area-inset-bottom,0px))]"
        >
          <button
            type="button"
            onClick={() => setShowContact(true)}
            className="text-sm text-gray-500 hover:text-gray-700 underline underline-offset-2"
          >
            Contact
          </button>
          <p className="text-gray-500 italic text-sm leading-tight">© 2026 Davis English. All Rights Reserved.</p>
        </footer>
      )}
      </div>
      </div>
    </div>
  );
}