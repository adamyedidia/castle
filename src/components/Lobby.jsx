import React, { useState } from 'react';

export default function Lobby({ onJoin, players, hasJoined, playerName, onStartGame, onKickPlayer, houseRules, onUpdateHouseRules, turnTimer, onUpdateTurnTimer }) {
  const [name, setName] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (name.trim()) {
      onJoin(name.trim());
    }
  };

  const playerList = Object.entries(players);

  const handleRuleChange = (rule, value) => {
    if (onUpdateHouseRules) {
      onUpdateHouseRules({ [rule]: value });
    }
  };

  const handleTimerChange = (updates) => {
    if (onUpdateTurnTimer) {
      onUpdateTurnTimer(updates);
    }
  };

  return (
    <div className="lobby">
      <div className="lobby-card">
        <div className="lobby-header">
          <h1>Castle</h1>
          <p className="subtitle">A Game of Hidden Loyalties</p>
        </div>

        {!hasJoined ? (
          <form onSubmit={handleSubmit} className="join-form">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name"
              autoFocus
            />
            <button type="submit" className="btn-primary">
              Join Game
            </button>
          </form>
        ) : (
          <div className="lobby-waiting">
            <p className="welcome">Welcome, <strong>{playerName}</strong></p>

            <div className="players-section">
              <h3>Players in Lobby ({playerList.length})</h3>
              <ul className="player-list">
                {playerList.map(([id, player]) => (
                  <li key={id} className="player-item">
                    <span className="player-icon">♠</span>
                    <span className="player-name-text">{player.name}</span>
                    {onKickPlayer && (
                      <button
                        className="btn-kick"
                        onClick={() => onKickPlayer(id)}
                        title={`Kick ${player.name}`}
                      >
                        ✕
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            {/* House Rules */}
            {houseRules && onUpdateHouseRules && (
              <div className="house-rules-section">
                <h3>House Rules</h3>
                <label className="house-rule-checkbox">
                  <input
                    type="checkbox"
                    checked={houseRules.noCallingSelf ?? true}
                    onChange={(e) => handleRuleChange('noCallingSelf', e.target.checked)}
                  />
                  <span className="checkbox-label">No calling yourself</span>
                  <span className="checkbox-hint">You cannot name yourself as a leader when calling</span>
                </label>
                <label className="house-rule-checkbox">
                  <input
                    type="checkbox"
                    checked={houseRules.oneTraitor ?? true}
                    onChange={(e) => handleRuleChange('oneTraitor', e.target.checked)}
                  />
                  <span className="checkbox-label">One traitor</span>
                  <span className="checkbox-hint">Each team has exactly one player whose soul card is their minority color</span>
                </label>
              </div>
            )}

            {/* Turn Timer */}
            {turnTimer && onUpdateTurnTimer && (
              <div className="house-rules-section">
                <h3>Turn Timer</h3>
                <label className="house-rule-checkbox">
                  <input
                    type="checkbox"
                    checked={turnTimer.enabled ?? false}
                    onChange={(e) => handleTimerChange({ enabled: e.target.checked })}
                  />
                  <span className="checkbox-label">Enable turn timer</span>
                  <span className="checkbox-hint">Auto-move after time runs out</span>
                </label>
                {turnTimer.enabled && (
                  <div className="timer-select">
                    <label>Time per action:</label>
                    <select
                      value={turnTimer.seconds ?? 15}
                      onChange={(e) => handleTimerChange({ seconds: parseInt(e.target.value) })}
                    >
                      <option value={5}>5 seconds</option>
                      <option value={10}>10 seconds</option>
                      <option value={15}>15 seconds</option>
                      <option value={20}>20 seconds</option>
                      <option value={30}>30 seconds</option>
                      <option value={60}>60 seconds</option>
                    </select>
                  </div>
                )}
              </div>
            )}

            {playerList.length >= 2 ? (
              <button onClick={onStartGame} className="btn-primary btn-start">
                Start Game
              </button>
            ) : (
              <p className="waiting-text">Waiting for more players...</p>
            )}
          </div>
        )}
      </div>

      <div className="rules-preview">
        <h3>Quick Rules</h3>
        <ul>
          <li>Your <strong>soul card</strong> is your highest-ranked card</li>
          <li>Soul card color determines your <strong>team</strong></li>
          <li>Submit a card to <strong>duel</strong> another player</li>
          <li>Lower card in a duel gets <strong>revealed</strong></li>
          <li>Figure out who the <strong>team leaders</strong> are!</li>
        </ul>
      </div>
    </div>
  );
}
