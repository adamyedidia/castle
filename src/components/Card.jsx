import React from 'react';

export default function Card({ card, back, revealed, isSubmitted, disabled, small, privateKnowledge }) {
  // If no card data and not revealed, show card back
  if (!card && !revealed) {
    return (
      <div className={`card card-back ${back === 'red' ? 'back-red' : 'back-blue'} ${small ? 'card-small' : ''} ${isSubmitted ? 'submitted' : ''}`}>
        <div className="back-pattern">
          <span className="back-icon">{back === 'red' ? '♦' : '♠'}</span>
        </div>
      </div>
    );
  }

  // Revealed card placeholder (shouldn't happen with proper data)
  if (!card && revealed) {
    return (
      <div className={`card card-revealed-back ${back === 'red' ? 'back-red' : 'back-blue'} ${small ? 'card-small' : ''}`}>
        <div className="revealed-indicator">?</div>
      </div>
    );
  }

  const isJoker = card.rank === 'joker';
  const isRed = card.color === 'red';
  const displayText = isJoker ? 'Joker' : card.rank;
  const isTwoDigit = !isJoker && String(card.rank).length >= 2;

  return (
    <div
      className={`card card-front ${small ? 'card-small' : ''} ${isSubmitted ? 'submitted' : ''} ${disabled ? 'disabled' : ''} ${privateKnowledge ? 'private-knowledge' : ''}`}
    >
      <span className={`card-rank ${isRed ? 'rank-red' : 'rank-black'} ${isJoker ? 'rank-joker' : ''} ${isTwoDigit ? 'rank-two-digit' : ''}`}>
        {displayText}
      </span>
    </div>
  );
}
