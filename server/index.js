const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// Updated CORS for production deployment
const io = socketIo(server, {
  cors: {
    origin: [
      "http://localhost:3000",
      "https://playrobbery.vercel.app", // Your actual Vercel domain
    ],
    methods: ["GET", "POST"],
    credentials: true
  }
});

app.use(cors({
  origin: [
    "http://localhost:3000",
    "https://playrobbery.vercel.app"
  ],
  credentials: true
}));

app.use(express.json());

// Health check endpoint for Render
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    games: games.size,
    players: playerSockets.size
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'ROBBERY Game Server is running!',
    games: games.size,
    players: playerSockets.size
  });
});

// Game state storage
const games = new Map();
const playerSockets = new Map();

// Helper functions
function generatePartyCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Updated with harder letter combinations
function getRandomTarget() {
  const targets = [
    // Easy 2-letter combinations
    'BL', 'ST', 'ER', 'TH', 'CH', 'SH', 'WH', 'LY', 'ED', 'UN', 'RE',
    
    // Medium 2-letter combinations  
    'QU', 'PH', 'GH', 'CK', 'DG', 'NK', 'MP', 'NT', 'ND', 'NG', 'RD', 'LD', 'LT', 'PT', 'CT',
    
    // Hard 2-letter combinations
    'ZE', 'ZI', 'ZA', 'ZO', 'YN', 'YM', 'YP', 'YT', 'XY', 'WR', 'PS', 'PN',
    
    // 3-letter combinations
    'ING', 'ION', 'NDE', 'TLE', 'BLE', 'PLE', 'CLE', 'GLE', 'TCH', 'DGE', 'GHT', 'OUG',
    
    // Hard 3-letter combinations
    'ESS', 'ENT', 'ANT', 'NCE', 'ATE', 'IVE', 'URE', 'ARD', 'ORD', 'IRD', 'AST', 'EST', 'IST',
    
    // Very hard 4+ letter combinations
    'TION', 'SION', 'NESS', 'MENT', 'ABLE', 'IBLE', 'WARD', 'SHIP', 'HOOD', 'OUGH', 'IGHT'
  ];
  
  return targets[Math.floor(Math.random() * targets.length)];
}

// Socket connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Create party
  socket.on('createParty', (playerName) => {
    const partyCode = generatePartyCode();
    const gameState = {
      code: partyCode,
      host: socket.id,
      players: [{
        id: socket.id,
        name: playerName,
        score: 0,
        lives: 3,
        isHost: true,
        isBot: false,
        currentlyTyping: '' // Add typing state
      }],
      gameState: 'lobby',
      currentPlayer: 0,
      target: '',
      timeLeft: 15,
      maxTime: 15,
      round: 1,
      usedWords: [], // Changed from Set to Array
      chatMessages: []
    };
    
    games.set(partyCode, gameState);
    playerSockets.set(socket.id, partyCode);
    socket.join(partyCode);
    
    socket.emit('partyCreated', { partyCode, gameState });
  });

  // Join party
  socket.on('joinParty', ({ playerName, partyCode }) => {
    const game = games.get(partyCode);
    if (!game) {
      socket.emit('error', 'Party not found');
      return;
    }

    const newPlayer = {
      id: socket.id,
      name: playerName,
      score: 0,
      lives: 3,
      isHost: false,
      isBot: false,
      currentlyTyping: '' // Add typing state
    };

    game.players.push(newPlayer);
    playerSockets.set(socket.id, partyCode);
    socket.join(partyCode);

    io.to(partyCode).emit('gameStateUpdate', game);
    io.to(partyCode).emit('chatMessage', {
      type: 'system',
      message: `${playerName} joined the game`,
      timestamp: Date.now()
    });
  });

  // NEW: Handle real-time typing updates
  socket.on('typingUpdate', ({ word }) => {
    const partyCode = playerSockets.get(socket.id);
    const game = games.get(partyCode);
    
    if (!game) return;
    
    // Update the player's current typing
    const player = game.players.find(p => p.id === socket.id);
    if (player) {
      player.currentlyTyping = word;
      
      // Broadcast to all players in the party
      io.to(partyCode).emit('playerTypingUpdate', {
        playerId: socket.id,
        word: word
      });
    }
  });

  // Add bot
  socket.on('addBot', () => {
    const partyCode = playerSockets.get(socket.id);
    const game = games.get(partyCode);
    
    if (!game || game.host !== socket.id) return;

    const botNames = ['MAVERICK', 'DAKOTA', 'PHOENIX', 'STERLING'];
    const availableBots = botNames.filter(name => 
      !game.players.some(p => p.name === name)
    );

    if (availableBots.length > 0) {
      const newBot = {
        id: `bot-${Date.now()}`,
        name: availableBots[0],
        score: 0,
        lives: 3,
        isHost: false,
        isBot: true,
        currentlyTyping: '' // Add typing state
      };

      game.players.push(newBot);
      io.to(partyCode).emit('gameStateUpdate', game);
    }
  });

  // Start game
  socket.on('startGame', () => {
    const partyCode = playerSockets.get(socket.id);
    const game = games.get(partyCode);
    
    if (!game || game.host !== socket.id) return;

    // Clear any existing timer first
    if (game.timerId) {
      clearInterval(game.timerId);
      game.timerId = null;
    }

    // Reset ALL game state completely
    game.gameState = 'playing';
    game.target = getRandomTarget();
    game.currentPlayer = 0;
    game.usedWords = []; // Reset as empty array
    game.round = 1; // Reset round counter
    game.timeLeft = game.maxTime; // Reset timer
    game.turnsThisRound = 0; // Track turns in current round
    game.playersAliveAtRoundStart = 0; // Track how many players started the round
    
    // Reset all player stats for new game - VERY IMPORTANT
    game.players.forEach(player => {
      player.lives = 3;           // Reset lives to 3
      player.score = 0;           // Reset score to 0
      player.currentlyTyping = ''; // Clear typing state
    });
    
    // Count alive players for round tracking
    game.playersAliveAtRoundStart = game.players.filter(p => p.lives > 0).length;
    
    // Send updated game state FIRST
    io.to(partyCode).emit('gameStateUpdate', game);
    
    // Small delay to ensure state is updated before starting timer
    setTimeout(() => {
      startGameTimer(partyCode);
    }, 100);
  });

  // Submit word with validation
  socket.on('submitWord', (word) => {
    const partyCode = playerSockets.get(socket.id);
    const game = games.get(partyCode);
    
    if (!game || game.gameState !== 'playing') return;
    
    const currentPlayerData = game.players[game.currentPlayer];
    if (currentPlayerData.id !== socket.id) return;

    // Clear the player's typing state
    currentPlayerData.currentlyTyping = '';
    io.to(partyCode).emit('playerTypingUpdate', {
      playerId: socket.id,
      word: ''
    });

    // Basic validation (target contains check already done on client)
    const isValid = word.length >= 3 && 
                   word.toLowerCase().includes(game.target.toLowerCase()) &&
                   !game.usedWords.includes(word.toLowerCase());

    if (isValid) {
      game.usedWords.push(word.toLowerCase());
      currentPlayerData.score += word.length;
      
      io.to(partyCode).emit('chatMessage', {
        type: 'success',
        message: `"${word}" earned ${word.length} points!`,
        playerName: currentPlayerData.name,
        timestamp: Date.now()
      });
      
      nextTurn(partyCode);
    } else {
      // Invalid word, but client handles attempts
      currentPlayerData.lives--;
      io.to(partyCode).emit('playerEliminated', currentPlayerData.id);
      
      setTimeout(() => {
        nextTurn(partyCode);
      }, 1000);
    }
  });

  // Handle when player runs out of attempts
  socket.on('outOfAttempts', () => {
    const partyCode = playerSockets.get(socket.id);
    const game = games.get(partyCode);
    
    if (!game || game.gameState !== 'playing') return;
    
    const currentPlayerData = game.players[game.currentPlayer];
    if (currentPlayerData.id !== socket.id) return;

    // Clear the player's typing state
    currentPlayerData.currentlyTyping = '';
    io.to(partyCode).emit('playerTypingUpdate', {
      playerId: socket.id,
      word: ''
    });

    // Player loses a life for running out of attempts
    currentPlayerData.lives--;
    
    io.to(partyCode).emit('chatMessage', {
      type: 'error',
      message: `${currentPlayerData.name} ran out of attempts!`,
      timestamp: Date.now()
    });
    
    io.to(partyCode).emit('playerEliminated', currentPlayerData.id);
    
    setTimeout(() => {
      nextTurn(partyCode);
    }, 1000);
  });

  // NEW: Handle timer duration updates
  socket.on('updateTimerDuration', (newMaxTime) => {
    const partyCode = playerSockets.get(socket.id);
    const game = games.get(partyCode);
    
    if (!game || game.host !== socket.id) return;

    game.maxTime = newMaxTime;
    
    // Broadcast to all players
    io.to(partyCode).emit('timerDurationUpdate', newMaxTime);
  });

  // Chat message
  socket.on('chatMessage', (message) => {
    const partyCode = playerSockets.get(socket.id);
    const game = games.get(partyCode);
    
    if (!game) return;
    
    const player = game.players.find(p => p.id === socket.id);
    
    io.to(partyCode).emit('chatMessage', {
      type: 'player',
      message,
      playerName: player.name,
      timestamp: Date.now()
    });
  });

  // Disconnect - IMPROVED with better game state handling
  socket.on('disconnect', () => {
    console.log(`Player ${socket.id} disconnected`);
    
    const partyCode = playerSockets.get(socket.id);
    if (partyCode) {
      const game = games.get(partyCode);
      if (game) {
        const disconnectedPlayer = game.players.find(p => p.id === socket.id);
        const wasCurrentPlayer = game.currentPlayer < game.players.length && 
                                 game.players[game.currentPlayer]?.id === socket.id;
        
        console.log(`Disconnected player: ${disconnectedPlayer?.name}, was current: ${wasCurrentPlayer}`);
        
        // Remove the disconnected player
        game.players = game.players.filter(p => p.id !== socket.id);
        
        // Update current player index if needed
        if (wasCurrentPlayer && game.gameState === 'playing') {
          // Clear any existing timer
          if (game.timerId) {
            clearInterval(game.timerId);
            game.timerId = null;
          }
          
          // Adjust current player index if necessary
          if (game.currentPlayer >= game.players.length) {
            game.currentPlayer = 0;
          }
          
          // Check if we still have enough players to continue
          const alivePlayers = game.players.filter(p => p.lives > 0);
          if (alivePlayers.length <= 1) {
            console.log('Not enough players after disconnect, ending game');
            game.gameState = 'finished';
            io.to(partyCode).emit('gameStateUpdate', game);
          } else {
            // Find next alive player
            let attempts = 0;
            while (game.players[game.currentPlayer]?.lives <= 0 && attempts < game.players.length) {
              game.currentPlayer = (game.currentPlayer + 1) % game.players.length;
              attempts++;
            }
            
            // If we found a valid player, continue the game
            if (attempts < game.players.length && game.players[game.currentPlayer]?.lives > 0) {
              game.target = getRandomTarget();
              game.timeLeft = game.maxTime;
              
              // Update turn tracking for rounds
              if (game.playersAliveAtRoundStart) {
                game.playersAliveAtRoundStart = alivePlayers.length;
              }
              
              io.to(partyCode).emit('gameStateUpdate', game);
              
              io.to(partyCode).emit('chatMessage', {
                type: 'system',
                message: `${disconnectedPlayer?.name || 'Player'} disconnected. ${game.players[game.currentPlayer]?.name}'s turn!`,
                timestamp: Date.now()
              });
              
              // Handle bot turn or start timer
              if (game.players[game.currentPlayer]?.isBot) {
                handleBotTurn(partyCode);
              } else {
                startGameTimer(partyCode);
              }
            } else {
              // Couldn't find valid player, end game
              game.gameState = 'finished';
              io.to(partyCode).emit('gameStateUpdate', game);
            }
          }
        } else {
          // Player wasn't current, just update the game state
          // Update turn tracking if needed
          if (game.gameState === 'playing' && game.playersAliveAtRoundStart) {
            const alivePlayers = game.players.filter(p => p.lives > 0);
            game.playersAliveAtRoundStart = alivePlayers.length;
          }
        }
        
        // Handle empty game or host transfer
        if (game.players.length === 0) {
          console.log('No players left, deleting game');
          games.delete(partyCode);
        } else {
          // Transfer host if needed
          if (game.host === socket.id) {
            const newHost = game.players.find(p => !p.isBot);
            if (newHost) {
              game.host = newHost.id;
              newHost.isHost = true;
              console.log(`Host transferred to: ${newHost.name}`);
            }
          }
          
          // Always emit updated game state
          io.to(partyCode).emit('gameStateUpdate', game);
          
          if (disconnectedPlayer) {
            io.to(partyCode).emit('chatMessage', {
              type: 'system',
              message: `${disconnectedPlayer.name} left the game`,
              timestamp: Date.now()
            });
          }
        }
      }
      playerSockets.delete(socket.id);
    }
  });
});

// Game timer function
function startGameTimer(partyCode) {
  const game = games.get(partyCode);
  if (!game || game.gameState !== 'playing') return;

  // Clear any existing timer first
  if (game.timerId) {
    clearInterval(game.timerId);
  }

  // Make sure we have alive players before starting
  const alivePlayers = game.players.filter(p => p.lives > 0);
  if (alivePlayers.length <= 1) {
    console.log('Not enough alive players to start timer');
    return;
  }

  console.log(`Starting timer for party ${partyCode}, time: ${game.timeLeft}`);

  const timer = setInterval(() => {
    game.timeLeft--;
    
    if (game.timeLeft <= 0) {
      clearInterval(timer);
      
      // Current player loses a life
      const currentPlayer = game.players[game.currentPlayer];
      if (currentPlayer) {
        currentPlayer.lives--;
        
        // Clear typing state
        currentPlayer.currentlyTyping = '';
        io.to(partyCode).emit('playerTypingUpdate', {
          playerId: currentPlayer.id,
          word: ''
        });
        
        io.to(partyCode).emit('playerEliminated', currentPlayer.id);
        
        setTimeout(() => {
          nextTurn(partyCode);
        }, 1000);
      }
    } else {
      io.to(partyCode).emit('timerUpdate', game.timeLeft);
    }
  }, 1000);

  game.timerId = timer;
}

function nextTurn(partyCode) {
  const game = games.get(partyCode);
  if (!game) return;

  console.log(`Next turn called for party ${partyCode}`);

  // Clear existing timer
  if (game.timerId) {
    clearInterval(game.timerId);
  }

  // Increment turns this round
  game.turnsThisRound = (game.turnsThisRound || 0) + 1;

  // Check current alive players
  const alivePlayers = game.players.filter(p => p.lives > 0);
  console.log(`Alive players: ${alivePlayers.length}`, alivePlayers.map(p => `${p.name}:${p.lives}`));
  
  // Only end game if 1 or fewer players alive
  if (alivePlayers.length <= 1) {
    console.log('Game ending - not enough alive players');
    game.gameState = 'finished';
    io.to(partyCode).emit('gameStateUpdate', game);
    return;
  }

  // Check if round is complete (everyone has had their turn)
  if (game.turnsThisRound >= game.playersAliveAtRoundStart) {
    console.log(`Round ${game.round} complete! Processing round end...`);
    
    // ROUND END PROCESSING
    // Find player(s) with lowest score among alive players
    const alivePlayersWithScores = alivePlayers.map(p => ({ 
      player: p, 
      score: p.score 
    }));
    
    const lowestScore = Math.min(...alivePlayersWithScores.map(p => p.score));
    const lowestScorers = alivePlayersWithScores.filter(p => p.score === lowestScore);
    
    console.log(`Lowest score this round: ${lowestScore}`);
    console.log(`Players with lowest score:`, lowestScorers.map(p => p.player.name));
    
    // Deduct life from lowest scorer(s)
    lowestScorers.forEach(({ player }) => {
      player.lives--;
      console.log(`${player.name} loses a life for lowest score. Lives remaining: ${player.lives}`);
      
      // Emit elimination animation for each lowest scorer
      io.to(partyCode).emit('playerEliminated', player.id);
      
      // Clear their typing state
      player.currentlyTyping = '';
      io.to(partyCode).emit('playerTypingUpdate', {
        playerId: player.id,
        word: ''
      });
    });
    
    // Send updated game state after life deductions
    io.to(partyCode).emit('gameStateUpdate', game);
    
    // Announce round results
    if (lowestScorers.length === 1) {
      io.to(partyCode).emit('chatMessage', {
        type: 'system',
        message: `💀 Round ${game.round} complete! ${lowestScorers[0].player.name} had the lowest score (${lowestScore}) and loses a life!`,
        timestamp: Date.now()
      });
    } else {
      const names = lowestScorers.map(p => p.player.name).join(', ');
      io.to(partyCode).emit('chatMessage', {
        type: 'system',
        message: `💀 Round ${game.round} complete! ${names} tied for lowest score (${lowestScore}) and each lose a life!`,
        timestamp: Date.now()
      });
    }
    
    // Check if we need to end the game after life deduction
    const remainingAlivePlayers = game.players.filter(p => p.lives > 0);
    if (remainingAlivePlayers.length <= 1) {
      console.log('Game ending after round - not enough alive players');
      
      // Small delay to show elimination animation
      setTimeout(() => {
        game.gameState = 'finished';
        io.to(partyCode).emit('gameStateUpdate', game);
      }, 2000);
      return;
    }
    
    // START NEW ROUND
    setTimeout(() => {
      game.round++; // Increment round number
      game.turnsThisRound = 0; // Reset turn counter
      game.playersAliveAtRoundStart = remainingAlivePlayers.length; // Update alive count
      game.target = getRandomTarget(); // New target for new round
      
      console.log(`Starting Round ${game.round} with ${game.playersAliveAtRoundStart} players`);
      
      // Send updated game state with new round number
      io.to(partyCode).emit('gameStateUpdate', game);
      
      // Announce new round
      io.to(partyCode).emit('chatMessage', {
        type: 'success',
        message: `🎯 Round ${game.round} begins! Target: ${game.target}`,
        timestamp: Date.now()
      });
      
      // Continue with next player
      proceedWithNextPlayer();
      
    }, 2500); // Delay to allow elimination animations to play
    
    return; // Exit here to wait for the timeout
  }
  
  // If round is NOT complete, just proceed to next player
  proceedWithNextPlayer();
  
  function proceedWithNextPlayer() {
    // Find next alive player
    let attempts = 0;
    let nextPlayer = (game.currentPlayer + 1) % game.players.length;
    
    // Safety check to prevent infinite loop
    while (game.players[nextPlayer].lives <= 0 && attempts < game.players.length) {
      nextPlayer = (nextPlayer + 1) % game.players.length;
      attempts++;
    }

    // If we couldn't find an alive player, end the game
    if (attempts >= game.players.length || game.players[nextPlayer].lives <= 0) {
      console.log('Could not find alive player, ending game');
      game.gameState = 'finished';
      io.to(partyCode).emit('gameStateUpdate', game);
      return;
    }

    game.currentPlayer = nextPlayer;
    
    // Only set new target if we're not in a new round (new round already set target)
    if (game.turnsThisRound > 0) {
      game.target = getRandomTarget();
    }
    
    game.timeLeft = game.maxTime;

    // Clear all typing states for new turn
    game.players.forEach(player => {
      player.currentlyTyping = '';
    });

    console.log(`Next player: ${game.players[nextPlayer].name}, target: ${game.target}, round: ${game.round}, turn: ${game.turnsThisRound}/${game.playersAliveAtRoundStart}`);

    io.to(partyCode).emit('gameStateUpdate', game);
    
    // Handle bot turn
    if (game.players[nextPlayer].isBot) {
      handleBotTurn(partyCode);
    } else {
      startGameTimer(partyCode);
    }
  }
}

function handleBotTurn(partyCode) {
  const game = games.get(partyCode);
  const bot = game.players[game.currentPlayer];
  
  setTimeout(() => {
    const westernWords = ['horse', 'trail', 'dust', 'silver', 'sheriff', 'the', 'and', 'water', 'ranger', 'bullet', 'outlaw', 'canyon', 'desert', 'saloon'];
    const validWords = westernWords.filter(word => 
      word.includes(game.target.toLowerCase()) && !game.usedWords.includes(word)
    );
    
    if (validWords.length > 0 && Math.random() > 0.1) {
      const word = validWords[0];
      game.usedWords.push(word);
      bot.score += word.length;
      
      io.to(partyCode).emit('chatMessage', {
        type: 'success',
        message: `"${word}" earned ${word.length} points!`,
        playerName: bot.name,
        timestamp: Date.now()
      });
    } else {
      bot.lives--;
      io.to(partyCode).emit('playerEliminated', bot.id);
    }
    
    setTimeout(() => {
      nextTurn(partyCode);
    }, 1000);
  }, 2000);
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});