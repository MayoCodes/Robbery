import React, { useState, useEffect, useRef } from 'react';
import { Clock, Users, Trophy, Settings, Zap, Shield, Plus, MessageCircle, Crown, Star, Volume2, VolumeX, Play, UserPlus, Home, Bot, Trash2 } from 'lucide-react';
import io from 'socket.io-client';

const ROBBERY = () => {
  const [gameState, setGameState] = useState('welcome'); // welcome, lobby, playing, finished
  const [playerName, setPlayerName] = useState('');
  const [partyCode, setPartyCode] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [players, setPlayers] = useState([]);
  const [currentPlayer, setCurrentPlayer] = useState(0);
  const [target, setTarget] = useState('');
  const [timeLeft, setTimeLeft] = useState(15);
  const [maxTime, setMaxTime] = useState(15);
  const [currentWord, setCurrentWord] = useState('');
  const [usedWords, setUsedWords] = useState(new Set());
  const [round, setRound] = useState(1);
  const [gameMode, setGameMode] = useState('classic');
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [audioInitialized, setAudioInitialized] = useState(false);
  const [wheelRotation, setWheelRotation] = useState(0);
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [playerId, setPlayerId] = useState('');
  const [shootingAnimation, setShootingAnimation] = useState(null);
  const [screenFlash, setScreenFlash] = useState(false);
  const [socket, setSocket] = useState(null);
  const [attemptsLeft, setAttemptsLeft] = useState(5);
  const [wordValidationMessage, setWordValidationMessage] = useState('');
  const [isValidatingWord, setIsValidatingWord] = useState(false);
  const [powerups, setPowerups] = useState([]);
  const [availablePowerups, setAvailablePowerups] = useState(0);
  
  const inputRef = useRef();
  const audioContextRef = useRef();
  const lastTickTimeRef = useRef(0);

  // Socket.IO connection
  useEffect(() => {
    const newSocket = io(
      process.env.REACT_APP_SOCKET_URL || 
      (process.env.NODE_ENV === 'production' 
        ? 'https://robbery.onrender.com'  // Use your actual Render URL
        : 'http://localhost:3001'),
      {
        transports: ['websocket', 'polling'],
        timeout: 20000,
      }
    );
    
    setSocket(newSocket);
    setPlayerId(newSocket.id);

    // Connection status
    newSocket.on('connect', () => {
      setConnectionStatus('connected');
      console.log('Socket connected:', newSocket.id);
    });

    newSocket.on('disconnect', () => {
      setConnectionStatus('disconnected');
      console.log('Socket disconnected');
    });

    // Party created
    newSocket.on('partyCreated', ({ partyCode: code, gameState: state }) => {
      setPartyCode(code);
      setPlayers(state.players);
      setUsedWords(new Set(state.usedWords || []));
      setIsHost(true);
      setGameState('lobby');
      addChatMessage('system', `Party ${code} created successfully`);
    });

    // Game state updates
    newSocket.on('gameStateUpdate', (state) => {
      setPlayers(state.players);
      setCurrentPlayer(state.currentPlayer);
      setTarget(state.target);
      setTimeLeft(state.timeLeft);
      setMaxTime(state.maxTime);
      setRound(state.round);
      setUsedWords(new Set(state.usedWords || []));
      setGameState(state.gameState);
      setAttemptsLeft(5); // Reset attempts on new turn
      setWordValidationMessage('');
      
      // Update powerups for Wild West mode
      if (state.gameMode === 'wildwest') {
        const myPlayer = state.players.find(p => p.id === newSocket.id);
        if (myPlayer) {
          setAvailablePowerups(myPlayer.powerups || 0);
        }
      }
      
      // Update host status
      const myPlayer = state.players.find(p => p.id === newSocket.id);
      if (myPlayer) {
        setIsHost(myPlayer.isHost);
      }
    });

    // NEW: Handle real-time typing updates
    newSocket.on('playerTypingUpdate', ({ playerId, word }) => {
      console.log('Typing update received:', playerId, word);
      setPlayers(prev => prev.map(player => 
        player.id === playerId 
          ? { ...player, currentlyTyping: word }
          : player
      ));
    });

    // Powerup received
    newSocket.on('powerupReceived', ({ type, message }) => {
      setAvailablePowerups(prev => prev + 1);
      addChatMessage('success', message);
      playSound('powerup');
    });

    // Powerup used
    newSocket.on('powerupUsed', ({ type, message, effect }) => {
      addChatMessage('system', message);
      
      // Apply powerup effects
      if (effect.extraTime) {
        setTimeLeft(prev => prev + effect.extraTime);
      }
      if (effect.extraAttempts) {
        setAttemptsLeft(prev => prev + effect.extraAttempts);
      }
    });

    // Word validation response
    newSocket.on('wordValidationResult', ({ valid, attempts, message }) => {
      setIsValidatingWord(false);
      setAttemptsLeft(attempts);
      setWordValidationMessage(message);
      
      if (valid) {
        setCurrentWord('');
        setWordValidationMessage('');
      } else if (attempts === 0) {
        // Out of attempts, turn will end automatically
        setCurrentWord('');
        setTimeout(() => {
          setWordValidationMessage('');
        }, 3000);
      }
    });

    // Timer updates
    newSocket.on('timerUpdate', (time) => {
      setTimeLeft(time);
      playSound('countdown', time, maxTime);
    });

    // Chat messages
    newSocket.on('chatMessage', (msg) => {
      setChatMessages(prev => [...prev.slice(-50), msg]);
    });

    // Player eliminated
    newSocket.on('playerEliminated', (playerId) => {
      triggerShootingAnimation(playerId);
    });

    // Error handling
    newSocket.on('error', (error) => {
      addChatMessage('error', error);
    });

    return () => {
      newSocket.close();
    };
  }, []);

  // Auto-focus input when it becomes your turn - IMPROVED
  useEffect(() => {
    if (gameState === 'playing') {
      const currentPlayerData = players[currentPlayer];
      const isYourTurn = currentPlayerData?.id === playerId || currentPlayerData?.name === playerName;
      
      if (isYourTurn && inputRef.current && !isValidatingWord) {
        console.log('Attempting to focus input for player turn');
        
        // Multiple focus attempts with increasing delays to ensure it works
        const focusInput = () => {
          if (inputRef.current && !inputRef.current.disabled) {
            inputRef.current.focus();
            inputRef.current.select(); // Also select any existing text
            console.log('Input focused successfully');
          }
        };
        
        // Immediate focus
        focusInput();
        
        // Backup focuses in case the first one fails
        setTimeout(focusInput, 50);
        setTimeout(focusInput, 150);
        setTimeout(focusInput, 300);
      }
    }
  }, [currentPlayer, gameState, players, playerId, playerName, isValidatingWord]);

  // Additional effect to focus when game state changes to playing
  useEffect(() => {
    if (gameState === 'playing' && inputRef.current) {
      const currentPlayerData = players[currentPlayer];
      const isYourTurn = currentPlayerData?.id === playerId || currentPlayerData?.name === playerName;
      
      if (isYourTurn) {
        setTimeout(() => {
          if (inputRef.current && !inputRef.current.disabled) {
            inputRef.current.focus();
            console.log('Game started - input focused');
          }
        }, 500);
      }
    }
  }, [gameState]);

  // IMPROVED: Audio initialization with user interaction handling
  const initializeAudio = () => {
    if (!audioInitialized && !audioContextRef.current) {
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        audioContextRef.current = new AudioContext();
        setAudioInitialized(true);
        console.log('Audio initialized successfully');
      } catch (error) {
        console.warn('Audio initialization failed:', error);
        setSoundEnabled(false);
      }
    }
  };

  // Handle first user interaction to initialize audio
  useEffect(() => {
    const handleFirstInteraction = () => {
      if (soundEnabled && !audioInitialized) {
        initializeAudio();
        document.removeEventListener('click', handleFirstInteraction);
        document.removeEventListener('keydown', handleFirstInteraction);
      }
    };

    document.addEventListener('click', handleFirstInteraction);
    document.addEventListener('keydown', handleFirstInteraction);

    return () => {
      document.removeEventListener('click', handleFirstInteraction);
      document.removeEventListener('keydown', handleFirstInteraction);
    };
  }, [soundEnabled, audioInitialized]);

  // IMPROVED: Extract beep creation to separate function
  const createBeepSound = (context, frequency, duration, volume, type) => {
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(context.destination);
    
    oscillator.frequency.setValueAtTime(frequency, context.currentTime);
    oscillator.type = type;
    
    gainNode.gain.setValueAtTime(0, context.currentTime);
    gainNode.gain.linearRampToValueAtTime(volume, context.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
    
    oscillator.start(context.currentTime);
    oscillator.stop(context.currentTime + duration);
  };

  // IMPROVED: Better audio context handling
  const createBeep = (frequency, duration, volume = 0.1, type = 'sine') => {
    if (!audioContextRef.current || !soundEnabled) return;
    
    try {
      const context = audioContextRef.current;
      
      // Always try to resume context
      if (context.state === 'suspended') {
        context.resume().then(() => {
          createBeepSound(context, frequency, duration, volume, type);
        });
      } else {
        createBeepSound(context, frequency, duration, volume, type);
      }
    } catch (error) {
      console.warn('Sound playback failed:', error);
    }
  };

  // Advanced countdown tick with progressive speed and pitch
  const createCountdownTick = (timeLeft, maxTime) => {
    if (!audioContextRef.current || !soundEnabled) return;
    
    try {
      const context = audioContextRef.current;
      
      // Resume context if suspended
      if (context.state === 'suspended') {
        context.resume();
      }
      
      // Calculate urgency (0 to 1, where 1 is most urgent)
      const urgency = Math.max(0, (maxTime - timeLeft) / maxTime);
      
      // Progressive frequency increase (bomb ticking gets higher pitched)
      const baseFrequency = 800;
      const frequency = baseFrequency + (urgency * 1200); // Goes from 800Hz to 2000Hz
      
      // Progressive volume increase
      const volume = 0.05 + (urgency * 0.15); // Goes from 0.05 to 0.2
      
      // Shorter duration when more urgent
      const duration = 0.1 + (0.05 * (1 - urgency)); // Goes from 0.15s to 0.1s
      
      // Create the tick sound
      const oscillator = context.createOscillator();
      const gainNode = context.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(context.destination);
      
      // Sharp, urgent sound for critical moments
      if (timeLeft <= 3) {
        oscillator.type = 'square'; // More aggressive sound
        oscillator.frequency.setValueAtTime(frequency, context.currentTime);
        oscillator.frequency.linearRampToValueAtTime(frequency * 1.2, context.currentTime + duration/2);
        oscillator.frequency.linearRampToValueAtTime(frequency, context.currentTime + duration);
      } else {
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequency, context.currentTime);
      }
      
      // Quick attack, sharp decay for ticking effect
      gainNode.gain.setValueAtTime(0, context.currentTime);
      gainNode.gain.linearRampToValueAtTime(volume, context.currentTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
      
      oscillator.start(context.currentTime);
      oscillator.stop(context.currentTime + duration);
      
      // Store tick time for potential rapid-fire effect
      lastTickTimeRef.current = Date.now();
      
    } catch (error) {
      console.warn('Countdown tick failed:', error);
    }
  };

  const playSound = (type, timeLeft = 15, maxTime = 15) => {
    if (!soundEnabled || !audioInitialized) return;
    
    switch (type) {
      case 'countdown':
        createCountdownTick(timeLeft, maxTime);
        break;
      case 'success':
        // Pleasant success chord
        createBeep(523, 0.2, 0.1); // C5
        setTimeout(() => createBeep(659, 0.2, 0.1), 100); // E5
        setTimeout(() => createBeep(784, 0.3, 0.1), 200); // G5
        break;
      case 'shot':
        // Gunshot effect - low thud followed by sharp crack
        createBeep(80, 0.1, 0.2, 'square');
        setTimeout(() => createBeep(1200, 0.05, 0.15, 'sawtooth'), 50);
        break;
      case 'gamestart':
        // Rising fanfare
        createBeep(440, 0.2, 0.1); // A4
        setTimeout(() => createBeep(523, 0.2, 0.1), 150); // C5
        setTimeout(() => createBeep(659, 0.2, 0.1), 300); // E5
        setTimeout(() => createBeep(784, 0.4, 0.1), 450); // G5
        break;
      case 'gameover':
        // Dramatic descending sequence
        createBeep(784, 0.3, 0.1); // G5
        setTimeout(() => createBeep(659, 0.3, 0.1), 200); // E5
        setTimeout(() => createBeep(523, 0.3, 0.1), 400); // C5
        setTimeout(() => createBeep(261, 0.6, 0.1), 600); // C4
        break;
      case 'newturn':
        // Quick notification beep
        createBeep(880, 0.1, 0.08);
        break;
      case 'powerup':
        // Magical power-up sound
        createBeep(440, 0.1, 0.1);
        setTimeout(() => createBeep(554, 0.1, 0.1), 80);
        setTimeout(() => createBeep(659, 0.1, 0.1), 160);
        setTimeout(() => createBeep(880, 0.2, 0.1), 240);
        break;
      case 'elimination':
        // Sad elimination sound
        createBeep(330, 0.2, 0.1);
        setTimeout(() => createBeep(277, 0.2, 0.1), 150);
        setTimeout(() => createBeep(220, 0.4, 0.1), 300);
        break;
      default:
        createBeep(440, 0.2, 0.1);
    }
  };

  const triggerShootingAnimation = (targetPlayerId) => {
    setShootingAnimation(targetPlayerId);
    setScreenFlash(true);
    playSound('shot');
    
    setTimeout(() => {
      setScreenFlash(false);
      playSound('elimination'); // Add elimination sound after the shot
    }, 200);
    
    setTimeout(() => {
      setShootingAnimation(null);
    }, 1000);
  };

  const addChatMessage = (type, message, playerName = null) => {
    setChatMessages(prev => [...prev.slice(-50), { 
      type, 
      message, 
      playerName,
      timestamp: Date.now()
    }]);
  };

  // Socket.IO multiplayer functions
  const createParty = () => {
    if (!playerName.trim() || !socket) return;
    socket.emit('createParty', playerName.trim());
  };

  const joinParty = () => {
    if (!playerName.trim() || !partyCode.trim() || !socket) return;
    socket.emit('joinParty', { 
      playerName: playerName.trim(), 
      partyCode: partyCode.toUpperCase() 
    });
  };

  const addPlayer = () => {
    if (!isHost || !socket) return;
    socket.emit('addBot');
  };

  const removePlayer = (botId) => {
    if (!isHost || !socket) return;
    socket.emit('removeBot', botId);
  };

  const startGame = () => {
    if (!isHost || players.length < 2 || !socket) return;
    socket.emit('startGame', { gameMode });
    playSound('gamestart');
  };

  // Word validation function
  const validateWord = async (word) => {
    try {
      const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word.toLowerCase()}`);
      return response.ok;
    } catch (error) {
      console.warn('Dictionary API failed, using basic validation:', error);
      // Fallback: basic word validation (length > 2, contains letters only)
      return word.length >= 3 && /^[a-zA-Z]+$/.test(word);
    }
  };

  const submitWord = async (word) => {
    if (!word.trim() || !socket || isValidatingWord) return;
    
    setIsValidatingWord(true);
    setWordValidationMessage('Checking word...');
    
    // Clear typing state immediately when submitting
    if (socket) {
      socket.emit('typingUpdate', { word: '' });
    }
    
    // Check if word contains target
    if (!word.toLowerCase().includes(target.toLowerCase())) {
      setIsValidatingWord(false);
      setWordValidationMessage(`Word must contain "${target}"`);
      return;
    }
    
    // Check if word was already used
    if (usedWords.has(word.toLowerCase())) {
      setIsValidatingWord(false);
      setWordValidationMessage('Word already used!');
      return;
    }
    
    // Validate if it's a real word
    const isValidWord = await validateWord(word);
    
    if (isValidWord) {
      // Word is valid, submit to server
      socket.emit('submitWord', word.trim());
      setCurrentWord('');
      setWordValidationMessage('');
      setIsValidatingWord(false);
      
      // In Wild West mode, chance to get powerup on successful word
      if (gameMode === 'wildwest' && Math.random() < 0.3) { // 30% chance
        socket.emit('requestPowerup');
      }
    } else {
      // Word is invalid, use an attempt
      const newAttempts = attemptsLeft - 1;
      setAttemptsLeft(newAttempts);
      setIsValidatingWord(false);
      
      if (newAttempts > 0) {
        setWordValidationMessage(`"${word}" is not a valid English word. ${newAttempts} attempts remaining.`);
      } else {
        setWordValidationMessage('Out of attempts! You lose a life.');
        // Emit to server that player ran out of attempts
        socket.emit('outOfAttempts');
        setCurrentWord('');
        setTimeout(() => {
          setWordValidationMessage('');
        }, 3000);
      }
    }
  };

  // NEW: Handle word input changes with typing broadcast
  const handleWordChange = (e) => {
    const word = e.target.value;
    setCurrentWord(word);
    
    // Check if it's currently your turn
    const currentPlayerData = players[currentPlayer];
    const isCurrentlyYourTurn = currentPlayerData?.id === playerId || currentPlayerData?.name === playerName;
    
    // Broadcast typing to other players
    if (socket && isCurrentlyYourTurn) {
      socket.emit('typingUpdate', { word });
    }
  };

  // Powerup functions
  const usePowerup = (type) => {
    if (availablePowerups <= 0 || !socket) return;
    
    socket.emit('usePowerup', type);
    setAvailablePowerups(prev => prev - 1);
  };

  const getPowerupIcon = (type) => {
    switch (type) {
      case 'extraTime': return '⏰';
      case 'skipTurn': return '⏭️';
      case 'doublePoints': return '💎';
      case 'extraLife': return '❤️';
      case 'showHint': return '💡';
      case 'steal': return '💰';
      default: return '⚡';
    }
  };

  const sendChatMessage = () => {
    if (!chatInput.trim() || !socket) return;
    socket.emit('chatMessage', chatInput.trim());
    setChatInput('');
  };

  const leaveParty = () => {
    if (socket) {
      socket.emit('leaveParty');
    }
    setGameState('welcome');
    setPlayers([]);
    setPartyCode('');
    setIsHost(false);
    setChatMessages([]);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && currentWord.trim() && gameState === 'playing') {
      submitWord(currentWord.trim());
    }
  };

  const handleChatKeyPress = (e) => {
    if (e.key === 'Enter') {
      sendChatMessage();
    }
  };

  // Welcome Screen
  if (gameState === 'welcome') {
    return (
      <div className="game-container">
        {/* Add CSS animation for typing bubble */}
        <style>{`
          @keyframes typingPulse {
            0% { opacity: 0.8; transform: translateX(-50%) scale(1); }
            100% { opacity: 1; transform: translateX(-50%) scale(1.05); }
          }
        `}</style>
        
        <div className="game-background-effects">
          <div className="bg-blob-1"></div>
          <div className="bg-blob-2"></div>
          <div className="bg-blob-3"></div>
        </div>
        
        <div className="game-content">
          <div className="welcome-content">
            {/* Connection Status */}
            <div className="connection-status">
              <span className={`status-badge ${
                connectionStatus === 'connected' ? 'status-connected' : 
                connectionStatus === 'connecting' ? 'status-connecting' :
                'status-disconnected'
              }`}>
                <div className={`status-dot ${connectionStatus}`}></div>
                {connectionStatus === 'connected' ? 'Ready to Play' : 
                 connectionStatus === 'connecting' ? 'Connecting...' : 'Connection Lost'}
              </span>
            </div>

            {/* Main Title */}
            <div className="game-title">
              <h1 className="main-title">ROBBERY</h1>
              <div className="title-divider"></div>
              <p className="subtitle">Elite Word Heist</p>
            </div>

            {/* Player Registration */}
            <div className="game-card">
              <h2 className="card-header">Join the Heist</h2>
              <div className="card-content">
                <div className="form-group">
                  <label className="form-label">Player Name</label>
                  <input
                    type="text"
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    placeholder="Enter your name"
                    className="form-input"
                    maxLength={12}
                  />
                </div>

                <button
                  onClick={createParty}
                  disabled={!playerName.trim() || connectionStatus !== 'connected'}
                  className="btn btn-primary"
                >
                  <Plus className="icon" />
                  Create Party
                </button>

                <div className="divider">
                  <div className="divider-text">
                    <span>or</span>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Party Code</label>
                  <input
                    type="text"
                    value={partyCode}
                    onChange={(e) => setPartyCode(e.target.value.toUpperCase())}
                    placeholder="Enter party code"
                    className="form-input"
                    maxLength={6}
                  />
                </div>

                <button
                  onClick={joinParty}
                  disabled={!playerName.trim() || !partyCode.trim() || connectionStatus !== 'connected'}
                  className="btn btn-secondary"
                >
                  <UserPlus className="icon" />
                  Join Party
                </button>
              </div>
            </div>

            {/* Audio Control */}
            <div style={{ textAlign: 'center' }}>
              <button
                onClick={() => setSoundEnabled(!soundEnabled)}
                className="btn btn-outline"
              >
                {soundEnabled ? <Volume2 className="icon" /> : <VolumeX className="icon" />}
                <span>{soundEnabled ? 'Sound On' : 'Sound Off'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Lobby Screen
  if (gameState === 'lobby') {
    const humanPlayers = players.filter(p => !p.isBot);
    const bots = players.filter(p => p.isBot);

    return (
      <div className="game-container">
        <div className="game-background-effects">
          <div className="bg-blob-1"></div>
          <div className="bg-blob-2"></div>
        </div>
        
        <div className="lobby-container">
          {/* Header */}
          <div className="game-header">
            <div className="header-left">
              <h1 className="lobby-title">ROBBERY HIDEOUT</h1>
              <p className="party-code-display">Party Code: <span className="party-code">{partyCode}</span></p>
            </div>
            <button onClick={leaveParty} className="btn btn-outline">
              <Home className="icon" />
              Leave
            </button>
          </div>

          <div className="lobby-grid">
            {/* Players Panel */}
            <div className="game-card">
              <h2 className="card-header">
                <Users className="icon-lg" />
                Players ({humanPlayers.length}/6)
              </h2>
              <div className="player-list">
                {humanPlayers.map(player => (
                  <div key={player.id} className="player-item">
                    <div className="player-avatar">
                      {player.name.charAt(0)}
                    </div>
                    <div className="player-info">
                      <span className="player-name">{player.name}</span>
                      {player.isHost && <Crown className="icon" style={{ color: '#fbbf24', marginLeft: '0.5rem' }} />}
                    </div>
                    <div className="player-lives">
                      {[...Array(3)].map((_, i) => (
                        <div key={i} className="life-dot"></div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Bot Management */}
              <div className="bot-section">
                <div className="bot-header">
                  <h3 className="bot-title">
                    <Bot className="icon" />
                    AI Players ({bots.length}/4)
                  </h3>
                  {isHost && bots.length < 4 && (
                    <button onClick={addPlayer} className="btn btn-blue btn-small">
                      <Plus className="icon" />
                      Add AI
                    </button>
                  )}
                </div>
                <div className="bot-list">
                  {bots.map(bot => (
                    <div key={bot.id} className="bot-item">
                      <div className="bot-avatar">
                        <Bot className="icon" />
                      </div>
                      <span className="bot-name">{bot.name}</span>
                      {isHost && (
                        <button
                          onClick={() => removePlayer(bot.id)}
                          className="remove-btn"
                        >
                          <Trash2 className="icon" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Game Settings */}
            <div className="game-card">
              <h2 className="card-header">
                <Settings className="icon-lg" />
                Game Settings
              </h2>
              <div className="settings-group">
                <div className="setting-item">
                  <label className="form-label">Game Mode</label>
                  <select 
                    value={gameMode} 
                    onChange={(e) => setGameMode(e.target.value)}
                    disabled={!isHost}
                    className="select-input"
                  >
                    <option value="classic">Classic</option>
                    <option value="wildwest">Wild West</option>
                  </select>
                  {gameMode === 'wildwest' && (
                    <div style={{ 
                      marginTop: '0.5rem', 
                      fontSize: '0.875rem', 
                      color: '#fdba74',
                      fontStyle: 'italic'
                    }}>
                      ⚡ Includes powerups and special abilities!
                    </div>
                  )}
                </div>
                <div className="setting-item">
                  <label className="form-label">Timer Duration</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <input 
                      type="range" 
                      min="8" 
                      max="20" 
                      value={maxTime}
                      onChange={(e) => setMaxTime(parseInt(e.target.value))}
                      disabled={!isHost}
                      className="range-input"
                    />
                    <div className="range-value">{maxTime} seconds</div>
                  </div>
                </div>
              </div>
              
              {isHost && (
                <button 
                  onClick={startGame}
                  disabled={players.length < 2}
                  className="btn btn-primary"
                  style={{ marginTop: '2rem' }}
                >
                  <Play className="icon" />
                  Start Heist
                </button>
              )}
              {!isHost && (
                <div className="waiting-message">
                  Waiting for host to start the game...
                </div>
              )}
            </div>

            {/* Chat Panel */}
            <div className="game-card">
              <h2 className="card-header">
                <MessageCircle className="icon-lg" />
                Chat
              </h2>
              <div className="chat-container">
                <div className="chat-messages">
                  {chatMessages.map((msg, index) => (
                    <div key={index} className={`chat-message ${msg.type}`}>
                      {msg.playerName && <span style={{ fontWeight: 'bold' }}>{msg.playerName}: </span>}
                      {msg.message}
                    </div>
                  ))}
                </div>
                <div className="chat-input-container">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyPress={handleChatKeyPress}
                    placeholder="Type a message..."
                    className="chat-input"
                  />
                  <button onClick={sendChatMessage} className="chat-send-btn">
                    Send
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Game Rules */}
          <div className="game-rules">
            <h3 className="rules-title">How to Play</h3>
            <div className="rules-grid">
              <div className="rules-column">
                <p>• Create words containing the target letters</p>
                <p>• Submit before the timer expires</p>
                <p>• Longer words earn more points</p>
              </div>
              <div className="rules-column">
                <p>• Cannot reuse words already played</p>
                <p>• Wrong words or timeout = elimination</p>
                <p>• Last player standing wins</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Playing Screen
  if (gameState === 'playing') {
    const currentPlayerData = players[currentPlayer];
    // Fix: Check if it's your turn by name as backup
    const isYourTurn = currentPlayerData?.id === playerId || currentPlayerData?.name === playerName;
    const progress = (timeLeft / maxTime) * 100;

    return (
      <div className="game-container">
        
        {/* Shooting Animation Effects */}
        {shootingAnimation && (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50, pointerEvents: 'none' }}>
            {screenFlash && <div className="screen-flash"></div>}
          </div>
        )}

        <div className="game-background-effects">
          <div className="bg-blob-1"></div>
          <div className="bg-blob-2"></div>
        </div>
        
        <div className={`playing-container ${shootingAnimation ? 'screen-shake' : ''}`}>
          {/* Header */}
          <div className="playing-header">
            <div className="header-left-playing">
              <h1 className="playing-title">ROBBERY</h1>
              <div className="round-display">
                <span className="round-label">Round </span>
                <span className="round-number">{round}</span>
              </div>
              <button
                onClick={() => setSoundEnabled(!soundEnabled)}
                className="sound-toggle"
              >
                {soundEnabled ? <Volume2 className="icon" /> : <VolumeX className="icon" />}
              </button>
            </div>
            
            {/* Timer */}
            <div className={`timer-display ${
              timeLeft <= 3 ? 'critical' : 
              timeLeft <= 5 ? 'warning' : ''
            }`}>
              {timeLeft.toString().padStart(2, '0')}
            </div>
          </div>

          {/* Progress Bar */}
          <div className="progress-bar">
            <div 
              className={`progress-fill ${
                timeLeft <= 3 ? 'critical' : 
                timeLeft <= 5 ? 'warning' : 
                'normal'
              }`}
              style={{ transform: `scaleX(${progress / 100})` }}
            ></div>
          </div>

          {/* Game Area */}
          <div className="game-area" style={{ padding: '4rem 2rem 2rem 2rem' }}>
            <div className="game-circle" style={{ position: 'relative', overflow: 'visible' }}>
              {/* Central Target Area */}
              <div className={`target-area ${timeLeft <= 3 ? 'critical' : ''}`}>
                <div className="target-text">{target}</div>
                <div className="target-divider"></div>
                <div className="target-label">TARGET</div>
              </div>

              {/* Players arranged in circle */}
              {players.map((player, index) => {
                const angle = (index * 360) / players.length;
                const radius = 180;
                const x = Math.cos((angle - 90) * Math.PI / 180) * radius;
                const y = Math.sin((angle - 90) * Math.PI / 180) * radius;
                const isActive = index === currentPlayer;
                const isBeingShot = shootingAnimation === player.id;
                
                return (
                  <div key={player.id}>
                    {/* Player Card */}
                    <div
                      className={`player-position ${
                        isActive ? 'active' : 
                        player.lives <= 0 ? 'eliminated' :
                        player.isBot ? 'bot' : 'human'
                      } ${isBeingShot ? 'being-shot' : ''}`}
                      style={{
                        left: `calc(50% + ${x}px - 3rem)`,
                        top: `calc(50% + ${y}px - 3rem)`
                      }}
                    >
                      {/* Gun Icon */}
                      <div className="player-gun">🔫</div>
                      
                      {/* Player avatar */}
                      <div className={`player-position-avatar ${
                        player.isBot ? 'bot' : 'human'
                      } ${isBeingShot ? 'being-shot' : ''}`}>
                        {player.isBot ? <Bot className="icon" /> : player.name.charAt(0)}
                      </div>
                      
                      {/* Player name */}
                      <div className="player-position-name">
                        {player.name.length > 8 ? player.name.substring(0, 8) + '...' : player.name}
                      </div>
                      
                      {/* Lives display */}
                      <div className="player-position-lives">
                        {[...Array(Math.max(0, player.lives))].map((_, i) => (
                          <div key={i} className={`life-dot-small ${isBeingShot ? 'being-shot' : ''}`}></div>
                        ))}
                        {[...Array(Math.max(0, 3 - player.lives))].map((_, i) => (
                          <div key={`lost-${i}`} className="life-lost">×</div>
                        ))}
                      </div>
                      
                      {/* Score */}
                      <div className="player-position-score">{player.score}</div>
                    </div>

                    {/* NEW: Typing display positioned outside the player card */}
                    {player.currentlyTyping && (
                      <div 
                        className="player-typing-bubble" 
                        style={{
                          position: 'absolute',
                          left: `calc(50% + ${x}px - 4rem)`,
                          top: `calc(50% + ${y}px - 5.5rem)`, // Position above the player card
                          fontSize: '0.8rem',
                          color: '#fbbf24',
                          fontWeight: 'bold',
                          fontStyle: 'italic',
                          maxWidth: '120px',
                          minWidth: '60px',
                          textAlign: 'center',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          background: 'rgba(0, 0, 0, 0.85)',
                          padding: '6px 10px',
                          borderRadius: '12px',
                          border: '2px solid #fbbf24',
                          boxShadow: '0 4px 12px rgba(251, 191, 36, 0.3)',
                          zIndex: 10,
                          transform: 'translateX(-50%)', // Center it horizontally
                          animation: 'typingPulse 1.5s ease-in-out infinite alternate'
                        }}
                      >
                        "{player.currentlyTyping}"
                        {/* Small arrow pointing to player */}
                        <div style={{
                          position: 'absolute',
                          bottom: '-8px',
                          left: '50%',
                          transform: 'translateX(-50%)',
                          width: '0',
                          height: '0',
                          borderLeft: '8px solid transparent',
                          borderRight: '8px solid transparent',
                          borderTop: '8px solid #fbbf24'
                        }}></div>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Turn indicator */}
              {players.length > 0 && (
                <div
                  className="turn-indicator"
                  style={{
                    transform: `rotate(${(currentPlayer * 360) / players.length}deg)`
                  }}
                >
                  <div className="turn-arrow"></div>
                </div>
              )}
            </div>
          </div>

          {/* Input Area - Always Visible */}
          <div className="input-area">
            <div className="input-container">
              {/* Wild West Powerups */}
              {gameMode === 'wildwest' && availablePowerups > 0 && isYourTurn && (
                <div style={{ 
                  textAlign: 'center',
                  marginBottom: '1rem',
                  padding: '1rem',
                  background: 'rgba(184, 107, 49, 0.3)',
                  border: '1px solid #d97706',
                  borderRadius: '0.5rem'
                }}>
                  <div style={{ 
                    color: '#fbbf24', 
                    fontWeight: 'bold', 
                    marginBottom: '0.5rem',
                    fontSize: '1rem'
                  }}>
                    ⚡ Wild West Powerups ({availablePowerups}) ⚡
                  </div>
                  <div style={{ 
                    display: 'flex', 
                    gap: '0.5rem', 
                    justifyContent: 'center',
                    flexWrap: 'wrap'
                  }}>
                    <button
                      onClick={() => usePowerup('extraTime')}
                      className="btn btn-small"
                      style={{ 
                        background: '#059669', 
                        color: 'white',
                        minWidth: '100px'
                      }}
                    >
                      ⏰ +5 Time
                    </button>
                    <button
                      onClick={() => usePowerup('skipTurn')}
                      className="btn btn-small"
                      style={{ 
                        background: '#7c3aed', 
                        color: 'white',
                        minWidth: '100px'
                      }}
                    >
                      ⏭️ Skip Bot
                    </button>
                    <button
                      onClick={() => usePowerup('doublePoints')}
                      className="btn btn-small"
                      style={{ 
                        background: '#dc2626', 
                        color: 'white',
                        minWidth: '100px'
                      }}
                    >
                      💎 x2 Points
                    </button>
                    <button
                      onClick={() => usePowerup('extraLife')}
                      className="btn btn-small"
                      style={{ 
                        background: '#be185d', 
                        color: 'white',
                        minWidth: '100px'
                      }}
                    >
                      ❤️ +1 Life
                    </button>
                  </div>
                </div>
              )}
              
              <p className="turn-instruction">
                {isYourTurn ? (
                  <>Your turn! Create a word containing: <span className="target-highlight">{target}</span></>
                ) : (
                  <>Waiting for {currentPlayerData?.name || 'player'}... Target: <span className="target-highlight">{target}</span></>
                )}
              </p>
              
              {/* Attempts Counter */}
              {isYourTurn && (
                <div style={{ 
                  textAlign: 'center', 
                  margin: '0.5rem 0',
                  color: attemptsLeft <= 2 ? '#f87171' : '#fbbf24',
                  fontWeight: 'bold'
                }}>
                  Attempts remaining: {attemptsLeft}/5
                </div>
              )}
              
              {/* Validation Message */}
              {wordValidationMessage && (
                <div style={{ 
                  textAlign: 'center', 
                  margin: '0.5rem 0',
                  padding: '0.5rem',
                  borderRadius: '0.5rem',
                  background: wordValidationMessage.includes('valid') || wordValidationMessage.includes('attempts') || wordValidationMessage.includes('contain') || wordValidationMessage.includes('used') ? 
                    'rgba(239, 68, 68, 0.2)' : 'rgba(34, 197, 94, 0.2)',
                  color: wordValidationMessage.includes('valid') || wordValidationMessage.includes('attempts') || wordValidationMessage.includes('contain') || wordValidationMessage.includes('used') ? 
                    '#fca5a5' : '#86efac',
                  fontWeight: 'bold'
                }}>
                  {wordValidationMessage}
                </div>
              )}
              
              <div className="input-row">
                <input
                  ref={inputRef}
                  type="text"
                  value={currentWord}
                  onChange={handleWordChange}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && currentWord.trim() && gameState === 'playing' && isYourTurn && !isValidatingWord) {
                      submitWord(currentWord.trim());
                    }
                  }}
                  onFocus={() => console.log('Input focused by user')}
                  onClick={() => {
                    // Ensure focus when clicked
                    if (inputRef.current) {
                      inputRef.current.focus();
                    }
                  }}
                  className="word-input"
                  placeholder={isYourTurn ? (isValidatingWord ? "Validating..." : "Type your word...") : "Not your turn..."}
                  disabled={!isYourTurn || isValidatingWord}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck="false"
                  tabIndex={isYourTurn ? 0 : -1}
                />
                <button
                  onClick={() => submitWord(currentWord.trim())}
                  disabled={!currentWord.trim() || !isYourTurn || isValidatingWord}
                  className="submit-btn"
                >
                  {isValidatingWord ? 'CHECKING...' : 'SUBMIT'}
                </button>
              </div>
            </div>
          </div>

          {/* Used Words */}
          <div className="used-words-area">
            <div className="used-words-container">
              <h4 className="used-words-title">Used Words</h4>
              <div className="used-words-list">
                {Array.from(usedWords).slice(-15).map(word => (
                  <span key={word} className="used-word">
                    {word.toUpperCase()}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Game Over Screen
  if (gameState === 'finished') {
    const winner = players.reduce((prev, current) => 
      (current.score > prev.score) ? current : prev
    );

    return (
      <div className="game-container game-over-container">
        <div className="game-background-effects">
          <div className="bg-blob-1"></div>
          <div className="bg-blob-2"></div>
        </div>
        
        <div className="game-over-content">
          <div className="game-over-card">
            <div className="game-over-icon">💰</div>
            <h1 className="game-over-title">Heist Complete</h1>
            <div className="winner-name">Winner: {winner.name}</div>
            <div className="winner-score">Score: {winner.score} points</div>
            
            <div className="final-scores">
              <h3 className="final-scores-title">Final Scores</h3>
              <div className="score-list">
                {players.sort((a, b) => b.score - a.score).map((player, index) => (
                  <div key={player.id} className="score-item">
                    <div className="score-player">
                      <span className="score-medal">
                        {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '🏅'}
                      </span>
                      <div className="score-player-info">
                        {player.isBot && <Bot className="icon" style={{ color: '#60a5fa' }} />}
                        <span className="score-player-name">{player.name}</span>
                      </div>
                    </div>
                    <span className="score-points">{player.score} pts</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="game-over-actions">
              <button 
                onClick={() => setGameState('lobby')}
                className="btn btn-primary"
              >
                Play Again
              </button>
              <button 
                onClick={leaveParty}
                className="btn btn-outline"
              >
                Exit Game
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default ROBBERY;