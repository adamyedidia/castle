import React, { useState } from 'react';
import Card from './Card';

// Public card representation - shows card back and future hints
function PublicCard({ back, small }) {
  return (
    <div className={`card card-back ${back === 'red' ? 'back-red' : 'back-blue'} ${small ? 'card-small' : ''}`}>
      <div className="back-pattern">
        <span className="back-icon">{back === 'red' ? '♦' : '♠'}</span>
      </div>
    </div>
  );
}

export default function Game({
  gameState,
  privateState,
  playerId,
  playerName,
  onChallenge,
  onRespondToChallenge,
  onEndGame,
  duelResult
}) {
  const [selectedCardIndex, setSelectedCardIndex] = useState(null);
  const [selectedOpponentId, setSelectedOpponentId] = useState(null);

  const myPlayer = gameState.players[playerId];
  const otherPlayers = Object.entries(gameState.players)
    .filter(([id]) => id !== playerId);

  const isMyTurn = gameState.currentTurnPlayerId === playerId;
  const currentTurnPlayer = gameState.players[gameState.currentTurnPlayerId];

  // Am I being challenged?
  const amBeingChallenged = gameState.duel &&
    gameState.duel.defenderId === playerId &&
    gameState.duel.waitingForDefender;

  // Is there an active duel?
  const duelInProgress = !!gameState.duel;

  // Get unrevealed card indices
  const unrevealedIndices = privateState.unrevealedCardIndices || [];

  // Check if a card is revealed
  const isRevealed = (index) => {
    return myPlayer?.revealedCards?.includes(index);
  };

  // Handle selecting a card for challenge
  const handleSelectCard = (index) => {
    if (isRevealed(index)) return;
    setSelectedCardIndex(index === selectedCardIndex ? null : index);
  };

  // Handle selecting an opponent to challenge
  const handleSelectOpponent = (opponentId) => {
    if (!gameState.players[opponentId]?.canBeChallenged) return;
    setSelectedOpponentId(opponentId === selectedOpponentId ? null : opponentId);
  };

  // Submit challenge
  const handleChallenge = () => {
    if (selectedCardIndex !== null && selectedOpponentId) {
      onChallenge(selectedCardIndex, selectedOpponentId);
      setSelectedCardIndex(null);
      setSelectedOpponentId(null);
    }
  };

  // Respond to challenge
  const handleRespond = (cardIndex) => {
    onRespondToChallenge(cardIndex);
  };

  // Get team color class
  const teamClass = privateState.team === 'red' ? 'team-red' : 'team-black';

  return (
    <div className="game">
      {/* Duel Result Overlay */}
      {duelResult && (
        <div className="duel-overlay">
          <div className="duel-result">
            <h2>Duel!</h2>
            <div className="duel-participants">
              <span>{gameState.players[duelResult.challenger.id]?.name || duelResult.challenger.name}</span>
              <span className="vs">vs</span>
              <span>{gameState.players[duelResult.defender.id]?.name || duelResult.defender.name}</span>
            </div>
            {duelResult.result === 'tie' ? (
              <p className="result-tie">It's a tie! No cards revealed.</p>
            ) : (
              <div className="result-winner">
                <p>{gameState.players[duelResult.loser]?.name || 'Player'} loses!</p>
                <div className="revealed-card-display">
                  <Card card={duelResult.revealedCard} revealed={true} />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <header className="game-header">
        <h1>Castle</h1>
        <div className="player-info">
          <span className="player-name">{playerName}</span>
          <span className={`team-badge ${teamClass}`}>
            Team {privateState.team === 'red' ? 'Red ♦' : 'Black ♠'}
          </span>
        </div>
        <button onClick={onEndGame} className="btn-end">End Game</button>
      </header>

      {/* Turn Indicator */}
      <div className="turn-indicator">
        {amBeingChallenged ? (
          <div className="turn-alert challenge-alert">
            <span className="alert-icon">⚔️</span>
            <span>{gameState.duel.challengerName} is challenging you! Select a card to defend.</span>
          </div>
        ) : isMyTurn && !duelInProgress ? (
          <div className="turn-alert your-turn">
            <span className="alert-icon">👑</span>
            <span>Your turn! Select a card and an opponent to challenge.</span>
          </div>
        ) : duelInProgress ? (
          <div className="turn-alert waiting">
            <span>Waiting for {gameState.duel.defenderName} to respond...</span>
          </div>
        ) : (
          <div className="turn-alert waiting">
            <span>Waiting for {currentTurnPlayer?.name}'s turn...</span>
          </div>
        )}
      </div>

      {/* Challenger's Card (when being challenged) */}
      {amBeingChallenged && gameState.duel.challengerCardBack && (
        <div className="challenge-card-display">
          <p>{gameState.duel.challengerName}'s card:</p>
          <PublicCard back={gameState.duel.challengerCardBack} />
        </div>
      )}

      {/* Other Players */}
      <div className="other-players">
        <h3>Other Players</h3>
        <div className="players-grid">
          {otherPlayers.map(([id, player]) => {
            const isSelected = selectedOpponentId === id;
            const canSelect = isMyTurn && !duelInProgress && player.canBeChallenged;
            const isCurrentChallenger = gameState.duel?.challengerId === id;

            return (
              <div
                key={id}
                className={`other-player ${isSelected ? 'selected' : ''} ${canSelect ? 'selectable' : ''} ${isCurrentChallenger ? 'challenger' : ''}`}
                onClick={() => canSelect && handleSelectOpponent(id)}
              >
                <div className="player-header">
                  <span className="name">{player.name}</span>
                  {!player.canBeChallenged && <span className="all-revealed">All revealed</span>}
                  {gameState.currentTurnPlayerId === id && <span className="turn-badge">Their turn</span>}
                </div>
                <div className="player-cards">
                  {player.cardBacks.map((back, i) => {
                    const revealedData = player.revealedCardsData?.find(r => r.index === i);
                    const isCardRevealed = !!revealedData;

                    return (
                      <div key={i} className="card-slot">
                        <Card
                          card={isCardRevealed ? revealedData.card : null}
                          back={back}
                          revealed={isCardRevealed}
                          small
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Your Hand */}
      <div className="your-hand">
        <h3>Your Hand</h3>
        <div className="hand-cards">
          {privateState.cards.map((card, i) => {
            const revealed = isRevealed(i);
            const isSoulCard = privateState.soulCard &&
              card.rank === privateState.soulCard.rank &&
              card.suit === privateState.soulCard.suit;
            const isSelected = selectedCardIndex === i;
            const canSelect = !revealed && isMyTurn && !duelInProgress;
            const canRespond = !revealed && amBeingChallenged;

            return (
              <div
                key={i}
                className={`card-container ${isSoulCard ? 'soul-card' : ''} ${isSelected ? 'selected' : ''}`}
              >
                {isSoulCard && <div className="soul-badge">Soul Card</div>}
                <Card
                  card={card}
                  revealed={true}
                  isSubmitted={isSelected}
                  disabled={revealed}
                />
                {revealed ? (
                  <div className="card-status revealed-status">Revealed</div>
                ) : amBeingChallenged ? (
                  <button
                    onClick={() => handleRespond(i)}
                    className="btn-submit"
                  >
                    Defend with this
                  </button>
                ) : isMyTurn && !duelInProgress ? (
                  <button
                    onClick={() => handleSelectCard(i)}
                    className={`btn-select ${isSelected ? 'selected' : ''}`}
                  >
                    {isSelected ? 'Selected ✓' : 'Select'}
                  </button>
                ) : (
                  <div className="card-status">-</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Challenge Button */}
      {isMyTurn && !duelInProgress && selectedCardIndex !== null && selectedOpponentId && (
        <div className="challenge-action">
          <button onClick={handleChallenge} className="btn-challenge">
            Challenge {gameState.players[selectedOpponentId]?.name}!
          </button>
        </div>
      )}

      {/* Turn Order Display */}
      <div className="turn-order">
        <span className="turn-order-label">Turn order:</span>
        {gameState.turnOrder.map((id, i) => (
          <span
            key={id}
            className={`turn-order-player ${id === playerId ? 'you' : ''} ${id === gameState.currentTurnPlayerId ? 'current' : ''}`}
          >
            {gameState.players[id]?.name}{id === playerId ? ' (you)' : ''}
          </span>
        ))}
      </div>
    </div>
  );
}
