import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Serve static files from dist folder
app.use(express.static(join(__dirname, 'dist')));

// Serve index.html for all non-API routes (SPA support)
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'));
});

// Game state
let gameState = {
  phase: 'lobby', // 'lobby', 'playing', or 'finished'
  players: {},    // playerId -> { name, cards, revealedCards, socketId }
  turnOrder: [],  // Array of player IDs in turn order
  currentTurnIndex: 0,
  duel: null,     // null or { challengerId, challengerCardIndex, defenderId, defenderCardIndex }
  gameResult: null, // null or { callerId, guessedLeaders, actualLeaders, correct, winningTeam, losingTeam }
  houseRules: {
    noCallingSelf: true,
    oneTraitor: true
  }
};

// Map socket IDs to player IDs
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

  for (const rank of ranks) {
    deck.push({ rank, suit: 'diamonds', color: 'red', back: 'red' });
  }

  for (const rank of ranks) {
    deck.push({ rank, suit: 'spades', color: 'black', back: 'blue' });
  }

  deck.push({ rank: 'joker', suit: 'joker', color: 'red', back: 'red' });
  deck.push({ rank: 'joker', suit: 'joker', color: 'black', back: 'blue' });

  return deck;
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// Check if a player is a "traitor" (soul card is minority color)
function isTraitor(cards) {
  const soulCard = getSoulCard(cards);
  const soulColor = soulCard.color;

  // Count card back colors (which correspond to card colors)
  const redCount = cards.filter(c => c.color === 'red').length;
  const blackCount = cards.filter(c => c.color === 'black').length;

  // Majority color
  const majorityColor = redCount > blackCount ? 'red' : 'black';

  // Traitor if soul card is NOT the majority color
  return soulColor !== majorityColor;
}

// Check if a deal is valid (balanced teams + optional one traitor rule)
function isValidDeal(hands) {
  let redTeamCount = 0;
  let blackTeamCount = 0;
  let redTeamTraitors = 0;
  let blackTeamTraitors = 0;

  for (const cards of Object.values(hands)) {
    const team = getTeamFromCards(cards);
    const traitor = isTraitor(cards);

    if (team === 'red') {
      redTeamCount++;
      if (traitor) redTeamTraitors++;
    } else {
      blackTeamCount++;
      if (traitor) blackTeamTraitors++;
    }
  }

  // Teams must differ by at most 1
  if (Math.abs(redTeamCount - blackTeamCount) > 1) {
    return false;
  }

  // If "one traitor" rule is active, each team must have exactly one traitor
  if (gameState.houseRules.oneTraitor) {
    // Each team must exist and have exactly one traitor
    if (redTeamCount > 0 && redTeamTraitors !== 1) return false;
    if (blackTeamCount > 0 && blackTeamTraitors !== 1) return false;
  }

  return true;
}

// Helper to get team from cards (used during dealing before full game state)
function getTeamFromCards(cards) {
  const soulCard = getSoulCard(cards);
  return soulCard.color;
}

// Deal a single set of hands (may not be valid)
function dealCardsOnce(playerIds) {
  const deck = shuffle(createDeck());
  const hands = {};

  for (const playerId of playerIds) {
    hands[playerId] = [];
  }

  for (const playerId of playerIds) {
    hands[playerId].push(deck.pop());
    hands[playerId].push(deck.pop());
  }

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

// Deal cards with validation - retry until we get balanced teams
function dealCards(playerIds) {
  const MAX_ATTEMPTS = 1000;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const hands = dealCardsOnce(playerIds);

    if (isValidDeal(hands)) {
      if (attempt > 0) {
        console.log(`Valid deal found after ${attempt + 1} attempts`);
      }
      return hands;
    }
  }

  // Fallback (shouldn't happen in practice)
  console.warn('Could not find valid deal after max attempts, using last attempt');
  return dealCardsOnce(playerIds);
}

function getSoulCard(cards) {
  const sorted = [...cards].sort((a, b) => getRankValue(b.rank) - getRankValue(a.rank));

  if (sorted.length >= 2 && getRankValue(sorted[0].rank) === getRankValue(sorted[1].rank)) {
    return sorted[2];
  }

  return sorted[0];
}

function getTeam(cards) {
  const soulCard = getSoulCard(cards);
  return soulCard.color;
}

// Get the actual team leaders
function getTeamLeaders() {
  const teams = { red: [], black: [] };

  // Group players by team with their soul card info
  for (const [playerId, player] of Object.entries(gameState.players)) {
    if (!player.cards || player.cards.length === 0) continue;

    const soulCard = getSoulCard(player.cards);
    const team = soulCard.color;
    teams[team].push({
      playerId,
      soulCard,
      soulRank: getRankValue(soulCard.rank)
    });
  }

  const leaders = [];

  // Find leader for each team (highest soul card rank)
  for (const team of ['red', 'black']) {
    if (teams[team].length > 0) {
      const sorted = teams[team].sort((a, b) => b.soulRank - a.soulRank);
      leaders.push(sorted[0].playerId);
    }
  }

  return {
    leaders: leaders.sort(), // Sort for consistent comparison
    redTeam: teams.red.map(p => p.playerId),
    blackTeam: teams.black.map(p => p.playerId),
    singleTeam: teams.red.length === 0 || teams.black.length === 0
  };
}

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

function getPlayerId(socket) {
  return socketToPlayer[socket.id];
}

// Get unrevealed card indices for a player
function getUnrevealedCardIndices(player) {
  const unrevealed = [];
  for (let i = 0; i < (player.cards?.length || 0); i++) {
    if (!player.revealedCards.includes(i)) {
      unrevealed.push(i);
    }
  }
  return unrevealed;
}

// Check if a player can be challenged (has unrevealed cards)
function canBeChallenged(player) {
  return getUnrevealedCardIndices(player).length > 0;
}

// Check if a player can challenge others (has unrevealed cards)
function canChallenge(player) {
  return getUnrevealedCardIndices(player).length > 0;
}

// Get current turn player ID
function getCurrentTurnPlayerId() {
  if (gameState.turnOrder.length === 0) return null;
  return gameState.turnOrder[gameState.currentTurnIndex];
}

// Advance to next player's turn
function advanceToNextTurn() {
  if (gameState.turnOrder.length === 0) return;

  const startIndex = gameState.currentTurnIndex;
  let attempts = 0;

  do {
    gameState.currentTurnIndex = (gameState.currentTurnIndex + 1) % gameState.turnOrder.length;
    attempts++;

    const playerId = gameState.turnOrder[gameState.currentTurnIndex];
    const player = gameState.players[playerId];

    // Skip players who can't challenge
    if (player && canChallenge(player)) {
      break;
    }
  } while (attempts < gameState.turnOrder.length);

  gameState.duel = null;
}

// Get public card representation (for showing to opponent during duel)
function getPublicCardRepresentation(card) {
  return {
    back: card.back
    // Future: add hints like ">8" etc.
  };
}

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
      cardPublicInfo: player.cardPublicInfo || [],
      connected: !!player.socketId,
      canBeChallenged: player.cards ? canBeChallenged(player) : false,
      unrevealedCount: player.cards ? getUnrevealedCardIndices(player).length : 0
    };
  }

  // Include duel state with public info only
  let duelPublic = null;
  if (gameState.duel) {
    const challenger = gameState.players[gameState.duel.challengerId];
    duelPublic = {
      challengerId: gameState.duel.challengerId,
      challengerName: challenger?.name,
      defenderId: gameState.duel.defenderId,
      defenderName: gameState.players[gameState.duel.defenderId]?.name,
      // Show the back of the challenger's card to the defender
      challengerCardBack: challenger?.cards?.[gameState.duel.challengerCardIndex]?.back || null,
      challengerCardPublicInfo: challenger?.cardPublicInfo?.[gameState.duel.challengerCardIndex] || null,
      waitingForDefender: gameState.duel.defenderCardIndex === null
    };
  }

  return {
    phase: gameState.phase,
    players,
    turnOrder: gameState.turnOrder,
    currentTurnPlayerId: getCurrentTurnPlayerId(),
    duel: duelPublic,
    gameResult: gameState.gameResult,
    houseRules: gameState.houseRules
  };
}

function getPrivateState(playerId) {
  const player = gameState.players[playerId];
  if (!player) return null;

  return {
    cards: player.cards || [],
    soulCard: player.cards && player.cards.length ? getSoulCard(player.cards) : null,
    team: player.cards && player.cards.length ? getTeam(player.cards) : null,
    unrevealedCardIndices: getUnrevealedCardIndices(player)
  };
}

function sendStateToPlayer(playerId) {
  const player = gameState.players[playerId];
  if (player && player.socketId) {
    io.to(player.socketId).emit('gameState', getPublicState());
    io.to(player.socketId).emit('privateState', getPrivateState(playerId));
    io.to(player.socketId).emit('yourPlayerId', playerId);
  }
}

function broadcastState() {
  io.emit('gameState', getPublicState());
  // Send private state to each connected player
  for (const [playerId, player] of Object.entries(gameState.players)) {
    if (player.socketId) {
      io.to(player.socketId).emit('privateState', getPrivateState(playerId));
    }
  }
}

io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);
  socket.emit('gameState', getPublicState());

  socket.on('joinLobby', ({ playerId, name }) => {
    if (gameState.players[playerId]) {
      const player = gameState.players[playerId];
      const oldSocketId = player.socketId;

      if (oldSocketId) {
        delete socketToPlayer[oldSocketId];
      }

      player.socketId = socket.id;
      socketToPlayer[socket.id] = playerId;

      console.log(`${player.name} reconnected (${playerId})`);
      sendStateToPlayer(playerId);
      io.emit('gameState', getPublicState());
    } else {
      if (gameState.phase !== 'lobby') {
        socket.emit('error', 'Game already in progress');
        return;
      }

      gameState.players[playerId] = {
        name,
        cards: [],
        revealedCards: [],
        socketId: socket.id
      };
      socketToPlayer[socket.id] = playerId;

      console.log(`${name} joined the lobby (${playerId})`);
      io.emit('gameState', getPublicState());
      socket.emit('yourPlayerId', playerId);
    }
  });

  // Update house rules (only in lobby)
  socket.on('updateHouseRules', (rules) => {
    if (gameState.phase !== 'lobby') {
      socket.emit('error', 'Can only change rules in the lobby');
      return;
    }

    if (typeof rules.noCallingSelf === 'boolean') {
      gameState.houseRules.noCallingSelf = rules.noCallingSelf;
    }
    if (typeof rules.oneTraitor === 'boolean') {
      gameState.houseRules.oneTraitor = rules.oneTraitor;
    }

    console.log('House rules updated:', gameState.houseRules);
    io.emit('gameState', getPublicState());
  });

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
      // Initialize public info for each card (tracks what info is publicly known about each card)
      gameState.players[playerId].cardPublicInfo = hands[playerId].map(() => ({
        defeatedRanks: [],    // Ranks this card has beaten (means this card is > those ranks)
        defeatedJoker: false, // If true, this card beat a joker (means it's J, Q, K, or A)
        notJoker: false       // If true, this card beat a non-face card (means it's NOT a joker)
      }));
    }

    // Set up turn order (randomized)
    gameState.turnOrder = shuffle([...playerIds]);
    gameState.currentTurnIndex = 0;
    gameState.phase = 'playing';
    gameState.duel = null;

    console.log('Game started! Turn order:', gameState.turnOrder.map(id => gameState.players[id].name));
    broadcastState();
  });

  // Challenger selects a card and a player to challenge
  socket.on('challenge', ({ cardIndex, defenderId }) => {
    const playerId = getPlayerId(socket);
    const player = gameState.players[playerId];

    if (!player || gameState.phase !== 'playing') return;

    // Check it's this player's turn
    if (getCurrentTurnPlayerId() !== playerId) {
      socket.emit('error', "It's not your turn");
      return;
    }

    // Check there's no active duel
    if (gameState.duel) {
      socket.emit('error', 'A duel is already in progress');
      return;
    }

    // Check the card is unrevealed
    if (player.revealedCards.includes(cardIndex)) {
      socket.emit('error', 'Cannot use a revealed card');
      return;
    }

    // Check the defender exists and can be challenged
    const defender = gameState.players[defenderId];
    if (!defender) {
      socket.emit('error', 'Invalid defender');
      return;
    }

    if (!canBeChallenged(defender)) {
      socket.emit('error', 'That player has no unrevealed cards');
      return;
    }

    // Start the duel
    gameState.duel = {
      challengerId: playerId,
      challengerCardIndex: cardIndex,
      defenderId: defenderId,
      defenderCardIndex: null
    };

    console.log(`${player.name} challenges ${defender.name} with card ${cardIndex}`);

    // Check if defender has only one unrevealed card - auto-submit
    const defenderUnrevealed = getUnrevealedCardIndices(defender);
    if (defenderUnrevealed.length === 1) {
      // Auto-submit the only available card
      gameState.duel.defenderCardIndex = defenderUnrevealed[0];
      console.log(`${defender.name} auto-submits their only unrevealed card`);
      resolveDuelAndAdvance();
    } else {
      broadcastState();
    }
  });

  // Defender responds to challenge
  socket.on('respondToChallenge', (cardIndex) => {
    const playerId = getPlayerId(socket);
    const player = gameState.players[playerId];

    if (!player || gameState.phase !== 'playing') return;

    // Check there's an active duel waiting for this player
    if (!gameState.duel || gameState.duel.defenderId !== playerId) {
      socket.emit('error', 'You are not being challenged');
      return;
    }

    if (gameState.duel.defenderCardIndex !== null) {
      socket.emit('error', 'You already responded');
      return;
    }

    // Check the card is unrevealed
    if (player.revealedCards.includes(cardIndex)) {
      socket.emit('error', 'Cannot use a revealed card');
      return;
    }

    gameState.duel.defenderCardIndex = cardIndex;
    console.log(`${player.name} responds with card ${cardIndex}`);

    resolveDuelAndAdvance();
  });

  function resolveDuelAndAdvance() {
    const duel = gameState.duel;
    const challenger = gameState.players[duel.challengerId];
    const defender = gameState.players[duel.defenderId];

    const card1 = challenger.cards[duel.challengerCardIndex];
    const card2 = defender.cards[duel.defenderCardIndex];

    const result = resolveDuel(card1, card2);

    let duelResult = {
      challenger: { id: duel.challengerId, name: challenger.name, cardIndex: duel.challengerCardIndex },
      defender: { id: duel.defenderId, name: defender.name, cardIndex: duel.defenderCardIndex },
      result
    };

    // Track public info for the winning card
    const faceCards = ['J', 'Q', 'K', 'A'];

    if (result === 'player1') {
      // Challenger (card1) won, update card1's public info
      const info = challenger.cardPublicInfo[duel.challengerCardIndex];
      if (card2.rank === 'joker') {
        // Beat a joker means this card is J, Q, K, or A
        info.defeatedJoker = true;
      } else {
        // Beat a non-joker, record the rank
        if (!info.defeatedRanks.includes(card2.rank)) {
          info.defeatedRanks.push(card2.rank);
        }
        // If we beat a non-face card, we can't be a joker
        if (!faceCards.includes(card2.rank)) {
          info.notJoker = true;
        }
      }

      defender.revealedCards.push(duel.defenderCardIndex);
      duelResult.loser = duel.defenderId;
      duelResult.revealedCard = card2;
    } else if (result === 'player2') {
      // Defender (card2) won, update card2's public info
      const info = defender.cardPublicInfo[duel.defenderCardIndex];
      if (card1.rank === 'joker') {
        // Beat a joker means this card is J, Q, K, or A
        info.defeatedJoker = true;
      } else {
        // Beat a non-joker, record the rank
        if (!info.defeatedRanks.includes(card1.rank)) {
          info.defeatedRanks.push(card1.rank);
        }
        // If we beat a non-face card, we can't be a joker
        if (!faceCards.includes(card1.rank)) {
          info.notJoker = true;
        }
      }

      challenger.revealedCards.push(duel.challengerCardIndex);
      duelResult.loser = duel.challengerId;
      duelResult.revealedCard = card1;
    }
    // Note: ties don't reveal any info

    io.emit('duelResult', duelResult);

    // Advance turn
    advanceToNextTurn();
    broadcastState();
  }

  // Call the team leaders
  socket.on('callLeaders', (guessedLeaderIds) => {
    const callerId = getPlayerId(socket);
    const caller = gameState.players[callerId];

    if (!caller || gameState.phase !== 'playing') {
      socket.emit('error', 'Cannot call leaders now');
      return;
    }

    // Check "no calling yourself" rule
    if (gameState.houseRules.noCallingSelf && guessedLeaderIds.includes(callerId)) {
      socket.emit('error', 'You cannot call yourself as a leader (house rule)');
      return;
    }

    // Get actual leaders
    const { leaders: actualLeaders, redTeam, blackTeam, singleTeam } = getTeamLeaders();

    // Normalize guessed leaders for comparison
    const guessedSorted = [...guessedLeaderIds].sort();
    const actualSorted = [...actualLeaders].sort();

    // Check if guess is correct
    const correct = guessedSorted.length === actualSorted.length &&
      guessedSorted.every((id, i) => id === actualSorted[i]);

    // Determine caller's team
    const callerTeam = getTeam(caller.cards);

    // Determine winning and losing teams
    let winningPlayerIds, losingPlayerIds;

    if (singleTeam) {
      // All players on same team
      if (correct) {
        // Everyone wins
        winningPlayerIds = Object.keys(gameState.players);
        losingPlayerIds = [];
      } else {
        // Everyone loses
        winningPlayerIds = [];
        losingPlayerIds = Object.keys(gameState.players);
      }
    } else {
      if (correct) {
        // Caller's team wins
        winningPlayerIds = callerTeam === 'red' ? redTeam : blackTeam;
        losingPlayerIds = callerTeam === 'red' ? blackTeam : redTeam;
      } else {
        // Caller's team loses
        winningPlayerIds = callerTeam === 'red' ? blackTeam : redTeam;
        losingPlayerIds = callerTeam === 'red' ? redTeam : blackTeam;
      }
    }

    // Build full player reveal data
    const allPlayersRevealed = Object.entries(gameState.players).map(([id, player]) => {
      const soulCard = getSoulCard(player.cards);
      const team = getTeam(player.cards);
      const isRedLeader = team === 'red' && actualLeaders.includes(id);
      const isBlackLeader = team === 'black' && actualLeaders.includes(id);

      return {
        id,
        name: player.name,
        cards: player.cards,
        soulCard,
        team,
        isRedLeader,
        isBlackLeader
      };
    });

    // Sort by team (red first, then black), then by soul card rank descending
    allPlayersRevealed.sort((a, b) => {
      if (a.team !== b.team) {
        return a.team === 'red' ? -1 : 1;
      }
      return getRankValue(b.soulCard.rank) - getRankValue(a.soulCard.rank);
    });

    // Store game result
    gameState.gameResult = {
      callerId,
      callerName: caller.name,
      guessedLeaders: guessedLeaderIds.map(id => ({
        id,
        name: gameState.players[id]?.name
      })),
      actualLeaders: actualLeaders.map(id => ({
        id,
        name: gameState.players[id]?.name,
        team: getTeam(gameState.players[id]?.cards)
      })),
      correct,
      winningPlayerIds,
      losingPlayerIds,
      singleTeam,
      allPlayersRevealed
    };

    gameState.phase = 'finished';

    console.log(`${caller.name} called leaders: ${guessedLeaderIds.map(id => gameState.players[id]?.name).join(', ')}`);
    console.log(`Actual leaders: ${actualLeaders.map(id => gameState.players[id]?.name).join(', ')}`);
    console.log(`Result: ${correct ? 'CORRECT' : 'WRONG'}`);

    broadcastState();
  });

  socket.on('endGame', () => {
    gameState.phase = 'lobby';
    for (const player of Object.values(gameState.players)) {
      player.cards = [];
      player.revealedCards = [];
    }
    gameState.turnOrder = [];
    gameState.currentTurnIndex = 0;
    gameState.duel = null;
    gameState.gameResult = null;

    io.emit('gameState', getPublicState());
    console.log('Game ended, returning to lobby');
  });

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

const PORT = 5046;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
