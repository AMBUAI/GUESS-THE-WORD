import { Check, Copy, Crown, LogOut, Wifi, WifiOff } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import type { WsConnectionStatus } from '../hooks/useGameConnection.ts';
import type { RoomPublicState } from '../types.ts';

interface LobbyScreenProps {
  roomState: RoomPublicState;
  currentPlayerId: string;
  wsStatus: WsConnectionStatus;
  onStartGame: () => Promise<void>;
  onLeaveRoom: () => Promise<void>;
}

export function LobbyScreen({
  roomState,
  currentPlayerId,
  wsStatus,
  onStartGame,
  onLeaveRoom,
}: LobbyScreenProps) {
  const [copied, setCopied] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentPlayer = roomState.players.find((p) => p.id === currentPlayerId);
  const isHost = Boolean(currentPlayer?.isHost);
  const isFull = roomState.players.length >= roomState.maxPlayers;

  const handleCopyCode = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(roomState.roomCode);
      } else {
        const el = document.createElement('textarea');
        el.value = roomState.roomCode;
        el.style.position = 'fixed';
        el.style.opacity = '0';
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard failures
    }
  };

  const handleStart = async () => {
    setError(null);
    setIsStarting(true);
    try {
      await onStartGame();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start game.');
    } finally {
      setIsStarting(false);
    }
  };

  const slots = Array.from({ length: roomState.maxPlayers }, (_, idx) => {
    return roomState.players[idx] ?? null;
  });

  return (
    <div className="min-h-screen flex flex-col px-4 py-6 sm:px-8 sm:py-8 max-w-3xl mx-auto">
      <header className="flex items-center justify-between gap-4 mb-6">
        <span className="font-display font-bold text-lg tracking-tight text-[#151B26] whitespace-nowrap shrink-0">
          GUESS THE WORD
        </span>

        <div className="flex items-center gap-4 shrink-0">
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
            <span>{wsStatus === 'connected' ? 'Connected' : 'Reconnecting...'}</span>
          </span>

          <button
            type="button"
            onClick={() => void onLeaveRoom()}
            className="inline-flex items-center gap-1.5 min-h-[40px] px-3 py-1.5 rounded-xl border border-[#E2DDD3] bg-white hover:bg-[#FAF9F5] text-xs font-semibold text-[#4B5563] hover:text-[#151B26] transition-colors whitespace-nowrap shrink-0"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>LEAVE</span>
          </button>
        </div>
      </header>

      <main className="my-auto">
        <div className="bg-white rounded-3xl border border-[#E2DDD3] shadow-[0_6px_0_0_#E2DDD3] p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5 pb-6 border-b border-[#EFECE4]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7280] mb-1">
                Room Code
              </p>
              <div className="flex items-center gap-3 flex-wrap">
                <span
                  data-testid="lobby-room-code"
                  className="font-mono-code font-bold text-3xl sm:text-4xl tracking-[0.2em] text-[#151B26]"
                >
                  {roomState.roomCode}
                </span>
                <button
                  type="button"
                  onClick={() => void handleCopyCode()}
                  className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-xl border border-[#D8D1C5] bg-[#FAF9F5] hover:bg-[#F1EDE4] text-sm font-semibold text-[#151B26] transition-colors whitespace-nowrap shrink-0"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4 text-[#0D9458]" />
                      <span className="text-[#0D9458]">COPIED</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>COPY CODE</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="sm:text-right">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7280] mb-1">
                Lobby Capacity
              </p>
              <p
                data-testid="lobby-player-count"
                className="font-display font-bold text-2xl text-[#151B26] tabular-nums"
              >
                PLAYERS: {roomState.players.length}/{roomState.maxPlayers}
              </p>
            </div>
          </div>

          <div className="py-6">
            <div className="space-y-2.5">
              <AnimatePresence initial={false}>
                {slots.map((player, idx) => {
                  const slotNum = idx + 1;
                  if (!player) {
                    return (
                      <div
                        key={`empty-${slotNum}`}
                        className="flex items-center justify-between px-4 py-3.5 rounded-2xl border border-dashed border-[#D8D1C5] bg-[#FAF9F5] text-[#9CA3AF]"
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-mono-code font-bold text-sm tabular-nums w-6">
                            {slotNum}.
                          </span>
                          <span className="text-sm font-medium">Waiting for player...</span>
                        </div>
                      </div>
                    );
                  }

                  const isMe = player.id === currentPlayerId;
                  return (
                    <motion.div
                      key={player.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.18 }}
                      className={`flex items-center justify-between gap-3 px-4 py-3.5 rounded-2xl border ${
                        isMe
                          ? 'bg-[#FFF8F5] border-[#F6C8BC]'
                          : 'bg-[#F6F4EE] border-[#E7E2D8]'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-mono-code font-bold text-sm text-[#6B7280] tabular-nums w-6 shrink-0">
                          {slotNum}.
                        </span>
                        <span className="font-semibold text-base text-[#151B26] truncate">
                          {player.displayName}
                        </span>
                        {isMe && (
                          <span className="text-xs font-medium text-[#6B7280] shrink-0">
                            (You)
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        {player.connectionStatus === 'disconnected' && (
                          <span className="text-xs font-semibold text-[#D97706]">
                            Reconnecting
                          </span>
                        )}
                        {player.isHost && (
                          <span className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-[#E84A27]">
                            <Crown className="w-3.5 h-3.5" />
                            <span>HOST</span>
                          </span>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-5 px-4 py-3 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-[#991B1B] text-sm font-medium"
            >
              {error}
            </div>
          )}

          <div className="pt-2">
            {isHost ? (
              <div className="space-y-3">
                <motion.button
                  type="button"
                  whileTap={isFull ? { scale: 0.98 } : undefined}
                  disabled={!isFull || isStarting}
                  onClick={() => void handleStart()}
                  className="w-full min-h-[54px] px-6 py-3.5 rounded-2xl bg-[#E84A27] hover:bg-[#D03B1A] disabled:bg-[#E5E0D8] disabled:text-[#9CA3AF] disabled:shadow-none text-white font-display font-bold text-lg tracking-wide shadow-[0_4px_0_0_#A82B10] transition-all whitespace-nowrap shrink-0"
                >
                  {isStarting ? 'STARTING GAME...' : 'START GAME'}
                </motion.button>
                {!isFull && (
                  <p className="text-center text-sm text-[#6B7280]">
                    Share code <span className="font-mono-code font-bold text-[#151B26]">{roomState.roomCode}</span> — game can start once all {roomState.maxPlayers} players join.
                  </p>
                )}
              </div>
            ) : (
              <div className="px-4 py-4 rounded-2xl bg-[#FAF9F5] border border-[#E7E2D8] text-center">
                <p className="text-sm sm:text-base font-medium text-[#4B5563]">
                  {isFull
                    ? 'All players are in! Waiting for the host to start the game...'
                    : `Waiting for more players (${roomState.players.length}/${roomState.maxPlayers}) and the host to start...`}
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
