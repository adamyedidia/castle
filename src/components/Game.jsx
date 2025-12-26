import React, { useState, useEffect } from 'react';
import Card from './Card';

// Rank order for comparison (higher index = higher rank)
const RANK_ORDER = ['joker', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

function getRankValue(rank) {
  return RANK_ORDER.indexOf(rank);
}

// Get the highest rank from an array of ranks
function getHighestRank(ranks) {
  if (!ranks || ranks.length === 0) return null;
  return ranks.reduce((highest, rank) => {
    return getRankValue(rank) > getRankValue(highest) ? rank : highest;
  }, ranks[0]);
}

// Component to display public info markers beneath a card
function CardPublicInfo({ info }) {
  if (!info) return null;

  const markers = [];

  // If beat a non-face card, this card is NOT a joker
  if (info.notJoker) {
    markers.push(
      <span key="notJoker" className="public-info-marker not-joker">
        <s>Joker</s>
      </span>
    );
  }

  // If beat a joker, this card is J, Q, K, or A
  if (info.defeatedJoker) {
    markers.push(
      <span key="defeatedJoker" className="public-info-marker defeated-joker">
        &lt;J
      </span>
    );
  }

  // Show highest defeated rank
  if (info.defeatedRanks && info.defeatedRanks.length > 0) {
    const highestRank = getHighestRank(info.defeatedRanks);
    markers.push(
      <span key="highestRank" className="public-info-marker higher-than">
        &gt;{highestRank}
      </span>
    );
  }

  if (markers.length === 0) return null;

  return <div className="card-public-info">{markers}</div>;
}

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
  onCallLeaders,
  onEndGame,
  duelResult
}) {
  const [selectedCardIndex, setSelectedCardIndex] = useState(null);
  const [selectedOpponentId, setSelectedOpponentId] = useState(null);
  const [showCallLeaders, setShowCallLeaders] = useState(false);
  const [selectedLeaders, setSelectedLeaders] = useState([]);
  const [timeRemaining, setTimeRemaining] = useState(null);
  const [showGameResult, setShowGameResult] = useState(true);

  const myPlayer = gameState.players[playerId];
  const otherPlayers = Object.entries(gameState.players)
    .filter(([id]) => id !== playerId);
  const allPlayers = Object.entries(gameState.players);

  // Timer countdown effect
  useEffect(() => {
    if (!gameState.turnTimer?.enabled || !gameState.turnTimer?.turnStartTime) {
      setTimeRemaining(null);
      return;
    }

    const updateTimer = () => {
      const elapsed = (Date.now() - gameState.turnTimer.turnStartTime) / 1000;
      const remaining = Math.max(0, gameState.turnTimer.seconds - elapsed);
      setTimeRemaining(Math.ceil(remaining));
    };

    updateTimer();
    const interval = setInterval(updateTimer, 100);
    return () => clearInterval(interval);
  }, [gameState.turnTimer?.enabled, gameState.turnTimer?.turnStartTime, gameState.turnTimer?.seconds]);

  const isMyTurn = gameState.currentTurnPlayerId === playerId;
  const currentTurnPlayer = gameState.players[gameState.currentTurnPlayerId];

  const amBeingChallenged = gameState.duel &&
    gameState.duel.defenderId === playerId &&
    gameState.duel.waitingForDefender;

  const duelInProgress = !!gameState.duel;
  const gameFinished = gameState.phase === 'finished';
  const gameResult = gameState.gameResult;

  // Reset game result visibility when new result comes in
  useEffect(() => {
    if (gameResult) {
      setShowGameResult(true);
    }
  }, [gameResult]);

  const unrevealedIndices = privateState.unrevealedCardIndices || [];

  const isRevealed = (index) => {
    return myPlayer?.revealedCards?.includes(index);
  };

  const handleSelectCard = (index) => {
    if (isRevealed(index)) return;
    setSelectedCardIndex(index === selectedCardIndex ? null : index);
  };

  const handleSelectOpponent = (opponentId) => {
    if (!gameState.players[opponentId]?.canBeChallenged) return;
    setSelectedOpponentId(opponentId === selectedOpponentId ? null : opponentId);
  };

  const handleChallenge = () => {
    if (selectedCardIndex !== null && selectedOpponentId) {
      onChallenge(selectedCardIndex, selectedOpponentId);
      setSelectedCardIndex(null);
      setSelectedOpponentId(null);
    }
  };

  const handleRespond = (cardIndex) => {
    onRespondToChallenge(cardIndex);
  };

  // Leader selection
  const toggleLeaderSelection = (id) => {
    if (selectedLeaders.includes(id)) {
      setSelectedLeaders(selectedLeaders.filter(l => l !== id));
    } else if (selectedLeaders.length < 2) {
      setSelectedLeaders([...selectedLeaders, id]);
    }
  };

  const handleCallLeaders = () => {
    if (selectedLeaders.length > 0) {
      onCallLeaders(selectedLeaders);
      setShowCallLeaders(false);
      setSelectedLeaders([]);
    }
  };

  // Check if I won or lost
  const iWon = gameResult?.winningPlayerIds?.includes(playerId);
  const iLost = gameResult?.losingPlayerIds?.includes(playerId);

  const teamClass = privateState.team === 'red' ? 'team-red' : 'team-black';

  const needsAction = (isMyTurn && !duelInProgress) || amBeingChallenged;

  return (
    <div className={`game ${needsAction ? 'your-action' : ''}`}>
      {/* Game Result Overlay */}
      {gameFinished && gameResult && showGameResult && (
        <div className="duel-overlay">
          <div className={`game-result-modal ${iWon ? 'won' : 'lost'}`}>
            <h2>{iWon ? '🎉 Victory!' : '💀 Defeat!'}</h2>
            <p className="result-subtitle">
              {gameResult.callerName} called the leaders
              {gameResult.correct ? ' correctly!' : ' incorrectly!'}
            </p>

            {/* All Players Revealed */}
            <div className="all-players-revealed">
              {gameResult.allPlayersRevealed?.map((player) => (
                <div key={player.id} className={`revealed-player ${player.team}`}>
                  <div className="revealed-player-header">
                    {player.isRedLeader && <span className="crown red-crown">👑</span>}
                    {player.isBlackLeader && <span className="crown black-crown">👑</span>}
                    <span className={`revealed-player-name ${player.majorityColor ? `majority-${player.majorityColor}` : ''}`}>{player.name}</span>
                    <span className={`team-indicator ${player.team}`}>
                      {player.team === 'red' ? '♦' : '♠'}
                    </span>
                  </div>
                  <div className="revealed-player-cards">
                    {player.cards.map((card, i) => {
                      const isSoul = card.rank === player.soulCard.rank &&
                                     card.suit === player.soulCard.suit;
                      return (
                        <div key={i} className={`revealed-card-wrapper ${isSoul ? 'is-soul' : ''}`}>
                          <Card card={card} revealed={true} small />
                          {isSoul && <span className="soul-marker">★</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="game-result-buttons">
              <button onClick={() => setShowGameResult(false)} className="btn-secondary">
                Dismiss
              </button>
              <button onClick={onEndGame} className="btn-primary">
                Return to Lobby
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Call Leaders Modal */}
      {showCallLeaders && !gameFinished && (
        <div className="duel-overlay">
          <div className="call-leaders-modal">
            <h2>Call the Leaders</h2>
            <p>Select who you think the team leaders are (1 or 2 players)</p>

            <div className="leader-selection">
              {allPlayers.map(([id, player]) => {
                const isMe = id === playerId;
                const noCallingSelf = gameState.houseRules?.noCallingSelf;
                const isDisabled = isMe && noCallingSelf;

                return (
                  <button
                    key={id}
                    className={`leader-option ${selectedLeaders.includes(id) ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}`}
                    onClick={() => !isDisabled && toggleLeaderSelection(id)}
                    disabled={isDisabled}
                  >
                    <span className={player.majorityColor ? `majority-${player.majorityColor}` : ''}>{player.name}</span>
                    {isMe && ' (you)'}
                    {isDisabled && ' - cannot call self'}
                  </button>
                );
              })}
            </div>

            <div className="modal-actions">
              <button
                onClick={handleCallLeaders}
                className="btn-primary"
                disabled={selectedLeaders.length === 0}
              >
                Call Leaders ({selectedLeaders.length} selected)
              </button>
              <button
                onClick={() => { setShowCallLeaders(false); setSelectedLeaders([]); }}
                className="btn-cancel"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Duel Result Overlay */}
      {duelResult && !gameFinished && (
        <div className="duel-overlay">
          <div className="duel-result">
            <h2>Duel!</h2>
            <div className="duel-participants">
              <span className={gameState.players[duelResult.challenger.id]?.majorityColor ? `majority-${gameState.players[duelResult.challenger.id].majorityColor}` : ''}>{gameState.players[duelResult.challenger.id]?.name || duelResult.challenger.name}</span>
              <span className="vs">vs</span>
              <span className={gameState.players[duelResult.defender.id]?.majorityColor ? `majority-${gameState.players[duelResult.defender.id].majorityColor}` : ''}>{gameState.players[duelResult.defender.id]?.name || duelResult.defender.name}</span>
            </div>
            {duelResult.result === 'tie' ? (
              <p className="result-tie">It's a tie! No cards revealed.</p>
            ) : (
              <div className="result-winner">
                <p><span className={gameState.players[duelResult.loser]?.majorityColor ? `majority-${gameState.players[duelResult.loser].majorityColor}` : ''}>{gameState.players[duelResult.loser]?.name || 'Player'}</span> loses!</p>
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
          <span className={`player-name ${myPlayer?.majorityColor ? `majority-${myPlayer.majorityColor}` : ''}`}>{playerName}</span>
          <span className={`team-badge ${teamClass}`}>
            Team {privateState.team === 'red' ? 'Red ♦' : 'Black ♠'}
          </span>
        </div>
        <div className="header-actions">
          <button onClick={() => setShowCallLeaders(true)} className="btn-call-leaders">
            📢 Call Leaders
          </button>
          <button onClick={onEndGame} className="btn-end">End Game</button>
        </div>
      </header>

      {/* Turn Timer */}
      {gameState.turnTimer?.enabled && timeRemaining !== null && (
        <div className={`turn-timer ${timeRemaining <= 5 ? 'timer-warning' : ''} ${timeRemaining <= 3 ? 'timer-critical' : ''}`}>
          <div className="timer-bar">
            <div
              className="timer-fill"
              style={{ width: `${(timeRemaining / gameState.turnTimer.seconds) * 100}%` }}
            />
          </div>
          <span className="timer-text">{timeRemaining}s</span>
        </div>
      )}

      {/* Turn Indicator */}
      <div className="turn-indicator">
        {amBeingChallenged ? (
          <div className="turn-alert challenge-alert">
            <span className="alert-icon">⚔️</span>
            <span><span className={gameState.players[gameState.duel.challengerId]?.majorityColor ? `majority-${gameState.players[gameState.duel.challengerId].majorityColor}` : ''}>{gameState.duel.challengerName}</span> is challenging you! Select a card to defend.</span>
          </div>
        ) : isMyTurn && !duelInProgress ? (
          <div className="turn-alert your-turn">
            <span className="alert-icon">👑</span>
            <span>Your turn! Select a card and an opponent to challenge.</span>
          </div>
        ) : duelInProgress ? (
          <div className="turn-alert waiting">
            <span>Waiting for <span className={gameState.players[gameState.duel.defenderId]?.majorityColor ? `majority-${gameState.players[gameState.duel.defenderId].majorityColor}` : ''}>{gameState.duel.defenderName}</span> to respond...</span>
          </div>
        ) : (
          <div className="turn-alert waiting">
            <span>Waiting for {currentTurnPlayer?.name}'s turn...</span>
          </div>
        )}
      </div>

      {/* Challenger's Card (when being challenged) */}
      {amBeingChallenged && gameState.duel.challengerCardBack && (() => {
        const challengerId = gameState.duel.challengerId;
        const challengerCardIndex = gameState.duel.challengerCardIndex;
        const privatelyKnownCard = privateState?.privatelyKnownCards?.[challengerId]?.[challengerCardIndex];

        return (
          <div className="challenge-card-display">
            <p><span className={gameState.players[gameState.duel.challengerId]?.majorityColor ? `majority-${gameState.players[gameState.duel.challengerId].majorityColor}` : ''}>{gameState.duel.challengerName}</span>'s card:</p>
            <div className="challenge-card-with-info">
              {privatelyKnownCard ? (
                <Card card={privatelyKnownCard} revealed={true} privateKnowledge />
              ) : (
                <PublicCard back={gameState.duel.challengerCardBack} />
              )}
              {!privatelyKnownCard && <CardPublicInfo info={gameState.duel.challengerCardPublicInfo} />}
            </div>
          </div>
        );
      })()}

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
                  <span className={`name ${player.majorityColor ? `majority-${player.majorityColor}` : ''}`}>{player.name}</span>
                  {!player.canBeChallenged && <span className="all-revealed">All revealed</span>}
                  {gameState.currentTurnPlayerId === id && <span className="turn-badge">Their turn</span>}
                </div>
                <div className="player-cards">
                  {player.cardBacks.map((back, i) => {
                    const revealedData = player.revealedCardsData?.find(r => r.index === i);
                    const isCardRevealed = !!revealedData;
                    const publicInfo = !isCardRevealed ? player.cardPublicInfo?.[i] : null;
                    const privatelyKnown = !isCardRevealed && privateState?.privatelyKnownCards?.[id]?.[i];

                    return (
                      <div key={i} className="card-slot">
                        {privatelyKnown ? (
                          <Card
                            card={privatelyKnown}
                            revealed={true}
                            small
                            privateKnowledge
                          />
                        ) : (
                          <Card
                            card={isCardRevealed ? revealedData.card : null}
                            back={back}
                            revealed={isCardRevealed}
                            small
                          />
                        )}
                        {!isCardRevealed && !privatelyKnown && <CardPublicInfo info={publicInfo} />}
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
        <div className="hand-cards">
          {privateState.cards.map((card, i) => {
            const revealed = isRevealed(i);
            const isSoulCard = privateState.soulCard &&
              card.rank === privateState.soulCard.rank &&
              card.suit === privateState.soulCard.suit;
            const isSelected = selectedCardIndex === i;
            const canSelect = !revealed && isMyTurn && !duelInProgress;
            const canRespond = !revealed && amBeingChallenged;
            const publicInfo = !revealed ? myPlayer?.cardPublicInfo?.[i] : null;

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
                {!revealed && <CardPublicInfo info={publicInfo} />}
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
        {gameState.turnOrder.map((id, i) => {
          const p = gameState.players[id];
          return (
            <span
              key={id}
              className={`turn-order-player ${id === playerId ? 'you' : ''} ${id === gameState.currentTurnPlayerId ? 'current' : ''} ${p?.majorityColor ? `majority-${p.majorityColor}` : ''}`}
            >
              {p?.name}{id === playerId ? ' (you)' : ''}
            </span>
          );
        })}
      </div>
    </div>
  );
}
