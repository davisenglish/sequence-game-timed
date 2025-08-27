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

// Memoization cache for sequence counts
const sequenceCountCache = {};

async function getRandomLetters() {
  const candidates = PREPROCESSED_WORDS;
  const maxAttempts = 1000;
  // 75% chance to use hard mode
  const hardMode = Math.random() < 0.75;
  const minCount = hardMode ? 1 : 2;
  const minWordLength = hardMode ? 8 : 4;
  const sampleSize = 10000;
  const forbiddenThirdLetters = new Set(['S', 'G', 'D']);

  const filtered = candidates.filter(w => w.length >= minWordLength);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const word = filtered[Math.floor(Math.random() * filtered.length)];
    // Pick three increasing indices
    const idx1 = Math.floor(Math.random() * (word.length - 2));
    const idx2 = idx1 + 1 + Math.floor(Math.random() * (word.length - idx1 - 1));
    const idx3 = idx2 + 1 + Math.floor(Math.random() * (word.length - idx2 - 1));
    if (idx3 >= word.length) continue;
    const seq = word[idx1] + word[idx2] + word[idx3];
    // Enforce third letter restriction
    if (forbiddenThirdLetters.has(seq[2])) continue;
    // Skip if sequence is consecutive in the word
    if (word.includes(seq)) continue;
    // Memoized count of words containing these letters in order
    if (sequenceCountCache[seq]) {
      if (sequenceCountCache[seq] >= minCount) return seq;
      continue;
    }
    // Sample a subset for performance
    const sample = filtered.length > sampleSize
      ? Array.from({length: sampleSize}, () => filtered[Math.floor(Math.random() * filtered.length)])
      : filtered;
    const regex = new RegExp(seq.split('').join('.*'), 'i');
    const count = sample.filter(w => regex.test(w)).length;
    sequenceCountCache[seq] = count;
    if (count >= minCount) {
      return seq;
    }
  }
  // Fallback: random unique letters if no sequence found (should be rare)
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let letters = '';
  while (letters.length < 3) {
    const randomLetter = alphabet[Math.floor(Math.random() * alphabet.length)];
    if (letters.length === 2 && forbiddenThirdLetters.has(randomLetter)) continue;
    if (!letters.includes(randomLetter)) letters += randomLetter;
  }
  return letters;
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

// Helper to find most common possible answers for a given sequence
function findPossibleAnswers(letters, max = 3) {
  if (!letters || letters.length !== 3) return [];
  const regex = new RegExp(letters.split('').join('.*'), 'i');
  
  // Only use preprocessed words, ensure they meet the 5+ letter requirement
  let candidates = PREPROCESSED_WORDS.filter(w => regex.test(w) && w.length >= 5);
  
  // Filter out very long words (likely obscure) - prefer words under 10 letters
  candidates = candidates.filter(w => w.length <= 10);
  
  // Additional filtering: prefer words that are more likely to be common
  // Exclude words with unusual letter combinations or very technical terms
  candidates = candidates.filter(w => {
    // Avoid words with too many consecutive consonants (often technical/obscure)
    const consonantClusters = w.match(/[BCDFGHJKLMNPQRSTVWXYZ]{3,}/gi);
    if (consonantClusters && consonantClusters.length > 0) return false;
    
    // Avoid words ending in unusual suffixes (often technical)
    if (w.endsWith('IUM') || w.endsWith('TION') || w.endsWith('SION')) return false;
    
    return true;
  });
  
  // Sort by length first (shorter words are often more common)
  candidates.sort((a, b) => a.length - b.length);
  
  // Randomize the selection to get a good mix of different lengths
  const randomizedCandidates = [];
  const lengthGroups = {};
  
  // Group words by length
  candidates.forEach(word => {
    const length = word.length;
    if (!lengthGroups[length]) {
      lengthGroups[length] = [];
    }
    lengthGroups[length].push(word);
  });
  
  // Get available lengths and shuffle them to avoid always starting with shortest
  const lengths = Object.keys(lengthGroups).sort(() => Math.random() - 0.5);
  
  // Try to get one word from each available length, then fill remaining slots
  const targetLengths = [5, 6, 7, 8, 9, 10]; // Preferred length order
  
  // First, try to get one word from each preferred length (if available)
  for (const targetLength of targetLengths) {
    if (lengthGroups[targetLength] && lengthGroups[targetLength].length > 0 && randomizedCandidates.length < max) {
      const wordsInGroup = lengthGroups[targetLength];
      const randomWord = wordsInGroup[Math.floor(Math.random() * wordsInGroup.length)];
      randomizedCandidates.push(randomWord);
    }
  }
  
  // If we still have slots, fill with random words from any available length
  if (randomizedCandidates.length < max) {
    const remainingLengths = Object.keys(lengthGroups).filter(length => 
      lengthGroups[length].length > 0 && 
      !randomizedCandidates.some(word => word.length === parseInt(length))
    );
    
    for (const length of remainingLengths) {
      if (randomizedCandidates.length >= max) break;
      const wordsInGroup = lengthGroups[length];
      const randomWord = wordsInGroup[Math.floor(Math.random() * wordsInGroup.length)];
      randomizedCandidates.push(randomWord);
    }
  }
  
  return randomizedCandidates;
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
  const startTimeRef = useRef(null);
  const inputRef = useRef(null);

  // Function to generate all three sets of unique letters
  const generateAllLevelLetters = async () => {
    const letters = [];
    const used = new Set();
    
    for (let i = 0; i < 3; i++) {
      let attempts = 0;
      const maxAttempts = 100;
      let newLetters;
      
      do {
        newLetters = await getRandomLetters();
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
    
    // Detect mobile device
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (!roundStarted || gameOver) return;
    
    const timer = setInterval(() => {
      setGameTime(prev => prev + 1);
    }, 1000);
    
    return () => clearInterval(timer);
  }, [roundStarted, gameOver]);

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

    const handleSubmit = async (e) => {
    e.preventDefault();
    if (!roundStarted || gameOver || isTransitioning) return;
    
    const word = input.trim().toLowerCase();
    if (!word) { setError(true); setErrorMessage('Please enter a word'); return; }
    if (word.length < 5) { setError(true); setErrorMessage('Must be 5+ letters long'); return; }
    if (!isSequential(word, letters)) { setError(true); setErrorMessage(`Word must contain '${letters}' in order`); return; }
    if (!(await isValidWord(word))) { setError(true); setErrorMessage('Not a valid English word'); return; }

    // Record the result for this level
    const levelResult = {
      letters: letters,
      word: word,
      time: gameTime,
      gaveUp: false
    };
    
    setLevelResults(prev => [...prev, levelResult]);
    
    // Show score popup (currently disabled)
    // setLetterPopup(`+${word.length}`);
    // setTimeout(() => setLetterPopup(null), 1500);
    
    setInput('');
    setError(false);
    setErrorMessage('');
    
    // Check if this was the final level
    if (currentLevel === 3) {
      // Game complete
      setGameOver(true);
      updateStats();
      setTimeout(() => setShowStats(true), 500);
    } else {
      // Move to next level
      setIsTransitioning(true);
      
      // Fade out current letters
      setTimeout(async () => {
        // Use pre-generated letters for next level
        const nextLevel = currentLevel + 1;
        setLetters(allLevelLetters[nextLevel - 1]);
        setCurrentLevel(nextLevel);
        
        // Brief fade-in animation
        setTimeout(() => {
          setIsTransitioning(false);
          // Focus the input field immediately after transition
          setTimeout(() => {
            if (inputRef.current) {
              inputRef.current.focus();
            }
          }, 50);
        }, 100);
      }, 300); // Fade out duration
    }
  };



  const resetGame = () => {
    // Clear the current round time when starting a new game
    localStorage.removeItem('currentRoundTimeTimed');
    
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
    
    (async () => {
      const allLetters = await generateAllLevelLetters();
      setAllLevelLetters(allLetters);
      setLetters(allLetters[0]); // Set first level letters
    })();
    setInput('');
  };

  const updateStats = () => {
    const newStats = { ...stats };
    
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
    
    // Update fastest times - replace existing times with new ones to enable highlighting
    if (gameTime > 0) {
      // Remove the old time if it exists, then add the new one
      newStats.fastestTimes = newStats.fastestTimes.filter(t => t !== gameTime);
      newStats.fastestTimes.push(gameTime);
      newStats.fastestTimes.sort((a, b) => a - b); // Sort ascending
      newStats.fastestTimes = newStats.fastestTimes.slice(0, 5); // Keep top 5
      
      // Store the current round's time for highlighting - Version specific
      localStorage.setItem('currentRoundTimeTimed', gameTime.toString());
    }
    
    setStats(newStats);
    localStorage.setItem('sequenceGameTimedStats', JSON.stringify(newStats));
  };

  const handleInputChange = (e) => {
    if (!roundStarted || gameOver || isTransitioning) return;
    setInput(e.target.value);
    if (error) { setError(false); setErrorMessage(''); }
  };

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
                alt="Sequence Game Logo" 
                className="w-24 h-24 mb-4 object-contain cursor-pointer hover:opacity-80 transition-opacity"
                onError={(e) => {
                  e.target.style.display = 'none';
                }}
              />
            </a>
            <h1 className="text-3xl font-bold">Sequence</h1>
          </>
        )}
        {!roundStarted && (
          <p className="text-gray-500 italic mt-4 text-center game-transition">
            Make words.<br />
            Tickle your brain.
          </p>
        )}
        {roundStarted && (
          <div className="flex items-center space-x-3">
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


          {/* Timer - Bigger and centered */}
          {roundStarted && !gameOver && (
            <div className="text-3xl font-bold text-black mb-6 fade-in">
              {formatTime(gameTime)}
            </div>
          )}

          {/* Game Over Results Display */}
          {gameOver && (
            <div className="text-center mb-6 slide-up">
              <div className={`font-bold mb-6 ${levelResults.every(result => !result.gaveUp) ? 'text-4xl' : 'text-2xl'}`}>
                {levelResults.every(result => !result.gaveUp) ? formatTime(gameTime) : "Better Luck Next Time!"}
              </div>
              
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
                        <div className="font-medium mb-1">Possible answers:</div>
                        <div className="space-y-1">
                          {findPossibleAnswers(result.letters, 3).map((word, idx) => (
                            <div key={idx}>{word}</div>
                          ))}
                        </div>
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
            <div className="space-y-4 fade-in">
              <input 
                ref={inputRef}
                type="text" 
                value={input} 
                onChange={handleInputChange}
                className={`border rounded px-4 py-2 w-full text-lg ${error?'border-red-600 text-red-600':''}`}
                placeholder="Enter word..." 
                disabled={!roundStarted || gameOver || isTransitioning}
                onKeyDown={e=>e.key==='Enter'&&handleSubmit(e)} 
                onBlur={() => {
                  // Refocus if the user accidentally clicks away and the game is still active
                  if (roundStarted && !gameOver && !isTransitioning) {
                    setTimeout(() => {
                      if (inputRef.current) {
                        inputRef.current.focus();
                      }
                    }, 100);
                  }
                }}
              />
              {error && <p className="text-red-600">{errorMessage}</p>}
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

        </div>
      )}

          {/* Level Progress Indicators */}
          {roundStarted && !gameOver && (
            <div className="mt-4 fade-in">
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
                              {/* Score popup (currently disabled) */}
                {/* {letterPopup && (
                  <span className="absolute inset-0 flex items-center justify-center text-green-600 font-bold animate-float-up" style={{fontSize:'12pt'}}>{letterPopup}</span>
                )} */}
            </div>
                </div>
              )}
              
          {/* Game Controls */}
          <div className="flex flex-col items-center space-y-3 fade-in">
            {gameOver ? (
              <button onClick={resetGame} className="bg-white border border-gray-400 text-black w-52 h-16 text-xl font-semibold rounded">NEW GAME</button>
            ) : (
              <button onClick={async () => {
                // Record this as a played game but not a won game
                if (roundStarted && !gameOver) {
                  const newStats = { ...stats };
                  newStats.gamesPlayed = (newStats.gamesPlayed || 0) + 1;
                  // Reset streak since game wasn't completed
                  newStats.currentStreak = 0;
                  setStats(newStats);
                  localStorage.setItem('sequenceGameTimedStats', JSON.stringify(newStats));
                }
                
                // Add unsolved levels to results for display
                if (roundStarted && !gameOver) {
                  const unsolvedLevels = [];
                  
                  // Add current level if it hasn't been solved
                  if (levelResults.length < currentLevel) {
                    unsolvedLevels.push({
                      letters: letters,
                      word: null,
                      time: gameTime,
                      gaveUp: true
                    });
                  }
                  
                  // Add any remaining levels that weren't reached
                  for (let i = currentLevel + 1; i <= 3; i++) {
                    // Use pre-generated letters for remaining levels
                    const levelLetters = allLevelLetters[i - 1];
                    unsolvedLevels.push({
                      letters: levelLetters,
                      word: null,
                      time: gameTime,
                      gaveUp: true
                    });
                  }
                  
                  setLevelResults(prev => [...prev, ...unsolvedLevels]);
                }
                
                setGameOver(true);
                // Clear any current round time to prevent highlighting
                localStorage.removeItem('currentRoundTimeTimed');
                
                // Show stats modal automatically after a brief delay
                setTimeout(() => setShowStats(true), 500);
              }} className="bg-white border border-gray-400 text-black w-52 h-16 text-xl font-semibold rounded">END GAME</button>
            )}
          </div>
        </>
      )}

      {/* Statistics Modal */}
      {showStats && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] modal-fade-in" style={{ top: '-100vh', left: '-100vw', right: '-100vw', bottom: '-100vh', width: '300vw', height: '300vh' }}>
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
                    <div className="text-sm text-gray-600 mb-1">You completed this Sequence in:</div>
                    <div className="text-2xl font-bold text-green-700">{formatTime(gameTime)}</div>
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] modal-fade-in" style={{ top: '-100vh', left: '-100vw', right: '-100vw', bottom: '-100vh', width: '300vw', height: '300vh' }}>
          <div
            className="bg-white rounded-lg p-4 sm:p-6 w-full max-w-xs sm:max-w-sm md:max-w-md mx-4 sm:mx-6"
            style={{
              maxHeight: '90vh',
              overflow: 'visible',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              boxSizing: 'border-box',
              textAlign: 'left',
              // Responsive scaling for mobile
              transform: 'scale(1)',
              ...(window.innerWidth < 400 ? { transform: 'scale(0.92)' } : {}),
              ...(window.innerHeight < 600 ? { maxHeight: '80vh', transform: 'scale(0.92)' } : {}),
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
            <ul className="mb-3 text-sm list-disc pl-5 space-y-1">
              <li>Provided letters must be used in the order they appear.</li>
              <li>There can be letters before, after and between the provided letters, as long as they remain in order.</li>
              <li>Words must contain at least 5 letters.</li>
              <li>Complete all 3 levels to complete the Sequence.</li>
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
              <FontAwesomeIcon icon={faCheckCircle} className="mr-1" /> Valid word—nonconsecutive provided letters
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
      `}</style>
      
      {/* Footer */}
      <footer className="text-center py-4 mt-8">
        <p className="text-gray-500 italic text-sm">© 2025 Davis English. All Rights Reserved.</p>
      </footer>
    </div>
  );
}