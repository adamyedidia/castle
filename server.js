import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Game state - now keyed by persistent playerId, not socketId
let gameState = {
  phase: 'lobby', // 'lobby' or 'playing'
  players: {},    // playerId -> { name, cards, revealedCards, submittedCardIndex, socketId }
  deck: [],
  duel: {
    challenger: null,
    defender: null
  }
};

// Map socket IDs to player IDs for quick lookup
const socketToPlayer = {};

// Card ranks for comparison (higher = better)
const RANK_ORDER = ['joker', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

function getRankValue(rank) {
  return RANK_ORDER.indexOf(rank);
}

// Create the 28-card deck
function createDeck() {
  const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const deck = [];

  // Add diamonds (red suit, red back)
  for (const rank of ranks) {
    deck.push({ rank, suit: 'diamonds', color: 'red', back: 'red' });
  }

  // Add spades (black suit, blue back)
  for (const rank of ranks) {
    deck.push({ rank, suit: 'spades', color: 'black', back: 'blue' });
  }

  // Add jokers
  deck.push({ rank: 'joker', suit: 'joker', color: 'red', back: 'red' });
  deck.push({ rank: 'joker', suit: 'joker', color: 'black', back: 'blue' });

  return deck;
}

// Shuffle array in place
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// Deal cards ensuring each player gets 2-1 color split
function dealCards(playerIds) {
  const deck = shuffle(createDeck());
  const hands = {};

  for (const playerId of playerIds) {
    hands[playerId] = [];
  }

  // First, deal 2 cards to each player
  for (const playerId of playerIds) {
    hands[playerId].push(deck.pop());
    hands[playerId].push(deck.pop());
  }

  // Then deal the 3rd card, ensuring 2-1 color split
  for (const playerId of playerIds) {
    const currentBacks = hands[playerId].map(c => c.back);
    const redCount = currentBacks.filter(b => b === 'red').length;
    const blueCount = currentBacks.filter(b => b === 'blue').length;

    let neededBack = null;
    if (redCount === 2) neededBack = 'blue';
    else if (blueCount === 2) neededBack = 'red';

    if (neededBack) {
      const idx = deck.findIndex(c => c.back === neededBack);
      if (idx !== -1) {
        hands[playerId].push(deck.splice(idx, 1)[0]);
      } else {
        hands[playerId].push(deck.pop());
      }
    } else {
      hands[playerId].push(deck.pop());
    }
  }

  return hands;
}

// Determine soul card for a hand
function getSoulCard(cards) {
  const sorted = [...cards].sort((a, b) => getRankValue(b.rank) - getRankValue(a.rank));

  if (sorted.length >= 2 && getRankValue(sorted[0].rank) === getRankValue(sorted[1].rank)) {
    return sorted[2];
  }

  return sorted[0];
}

// Get team for a player based on soul card
function getTeam(cards) {
  const soulCard = getSoulCard(cards);
  return soulCard.color;
}

// Resolve a duel
function resolveDuel(card1, card2) {
  const rank1 = getRankValue(card1.rank);
  const rank2 = getRankValue(card2.rank);

  if (rank1 === rank2) {
    return 'tie';
  }

  if (card1.rank === 'joker') {
    const faceCards = ['J', 'Q', 'K', 'A'];
    return faceCards.includes(card2.rank) ? 'player1' : 'player2';
  }
  if (card2.rank === 'joker') {
    const faceCards = ['J', 'Q', 'K', 'A'];
    return faceCards.includes(card1.rank) ? 'player2' : 'player1';
  }

  return rank1 > rank2 ? 'player1' : 'player2';
}

// Get player ID from socket
function getPlayerId(socket) {
  return socketToPlayer[socket.id];
}

// Get public game state (what everyone can see)
function getPublicState() {
  const players = {};
  for (const [id, player] of Object.entries(gameState.players)) {
    const revealedCardsData = (player.revealedCards || []).map(idx => ({
      index: idx,
      card: player.cards ? player.cards[idx] : null
    }));

    players[id] = {
      name: player.name,
      cardCount: player.cards ? player.cards.length : 0,
      revealedCards: player.revealedCards || [],
      revealedCardsData: revealedCardsData,
      cardBacks: player.cards ? player.cards.map(c => c.back) : [],
      hasSubmitted: player.submittedCardIndex !== null && player.submittedCardIndex !== undefined,
      submittedCardIndex: player.submittedCardIndex,
      connected: !!player.socketId
    };
  }

  return {
    phase: gameState.phase,
    players,
    duel: gameState.duel
  };
}

// Get private state for a specific player
function getPrivateState(playerId) {
  const player = gameState.players[playerId];
  if (!player) return null;

  return {
    cards: player.cards || [],
    soulCard: player.cards && player.cards.length ? getSoulCard(player.cards) : null,
    team: player.cards && player.cards.length ? getTeam(player.cards) : null
  };
}

// Send state to a specific player by their playerId
function sendStateToPlayer(playerId) {
  const player = gameState.players[playerId];
  if (player && player.socketId) {
    io.to(player.socketId).emit('gameState', getPublicState());
    io.to(player.socketId).emit('privateState', getPrivateState(playerId));
    io.to(player.socketId).emit('yourPlayerId', playerId);
  }
}

io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  // Send current state to new connection
  socket.emit('gameState', getPublicState());

  // Player joins or reconnects with their persistent ID
  socket.on('joinLobby', ({ playerId, name }) => {
    // Check if this player already exists (reconnecting)
    if (gameState.players[playerId]) {
      // Reconnecting - update socket ID
      const player = gameState.players[playerId];
      const oldSocketId = player.socketId;

      // Clean up old socket mapping
      if (oldSocketId) {
        delete socketToPlayer[oldSocketId];
      }

      player.socketId = socket.id;
      socketToPlayer[socket.id] = playerId;

      console.log(`${player.name} reconnected (${playerId})`);

      // Send them their state
      sendStateToPlayer(playerId);
      io.emit('gameState', getPublicState());
    } else {
      // New player joining lobby
      if (gameState.phase !== 'lobby') {
        socket.emit('error', 'Game already in progress');
        return;
      }

      gameState.players[playerId] = {
        name,
        cards: [],
        revealedCards: [],
        submittedCardIndex: null,
        socketId: socket.id
      };
      socketToPlayer[socket.id] = playerId;

      console.log(`${name} joined the lobby (${playerId})`);
      io.emit('gameState', getPublicState());
      socket.emit('yourPlayerId', playerId);
    }
  });

  // Start the game
  socket.on('startGame', () => {
    const playerIds = Object.keys(gameState.players);
    if (playerIds.length < 2) {
      socket.emit('error', 'Need at least 2 players to start');
      return;
    }

    const hands = dealCards(playerIds);

    for (const playerId of playerIds) {
      gameState.players[playerId].cards = hands[playerId];
      gameState.players[playerId].revealedCards = [];
      gameState.players[playerId].submittedCardIndex = null;
    }

    gameState.phase = 'playing';
    gameState.duel = { challenger: null, defender: null };

    // Send public state to everyone
    io.emit('gameState', getPublicState());

    // Send private state to each player
    for (const playerId of playerIds) {
      const player = gameState.players[playerId];
      if (player.socketId) {
        io.to(player.socketId).emit('privateState', getPrivateState(playerId));
      }
    }

    console.log('Game started!');
  });

  // Submit card for duel
  socket.on('submitForDuel', (cardIndex) => {
    const playerId = getPlayerId(socket);
    const player = gameState.players[playerId];
    if (!player || gameState.phase !== 'playing') return;

    if (player.revealedCards.includes(cardIndex)) {
      socket.emit('error', 'Cannot submit a revealed card');
      return;
    }

    player.submittedCardIndex = cardIndex;

    const submittedPlayers = Object.entries(gameState.players)
      .filter(([_, p]) => p.submittedCardIndex !== null && p.submittedCardIndex !== undefined);

    if (submittedPlayers.length === 2) {
      const [[id1, p1], [id2, p2]] = submittedPlayers;
      const card1 = p1.cards[p1.submittedCardIndex];
      const card2 = p2.cards[p2.submittedCardIndex];

      const result = resolveDuel(card1, card2);

      let duelResult = {
        challenger: { id: id1, name: p1.name, cardIndex: p1.submittedCardIndex },
        defender: { id: id2, name: p2.name, cardIndex: p2.submittedCardIndex },
        result
      };

      if (result === 'player1') {
        p2.revealedCards.push(p2.submittedCardIndex);
        duelResult.loser = id2;
        duelResult.revealedCard = card2;
      } else if (result === 'player2') {
        p1.revealedCards.push(p1.submittedCardIndex);
        duelResult.loser = id1;
        duelResult.revealedCard = card1;
      }

      p1.submittedCardIndex = null;
      p2.submittedCardIndex = null;

      io.emit('duelResult', duelResult);
    }

    io.emit('gameState', getPublicState());
  });

  // Unsubmit card
  socket.on('unsubmitForDuel', () => {
    const playerId = getPlayerId(socket);
    const player = gameState.players[playerId];
    if (!player) return;

    player.submittedCardIndex = null;
    io.emit('gameState', getPublicState());
  });

  // End game - return to lobby
  socket.on('endGame', () => {
    gameState.phase = 'lobby';
    for (const player of Object.values(gameState.players)) {
      player.cards = [];
      player.revealedCards = [];
      player.submittedCardIndex = null;
    }
    gameState.duel = { challenger: null, defender: null };

    io.emit('gameState', getPublicState());
    console.log('Game ended, returning to lobby');
  });

  // Kick a player from the lobby
  socket.on('kickPlayer', (playerId) => {
    if (gameState.phase !== 'lobby') {
      socket.emit('error', 'Can only kick players in the lobby');
      return;
    }

    const player = gameState.players[playerId];
    if (player) {
      console.log(`${player.name} was kicked from the lobby`);
      if (player.socketId) {
        io.to(player.socketId).emit('kicked');
        delete socketToPlayer[player.socketId];
      }
      delete gameState.players[playerId];
      io.emit('gameState', getPublicState());
    }
  });

  // Handle disconnect - don't remove player, just mark as disconnected
  socket.on('disconnect', () => {
    const playerId = socketToPlayer[socket.id];
    if (playerId && gameState.players[playerId]) {
      const player = gameState.players[playerId];
      console.log(`${player.name} disconnected (will remain in game)`);
      player.socketId = null;
      delete socketToPlayer[socket.id];
      io.emit('gameState', getPublicState());
    }
  });
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
