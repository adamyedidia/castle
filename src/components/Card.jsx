import React from 'react';

const SUIT_SYMBOLS = {
  diamonds: '♦',
  spades: '♠',
  hearts: '♥',
  clubs: '♣',
  joker: '★'
};

const SUIT_COLORS = {
  diamonds: '#c41e3a',
  hearts: '#c41e3a',
  spades: '#1a1a2e',
  clubs: '#1a1a2e',
  joker: null // Determined by card color
};

export default function Card({ card, back, revealed, isSubmitted, disabled, small }) {
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

  // Revealed card (shown face-up)
  if (!card && revealed) {
    return (
      <div className={`card card-revealed-back ${back === 'red' ? 'back-red' : 'back-blue'} ${small ? 'card-small' : ''}`}>
        <div className="revealed-indicator">?</div>
      </div>
    );
  }

  const isJoker = card.rank === 'joker';
  const suitSymbol = SUIT_SYMBOLS[card.suit] || '?';
  const color = isJoker
    ? (card.color === 'red' ? '#c41e3a' : '#1a1a2e')
    : SUIT_COLORS[card.suit];

  const displayRank = isJoker ? 'JOKER' : card.rank;

  return (
    <div
      className={`card card-front ${small ? 'card-small' : ''} ${isSubmitted ? 'submitted' : ''} ${disabled ? 'disabled' : ''}`}
      style={{ '--card-color': color }}
    >
      <div className="card-corner top-left">
        <span className="rank">{displayRank}</span>
        <span className="suit">{suitSymbol}</span>
      </div>

      <div className="card-center">
        {isJoker ? (
          <span className="joker-symbol">★</span>
        ) : (
          <span className="center-suit">{suitSymbol}</span>
        )}
      </div>

      <div className="card-corner bottom-right">
        <span className="rank">{displayRank}</span>
        <span className="suit">{suitSymbol}</span>
      </div>
    </div>
  );
}

