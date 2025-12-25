import React from 'react';
import Card from './Card';

export default function Game({
  gameState,
  privateState,
  playerId,
  playerName,
  onSubmitForDuel,
  onUnsubmitForDuel,
  onEndGame,
  duelResult
}) {
  const myPlayer = gameState.players[playerId];
  const otherPlayers = Object.entries(gameState.players)
    .filter(([id]) => id !== playerId);

  const hasSubmitted = myPlayer?.hasSubmitted;
  const submittedIndex = myPlayer?.submittedCardIndex;

  // Check if a card is revealed
  const isRevealed = (index) => {
    return myPlayer?.revealedCards?.includes(index);
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
              <span>{gameState.players[duelResult.challenger.id]?.name}</span>
              <span className="vs">vs</span>
              <span>{gameState.players[duelResult.defender.id]?.name}</span>
            </div>
            {duelResult.result === 'tie' ? (
              <p className="result-tie">It's a tie! No cards revealed.</p>
            ) : (
              <div className="result-winner">
                <p>{gameState.players[duelResult.loser]?.name} loses!</p>
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

      {/* Other Players */}
      <div className="other-players">
        <h3>Other Players</h3>
        <div className="players-grid">
          {otherPlayers.map(([id, player]) => (
            <div key={id} className={`other-player ${player.hasSubmitted ? 'submitted' : ''}`}>
              <div className="player-header">
                <span className="name">{player.name}</span>
                {player.hasSubmitted && <span className="submitted-badge">⚔️ Ready</span>}
              </div>
              <div className="player-cards">
                {player.cardBacks.map((back, i) => {
                  // Find if this card has been revealed
                  const revealedData = player.revealedCardsData?.find(r => r.index === i);
                  const isCardRevealed = !!revealedData;

                  return (
                    <div key={i} className="card-slot">
                      <Card
                        card={isCardRevealed ? revealedData.card : null}
                        back={back}
                        revealed={isCardRevealed}
                        isSubmitted={player.hasSubmitted && player.submittedCardIndex === i}
                        small
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
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
            const isSubmittedCard = submittedIndex === i;

            return (
              <div key={i} className={`card-container ${isSoulCard ? 'soul-card' : ''}`}>
                {isSoulCard && <div className="soul-badge">Soul Card</div>}
                <Card
                  card={card}
                  revealed={true}
                  isSubmitted={isSubmittedCard}
                  disabled={revealed}
                />
                {revealed ? (
                  <div className="card-status revealed-status">Revealed</div>
                ) : isSubmittedCard ? (
                  <button
                    onClick={onUnsubmitForDuel}
                    className="btn-unsubmit"
                  >
                    Unsubmit
                  </button>
                ) : !hasSubmitted ? (
                  <button
                    onClick={() => onSubmitForDuel(i)}
                    className="btn-submit"
                  >
                    Submit for Duel
                  </button>
                ) : (
                  <div className="card-status">-</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Status */}
      <div className="game-status">
        {hasSubmitted ? (
          <p>Waiting for another player to submit a card...</p>
        ) : (
          <p>Select a card to submit for a duel</p>
        )}
      </div>
    </div>
  );
}

