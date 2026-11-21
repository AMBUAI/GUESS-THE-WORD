import { CheckCircle2, Clock, Lock, Sparkles, Volume2, VolumeX, Wifi, WifiOff } from 'lucide-react';
import { motion } from 'motion/react';
import { type FormEvent, useEffect, useState } from 'react';
import type { WsConnectionStatus } from '../hooks/useGameConnection.ts';
import type { RoomPublicState } from '../types.ts';
import { playSubmitSound } from '../utils/sound.ts';
import { ConfettiCanvas } from './ConfettiCanvas.tsx';
import { FullscreenButton } from './FullscreenButton.tsx';

interface GameplayScreenProps {
  roomState: RoomPublicState;
  currentPlayerId: string;
  wsStatus: WsConnectionStatus;
  clockOffsetMs: number;
  isMuted: boolean;
  onToggleMute: () => void;
  onSubmitWord: (word: string) => Promise<void>;
  onReturnToMenu: () => Promise<void>;
}

export function GameplayScreen({
  roomState,
  currentPlayerId,
  wsStatus,
  clockOffsetMs,
  isMuted,
  onToggleMute,
  onSubmitWord,
  onReturnToMenu,
}: GameplayScreenProps) {
  const [wordInput, setWordInput] = useState<string>('');
  const [isSending, setIsSending] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number>(0);

  const currentPlayer = roomState.players.find((p) => p.id === currentPlayerId);
  const hasSubmitted = Boolean(currentPlayer?.hasSubmitted);

  // Clear local word input when transitioning to a new round
  useEffect(() => {
    setWordInput('');
    setError(null);
    setIsSending(false);
  }, [roomState.currentRound]);

  // Countdown display synced to server revealEndsAt
  useEffect(() => {
    if (roomState.roomStatus !== 'REVEAL' || !roomState.revealEndsAt) {
      setSecondsLeft(0);
      return;
    }

    const updateTimer = () => {
      const remainingMs = (roomState.revealEndsAt ?? 0) - (Date.now() + clockOffsetMs);
      setSecondsLeft(Math.max(0, Math.ceil(remainingMs / 1000)));
    };

    updateTimer();
    const interval = window.setInterval(updateTimer, 200);
    return () => window.clearInterval(interval);
  }, [roomState.roomStatus, roomState.revealEndsAt, clockOffsetMs]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (hasSubmitted || isSending || roomState.roomStatus !== 'PLAYING') return;

    const trimmed = wordInput.trim();
    if (!trimmed) {
      setError('Empty submissions are not allowed.');
      return;
    }
    if (/\s/.test(trimmed)) {
      setError('Multiple words are not allowed. Enter exactly one word.');
      return;
    }
    if (trimmed.length > 40) {
      setError('Word must be 40 characters or fewer.');
      return;
    }

    setError(null);
    setIsSending(true);
    try {
      await onSubmitWord(trimmed);
      playSubmitSound();
      setWordInput('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit word.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col px-4 py-5 sm:px-8 sm:py-7 max-w-4xl mx-auto">
      {roomState.roomStatus === 'FINISHED' && <ConfettiCanvas />}

      <header className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-display font-bold text-lg tracking-tight text-[#151B26] whitespace-nowrap shrink-0">
            GUESS THE WORD
          </span>
          <span className="text-[#D8D1C5]" aria-hidden="true">·</span>
          <span className="font-mono-code font-bold text-sm text-[#4B5563] whitespace-nowrap shrink-0">
            ROOM {roomState.roomCode}
          </span>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span
            className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${
              wsStatus === 'connected' ? 'text-[#0D9458]' : 'text-[#D97706]'
            }`}
          >
            {wsStatus === 'connected' ? (
              <Wifi className="w-3.5 h-3.5" />
            ) : (
              <WifiOff className="w-3.5 h-3.5" />
            )}
            <span className="hidden sm:inline">
              {wsStatus === 'connected' ? 'Connected' : 'Reconnecting...'}
            </span>
          </span>

          <FullscreenButton />

          <button
            type="button"
            onClick={onToggleMute}
            aria-label={isMuted ? 'Unmute game sounds' : 'Mute game sounds'}
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl border border-[#E2DDD3] bg-white text-[#4B5563] hover:text-[#151B26] transition-colors"
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
      </header>

      <main className="my-auto">
        {roomState.roomStatus === 'PLAYING' && (
          <div className="space-y-6">
            <div className="bg-white rounded-3xl border border-[#E2DDD3] shadow-[0_6px_0_0_#E2DDD3] p-6 sm:p-8 text-center">
              <p className="font-mono-code font-bold text-sm uppercase tracking-widest text-[#E84A27] mb-2">
                ROUND {roomState.currentRound}
              </p>

              <h1
                className="font-display font-bold text-2xl sm:text-3xl text-[#151B26] mb-2"
                style={{ textWrap: 'balance' }}
              >
                Think of one word and submit it. Let&apos;s see if everyone&apos;s mind matches!
              </h1>

              <p className="text-sm text-[#6B7280] mb-7">
                Your word stays secret until every player submits. Case does not matter.
              </p>

              {!hasSubmitted ? (
                <form onSubmit={handleSubmit} className="max-w-md mx-auto space-y-4" noValidate>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <label htmlFor="secret-word-input" className="sr-only">
                      Your one-word guess
                    </label>
                    <input
                      id="secret-word-input"
                      type="text"
                      autoComplete="off"
                      autoCorrect="off"
                      spellCheck={false}
                      enterKeyHint="send"
                      maxLength={40}
                      value={wordInput}
                      onChange={(e) => {
                        setWordInput(e.target.value);
                        if (error) setError(null);
                      }}
                      placeholder="Type one word..."
                      disabled={isSending}
                      className="flex-1 min-h-[54px] px-5 py-3 rounded-2xl border border-[#D8D1C5] bg-[#FAF9F5] font-display font-bold text-xl text-center text-[#151B26] placeholder:text-[#9CA3AF] placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-[#E84A27] focus:border-[#E84A27]"
                    />
                    <motion.button
                      type="submit"
                      whileTap={{ scale: 0.98 }}
                      disabled={isSending}
                      className="min-h-[54px] px-8 py-3 rounded-2xl bg-[#E84A27] hover:bg-[#D03B1A] disabled:opacity-60 text-white font-display font-bold text-lg tracking-wide shadow-[0_4px_0_0_#A82B10] active:translate-y-[1px] transition-all whitespace-nowrap shrink-0"
                    >
                      {isSending ? 'SENDING...' : 'SEND'}
                    </motion.button>
                  </div>

                  {error && (
                    <p role="alert" className="text-sm font-medium text-[#DC2626]">
                      {error}
                    </p>
                  )}
                </form>
              ) : (
                <motion.div
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="max-w-md mx-auto px-6 py-5 rounded-2xl bg-[#ECFDF5] border border-[#A7F3D0]"
                >
                  <div className="inline-flex items-center gap-2 font-display font-bold text-lg text-[#065F46] mb-1">
                    <Lock className="w-5 h-5 text-[#0D9458]" />
                    <span>Word Locked In</span>
                  </div>
                  <p className="text-sm text-[#047857]">
                    Waiting for everyone else to submit. All words will reveal together.
                  </p>
                </motion.div>
              )}
            </div>

            <div className="bg-white rounded-3xl border border-[#E2DDD3] shadow-[0_4px_0_0_#E2DDD3] p-5 sm:p-6">
              <div className="flex items-center justify-between gap-4 mb-4">
                <span className="font-display font-bold text-base text-[#151B26] tabular-nums">
                  {roomState.submittedCount}/{roomState.maxPlayers} PLAYERS SUBMITTED
                </span>
                <span className="text-xs font-medium text-[#6B7280]">
                  Words remain hidden
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {roomState.players.map((player) => {
                  const isMe = player.id === currentPlayerId;
                  return (
                    <div
                      key={player.id}
                      className={`flex items-center justify-between gap-3 px-4 py-3 rounded-xl border ${
                        player.hasSubmitted
                          ? 'bg-[#ECFDF5] border-[#A7F3D0]'
                          : 'bg-[#FAF9F5] border-[#E7E2D8]'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-[#151B26] truncate">
                          {player.displayName} {isMe ? '(You)' : ''}
                        </p>
                        {player.connectionStatus === 'disconnected' && (
                          <p className="text-xs font-medium text-[#D97706]">Reconnecting...</p>
                        )}
                      </div>

                      {player.hasSubmitted ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-[#0D9458] shrink-0">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Submitted</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-[#6B7280] shrink-0">
                          <Clock className="w-3.5 h-3.5" />
                          <span>Thinking...</span>
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {roomState.roomStatus === 'REVEAL' && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="bg-white rounded-3xl border border-[#E2DDD3] shadow-[0_6px_0_0_#E2DDD3] p-6 sm:p-8"
          >
            <div className="text-center mb-7">
              <p className="font-mono-code font-bold text-sm uppercase tracking-widest text-[#6B7280] mb-2">
                ROUND {roomState.currentRound} RESULTS
              </p>
              <h1
                className="font-display font-extrabold text-2xl sm:text-4xl text-[#B45309] mb-2"
                style={{ textWrap: 'balance' }}
              >
                MINDS DIDN&apos;T MATCH THIS TIME!
              </h1>
              <p className="text-base text-[#4B5563]">
                Not quite! Let&apos;s try again.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-7">
              {roomState.revealedSubmissions.map((entry, idx) => (
                <motion.div
                  key={entry.playerId}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.18, delay: idx * 0.03 }}
                  className="px-5 py-4 rounded-2xl bg-[#FAF9F5] border border-[#E2DDD3] flex flex-col items-center text-center"
                >
                  <span className="text-xs font-semibold uppercase tracking-wider text-[#6B7280] mb-1 truncate max-w-full">
                    {entry.displayName}
                  </span>
                  <span className="font-mono-code font-bold text-2xl tracking-wider text-[#151B26] break-all">
                    {entry.word}
                  </span>
                </motion.div>
              ))}
            </div>

            <div className="px-4 py-3.5 rounded-2xl bg-[#FFFBEB] border border-[#FDE68A] text-center">
              <p className="text-sm font-semibold text-[#92400E] tabular-nums">
                {secondsLeft > 0
                  ? `Moving to Round ${roomState.currentRound + 1} in ${secondsLeft}s...`
                  : `Starting Round ${roomState.currentRound + 1}...`}
              </p>
            </div>
          </motion.div>
        )}

        {roomState.roomStatus === 'FINISHED' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.25 }}
            className="bg-white rounded-3xl border border-[#A7F3D0] shadow-[0_6px_0_0_#A7F3D0] p-6 sm:p-10 text-center"
          >
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#ECFDF5] text-[#0D9458] mb-4">
              <Sparkles className="w-7 h-7" />
            </div>

            <p className="font-mono-code font-bold text-sm uppercase tracking-widest text-[#0D9458] mb-2">
              ROUND {roomState.currentRound} RESULTS
            </p>

            <h1
              className="font-display font-extrabold text-3xl sm:text-5xl text-[#151B26] mb-3"
              style={{ textWrap: 'balance' }}
            >
              YOUR MIND MATCHED!
            </h1>

            <p className="text-base sm:text-lg text-[#4B5563] mb-7">
              Everyone thought of the same word!
            </p>

            {roomState.winningWord && (
              <div className="inline-block px-8 py-4 rounded-2xl bg-[#ECFDF5] border border-[#6EE7B7] mb-8">
                <span className="block text-xs font-semibold uppercase tracking-wider text-[#047857] mb-1">
                  Matched Word
                </span>
                <span className="font-mono-code font-bold text-3xl sm:text-4xl tracking-widest text-[#065F46]">
                  {roomState.winningWord}
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-8 text-left">
              {roomState.revealedSubmissions.map((entry) => (
                <div
                  key={entry.playerId}
                  className="px-4 py-3.5 rounded-2xl bg-[#F6F4EE] border border-[#E2DDD3] flex items-center justify-between gap-3"
                >
                  <span className="font-semibold text-sm text-[#4B5563] truncate">
                    {entry.displayName}
                  </span>
                  <span className="font-mono-code font-bold text-base tracking-wider text-[#0D9458] shrink-0">
                    {entry.word}
                  </span>
                </div>
              ))}
            </div>

            <motion.button
              type="button"
              whileTap={{ scale: 0.98 }}
              onClick={() => void onReturnToMenu()}
              className="min-h-[54px] px-8 py-3.5 rounded-2xl bg-[#E84A27] hover:bg-[#D03B1A] text-white font-display font-bold text-lg tracking-wide shadow-[0_4px_0_0_#A82B10] active:translate-y-[1px] transition-all whitespace-nowrap shrink-0"
            >
              BACK TO MENU
            </motion.button>
          </motion.div>
        )}
      </main>
    </div>
  );
}
