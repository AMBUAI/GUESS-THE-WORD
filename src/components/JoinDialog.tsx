import { ArrowLeft } from 'lucide-react';
import { motion } from 'motion/react';
import { type FormEvent, useState } from 'react';
import { loadSavedDisplayName } from '../utils/storage.ts';

interface JoinDialogProps {
  onBack: () => void;
  onJoinRoom: (roomCode: string, displayName: string) => Promise<void>;
}

export function JoinDialog({ onBack, onJoinRoom }: JoinDialogProps) {
  const [displayName, setDisplayName] = useState<string>(() => loadSavedDisplayName());
  const [roomCode, setRoomCode] = useState<string>('');
  const [isJoining, setIsJoining] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleCodeChange = (raw: string) => {
    const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    setRoomCode(cleaned);
    if (error) setError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmedName = displayName.trim();
    const normalizedCode = roomCode.trim().toUpperCase();

    if (!trimmedName) {
      setError('Please enter your display name.');
      return;
    }

    if (!/^[A-Z0-9]{6}$/.test(normalizedCode)) {
      setError('Enter a valid 6-character alphanumeric room code.');
      return;
    }

    setError(null);
    setIsJoining(true);
    try {
      await onJoinRoom(normalizedCode, trimmedName);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to join room.');
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center px-4 py-8 max-w-lg mx-auto">
      <div
        role="dialog"
        aria-labelledby="join-dialog-title"
        className="bg-white rounded-3xl border border-[#E2DDD3] shadow-[0_6px_0_0_#E2DDD3] p-6 sm:p-8"
      >
        <div className="flex items-center justify-between gap-4 mb-6">
          <button
            type="button"
            onClick={onBack}
            disabled={isJoining}
            className="inline-flex items-center gap-2 min-h-[44px] px-3 py-2 rounded-xl text-sm font-semibold text-[#4B5563] hover:text-[#151B26] hover:bg-[#F6F4EE] transition-colors whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>BACK</span>
          </button>

          <span className="text-xs font-semibold uppercase tracking-wider text-[#6B7280]">
            Join Room
          </span>
        </div>

        <h1 id="join-dialog-title" className="font-display font-bold text-2xl sm:text-3xl text-[#151B26] mb-2">
          Enter Room Code
        </h1>
        <p className="text-sm sm:text-base text-[#4B5563] mb-6">
          Ask the host for their 6-character code to join the lobby.
        </p>

        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          <div>
            <label
              htmlFor="join-display-name"
              className="block text-sm font-semibold text-[#151B26] mb-2"
            >
              Your Display Name
            </label>
            <input
              id="join-display-name"
              type="text"
              maxLength={24}
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value);
                if (error) setError(null);
              }}
              placeholder="Enter your name"
              disabled={isJoining}
              className="w-full min-h-[48px] px-4 py-3 rounded-xl border border-[#D8D1C5] bg-[#FAF9F5] text-base font-medium text-[#151B26] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#E84A27] focus:border-[#E84A27]"
            />
          </div>

          <div>
            <label
              htmlFor="join-room-code"
              className="block text-sm font-semibold text-[#151B26] mb-2"
            >
              6-Character Room Code
            </label>
            <input
              id="join-room-code"
              type="text"
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              maxLength={6}
              value={roomCode}
              onChange={(e) => handleCodeChange(e.target.value)}
              placeholder="A7K9P2"
              disabled={isJoining}
              className="w-full min-h-[58px] px-4 py-3 rounded-xl border border-[#D8D1C5] bg-[#FAF9F5] font-mono-code font-bold text-2xl tracking-[0.28em] text-center uppercase text-[#151B26] placeholder:text-[#C5BEB2] focus:outline-none focus:ring-2 focus:ring-[#E84A27] focus:border-[#E84A27]"
            />
          </div>

          {error && (
            <div
              role="alert"
              className="px-4 py-3 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-[#991B1B] text-sm font-medium"
            >
              {error}
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row gap-3 pt-1">
            <button
              type="button"
              onClick={onBack}
              disabled={isJoining}
              className="sm:w-1/3 min-h-[50px] px-5 py-3 rounded-2xl border border-[#D8D1C5] bg-white hover:bg-[#FAF9F5] text-[#151B26] font-display font-bold text-base transition-colors whitespace-nowrap shrink-0"
            >
              BACK
            </button>
            <motion.button
              type="submit"
              whileTap={{ scale: 0.98 }}
              disabled={isJoining}
              className="sm:w-2/3 min-h-[50px] px-6 py-3 rounded-2xl bg-[#E84A27] hover:bg-[#D03B1A] disabled:opacity-60 text-white font-display font-bold text-base tracking-wide shadow-[0_4px_0_0_#A82B10] active:translate-y-[1px] transition-all whitespace-nowrap shrink-0"
            >
              {isJoining ? 'JOINING...' : 'JOIN GAME'}
            </motion.button>
          </div>
        </form>
      </div>
    </div>
  );
}
