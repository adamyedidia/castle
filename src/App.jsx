import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import Lobby from './components/Lobby';
import Game from './components/Game';

const socket = io('http://localhost:3001');

export default function App() {
  const [gameState, setGameState] = useState({ phase: 'lobby', players: {} });
  const [privateState, setPrivateState] = useState({ cards: [], soulCard: null, team: null });
  const [playerName, setPlayerName] = useState('');
  const [hasJoined, setHasJoined] = useState(false);
  const [duelResult, setDuelResult] = useState(null);

  useEffect(() => {
    socket.on('gameState', (state) => {
      setGameState(state);
    });

    socket.on('privateState', (state) => {
      setPrivateState(state);
    });

    socket.on('duelResult', (result) => {
      setDuelResult(result);
      // Clear after 3 seconds
      setTimeout(() => setDuelResult(null), 3000);
    });

    socket.on('error', (message) => {
      alert(message);
    });

    socket.on('kicked', () => {
      alert('You have been kicked from the lobby');
      setHasJoined(false);
      setPlayerName('');
    });

    return () => {
      socket.off('gameState');
      socket.off('privateState');
      socket.off('duelResult');
      socket.off('error');
      socket.off('kicked');
    };
  }, []);

  const joinLobby = (name) => {
    setPlayerName(name);
    socket.emit('joinLobby', name);
    setHasJoined(true);
  };

  const startGame = () => {
    socket.emit('startGame');
  };

  const endGame = () => {
    socket.emit('endGame');
  };

  const submitForDuel = (cardIndex) => {
    socket.emit('submitForDuel', cardIndex);
  };

  const unsubmitForDuel = () => {
    socket.emit('unsubmitForDuel');
  };

  const kickPlayer = (playerId) => {
    socket.emit('kickPlayer', playerId);
  };

  if (!hasJoined) {
    return <Lobby onJoin={joinLobby} players={gameState.players} />;
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
      />
    );
  }

  return (
    <Game
      gameState={gameState}
      privateState={privateState}
      playerId={socket.id}
      playerName={playerName}
      onSubmitForDuel={submitForDuel}
      onUnsubmitForDuel={unsubmitForDuel}
      onEndGame={endGame}
      duelResult={duelResult}
    />
  );
}

