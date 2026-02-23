// Required dependencies: react, @fortawesome/react-fontawesome, @fortawesome/free-solid-svg-icons
// Tailwind CSS is used for styling (optional, or replace with your own CSS)
// Drop this file into your React project and import/use <WordPuzzleGame />
// 
// VERSION: TIMED EDITION - Uses isolated localStorage keys to prevent stats conflicts with other versions
// Storage Keys: 'sequenceGameTimedStats' and 'currentRoundTimeTimed'
import React, { useState, useEffect, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faStopwatch, faCircleInfo, faChartSimple, faCheckCircle, faTimesCircle, faCircleQuestion, faHouseChimney } from '@fortawesome/free-solid-svg-icons';
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
function PossibleAnswers({ letters, max = 3, ensureIncluded }) {
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

  return (
    <div className="space-y-1">
      {answers.map((word, idx) => (
        <div key={idx}>{word}</div>
      ))}
    </div>
  );
}

export default function WordPuzzleGame() {
  const [currentLevel, setCurrentLevel] = useState(1);
  const [letters, setLetters] = useState('');
  const [allLevelLetters, setAllLevelLetters] = useState([]); // Store all 3 sets of letters
  const [roundStarted, setRoundStarted] = useState(false);
  const [input, setInput] = useState('');
  const [levelResults, setLevelResults] = useState([]); // [{ letters, word, time, gaveUp }]
  const [error, setError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [gameTime, setGameTime] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [letterPopup, setLetterPopup] = useState(null);
  const [showRevealAnimation, setShowRevealAnimation] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [needsScrollForKeyboard, setNeedsScrollForKeyboard] = useState(false);
  const [stats, setStats] = useState({
    gamesPlayed: 0,
    gamesWon: 0,
    currentStreak: 0,
    maxStreak: 0,
    fastestTimes: [],
    averageTimes: []
  });
  const [showRules, setShowRules] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [pressedKey, setPressedKey] = useState(null);
  const [hintWord, setHintWord] = useState(null);
  const [hintRevealCount, setHintRevealCount] = useState(0); // kept for compatibility (one-hint-per-round: unused)
  const [hintRevealAnimating, setHintRevealAnimating] = useState(false);
  const [hintAvailable, setHintAvailable] = useState(false);
  const [hintFillProgress, setHintFillProgress] = useState(0);
  const [hintReadyPop, setHintReadyPop] = useState(false);
  const hintUnlockTimeoutRef = useRef(null);
  const hintFillIntervalRef = useRef(null);
  const startTimeRef = useRef(null);
  const inputRef = useRef(null);
  /** When the round ends (win), this is the single source of truth for the final time (avoids timer race). */
  const finalGameTimeRef = useRef(null);
  /** Tracks current timer value for use after async work (e.g. isValidWord); keeps modal time in sync with gameplay display. */
  const gameTimeRef = useRef(0);
  const inputValueRef = useRef(''); // on mobile, stays in sync with input so Submit sees latest value
  const backspaceHoldTimeoutRef = useRef(null);
  const backspaceHoldIntervalRef = useRef(null);
  const lastKeyPressRef = useRef({ key: null, time: 0 });
  const isSubmittingRef = useRef(false);
  const contentAboveKeyboardRef = useRef(null);
  const KEYBOARD_BOTTOM_OFFSET = 10;
  const KEYBOARD_HEIGHT_ESTIMATE = 280;
  const KEYBOARD_GAP_MIN = 0;

  // Function to generate all three sets of unique letters
  const generateAllLevelLetters = async () => {
    const letters = [];
    const used = new Set();
    
    for (let i = 0; i < 3; i++) {
      let attempts = 0;
      const maxAttempts = 100;
      let newLetters;
      const level = i + 1; // Level 1, 2, or 3
      
      do {
        newLetters = await getRandomLetters(level);
        attempts++;
      } while (used.has(newLetters) && attempts < maxAttempts);
      
      letters.push(newLetters);
      used.add(newLetters);
    }
    
    return letters;
  };

  useEffect(() => {
    (async () => {
      const allLetters = await generateAllLevelLetters();
      setAllLevelLetters(allLetters);
      setLetters(allLetters[0]); // Set first level letters
    })();
      // Load stats from localStorage - Version specific for Timed Edition
  const savedStats = localStorage.getItem('sequenceGameTimedStats');
    if (savedStats) {
      setStats(JSON.parse(savedStats));
    }
    
    // Detect mobile/tablet (show virtual keyboard for phones and tablets)
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 1024);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // When mobile + keyboard shown: allow scroll if content would overlap keyboard (keep ≥15px gap)
  useEffect(() => {
    if (!isMobile || !roundStarted || gameOver) {
      setNeedsScrollForKeyboard(false);
      return;
    }
    const checkOverlap = () => {
      const el = contentAboveKeyboardRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const contentBottom = rect.bottom;
      const keyboardTop = window.innerHeight - KEYBOARD_BOTTOM_OFFSET - KEYBOARD_HEIGHT_ESTIMATE;
      const threshold = keyboardTop - KEYBOARD_GAP_MIN;
      setNeedsScrollForKeyboard(contentBottom > threshold);
    };
    let ro;
    const scheduleCheck = () => {
      requestAnimationFrame(() => {
        if (contentAboveKeyboardRef.current) {
          checkOverlap();
          if (!ro && contentAboveKeyboardRef.current) {
            ro = new ResizeObserver(checkOverlap);
            ro.observe(contentAboveKeyboardRef.current);
          }
        }
      });
    };
    scheduleCheck();
    const t = setTimeout(scheduleCheck, 100);
    window.addEventListener('resize', checkOverlap);
    return () => {
      clearTimeout(t);
      if (ro) ro.disconnect();
      window.removeEventListener('resize', checkOverlap);
    };
  }, [isMobile, roundStarted, gameOver]);

  useEffect(() => {
    if (!roundStarted || gameOver) return;

    const timer = setInterval(() => {
      setGameTime(prev => {
        const next = prev + 1;
        gameTimeRef.current = next;
        return next;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [roundStarted, gameOver]);

  const startHintFillTimer = () => {
    setHintAvailable(false);
    setHintFillProgress(0);
    setHintReadyPop(false);
    if (hintUnlockTimeoutRef.current) clearTimeout(hintUnlockTimeoutRef.current);
    if (hintFillIntervalRef.current) clearInterval(hintFillIntervalRef.current);
    hintFillIntervalRef.current = setInterval(() => {
      setHintFillProgress((prev) => {
        if (prev >= 99) {
          if (hintFillIntervalRef.current) {
            clearInterval(hintFillIntervalRef.current);
            hintFillIntervalRef.current = null;
          }
          return 100;
        }
        return prev + 1;
      });
    }, 300);
    hintUnlockTimeoutRef.current = setTimeout(() => {
      hintUnlockTimeoutRef.current = null;
      setHintFillProgress(100);
      setHintAvailable(true);
      setHintReadyPop(true);
      setTimeout(() => setHintReadyPop(false), 200);
    }, 30000);
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

  // Reset hint when triplet/level changes; start 30s fill for this round
  useEffect(() => {
    setHintWord(null);
    setHintRevealCount(0);
    setHintAvailable(false);
    setHintFillProgress(0);
    clearHintTimers();
    if (roundStarted && !gameOver && letters) {
      startHintFillTimer();
    }
    return clearHintTimers;
  }, [letters]);

  // When game first starts (roundStarted), start the 30s hint fill for level 1
  useEffect(() => {
    if (!roundStarted || gameOver || !letters) return;
    startHintFillTimer();
    return clearHintTimers;
  }, [roundStarted, gameOver]);

  // Keep inputValueRef in sync with input state so mobile Submit always has a source of truth
  useEffect(() => {
    inputValueRef.current = input;
  }, [input]);

  // Ensure input field gets focus when game starts and after transitions
  useEffect(() => {
    if (roundStarted && !gameOver && !isTransitioning && inputRef.current) {
      // Small delay to ensure the input field is fully rendered
      const focusTimer = setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, 100);
      
      return () => clearTimeout(focusTimer);
    }
  }, [roundStarted, gameOver, isTransitioning]);

  const handleBegin = () => {
    setShowRevealAnimation(true);
    setError(false);
    setErrorMessage('');
    // Start the game after the reveal animation completes
    setTimeout(() => {
    setRoundStarted(true);
    startTimeRef.current = performance.now();
      // Focus the input field when the game starts
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, 200); // Slightly longer delay to ensure the input field is fully rendered
    }, 500); // Match the animation duration
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
        gaveUp: false
      };

      setLevelResults(prev => [...prev, levelResult]);

      setInput('');
      inputValueRef.current = '';
      setError(false);
      setErrorMessage('');

      if (currentLevel === 3) {
        finalGameTimeRef.current = timeToRecord;
        setGameOver(true);
        updateStats(timeToRecord);
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
    // Clear the current round time when starting a new game
    localStorage.removeItem('currentRoundTimeTimed');
    finalGameTimeRef.current = null;
    gameTimeRef.current = 0;

    setRoundStarted(false);
    setShowRevealAnimation(false);
    setShowStats(false);
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
    setHintRevealCount(0);
    setHintAvailable(false);
    setHintFillProgress(0);
    setHintReadyPop(false);
    clearHintTimers();
    
    (async () => {
      const allLetters = await generateAllLevelLetters();
      setAllLevelLetters(allLetters);
      setLetters(allLetters[0]); // Set first level letters
    })();
    inputValueRef.current = '';
    setInput('');
  };

  const updateStats = (recordedTime) => {
    const newStats = { ...stats };
    const timeForThisRound = recordedTime != null ? recordedTime : gameTime;

    // Ensure all required properties exist
    newStats.gamesPlayed = newStats.gamesPlayed || 0;
    newStats.gamesWon = newStats.gamesWon || 0;
    newStats.currentStreak = newStats.currentStreak || 0;
    newStats.maxStreak = newStats.maxStreak || 0;
    newStats.fastestTimes = newStats.fastestTimes || [];
    newStats.averageTimes = newStats.averageTimes || [];

    // Update games played and won
    newStats.gamesPlayed += 1;

    // Only count as won if no levels were given up on
    const hasGiveUps = levelResults.some(result => result.gaveUp);
    if (!hasGiveUps) {
      newStats.gamesWon += 1;
      newStats.currentStreak += 1;

      // Update max streak if current streak is higher
      if (newStats.currentStreak > newStats.maxStreak) {
        newStats.maxStreak = newStats.currentStreak;
      }
    } else {
      // Reset streak if any level was given up on
      newStats.currentStreak = 0;
    }

    // Update fastest times - use the same recorded time so modal and list match
    if (timeForThisRound > 0) {
      newStats.fastestTimes = newStats.fastestTimes.filter(t => t !== timeForThisRound);
      newStats.fastestTimes.push(timeForThisRound);
      newStats.fastestTimes.sort((a, b) => a - b); // Sort ascending
      newStats.fastestTimes = newStats.fastestTimes.slice(0, 5); // Keep top 5

      localStorage.setItem('currentRoundTimeTimed', timeForThisRound.toString());
    }

    setStats(newStats);
    localStorage.setItem('sequenceGameTimedStats', JSON.stringify(newStats));
  };

  const handleInputChange = (e) => {
    if (!roundStarted || gameOver || isTransitioning) return;
    const v = e.target.value;
    inputValueRef.current = v;
    setInput(v);
    if (error) { setError(false); setErrorMessage(''); }
  };

  // Virtual keyboard handlers
  const handleKeyboardLetter = (letter) => {
    if (!roundStarted || gameOver || isTransitioning) return;
    
    // Prevent duplicate rapid key presses (debounce)
    const now = Date.now();
    if (lastKeyPressRef.current.key === letter && now - lastKeyPressRef.current.time < 100) {
      return; // Ignore duplicate press within 100ms
    }
    lastKeyPressRef.current = { key: letter, time: now };
    
    const input = inputRef.current;
    if (input) {
      // Ensure input has focus
      if (document.activeElement !== input) {
        input.focus();
      }
      
      let start = input.selectionStart;
      const end = input.selectionEnd || 0;
      const currentValue = input.value;
      
      // If cursor is at start and field has text, or if input lost focus, move to end
      if (start === 0 && currentValue.length > 0 && document.activeElement !== input) {
        start = currentValue.length;
      } else if (start === null || start === undefined) {
        start = currentValue.length;
      }
      
      // Replace selected text or insert at cursor position
      const newValue = currentValue.slice(0, start) + letter + currentValue.slice(end);
      inputValueRef.current = newValue;
      setInput(newValue);
      
      // Set cursor position after the inserted letter
      setTimeout(() => {
        if (inputRef.current) {
          const newPosition = start + 1;
          inputRef.current.setSelectionRange(newPosition, newPosition);
        }
      }, 0);
    } else {
      // Fallback if input ref is not available
      const next = (inputValueRef.current || '') + letter;
      inputValueRef.current = next;
      setInput(next);
    }
    
    if (error) { setError(false); setErrorMessage(''); }
  };

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
      // Use rAF so it runs after the pointer event completes.
      requestAnimationFrame(() => {
        if (inputRef.current && roundStarted && !gameOver && !isTransitioning) {
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
  useEffect(() => {
    if (!isMobile || !roundStarted || gameOver) return;

    const onKeyDown = (e) => {
      if (isTransitioning) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === 'Enter') {
        e.preventDefault();
        const val = (inputRef.current?.value ?? inputValueRef.current) ?? '';
        handleSubmit(e, val);
        return;
      }

      if (e.key === 'Backspace') {
        e.preventDefault();
        handleKeyboardBackspace();
        return;
      }

      // Letters only
      if (/^[a-zA-Z]$/.test(e.key)) {
        e.preventDefault();
        handleKeyboardLetter(e.key.toLowerCase());
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
    const word = await getOnePossibleAnswer(letters);
    if (!word) return;
    const hintVal = word.slice(0, 3).toLowerCase();
    setHintWord(word);
    inputValueRef.current = hintVal;
    setInput(hintVal);
    setError(false);
    setErrorMessage('');
    setHintRevealAnimating(true);
    setTimeout(() => setHintRevealAnimating(false), 300);
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
  const size = 80;

  return (
    <div className={isMobile ? (needsScrollForKeyboard ? "min-h-[100dvh] flex flex-col" : "h-[100dvh] max-h-[100dvh] flex flex-col overflow-hidden") : ""}>
      <div className={isMobile ? `flex-1 min-h-0 ${needsScrollForKeyboard ? "overflow-y-auto pb-[5px]" : "overflow-hidden pb-[320px]"}` : ""}>
        <div className="p-6 max-w-xl mx-auto text-center space-y-6 relative overflow-hidden game-transition">
      <div className="flex justify-center items-center relative flex-col">
        {!roundStarted && (
          <>
            <a 
              href="https://davisenglish.github.io/sequence-game-home/"
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
          </>
        )}
        {!roundStarted && (
          <p className="text-gray-500 italic mt-4 text-center game-transition">
            Make words.<br />
            Tickle your brain.
          </p>
        )}
        {roundStarted && (
          <div className="flex items-center w-full">
            <div className="flex-1 min-w-0 flex items-center">
              <span className="text-base font-semibold text-gray-600 tabular-nums border border-gray-300 rounded px-2 py-1 bg-gray-50">
                {formatTime(gameOver && finalGameTimeRef.current != null ? finalGameTimeRef.current : gameTime)}
              </span>
            </div>
            <div className="flex items-center justify-center flex-shrink-0 space-x-3">
              <a 
                href="https://davisenglish.github.io/sequence-game-home/"
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
                  onClick={async () => {
                    if (roundStarted && !gameOver) {
                      const newStats = { ...stats };
                      newStats.gamesPlayed = (newStats.gamesPlayed || 0) + 1;
                      newStats.currentStreak = 0;
                      setStats(newStats);
                      localStorage.setItem('sequenceGameTimedStats', JSON.stringify(newStats));
                    }
                    if (roundStarted && !gameOver) {
                      const unsolvedLevels = [];
                      if (levelResults.length < currentLevel) {
                        unsolvedLevels.push({ letters: letters, word: null, time: gameTime, gaveUp: true });
                      }
                      for (let i = currentLevel + 1; i <= 3; i++) {
                        const levelLetters = allLevelLetters[i - 1];
                        unsolvedLevels.push({ letters: levelLetters, word: null, time: gameTime, gaveUp: true });
                      }
                      setLevelResults(prev => [...prev, ...unsolvedLevels]);
                    }
                    setGameOver(true);
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
        )}
      </div>

      {!roundStarted ? (
        <div className="flex flex-col items-center space-y-3">
        <button onClick={handleBegin} className="bg-white border border-gray-400 text-black w-52 h-16 text-xl font-semibold rounded">BEGIN : TIMED</button>
          <div className="flex flex-row items-center space-x-4">
            <a 
              href="https://davisenglish.github.io/sequence-game-home/"
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


          {/* Game Over Results Display */}
          {gameOver && (
            <div className="text-center mb-6 slide-up">
              {/* Level Results */}
              <div className="flex justify-center space-x-8">
                {levelResults.map((result, index) => (
                  <div key={index} className="text-center">
                    {/* Level Rectangle */}
                    <div className={`w-12 h-8 rounded-lg flex items-center justify-center text-sm font-bold mb-4 mx-auto ${
                      result.gaveUp 
                        ? 'bg-orange-500 bg-opacity-70 text-orange-800'
                        : 'bg-green-500 bg-opacity-70 text-green-800'
                    }`}>
                      {index + 1}
                    </div>
                    
                    {/* Provided Letters in Original Shapes */}
                    <div className="flex justify-center space-x-1 mb-3">
                      {result.letters.split('').map((char, idx) => {
                        const { shape, color } = shapes[idx];
                        const smallSize = 24;
                        const common = { 
                          width: `${smallSize}px`, 
                          height: `${smallSize}px`, 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center', 
                          color: 'white', 
                          fontSize: '0.75rem', 
                          fontWeight: '600',
                          boxShadow: '0 2px 6px rgba(0, 0, 0, 0.15)',
                          opacity: 0.8
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
                                fontSize: '0.75rem',
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
                    
                    {/* Word or Possible Answers */}
                    {result.gaveUp ? (
                      <div className="text-xs text-gray-500">
                        <div className="font-medium mb-1">Possible Answers:</div>
                        <PossibleAnswers
                          letters={result.letters}
                          max={3}
                          ensureIncluded={result.letters === letters ? hintWord : undefined}
                        />
                      </div>
                    ) : (
                      <div className="text-sm text-green-800 font-medium">
                        {result.word.toUpperCase()}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Current Letters Display */}
          {!gameOver && (
            <div className={`flex justify-center space-x-3 items-center transition-opacity duration-300 ${
              isTransitioning ? 'opacity-0' : 'opacity-100'
            }`}>
          {letters.split('').map((char, idx) => {
            const { shape, color } = shapes[idx];
            const common = { 
              width:`${size}px`, 
              height:`${size}px`, 
              display:'flex', 
              alignItems:'center', 
              justifyContent:'center', 
              color:'white', 
              fontSize:'1.75rem', 
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
          {roundStarted && !gameOver && (
            <div ref={contentAboveKeyboardRef} className="space-y-4 fade-in">
              <div
                className={`flex border rounded overflow-hidden ${error ? 'border-[#c85f31]' : 'border-gray-300'}`}
              >
              <div
                className={`flex-1 min-w-0 ${hintRevealAnimating ? 'hint-reveal-anim' : ''}`}
                style={{ transformOrigin: 'left center' }}
              >
              <input 
                ref={inputRef}
                type="text" 
                value={input} 
                onChange={handleInputChange}
                className="border-0 rounded-none px-4 py-2 w-full text-lg focus:ring-0 focus:outline-none"
                style={{
                  ...(error ? {
                    color: '#c85f31',
                    caretColor: '#c85f31'
                  } : {
                    caretColor: '#000000'
                  }),
                  ...(isMobile ? {
                    WebkitTapHighlightColor: 'transparent',
                    cursor: 'text'
                  } : {
                    cursor: 'text'
                  })
                }}
                placeholder="Enter word..." 
                disabled={!roundStarted || gameOver || isTransitioning}
                readOnly={isMobile}
                inputMode={isMobile ? 'none' : undefined}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                onTouchStart={(e) => {
                  // On mobile, ensure cursor is visible when tapping
                  if (isMobile && inputRef.current) {
                    e.preventDefault();
                    const input = inputRef.current;
                    // Temporarily remove readonly to show cursor, then restore
                    input.removeAttribute('readonly');
                    input.focus();
                    const pos = input.value.length;
                    input.setSelectionRange(pos, pos);
                    // Restore readonly after cursor is shown
                    setTimeout(() => {
                      input.setAttribute('readonly', 'readonly');
                      input.focus();
                      input.setSelectionRange(pos, pos);
                    }, 100);
                    setTimeout(() => {
                      input.focus();
                      input.setSelectionRange(pos, pos);
                    }, 200);
                  }
                }}
                onFocus={(e) => {
                  // Ensure cursor is visible when input is focused
                  if (e.target) {
                    const input = e.target;
                    // If cursor is at start (0) and there's existing text, move to end
                    // This handles the case where user taps outside then back in
                    let pos = input.selectionStart;
                    if ((pos === 0 || pos === null || pos === undefined) && input.value.length > 0) {
                      pos = input.value.length;
                    } else if (pos === null || pos === undefined) {
                      pos = input.value.length;
                    }
                    setTimeout(() => {
                      input.setSelectionRange(pos, pos);
                    }, 0);
                    // On mobile, make extra attempts to show cursor
                    if (isMobile) {
                      setTimeout(() => {
                        input.setSelectionRange(pos, pos);
                        input.focus();
                      }, 10);
                      setTimeout(() => {
                        input.setSelectionRange(pos, pos);
                      }, 50);
                    }
                  }
                }}
                onKeyDown={e=>e.key==='Enter'&&handleSubmit(e, isMobile ? (inputRef.current?.value ?? inputValueRef.current ?? input) : undefined)} 
                onClick={(e) => {
                  // On mobile, ensure cursor is visible when user taps to position it
                  if (isMobile && inputRef.current) {
                    const input = inputRef.current;
                    // Get click position relative to input
                    const rect = input.getBoundingClientRect();
                    const clickX = e.clientX - rect.left;
                    // Approximate cursor position based on click position
                    const textBeforeClick = input.value.substring(0, input.selectionStart || 0);
                    const clickPosition = Math.round(clickX / 8);
                    const newPosition = Math.max(0, Math.min(input.value.length, clickPosition));
                    input.setSelectionRange(newPosition, newPosition);
                    // Force focus to show cursor
                    input.focus();
                    // Multiple attempts to ensure cursor visibility
                    setTimeout(() => {
                      input.setSelectionRange(newPosition, newPosition);
                    }, 10);
                    setTimeout(() => {
                      input.setSelectionRange(newPosition, newPosition);
                    }, 50);
                  }
                }}
                onBlur={() => {
                  // Avoid fighting focus during virtual keyboard taps; only refocus if the user
                  // actually left the field (e.g., tapped elsewhere).
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
              <button
                type="button"
                onClick={handleHint}
                disabled={!roundStarted || gameOver || isTransitioning}
                className={`flex-shrink-0 border-l py-2 px-3 min-w-[2.75rem] flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed relative overflow-hidden ${error ? 'border-[#c85f31]' : 'border-gray-300'} ${
                  hintWord
                    ? 'bg-white text-gray-400'
                    : hintAvailable
                      ? 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-800'
                      : 'bg-white text-gray-400'
                }`}
                title={hintAvailable ? "Hint" : "Hint available in 30 seconds"}
                aria-label={hintAvailable ? "Hint" : "Hint loading"}
              >
                {!hintWord && !hintAvailable && (
                  <span
                    className="absolute bottom-0 left-0 pointer-events-none"
                    aria-hidden
                    style={{ width: `${hintFillProgress}%`, height: '10%', backgroundColor: '#195b7c' }}
                  />
                )}
                <span className={`relative z-10 text-sm font-medium ${hintReadyPop ? 'hint-ready-pop' : ''}`}>
                  Hint
                </span>
              </button>
              </div>
              {/* Level Progress Indicators */}
              <div className="relative inline-block font-bold text-center">
                <div className="flex justify-center space-x-4">
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
                </div>
              </div>
              {/* Error message container with fixed height to prevent layout shift */}
              <div className="h-6 flex items-start justify-center">
                {error && (
                  <p 
                    className="text-sm text-center"
                    style={{
                      color: '#c85f31',
                      animation: 'fadeIn 0.2s ease-in-out'
                    }}
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

              {/* Virtual Keyboard - only on mobile; in-flow when scroll needed, fixed otherwise */}
              {isMobile && roundStarted && !gameOver && (
                <>
                  <div style={{ marginTop: needsScrollForKeyboard ? 5 : 15, minHeight: needsScrollForKeyboard ? 5 : 260 }} aria-hidden />
                  <div
                    className={isMobile ? "" : "mt-4"}
                    style={isMobile
                      ? (needsScrollForKeyboard
                          ? { padding: '0 23px', paddingBottom: 5, paddingTop: 5 }
                          : { position: 'fixed', bottom: 10, left: 0, right: 0, padding: '0 23px', paddingBottom: 10, zIndex: 20 })
                      : { padding: '0 10px' }}
                  >
                  {/* Top row: Q-P (10 letters) */}
                  <div 
                    className="flex gap-1 mb-1.5 justify-center relative"
                    style={{ marginLeft: '-30px', marginRight: '-30px', paddingLeft: '30px', paddingRight: '30px' }}
                    onPointerDown={(e) => {
                      const row = e.currentTarget;
                      const rect = row.getBoundingClientRect();
                      const clickX = e.clientX - rect.left;
                      const rowWidth = rect.width;
                      const letters = ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'];
                      
                      // Expanded edge areas: 30px left of Q triggers Q, 30px right of P triggers P
                      // Check edge areas first, before checking if target is a button
                      if (clickX < 30) {
                        e.preventDefault();
                        e.stopPropagation();
                        setPressedKey('Q');
                        handleKeyboardLetter('q');
                        refocusInputSoon();
                        return;
                      } else if (clickX > rowWidth - 30) {
                        e.preventDefault();
                        e.stopPropagation();
                        setPressedKey('P');
                        handleKeyboardLetter('p');
                        refocusInputSoon();
                        return;
                      }
                      
                      // If clicked on a button, let the button's handler process it
                      if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
                      
                      // Otherwise, handle clicks in gaps between buttons
                      const keyWidth = (rowWidth - 20 - 36) / 10; // 20px padding, 36px gaps (9 gaps * 4px)
                      const keyIndex = Math.min(Math.max(0, Math.floor((clickX - 20) / (keyWidth + 4))), letters.length - 1);
                      const letter = letters[keyIndex];
                      if (letter) {
                        e.preventDefault();
                        e.stopPropagation();
                        setPressedKey(letter);
                        handleKeyboardLetter(letter.toLowerCase());
                        refocusInputSoon();
                      }
                    }}
                    onPointerUp={(e) => {
                      if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
                      setPressedKey(null);
                    }}
                    onPointerCancel={(e) => {
                      if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
                      setPressedKey(null);
                    }}
                  >
                    {['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'].map((letter) => (
                      <div key={letter} style={{ position: 'relative', flex: '0 0 calc((100% - 20px - 36px + 40px) / 10)' }}>
                        <button
                          type="button"
                          onPointerDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setPressedKey(letter);
                            handleKeyboardLetter(letter.toLowerCase());
                            refocusInputSoon();
                          }}
                          onPointerUp={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setPressedKey(null);
                          }}
                          onPointerCancel={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setPressedKey(null);
                          }}
                          className="bg-gray-200 hover:bg-gray-300 active:bg-gray-400 text-gray-800 font-semibold py-4 rounded text-base sm:text-lg transition-colors touch-manipulation"
                          disabled={!roundStarted || gameOver || isTransitioning}
                          style={{ 
                            touchAction: 'manipulation', 
                            width: '100%',
                            userSelect: 'none',
                            WebkitUserSelect: 'none',
                            WebkitTapHighlightColor: 'transparent',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            minHeight: '54px',
                            position: 'relative',
                            zIndex: pressedKey === letter ? 10 : 2,
                            transform: pressedKey === letter ? 'scale(1.3)' : 'scale(1)',
                            transition: 'transform 0.1s ease-out'
                          }}
                        >
                          {letter}
                        </button>
                        {/* Invisible expanded touch area */}
                        <div
                          onPointerDown={(e) => {
                            // Only handle if target is this div or a child text node, not the button
                            const target = e.target;
                            const isButton = target.tagName === 'BUTTON' || target.closest('button');
                            if (!isButton) {
                              e.preventDefault();
                              e.stopPropagation();
                              setPressedKey(letter);
                              handleKeyboardLetter(letter.toLowerCase());
                              refocusInputSoon();
                            }
                          }}
                          onPointerUp={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setPressedKey(null);
                          }}
                          onPointerCancel={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setPressedKey(null);
                          }}
                          style={{
                            position: 'absolute',
                            top: '-3px',
                            bottom: '-3px',
                            left: '-3px',
                            right: '-3px',
                            zIndex: 1,
                            touchAction: 'manipulation'
                          }}
                        />
                      </div>
                    ))}
                  </div>
                  
                  {/* Middle row: A-L (9 letters, centered) */}
                  <div 
                    className="flex gap-1 mb-1.5 justify-center relative"
                    style={{ marginLeft: '-40px', marginRight: '-40px', paddingLeft: '40px', paddingRight: '40px' }}
                    onPointerDown={(e) => {
                      const row = e.currentTarget;
                      const rect = row.getBoundingClientRect();
                      const clickX = e.clientX - rect.left;
                      const rowWidth = rect.width;
                      const letters = ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'];
                      
                      // Expanded edge areas: 40px left of A triggers A, 40px right of L triggers L
                      // Check edge areas first, before checking if target is a button
                      if (clickX < 40) {
                        e.preventDefault();
                        e.stopPropagation();
                        setPressedKey('A');
                        handleKeyboardLetter('a');
                        refocusInputSoon();
                        return;
                      } else if (clickX > rowWidth - 40) {
                        e.preventDefault();
                        e.stopPropagation();
                        setPressedKey('L');
                        handleKeyboardLetter('l');
                        refocusInputSoon();
                        return;
                      }
                      
                      // If clicked on a button, let the button's handler process it
                      if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
                      
                      // Otherwise, handle clicks in gaps between buttons
                      const keyWidth = (rowWidth - 20 - 36) / 10; // 20px padding, 36px gaps (9 gaps * 4px)
                      const keyIndex = Math.min(Math.max(0, Math.floor((clickX - 20) / (keyWidth + 4))), letters.length - 1);
                      const letter = letters[keyIndex];
                      if (letter) {
                        e.preventDefault();
                        e.stopPropagation();
                        setPressedKey(letter);
                        handleKeyboardLetter(letter.toLowerCase());
                        refocusInputSoon();
                      }
                    }}
                    onPointerUp={(e) => {
                      if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
                      setPressedKey(null);
                    }}
                    onPointerCancel={(e) => {
                      if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
                      setPressedKey(null);
                    }}
                  >
                    {['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'].map((letter) => (
                      <div key={letter} style={{ position: 'relative', flex: '0 0 calc((100% - 20px - 36px + 40px) / 10)' }}>
                        <button
                          type="button"
                          onPointerDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setPressedKey(letter);
                            handleKeyboardLetter(letter.toLowerCase());
                            refocusInputSoon();
                          }}
                          onPointerUp={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setPressedKey(null);
                          }}
                          onPointerCancel={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setPressedKey(null);
                          }}
                          className="bg-gray-200 hover:bg-gray-300 active:bg-gray-400 text-gray-800 font-semibold py-4 rounded text-base sm:text-lg transition-colors touch-manipulation"
                          disabled={!roundStarted || gameOver || isTransitioning}
                          style={{ 
                            touchAction: 'manipulation', 
                            width: '100%',
                            userSelect: 'none',
                            WebkitUserSelect: 'none',
                            WebkitTapHighlightColor: 'transparent',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            minHeight: '54px',
                            position: 'relative',
                            zIndex: pressedKey === letter ? 10 : 2,
                            transform: pressedKey === letter ? 'scale(1.3)' : 'scale(1)',
                            transition: 'transform 0.1s ease-out'
                          }}
                        >
                          {letter}
                        </button>
                        {/* Invisible expanded touch area */}
                        <div
                          onPointerDown={(e) => {
                            // Only handle if target is this div or a child text node, not the button
                            const target = e.target;
                            const isButton = target.tagName === 'BUTTON' || target.closest('button');
                            if (!isButton) {
                              e.preventDefault();
                              e.stopPropagation();
                              setPressedKey(letter);
                              handleKeyboardLetter(letter.toLowerCase());
                              refocusInputSoon();
                            }
                          }}
                          onPointerUp={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setPressedKey(null);
                          }}
                          onPointerCancel={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setPressedKey(null);
                          }}
                          style={{
                            position: 'absolute',
                            top: '-3px',
                            bottom: '-3px',
                            left: '-3px',
                            right: '-3px',
                            zIndex: 1,
                            touchAction: 'manipulation'
                          }}
                        />
                      </div>
                    ))}
                  </div>
                  
                  {/* Bottom row: Submit + Z-M + Backspace */}
                  <div 
                    className="flex gap-1 justify-center relative"
                    style={{ marginLeft: '-30px', marginRight: '-30px', paddingLeft: '30px', paddingRight: '30px' }}
                    onPointerDown={(e) => {
                      if (e.target.tagName === 'BUTTON' || e.target.closest('button') || e.target.closest('div[style*="position: absolute"]')) return;
                      const row = e.currentTarget;
                      const rect = row.getBoundingClientRect();
                      const clickX = e.clientX - rect.left;
                      const rowWidth = rect.width;
                      const letterWidth = (rowWidth - 20 - 36 + 40) / 10; // Same as other letter keys
                      const buttonWidth = letterWidth * 1.8; // Submit and Backspace buttons
                      const letters = ['Z', 'X', 'C', 'V', 'B', 'N', 'M'];
                      
                      // Expanded edge areas: 30px left of Submit triggers Submit, 30px right of Backspace triggers Backspace
                      // Submit starts at clickX=0, so 30px to left means clickX < 30
                      // Backspace ends at clickX=rowWidth, so 30px to right means clickX > rowWidth - 30
                      if (clickX < 30) {
                        e.preventDefault();
                        e.stopPropagation();
                        setPressedKey('submit');
                        const val = (inputRef.current?.value ?? inputValueRef.current ?? input) ?? '';
                        handleSubmit(e, val);
                        refocusInputSoon();
                      } else if (clickX > rowWidth - 30) {
                        e.preventDefault();
                        e.stopPropagation();
                        setPressedKey('backspace');
                        handleKeyboardBackspace();
                        refocusInputSoon();
                      } else {
                        const letterAreaStart = buttonWidth + 4;
                        const relativeX = clickX - letterAreaStart;
                        const keyIndex = Math.min(Math.max(0, Math.floor(relativeX / (letterWidth + 4))), letters.length - 1);
                        const letter = letters[keyIndex];
                        if (letter) {
                          e.preventDefault();
                          e.stopPropagation();
                          setPressedKey(letter);
                          handleKeyboardLetter(letter.toLowerCase());
                          refocusInputSoon();
                        }
                      }
                    }}
                    onPointerUp={(e) => {
                      if (e.target.tagName === 'BUTTON' || e.target.closest('button') || e.target.closest('div[style*="position: absolute"]')) return;
                      setPressedKey(null);
                    }}
                    onPointerCancel={(e) => {
                      if (e.target.tagName === 'BUTTON' || e.target.closest('button') || e.target.closest('div[style*="position: absolute"]')) return;
                      setPressedKey(null);
                    }}
                  >
                    {/* Submit button - same width as Backspace, wider for padding */}
                    <div style={{ position: 'relative', flex: '0 0 calc((100% - 20px - 36px + 40px) / 10 * 1.8)', width: 'calc((100% - 20px - 36px + 40px) / 10 * 1.8)', boxSizing: 'border-box' }}>
                      <button
                        type="button"
                        onPointerDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setPressedKey('submit');
                          const val = (inputRef.current?.value ?? inputValueRef.current ?? input) ?? '';
                          handleSubmit(e, val);
                          refocusInputSoon();
                        }}
                        onPointerUp={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setPressedKey(null);
                        }}
                        onPointerCancel={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setPressedKey(null);
                        }}
                        className="text-white rounded text-xs font-semibold disabled:opacity-50 touch-manipulation"
                        disabled={!roundStarted || gameOver || isTransitioning}
                        style={{
                          backgroundColor: '#195b7c',
                          touchAction: 'manipulation',
                          width: '100%',
                          padding: '16px 14px',
                          userSelect: 'none',
                          WebkitUserSelect: 'none',
                          WebkitTapHighlightColor: 'transparent',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          minHeight: '54px',
                          height: '54px',
                          position: 'relative',
                          zIndex: pressedKey === 'submit' ? 10 : 2,
                          boxSizing: 'border-box',
                          transform: pressedKey === 'submit' ? 'scale(1.3)' : 'scale(1)',
                          transition: 'transform 0.1s ease-out'
                        }}
                      >
                        Submit
                      </button>
                      {/* Invisible expanded touch area */}
                      <div
                        onPointerDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const val = (inputRef.current?.value ?? inputValueRef.current ?? input) ?? '';
                          handleSubmit(e, val);
                          refocusInputSoon();
                        }}
                        style={{
                          position: 'absolute',
                          top: '-3px',
                          bottom: '-3px',
                          left: '-3px',
                          right: '-3px',
                          zIndex: 1,
                          touchAction: 'manipulation'
                        }}
                      />
                    </div>
                    
                    {/* Z-M letters - same width as Q-P */}
                    {['Z', 'X', 'C', 'V', 'B', 'N', 'M'].map((letter) => (
                      <div key={letter} style={{ position: 'relative', flex: '0 0 calc((100% - 20px - 36px + 40px) / 10)' }}>
                        <button
                          type="button"
                          onPointerDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setPressedKey(letter);
                            handleKeyboardLetter(letter.toLowerCase());
                            refocusInputSoon();
                          }}
                          onPointerUp={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setPressedKey(null);
                          }}
                          onPointerCancel={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setPressedKey(null);
                          }}
                          className="bg-gray-200 hover:bg-gray-300 active:bg-gray-400 text-gray-800 font-semibold py-4 rounded text-base sm:text-lg transition-colors touch-manipulation"
                          disabled={!roundStarted || gameOver || isTransitioning}
                          style={{ 
                            touchAction: 'manipulation', 
                            width: '100%',
                            userSelect: 'none',
                            WebkitUserSelect: 'none',
                            WebkitTapHighlightColor: 'transparent',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            minHeight: '54px',
                            position: 'relative',
                            zIndex: pressedKey === letter ? 10 : 2,
                            transform: pressedKey === letter ? 'scale(1.3)' : 'scale(1)',
                            transition: 'transform 0.1s ease-out'
                          }}
                        >
                          {letter}
                        </button>
                        {/* Invisible expanded touch area */}
                        <div
                          onPointerDown={(e) => {
                            // Only handle if target is this div or a child text node, not the button
                            const target = e.target;
                            const isButton = target.tagName === 'BUTTON' || target.closest('button');
                            if (!isButton) {
                              e.preventDefault();
                              e.stopPropagation();
                              setPressedKey(letter);
                              handleKeyboardLetter(letter.toLowerCase());
                              refocusInputSoon();
                            }
                          }}
                          onPointerUp={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setPressedKey(null);
                          }}
                          onPointerCancel={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setPressedKey(null);
                          }}
                          style={{
                            position: 'absolute',
                            top: '-3px',
                            bottom: '-3px',
                            left: '-3px',
                            right: '-3px',
                            zIndex: 1,
                            touchAction: 'manipulation'
                          }}
                        />
                      </div>
                    ))}
                    
                    {/* Backspace button - same width as Submit */}
                    <div style={{ position: 'relative', flex: '0 0 calc((100% - 20px - 36px + 40px) / 10 * 1.8)', width: 'calc((100% - 20px - 36px + 40px) / 10 * 1.8)', boxSizing: 'border-box' }}>
                      <button
                        type="button"
                        onPointerDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setPressedKey('backspace');
                          handleKeyboardBackspace();
                          refocusInputSoon();
                          
                          backspaceHoldTimeoutRef.current = setTimeout(() => {
                            backspaceHoldIntervalRef.current = setInterval(() => {
                              handleKeyboardBackspace();
                            }, 50);
                          }, 300);
                        }}
                        onPointerUp={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setPressedKey(null);
                          if (backspaceHoldTimeoutRef.current) {
                            clearTimeout(backspaceHoldTimeoutRef.current);
                            backspaceHoldTimeoutRef.current = null;
                          }
                          if (backspaceHoldIntervalRef.current) {
                            clearInterval(backspaceHoldIntervalRef.current);
                            backspaceHoldIntervalRef.current = null;
                          }
                        }}
                        onPointerCancel={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setPressedKey(null);
                          if (backspaceHoldTimeoutRef.current) {
                            clearTimeout(backspaceHoldTimeoutRef.current);
                            backspaceHoldTimeoutRef.current = null;
                          }
                          if (backspaceHoldIntervalRef.current) {
                            clearInterval(backspaceHoldIntervalRef.current);
                            backspaceHoldIntervalRef.current = null;
                          }
                        }}
                        className="bg-gray-200 hover:bg-gray-300 active:bg-gray-400 text-gray-800 font-semibold rounded text-base disabled:opacity-50 touch-manipulation"
                        disabled={!roundStarted || gameOver || isTransitioning}
                        style={{ 
                          touchAction: 'manipulation', 
                          width: '100%',
                          padding: '16px 14px',
                          userSelect: 'none',
                          WebkitUserSelect: 'none',
                          WebkitTapHighlightColor: 'transparent',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          minHeight: '54px',
                          height: '54px',
                          position: 'relative',
                          zIndex: pressedKey === 'backspace' ? 10 : 2,
                          boxSizing: 'border-box',
                          transform: pressedKey === 'backspace' ? 'scale(1.3)' : 'scale(1)',
                          transition: 'transform 0.1s ease-out'
                        }}
                      >
                        ⌫
                      </button>
                      {/* Invisible expanded touch area */}
                      <div
                        onPointerDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleKeyboardBackspace();
                          refocusInputSoon();
                          
                          backspaceHoldTimeoutRef.current = setTimeout(() => {
                            backspaceHoldIntervalRef.current = setInterval(() => {
                              handleKeyboardBackspace();
                            }, 50);
                          }, 300);
                        }}
                        onPointerUp={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (backspaceHoldTimeoutRef.current) {
                            clearTimeout(backspaceHoldTimeoutRef.current);
                            backspaceHoldTimeoutRef.current = null;
                          }
                          if (backspaceHoldIntervalRef.current) {
                            clearInterval(backspaceHoldIntervalRef.current);
                            backspaceHoldIntervalRef.current = null;
                          }
                        }}
                        onPointerCancel={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (backspaceHoldTimeoutRef.current) {
                            clearTimeout(backspaceHoldTimeoutRef.current);
                            backspaceHoldTimeoutRef.current = null;
                          }
                          if (backspaceHoldIntervalRef.current) {
                            clearInterval(backspaceHoldIntervalRef.current);
                            backspaceHoldIntervalRef.current = null;
                          }
                        }}
                        style={{
                          position: 'absolute',
                          top: '-3px',
                          bottom: '-3px',
                          left: '-3px',
                          right: '-3px',
                          zIndex: 1,
                          touchAction: 'manipulation'
                        }}
                      />
                    </div>
                  </div>
                </div>
                </>
              )}
              
          {/* Game Controls */}
          <div className="flex flex-col items-center space-y-3 fade-in">
            {gameOver && (
              <button onClick={resetGame} className="bg-white border border-gray-400 text-black w-52 h-16 text-xl font-semibold rounded">NEW GAME</button>
            )}
          </div>
        </>
      )}

      {/* Statistics Modal */}
      {showStats && (
        <div className="fixed top-0 left-0 right-0 bottom-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] modal-fade-in" style={{ width: '100vw', height: '100vh', margin: 0, padding: 0 }}>
          <div className="bg-white rounded-lg p-4 sm:p-6 w-full max-w-xs sm:max-w-sm md:max-w-md mx-4 sm:mx-6 max-h-[85vh] sm:max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex justify-between items-center mb-4 sm:mb-6">
              <h2 className="text-xl sm:text-2xl font-bold">Statistics</h2>
              <div className="flex items-center space-x-2">
                <button 
                  onClick={clearStats}
                  className="text-xs text-red-500 hover:text-red-700 px-2 py-1 border border-red-300 rounded"
                >
                  Clear Stats
                </button>
                <button 
                  onClick={() => setShowStats(false)}
                  className="text-gray-500 hover:text-gray-700 text-lg sm:text-xl font-bold"
                >
                  ×
                </button>
              </div>
            </div>
            
            {/* Game Result Message */}
            {levelResults.length > 0 && (
              <div className="text-center mb-6 p-4 bg-gray-50 rounded-lg">
                {levelResults.every(result => !result.gaveUp) ? (
                  <div>
                    <div className="text-lg font-semibold text-green-700 mb-2">Congratulations!</div>
                    <div className="text-sm text-gray-600 mb-1">You completed this Stringlish in:</div>
                    <div className="text-2xl font-bold text-green-700">{formatTime(gameOver && finalGameTimeRef.current != null ? finalGameTimeRef.current : gameTime)}</div>
                  </div>
                ) : (
                  <div className="text-lg font-semibold text-gray-600">Better Luck Next Time!</div>
                )}
              </div>
            )}
            
            {/* Stats Grid */}
            <div className="grid grid-cols-5 gap-2 mb-6 sm:mb-8">
              <div className="text-center">
                <div className="text-xl sm:text-2xl font-bold">{stats.gamesPlayed}</div>
                <div className="text-xs text-gray-600 leading-tight">
                  <span className="block">Games</span>
                  <span className="block">Played</span>
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
              <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4">Fastest Times</h3>
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
          </div>
        </div>
      )}

      {/* Rules Modal */}
      {showRules && (
        <div className="fixed top-0 left-0 right-0 bottom-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] modal-fade-in" style={{ width: '100vw', height: '100vh', margin: 0, padding: 0 }}>
          <div
            className="bg-white rounded-lg p-4 sm:p-6 w-full max-w-xs sm:max-w-sm md:max-w-md mx-4 sm:mx-6 overflow-y-auto"
            style={{
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxSizing: 'border-box',
              textAlign: 'left',
            }}
          >
            {/* Header */}
            <div className="flex justify-between items-center mb-4 sm:mb-6">
              <h2 className="text-xl sm:text-2xl font-bold text-left">Rules</h2>
              <button 
                onClick={() => setShowRules(false)}
                className="text-gray-500 hover:text-gray-700 text-lg sm:text-xl font-bold"
              >
                ×
              </button>
            </div>
            <div className="mb-4 text-base font-medium">Use the provided letters to create words.</div>
            <ul className="mb-3 text-xs list-disc pl-5 space-y-1">
              <li>Provided letters must be used in the order they appear.</li>
              <li>There can be letters before, after and between the provided letters, as long as they remain in order.</li>
              <li>Words must contain at least 5 letters and cannot be proper nouns or names.</li>
              <li>Complete all 3 levels to win!</li>
            </ul>
            <div className="mb-1 mt-2 text-base font-semibold">Example</div>
            <div className="mb-1 text-xs font-medium">Provided Letters:</div>
            {/* LIN example, small */}
            <div className="flex space-x-1 mb-2" style={{ transform: 'scale(0.7)', transformOrigin: 'left' }}>
              <div style={{ width: 36, height: 36, background: '#c85f31', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 600, fontSize: '1.25rem', boxShadow: '0 2px 6px rgba(0,0,0,0.12)' }}>L</div>
              <div style={{ width: 36, height: 36, background: '#195b7c', borderRadius: 8, transform: 'rotate(45deg) scale(0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 600, fontSize: '1.25rem', boxShadow: '0 2px 6px rgba(0,0,0,0.12)' }}>
                <span style={{ transform: 'rotate(-45deg) scale(1.176)', display: 'inline-block', width: '100%', textAlign: 'center' }}>I</span>
              </div>
              <div style={{ width: 36, height: 36, background: '#1c6d2a', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 600, fontSize: '1.25rem', boxShadow: '0 2px 6px rgba(0,0,0,0.12)' }}>N</div>
            </div>
            <div className="mb-1 text-xs font-medium">Possible Answers:</div>
            {/* PLAIN example */}
            <div className="flex items-center space-x-1 mb-1">
              <span>P</span>
              <div style={{ width: 24, height: 24, background: '#c85f31', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 600, fontSize: '0.95rem', boxShadow: '0 1px 3px rgba(0,0,0,0.10)' }}>L</div>
              <span>A</span>
              <div style={{ width: 24, height: 24, background: '#195b7c', borderRadius: 6, transform: 'rotate(45deg) scale(0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 600, fontSize: '0.95rem', boxShadow: '0 1px 3px rgba(0,0,0,0.10)' }}>
                <span style={{ transform: 'rotate(-45deg) scale(1.176)', display: 'inline-block', width: '100%', textAlign: 'center' }}>I</span>
              </div>
              <div style={{ width: 24, height: 24, background: '#1c6d2a', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 600, fontSize: '0.95rem', boxShadow: '0 1px 3px rgba(0,0,0,0.10)' }}>N</div>
            </div>
            <div className="flex items-center mb-3 text-xs" style={{ color: '#1c6d2a' }}>
              <FontAwesomeIcon icon={faCheckCircle} className="mr-1" /> Valid word—nonconsecutive provided letters.
            </div>
            {/* LINK example */}
            <div className="flex items-center space-x-1 mb-1">
              <div style={{ width: 24, height: 24, background: '#c85f31', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 600, fontSize: '0.95rem', boxShadow: '0 1px 3px rgba(0,0,0,0.10)' }}>L</div>
              <div style={{ width: 24, height: 24, background: '#195b7c', borderRadius: 6, transform: 'rotate(45deg) scale(0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 600, fontSize: '0.95rem', boxShadow: '0 1px 3px rgba(0,0,0,0.10)' }}>
                <span style={{ transform: 'rotate(-45deg) scale(1.176)', display: 'inline-block', width: '100%', textAlign: 'center' }}>I</span>
              </div>
              <div style={{ width: 24, height: 24, background: '#1c6d2a', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 600, fontSize: '0.95rem', boxShadow: '0 1px 3px rgba(0,0,0,0.10)' }}>N</div>
              <span>K</span>
            </div>
            <div className="flex items-center mb-3 text-xs" style={{ color: '#1c6d2a' }}>
              <FontAwesomeIcon icon={faCheckCircle} className="mr-1" /> Valid word—consecutive provided letters.
            </div>
            {/* NAIL (invalid) example */}
            <div className="flex items-center space-x-1 mb-1">
              <div style={{ width: 24, height: 24, background: '#1c6d2a', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 600, fontSize: '0.95rem', boxShadow: '0 1px 3px rgba(0,0,0,0.10)' }}>N</div>
              <span>A</span>
              <div style={{ width: 24, height: 24, background: '#195b7c', borderRadius: 6, transform: 'rotate(45deg) scale(0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 600, fontSize: '0.95rem', boxShadow: '0 1px 3px rgba(0,0,0,0.10)' }}>
                <span style={{ transform: 'rotate(-45deg) scale(1.176)', display: 'inline-block', width: '100%', textAlign: 'center' }}>I</span>
              </div>
              <div style={{ width: 24, height: 24, background: '#c85f31', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 600, fontSize: '0.95rem', boxShadow: '0 1px 3px rgba(0,0,0,0.10)' }}>L</div>
            </div>
            <div className="flex items-center mb-1 text-xs" style={{ color: '#992108' }}>
              <FontAwesomeIcon icon={faTimesCircle} className="mr-1" /> Invalid word—letters appear out of order from provided letters.
            </div>
          </div>
        </div>
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
      {!(isMobile && roundStarted && !gameOver) && (
        <footer
          className={`text-center ${isMobile ? "" : "py-4 mt-8"}`}
          style={isMobile ? { position: 'fixed', bottom: 0, left: 0, right: 0, paddingTop: 5, paddingBottom: 5, zIndex: 15, background: 'white' } : undefined}
        >
          <p className="text-gray-500 italic text-sm">© 2026 Davis English. All Rights Reserved.</p>
        </footer>
      )}
      </div>
      </div>
    </div>
  );
}