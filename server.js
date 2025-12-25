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

// Game state
let gameState = {
  phase: 'lobby', // 'lobby' or 'playing'
  players: {},    // socketId -> { name, cards, revealedCards, submittedCard }
  deck: [],
  duel: {         // Current duel state
    challenger: null,
    defender: null
  }
};

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

    // Need a card of the minority color
    let neededBack = null;
    if (redCount === 2) neededBack = 'blue';
    else if (blueCount === 2) neededBack = 'red';
    // If already 1-1, any card works

    if (neededBack) {
      // Find a card of the needed back color
      const idx = deck.findIndex(c => c.back === neededBack);
      if (idx !== -1) {
        hands[playerId].push(deck.splice(idx, 1)[0]);
      } else {
        // Fallback: just take any card
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

  // Check for ties at highest rank
  if (sorted.length >= 2 && getRankValue(sorted[0].rank) === getRankValue(sorted[1].rank)) {
    // Two highest cards tie, so the third card is the soul card
    return sorted[2];
  }

  // Otherwise, highest rank is soul card
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

  // Same rank = tie
  if (rank1 === rank2) {
    return 'tie';
  }

  // Handle jokers
  if (card1.rank === 'joker') {
    // Joker beats face cards and aces (J, Q, K, A)
    const faceCards = ['J', 'Q', 'K', 'A'];
    return faceCards.includes(card2.rank) ? 'player1' : 'player2';
  }
  if (card2.rank === 'joker') {
    const faceCards = ['J', 'Q', 'K', 'A'];
    return faceCards.includes(card1.rank) ? 'player2' : 'player1';
  }

  // Normal comparison
  return rank1 > rank2 ? 'player1' : 'player2';
}

// Get public game state (what everyone can see)
function getPublicState() {
  const players = {};
  for (const [id, player] of Object.entries(gameState.players)) {
    // Build revealed cards with full card data
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
      submittedCardIndex: player.submittedCardIndex
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
    soulCard: player.cards ? getSoulCard(player.cards) : null,
    team: player.cards ? getTeam(player.cards) : null
  };
}

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  // Send current state to new player
  socket.emit('gameState', getPublicState());

  // Player joins the lobby
  socket.on('joinLobby', (name) => {
    gameState.players[socket.id] = {
      name,
      cards: [],
      revealedCards: [],
      submittedCardIndex: null
    };
    io.emit('gameState', getPublicState());
    console.log(`${name} joined the lobby`);
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
      io.to(playerId).emit('privateState', getPrivateState(playerId));
    }

    console.log('Game started!');
  });

  // Submit card for duel
  socket.on('submitForDuel', (cardIndex) => {
    const player = gameState.players[socket.id];
    if (!player || gameState.phase !== 'playing') return;

    // Check if card is already revealed
    if (player.revealedCards.includes(cardIndex)) {
      socket.emit('error', 'Cannot submit a revealed card');
      return;
    }

    player.submittedCardIndex = cardIndex;

    // Check if two players have submitted
    const submittedPlayers = Object.entries(gameState.players)
      .filter(([_, p]) => p.submittedCardIndex !== null && p.submittedCardIndex !== undefined);

    if (submittedPlayers.length === 2) {
      // Duel happens!
      const [[id1, p1], [id2, p2]] = submittedPlayers;
      const card1 = p1.cards[p1.submittedCardIndex];
      const card2 = p2.cards[p2.submittedCardIndex];

      const result = resolveDuel(card1, card2);

      let duelResult = {
        challenger: { id: id1, name: p1.name, cardIndex: p1.submittedCardIndex },
        defender: { id: id2, name: p2.name, cardIndex: p2.submittedCardIndex },
        result
      };

      // Reveal loser's card
      if (result === 'player1') {
        // Player 2 lost
        p2.revealedCards.push(p2.submittedCardIndex);
        duelResult.loser = id2;
        duelResult.revealedCard = card2;
      } else if (result === 'player2') {
        // Player 1 lost
        p1.revealedCards.push(p1.submittedCardIndex);
        duelResult.loser = id1;
        duelResult.revealedCard = card1;
      }
      // On tie, no cards revealed

      // Clear submissions
      p1.submittedCardIndex = null;
      p2.submittedCardIndex = null;

      // Broadcast duel result
      io.emit('duelResult', duelResult);
    }

    io.emit('gameState', getPublicState());
  });

  // Unsubmit card
  socket.on('unsubmitForDuel', () => {
    const player = gameState.players[socket.id];
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

  // Handle disconnect
  socket.on('disconnect', () => {
    const player = gameState.players[socket.id];
    if (player) {
      console.log(`${player.name} disconnected`);
      delete gameState.players[socket.id];
      io.emit('gameState', getPublicState());
    }
  });
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

