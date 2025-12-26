import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import Lobby from './components/Lobby';
import Game from './components/Game';

// Generate a unique player ID
function generatePlayerId() {
  return 'player_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
}

// Get or create persistent player ID from localStorage
function getPlayerId() {
  let playerId = localStorage.getItem('castle_player_id');
  if (!playerId) {
    playerId = generatePlayerId();
    localStorage.setItem('castle_player_id', playerId);
  }
  return playerId;
}

const socket = io(`${window.location.protocol}//${window.location.hostname}:5047`);

export default function App() {
  const [gameState, setGameState] = useState({ phase: 'lobby', players: {} });
  const [privateState, setPrivateState] = useState({ cards: [], soulCard: null, team: null });
  const [playerName, setPlayerName] = useState('');
  const [hasJoined, setHasJoined] = useState(false);
  const [duelResult, setDuelResult] = useState(null);
  const [playerId, setPlayerId] = useState(getPlayerId());

  // Track if we've attempted to reconnect
  const reconnectAttempted = useRef(false);

  useEffect(() => {
    socket.on('gameState', (state) => {
      setGameState(state);

      // Check if we're already in the game (reconnecting)
      const myPlayerId = getPlayerId();
      if (state.players[myPlayerId] && !reconnectAttempted.current) {
        reconnectAttempted.current = true;
        // We're in the game - try to reconnect
        const existingPlayer = state.players[myPlayerId];
        setPlayerName(existingPlayer.name);
        setHasJoined(true);
        // Send rejoin to associate our new socket with our player
        socket.emit('joinLobby', { playerId: myPlayerId, name: existingPlayer.name });
      }
    });

    socket.on('privateState', (state) => {
      setPrivateState(state);
    });

    socket.on('yourPlayerId', (id) => {
      setPlayerId(id);
      localStorage.setItem('castle_player_id', id);
    });

    socket.on('duelResult', (result) => {
      setDuelResult(result);
      setTimeout(() => setDuelResult(null), 3000);
    });

    socket.on('error', (message) => {
      alert(message);
    });

    socket.on('kicked', () => {
      alert('You have been kicked from the lobby');
      // Generate a new player ID so they can rejoin fresh
      const newPlayerId = generatePlayerId();
      localStorage.setItem('castle_player_id', newPlayerId);
      setPlayerId(newPlayerId);
      setHasJoined(false);
      setPlayerName('');
      reconnectAttempted.current = false;
    });

    return () => {
      socket.off('gameState');
      socket.off('privateState');
      socket.off('yourPlayerId');
      socket.off('duelResult');
      socket.off('error');
      socket.off('kicked');
    };
  }, []);

  const joinLobby = (name) => {
    const myPlayerId = getPlayerId();
    setPlayerName(name);
    socket.emit('joinLobby', { playerId: myPlayerId, name });
    setHasJoined(true);
  };

  const startGame = () => {
    socket.emit('startGame');
  };

  const endGame = () => {
    socket.emit('endGame');
  };

  const challenge = (cardIndex, defenderId) => {
    socket.emit('challenge', { cardIndex, defenderId });
  };

  const respondToChallenge = (cardIndex) => {
    socket.emit('respondToChallenge', cardIndex);
  };

  const callLeaders = (leaderIds) => {
    socket.emit('callLeaders', leaderIds);
  };

  const kickPlayer = (targetPlayerId) => {
    socket.emit('kickPlayer', targetPlayerId);
  };

  const updateHouseRules = (rules) => {
    socket.emit('updateHouseRules', rules);
  };

  const updateTurnTimer = (settings) => {
    socket.emit('updateTurnTimer', settings);
  };

  if (!hasJoined) {
    return <Lobby onJoin={joinLobby} players={gameState.players} houseRules={gameState.houseRules} turnTimer={gameState.turnTimer} />;
  }

  if (gameState.phase === 'lobby') {
    return (
      <Lobby
        onJoin={joinLobby}
        players={gameState.players}
        hasJoined={hasJoined}
        playerName={playerName}
        onStartGame={startGame}
        onKickPlayer={kickPlayer}
        houseRules={gameState.houseRules}
        onUpdateHouseRules={updateHouseRules}
        turnTimer={gameState.turnTimer}
        onUpdateTurnTimer={updateTurnTimer}
      />
    );
  }

  return (
    <Game
      gameState={gameState}
      privateState={privateState}
      playerId={playerId}
      playerName={playerName}
      onChallenge={challenge}
      onRespondToChallenge={respondToChallenge}
      onCallLeaders={callLeaders}
      onEndGame={endGame}
      duelResult={duelResult}
    />
  );
}
