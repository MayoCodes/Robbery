import React, { useState, useEffect, useRef } from 'react';
import { Clock, Users, Trophy, Settings, Zap, Shield, Plus, MessageCircle, Crown, Star, Volume2, VolumeX, Play, UserPlus, Home, Bot, Trash2 } from 'lucide-react';
import * as Tone from 'tone';
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
  
  const inputRef = useRef();
  const synthRef = useRef();
  const countdownSynthRef = useRef();

  // Socket.IO connection
  useEffect(() => {
    const newSocket = io(process.env.NODE_ENV === 'production' 
      ? 'https://your-vercel-backend-url.vercel.app' 
      : 'http://localhost:3001'
    );
    
    setSocket(newSocket);
    setPlayerId(newSocket.id);

    // Connection status
    newSocket.on('connect', () => {
      setConnectionStatus('connected');
    });

    newSocket.on('disconnect', () => {
      setConnectionStatus('disconnected');
    });

    // Party created
    newSocket.on('partyCreated', ({ partyCode: code, gameState: state }) => {
      setPartyCode(code);
      setPlayers(state.players);
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
      setUsedWords(new Set(state.usedWords));
      setGameState(state.gameState);
      
      // Update host status
      const myPlayer = state.players.find(p => p.id === newSocket.id);
      if (myPlayer) {
        setIsHost(myPlayer.isHost);
      }
    });

    // Timer updates
    newSocket.on('timerUpdate', (time) => {
      setTimeLeft(time);
      playSound('countdown');
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

  // Initialize audio with simple countdown tick
  useEffect(() => {
    const initAudio = async () => {
      if (soundEnabled && !audioInitialized) {
        try {
          await Tone.start();
          
          synthRef.current = new Tone.Synth({
            oscillator: { type: 'sine' },
            envelope: { attack: 0.01, decay: 0.2, sustain: 0.1, release: 0.3 }
          }).toDestination();
          
          countdownSynthRef.current = new Tone.Synth({
            oscillator: { type: 'square' },
            envelope: { attack: 0.01, decay: 0.1, sustain: 0, release: 0.1 }
          }).toDestination();
          
          setAudioInitialized(true);
        } catch (error) {
          console.warn('Audio initialization failed:', error);
        }
      }
    };
    
    initAudio();
  }, [soundEnabled, audioInitialized]);

  const playSound = (type, note = 'C4', duration = '8n') => {
    if (!soundEnabled || !audioInitialized) return;
    
    try {
      switch (type) {
        case 'countdown':
          if (countdownSynthRef.current) {
            countdownSynthRef.current.triggerAttackRelease('C5', '16n');
          }
          break;
        case 'success':
          synthRef.current.triggerAttackRelease('E5', '8n');
          setTimeout(() => synthRef.current.triggerAttackRelease('G5', '8n'), 100);
          break;
        case 'shot':
          synthRef.current.triggerAttackRelease('C3', '8n');
          setTimeout(() => synthRef.current.triggerAttackRelease('G2', '8n'), 100);
          break;
        case 'gamestart':
          synthRef.current.triggerAttackRelease('C5', '8n');
          setTimeout(() => synthRef.current.triggerAttackRelease('E5', '8n'), 100);
          setTimeout(() => synthRef.current.triggerAttackRelease('G5', '4n'), 200);
          break;
        case 'gameover':
          synthRef.current.triggerAttackRelease('G4', '4n');
          setTimeout(() => synthRef.current.triggerAttackRelease('E4', '4n'), 200);
          setTimeout(() => synthRef.current.triggerAttackRelease('C4', '2n'), 400);
          break;
        case 'newturn':
          synthRef.current.triggerAttackRelease('A4', '16n');
          break;
        default:
          synthRef.current.triggerAttackRelease(note, duration);
      }
    } catch (error) {
      console.warn('Sound playback failed:', error);
    }
  };

  const triggerShootingAnimation = (targetPlayerId) => {
    setShootingAnimation(targetPlayerId);
    setScreenFlash(true);
    playSound('shot');
    
    // Screen flash duration
    setTimeout(() => {
      setScreenFlash(false);
    }, 200);
    
    // Clear shooting animation
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
    socket.emit('startGame');
    playSound('gamestart');
  };

  const submitWord = (word) => {
    if (!word.trim() || !socket) return;
    socket.emit('submitWord', word.trim());
    setCurrentWord('');
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
      <div className="min-h-screen bg-gradient-to-br from-red-950 via-orange-900 to-amber-950 text-amber-100 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-32 h-32 bg-red-600 rounded-full blur-3xl"></div>
          <div className="absolute bottom-20 right-20 w-40 h-40 bg-orange-600 rounded-full blur-3xl"></div>
          <div className="absolute top-1/2 left-1/3 w-24 h-24 bg-amber-700 rounded-full blur-2xl"></div>
        </div>
        
        <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
          <div className="max-w-md w-full">
            {/* Connection Status */}
            <div className="text-center mb-4">
              <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm ${
                connectionStatus === 'connected' ? 'bg-green-900/50 text-green-300' : 
                connectionStatus === 'connecting' ? 'bg-yellow-900/50 text-yellow-300' :
                'bg-red-900/50 text-red-300'
              }`}>
                <div className={`w-2 h-2 rounded-full ${
                  connectionStatus === 'connected' ? 'bg-green-400' : 
                  connectionStatus === 'connecting' ? 'bg-yellow-400 animate-pulse' :
                  'bg-red-400'
                }`}></div>
                {connectionStatus === 'connected' ? 'Ready to Play' : 
                 connectionStatus === 'connecting' ? 'Connecting...' : 'Connection Lost'}
              </span>
            </div>

            {/* Main Title */}
            <div className="text-center mb-12">
              <h1 className="text-7xl font-bold mb-4 text-red-200 tracking-wider drop-shadow-2xl">
                ROBBERY
              </h1>
              <div className="w-32 h-1 bg-red-600 mx-auto mb-4"></div>
              <p className="text-xl text-orange-300 font-medium">Elite Word Heist</p>
            </div>

            {/* Player Registration */}
            <div className="bg-stone-900/80 backdrop-blur-lg border border-orange-700 rounded-lg p-8 shadow-2xl mb-8">
              <h2 className="text-2xl font-bold mb-6 text-center text-red-200">Join the Heist</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2 text-orange-300">Player Name</label>
                  <input
                    type="text"
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    placeholder="Enter your name"
                    className="w-full p-4 bg-stone-800/60 border border-orange-600 rounded-lg text-amber-100 placeholder-stone-400 focus:border-red-500 focus:outline-none transition-colors"
                    maxLength={12}
                  />
                </div>

                <button
                  onClick={createParty}
                  disabled={!playerName.trim() || connectionStatus !== 'connected'}
                  className="w-full py-4 bg-red-700 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-stone-100 font-bold text-lg rounded-lg transition-all transform hover:scale-105 shadow-lg flex items-center justify-center gap-2"
                >
                  <Plus className="w-5 h-5" />
                  Create Party
                </button>

                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-orange-600"></div>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-4 bg-stone-900 text-orange-400">or</span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 text-orange-300">Party Code</label>
                  <input
                    type="text"
                    value={partyCode}
                    onChange={(e) => setPartyCode(e.target.value.toUpperCase())}
                    placeholder="Enter party code"
                    className="w-full p-4 bg-stone-800/60 border border-orange-600 rounded-lg text-amber-100 placeholder-stone-400 focus:border-red-500 focus:outline-none transition-colors"
                    maxLength={6}
                  />
                </div>

                <button
                  onClick={joinParty}
                  disabled={!playerName.trim() || !partyCode.trim() || connectionStatus !== 'connected'}
                  className="w-full py-4 bg-orange-700 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-amber-100 font-bold text-lg rounded-lg transition-all transform hover:scale-105 shadow-lg flex items-center justify-center gap-2"
                >
                  <UserPlus className="w-5 h-5" />
                  Join Party
                </button>
              </div>
            </div>

            {/* Audio Control */}
            <div className="text-center">
              <button
                onClick={() => setSoundEnabled(!soundEnabled)}
                className="inline-flex items-center gap-2 px-6 py-3 bg-stone-800/60 border border-orange-600 rounded-lg hover:bg-stone-700/60 transition-all text-amber-100"
              >
                {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
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
      <div className="min-h-screen bg-gradient-to-br from-red-950 via-orange-900 to-amber-950 text-amber-100 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-32 h-32 bg-red-600 rounded-full blur-3xl"></div>
          <div className="absolute bottom-20 right-20 w-40 h-40 bg-orange-600 rounded-full blur-3xl"></div>
        </div>
        
        <div className="relative z-10 container mx-auto px-4 py-8">
          {/* Header */}
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-4xl font-bold text-red-200 mb-2">ROBBERY HIDEOUT</h1>
              <p className="text-orange-300">Party Code: <span className="text-red-300 font-mono font-bold">{partyCode}</span></p>
            </div>
            <button
              onClick={leaveParty}
              className="px-6 py-3 bg-stone-700 hover:bg-stone-600 text-amber-100 rounded-lg transition-all flex items-center gap-2"
            >
              <Home className="w-4 h-4" />
              Leave
            </button>
          </div>

          <div className="max-w-7xl mx-auto grid lg:grid-cols-3 gap-8">
            {/* Players Panel */}
            <div className="bg-stone-900/80 backdrop-blur-lg border border-orange-700 rounded-lg p-6 shadow-2xl">
              <h2 className="text-2xl font-bold mb-6 flex items-center gap-2 text-red-200">
                <Users className="w-6 h-6" />
                Players ({humanPlayers.length}/6)
              </h2>
              <div className="space-y-3">
                {humanPlayers.map(player => (
                  <div key={player.id} className="flex items-center gap-4 p-4 bg-stone-800/60 border border-orange-700 rounded-lg">
                    <div className="w-10 h-10 bg-red-700 rounded-full flex items-center justify-center text-stone-100 font-bold text-lg">
                      {player.name.charAt(0)}
                    </div>
                    <div className="flex-1">
                      <span className="font-semibold text-amber-100">{player.name}</span>
                      {player.isHost && <Crown className="w-4 h-4 text-amber-400 inline ml-2" />}
                    </div>
                    <div className="flex gap-1">
                      {[...Array(3)].map((_, i) => (
                        <div key={i} className="w-3 h-3 bg-red-500 rounded-full"></div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Bot Management */}
              <div className="mt-8">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-red-200 flex items-center gap-2">
                    <Bot className="w-5 h-5" />
                    AI Players ({bots.length}/4)
                  </h3>
                  {isHost && bots.length < 4 && (
                    <button
                      onClick={addPlayer}
                      className="px-3 py-2 bg-blue-700 hover:bg-blue-600 text-white rounded-lg text-sm font-bold flex items-center gap-1"
                    >
                      <Plus className="w-4 h-4" />
                      Add AI
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  {bots.map(bot => (
                    <div key={bot.id} className="flex items-center gap-3 p-3 bg-blue-900/30 border border-blue-700/50 rounded-lg">
                      <div className="w-8 h-8 bg-blue-700 rounded-full flex items-center justify-center text-white font-bold text-sm">
                        <Bot className="w-4 h-4" />
                      </div>
                      <span className="flex-1 font-medium text-blue-200">{bot.name}</span>
                      {isHost && (
                        <button
                          onClick={() => removePlayer(bot.id)}
                          className="p-1 text-red-400 hover:text-red-300 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Game Settings */}
            <div className="bg-stone-900/80 backdrop-blur-lg border border-orange-700 rounded-lg p-6 shadow-2xl">
              <h2 className="text-2xl font-bold mb-6 flex items-center gap-2 text-red-200">
                <Settings className="w-6 h-6" />
                Game Settings
              </h2>
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium mb-3 text-orange-300">Game Mode</label>
                  <select 
                    value={gameMode} 
                    onChange={(e) => setGameMode(e.target.value)}
                    disabled={!isHost}
                    className="w-full p-3 bg-stone-800/60 border border-orange-600 rounded-lg text-amber-100 focus:border-red-500 focus:outline-none transition-colors"
                  >
                    <option value="classic">Classic</option>
                    <option value="speed">Speed Round</option>
                    <option value="hardcore">Hardcore</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-3 text-orange-300">Timer Duration</label>
                  <div className="space-y-2">
                    <input 
                      type="range" 
                      min="8" 
                      max="20" 
                      value={maxTime}
                      onChange={(e) => setMaxTime(parseInt(e.target.value))}
                      disabled={!isHost}
                      className="w-full accent-red-500"
                    />
                    <div className="text-red-300 font-bold text-lg">{maxTime} seconds</div>
                  </div>
                </div>
              </div>
              
              {isHost && (
                <button 
                  onClick={startGame}
                  disabled={players.length < 2}
                  className="w-full mt-8 bg-red-700 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-stone-100 px-6 py-4 rounded-lg font-bold text-lg transition-all transform hover:scale-105 shadow-lg flex items-center justify-center gap-2"
                >
                  <Play className="w-5 h-5" />
                  Start Heist
                </button>
              )}
              {!isHost && (
                <div className="mt-8 text-center text-orange-400">
                  Waiting for host to start the game...
                </div>
              )}
            </div>

            {/* Chat Panel */}
            <div className="bg-stone-900/80 backdrop-blur-lg border border-orange-700 rounded-lg p-6 shadow-2xl">
              <h2 className="text-2xl font-bold mb-6 flex items-center gap-2 text-red-200">
                <MessageCircle className="w-6 h-6" />
                Chat
              </h2>
              <div className="flex flex-col h-80">
                <div className="flex-1 overflow-y-auto space-y-2 mb-4">
                  {chatMessages.map((msg, index) => (
                    <div key={index} className={`p-2 rounded text-sm ${
                      msg.type === 'error' ? 'bg-red-900/40 text-red-300' :
                      msg.type === 'success' ? 'bg-green-900/40 text-green-300' :
                      msg.type === 'system' ? 'bg-blue-900/40 text-blue-300' :
                      'bg-stone-800/60 text-orange-300'
                    }`}>
                      {msg.playerName && <span className="font-bold">{msg.playerName}: </span>}
                      {msg.message}
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyPress={handleChatKeyPress}
                    placeholder="Type a message..."
                    className="flex-1 p-3 bg-stone-800/60 border border-orange-600 rounded-lg text-amber-100 placeholder-stone-400 focus:border-red-500 focus:outline-none transition-colors"
                  />
                  <button
                    onClick={sendChatMessage}
                    className="px-4 py-3 bg-red-700 hover:bg-red-600 text-stone-100 font-bold rounded-lg transition-all"
                  >
                    Send
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Game Rules */}
          <div className="max-w-4xl mx-auto mt-8 bg-stone-900/60 backdrop-blur-lg border border-orange-700 rounded-lg p-6">
            <h3 className="text-xl font-bold mb-4 text-red-200">How to Play</h3>
            <div className="grid md:grid-cols-2 gap-4 text-orange-300">
              <div className="space-y-2">
                <p>• Create words containing the target letters</p>
                <p>• Submit before the timer expires</p>
                <p>• Longer words earn more points</p>
              </div>
              <div className="space-y-2">
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

  // Playing Screen with Gun Visuals and Shooting Animations
  if (gameState === 'playing') {
    const currentPlayerData = players[currentPlayer];
    const isYourTurn = currentPlayerData?.id === playerId;
    const progress = (timeLeft / maxTime) * 100;

    return (
      <div className="min-h-screen bg-gradient-to-br from-red-950 via-orange-900 to-amber-950 text-amber-100 relative overflow-hidden">
        
        {/* Simple Shooting Animation Effects */}
        {shootingAnimation && (
          <div className="absolute inset-0 z-50 pointer-events-none">
            
            {/* CSS for screen shake */}
            <style jsx>{`
              @keyframes screenShake {
                0%, 100% { transform: translateX(0) translateY(0); }
                10% { transform: translateX(-5px) translateY(2px); }
                20% { transform: translateX(5px) translateY(-2px); }
                30% { transform: translateX(-3px) translateY(3px); }
                40% { transform: translateX(3px) translateY(-3px); }
                50% { transform: translateX(-2px) translateY(1px); }
                60% { transform: translateX(2px) translateY(-1px); }
                70% { transform: translateX(-1px) translateY(2px); }
                80% { transform: translateX(1px) translateY(-2px); }
                90% { transform: translateX(-1px) translateY(1px); }
              }
              .screen-shake {
                animation: screenShake 0.6s ease-in-out;
              }
            `}</style>
            
            {/* Screen Flash */}
            {screenFlash && (
              <div className="absolute inset-0 bg-red-500/60 animate-pulse"></div>
            )}
          </div>
        )}

        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-32 h-32 bg-red-600 rounded-full blur-3xl"></div>
          <div className="absolute bottom-20 right-20 w-40 h-40 bg-orange-600 rounded-full blur-3xl"></div>
        </div>
        
        <div className={`relative z-10 min-h-screen flex flex-col ${shootingAnimation ? 'screen-shake' : ''}`}>
          {/* Header with Progress Bar Timer */}
          <div className="flex justify-between items-center p-6 bg-stone-900/80 backdrop-blur-lg border-b border-orange-700">
            <div className="flex items-center gap-6">
              <h1 className="text-3xl font-bold text-red-200">ROBBERY</h1>
              <div className="bg-stone-800 border border-orange-600 px-4 py-2 rounded-lg">
                <span className="text-orange-300">Round </span>
                <span className="text-red-300 font-bold">{round}</span>
              </div>
              <button
                onClick={() => setSoundEnabled(!soundEnabled)}
                className="p-3 bg-stone-800 border border-orange-600 rounded-lg hover:bg-stone-700 transition-all"
              >
                {soundEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
              </button>
            </div>
            
            {/* Large Digital Timer */}
            <div className={`text-4xl font-bold bg-stone-800 border-2 px-6 py-3 rounded-lg ${
              timeLeft <= 3 ? 'border-red-500 text-red-400 animate-pulse shadow-red-500/50 shadow-lg' : 
              timeLeft <= 5 ? 'border-orange-500 text-orange-400' :
              'border-orange-600 text-red-200'
            }`}>
              {timeLeft.toString().padStart(2, '0')}
            </div>
          </div>

          {/* Progress Bar - Smooth */}
          <div className="w-full h-3 bg-stone-800 overflow-hidden">
            <div 
              className={`h-full transition-all duration-1000 ease-linear transform origin-left ${
                timeLeft <= 3 ? 'bg-red-500' : 
                timeLeft <= 5 ? 'bg-orange-500' : 
                'bg-green-500'
              }`}
              style={{ 
                transform: `scaleX(${progress / 100})`,
                filter: timeLeft <= 3 ? 'drop-shadow(0 0 8px rgba(239, 68, 68, 0.8))' : 'none'
              }}
            ></div>
          </div>

          {/* Game Area */}
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="relative w-96 h-96">
              {/* Central Target Area */}
              <div className={`absolute inset-16 bg-red-800/20 backdrop-blur-lg border-4 border-red-600 rounded-full flex flex-col items-center justify-center shadow-2xl ${
                timeLeft <= 3 ? 'animate-pulse border-red-400' : ''
              }`}>
                <div className="text-5xl font-bold text-red-200 mb-2">
                  {target}
                </div>
                <div className="w-12 h-1 bg-red-500 rounded"></div>
                <div className="text-sm text-red-300 mt-2 font-bold">TARGET</div>
              </div>

              {/* Players arranged in circle with simple guns */}
              {players.map((player, index) => {
                const angle = (index * 360) / players.length;
                const radius = 180;
                const x = Math.cos((angle - 90) * Math.PI / 180) * radius;
                const y = Math.sin((angle - 90) * Math.PI / 180) * radius;
                const isActive = index === currentPlayer;
                const isBeingShot = shootingAnimation === player.id;
                
                return (
                  <div
                    key={player.id}
                    className={`absolute w-24 h-24 rounded-lg border-2 flex flex-col items-center justify-center text-xs transition-all ${
                      isActive ? 'bg-red-600/30 border-red-400 shadow-lg scale-110 animate-pulse' : 
                      player.lives <= 0 ? 'bg-stone-800/40 border-stone-600 opacity-50 grayscale' :
                      player.isBot ? 'bg-blue-800/40 border-blue-600' :
                      'bg-stone-800/60 border-orange-600'
                    } ${isBeingShot ? 'animate-bounce' : ''}`}
                    style={{
                      left: `calc(50% + ${x}px - 48px)`,
                      top: `calc(50% + ${y}px - 48px)`
                    }}
                  >
                    {/* Simple Gun Icon */}
                    <div className="absolute -top-2 -right-2 text-lg">
                      🔫
                    </div>
                    
                    {/* Player avatar */}
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-stone-100 font-bold text-sm mb-1 transition-all ${
                      player.isBot ? 'bg-blue-700' : 'bg-red-700'
                    } ${isBeingShot ? 'animate-pulse bg-red-900' : ''}`}>
                      {player.isBot ? <Bot className="w-5 h-5" /> : player.name.charAt(0)}
                    </div>
                    
                    {/* Player name */}
                    <div className="text-amber-100 text-center leading-tight font-medium">
                      {player.name.length > 8 ? player.name.substring(0, 8) + '...' : player.name}
                    </div>
                    
                    {/* Lives display */}
                    <div className="flex gap-1 mt-1">
                      {[...Array(Math.max(0, player.lives))].map((_, i) => (
                        <div key={i} className={`w-2 h-2 bg-red-500 rounded-full ${isBeingShot ? 'animate-pulse' : ''}`}></div>
                      ))}
                      {/* Show X marks for lost lives */}
                      {[...Array(Math.max(0, 3 - player.lives))].map((_, i) => (
                        <div key={`lost-${i}`} className="w-2 h-2 text-red-800 text-xs flex items-center justify-center">×</div>
                      ))}
                    </div>
                    
                    {/* Score */}
                    <div className="text-amber-400 text-xs font-bold">{player.score}</div>
                  </div>
                );
              })}

              {/* Turn indicator */}
              {players.length > 0 && (
                <div
                  className="absolute w-8 h-8 transition-transform duration-500"
                  style={{
                    left: 'calc(50% - 16px)',
                    top: 'calc(50% - 80px)',
                    transform: `rotate(${(currentPlayer * 360) / players.length}deg)`
                  }}
                >
                  <div className="w-0 h-0 border-l-4 border-r-4 border-b-8 border-l-transparent border-r-transparent border-b-red-400"></div>
                </div>
              )}
            </div>
          </div>

          {/* Input Area */}
          {isYourTurn && (
            <div className="p-6 bg-stone-900/80 backdrop-blur-lg border-t border-orange-700">
              <div className="max-w-lg mx-auto">
                <p className="text-center text-orange-300 mb-4 text-lg">
                  Your turn! Create a word containing: <span className="text-red-300 font-bold text-xl">{target}</span>
                </p>
                <div className="flex gap-4">
                  <input
                    ref={inputRef}
                    type="text"
                    value={currentWord}
                    onChange={(e) => setCurrentWord(e.target.value)}
                    onKeyPress={handleKeyPress}
                    className="flex-1 p-4 bg-stone-800/60 border border-orange-600 rounded-lg text-amber-100 placeholder-stone-400 focus:border-red-500 focus:outline-none transition-colors text-lg"
                    placeholder="Type your word..."
                    autoFocus
                  />
                  <button
                    onClick={() => submitWord(currentWord.trim())}
                    disabled={!currentWord.trim()}
                    className="px-8 py-4 bg-red-700 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-stone-100 font-bold rounded-lg transition-all transform hover:scale-105"
                  >
                    SUBMIT
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Used Words */}
          <div className="p-4 bg-stone-900/60 backdrop-blur-lg border-t border-orange-700">
            <div className="max-w-4xl mx-auto">
              <h4 className="font-bold mb-3 text-red-200 text-center">Used Words</h4>
              <div className="flex flex-wrap justify-center gap-2">
                {Array.from(usedWords).slice(-15).map(word => (
                  <span key={word} className="bg-stone-700 px-3 py-1 rounded text-amber-100 text-sm border border-orange-600">
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
      <div className="min-h-screen bg-gradient-to-br from-red-950 via-orange-900 to-amber-950 text-amber-100 flex items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-32 h-32 bg-red-600 rounded-full blur-3xl"></div>
          <div className="absolute bottom-20 right-20 w-40 h-40 bg-orange-600 rounded-full blur-3xl"></div>
        </div>
        
        <div className="relative z-10 text-center max-w-lg mx-auto p-8">
          <div className="bg-stone-900/80 backdrop-blur-lg border border-orange-700 rounded-lg p-8 shadow-2xl">
            <div className="text-6xl mb-6">💰</div>
            <h1 className="text-4xl font-bold mb-4 text-red-200">
              Heist Complete
            </h1>
            <div className="text-2xl mb-6 text-red-300 font-bold">
              Winner: {winner.name}
            </div>
            <div className="text-lg mb-6 text-amber-300">
              Score: {winner.score} points
            </div>
            
            <div className="bg-stone-800/60 border border-orange-600 rounded-lg p-6 mb-6">
              <h3 className="text-xl font-bold mb-4 text-red-200">Final Scores</h3>
              <div className="space-y-3">
                {players.sort((a, b) => b.score - a.score).map((player, index) => (
                  <div key={player.id} className="flex justify-between items-center p-3 bg-stone-700/40 rounded border border-orange-600">
                    <div className="flex items-center gap-3">
                      <span className="text-lg">{index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '🏅'}</span>
                      <div className="flex items-center gap-2">
                        {player.isBot && <Bot className="w-4 h-4 text-blue-400" />}
                        <span className="font-semibold text-amber-100">{player.name}</span>
                      </div>
                    </div>
                    <span className="font-bold text-amber-300">{player.score} pts</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <button 
                onClick={() => setGameState('lobby')}
                className="w-full px-6 py-3 bg-red-700 hover:bg-red-600 text-stone-100 font-bold rounded-lg transition-all"
              >
                Play Again
              </button>
              <button 
                onClick={leaveParty}
                className="w-full px-6 py-3 bg-stone-700 hover:bg-stone-600 text-amber-100 font-bold rounded-lg transition-all"
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