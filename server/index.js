const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

// Game state storage
const games = new Map();
const playerSockets = new Map();

// Helper functions
function generatePartyCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function getRandomTarget() {
  const targets = ['BL', 'ST', 'ER', 'ING', 'ED', 'LY', 'UN', 'RE', 'TH', 'CH'];
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
        isBot: false
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
      isBot: false
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
        isBot: true
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

    game.gameState = 'playing';
    game.target = getRandomTarget();
    game.currentPlayer = 0;
    game.usedWords = []; // Reset as empty array
    
    io.to(partyCode).emit('gameStateUpdate', game);
    
    // Start timer
    startGameTimer(partyCode);
  });

  // Submit word with validation
  socket.on('submitWord', (word) => {
    const partyCode = playerSockets.get(socket.id);
    const game = games.get(partyCode);
    
    if (!game || game.gameState !== 'playing') return;
    
    const currentPlayerData = game.players[game.currentPlayer];
    if (currentPlayerData.id !== socket.id) return;

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

  // Disconnect
  socket.on('disconnect', () => {
    const partyCode = playerSockets.get(socket.id);
    if (partyCode) {
      const game = games.get(partyCode);
      if (game) {
        game.players = game.players.filter(p => p.id !== socket.id);
        
        if (game.players.length === 0) {
          games.delete(partyCode);
        } else {
          // Transfer host if needed
          if (game.host === socket.id) {
            const newHost = game.players.find(p => !p.isBot);
            if (newHost) {
              game.host = newHost.id;
              newHost.isHost = true;
            }
          }
          io.to(partyCode).emit('gameStateUpdate', game);
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

  const timer = setInterval(() => {
    game.timeLeft--;
    
    if (game.timeLeft <= 0) {
      clearInterval(timer);
      
      // Current player loses a life
      const currentPlayer = game.players[game.currentPlayer];
      currentPlayer.lives--;
      
      io.to(partyCode).emit('playerEliminated', currentPlayer.id);
      
      setTimeout(() => {
        nextTurn(partyCode);
      }, 1000);
    } else {
      io.to(partyCode).emit('timerUpdate', game.timeLeft);
    }
  }, 1000);

  game.timerId = timer;
}

function nextTurn(partyCode) {
  const game = games.get(partyCode);
  if (!game) return;

  // Clear existing timer
  if (game.timerId) {
    clearInterval(game.timerId);
  }

  // Check for game end
  const alivePlayers = game.players.filter(p => p.lives > 0);
  if (alivePlayers.length <= 1) {
    game.gameState = 'finished';
    io.to(partyCode).emit('gameStateUpdate', game);
    return;
  }

  // Find next alive player
  let nextPlayer = (game.currentPlayer + 1) % game.players.length;
  while (game.players[nextPlayer].lives <= 0) {
    nextPlayer = (nextPlayer + 1) % game.players.length;
  }

  game.currentPlayer = nextPlayer;
  game.target = getRandomTarget();
  game.timeLeft = game.maxTime;

  io.to(partyCode).emit('gameStateUpdate', game);
  
  // Handle bot turn
  if (game.players[nextPlayer].isBot) {
    handleBotTurn(partyCode);
  } else {
    startGameTimer(partyCode);
  }
}

function handleBotTurn(partyCode) {
  const game = games.get(partyCode);
  const bot = game.players[game.currentPlayer];
  
  setTimeout(() => {
    const westernWords = ['horse', 'trail', 'dust', 'silver', 'sheriff', 'the', 'and', 'water'];
    const validWords = westernWords.filter(word => 
      word.includes(game.target.toLowerCase()) && !game.usedWords.includes(word) // Changed to use includes
    );
    
    if (validWords.length > 0 && Math.random() > 0.1) {
      const word = validWords[0];
      game.usedWords.push(word); // Changed to push to array
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
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});