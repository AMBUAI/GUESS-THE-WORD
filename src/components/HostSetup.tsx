import { ArrowLeft, Users } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { loadSavedDisplayName } from '../utils/storage.ts';

interface HostSetupProps {
  onBack: () => void;
  onCreateRoom: (maxPlayers: number, displayName: string) => Promise<void>;
}

const PLAYER_OPTIONS = [2, 3, 4, 5, 6] as const;

export function HostSetup({ onBack, onCreateRoom }: HostSetupProps) {
  const [displayName, setDisplayName] = useState<string>(() => loadSavedDisplayName() || 'Host');
  const [selectedCount, setSelectedCount] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleSelectCount = async (count: number) => {
    const trimmed = displayName.trim();
    if (!trimmed) {
      setError('Please enter your display name first.');
      return;
    }

    setError(null);
    setSelectedCount(count);
    setIsSubmitting(true);
    try {
      await onCreateRoom(count, trimmed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create room.');
      setSelectedCount(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center px-4 py-8 max-w-xl mx-auto">
      <div className="bg-white rounded-3xl border border-[#E2DDD3] shadow-[0_6px_0_0_#E2DDD3] p-6 sm:p-8">
        <div className="flex items-center justify-between gap-4 mb-6">
          <button
            type="button"
            onClick={onBack}
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 min-h-[44px] px-3 py-2 rounded-xl text-sm font-semibold text-[#4B5563] hover:text-[#151B26] hover:bg-[#F6F4EE] transition-colors whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>BACK</span>
          </button>

          <span className="text-xs font-semibold uppercase tracking-wider text-[#6B7280]">
            Host Game
          </span>
        </div>

        <h1 className="font-display font-bold text-2xl sm:text-3xl text-[#151B26] mb-2">
          Select Player Count
        </h1>
        <p className="text-sm sm:text-base text-[#4B5563] mb-6">
          You count as the first player. Choose the total number of players for this room.
        </p>

        <div className="mb-6">
          <label
            htmlFor="host-display-name"
            className="block text-sm font-semibold text-[#151B26] mb-2"
          >
            Your Display Name
          </label>
          <input
            id="host-display-name"
            type="text"
            maxLength={24}
            value={displayName}
            onChange={(e) => {
              setDisplayName(e.target.value);
              if (error) setError(null);
            }}
            placeholder="Enter your name"
            disabled={isSubmitting}
            className="w-full min-h-[48px] px-4 py-3 rounded-xl border border-[#D8D1C5] bg-[#FAF9F5] text-base font-medium text-[#151B26] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#E84A27] focus:border-[#E84A27]"
          />
        </div>

        {error && (
          <div
            role="alert"
            className="mb-5 px-4 py-3 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-[#991B1B] text-sm font-medium"
          >
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" role="group" aria-label="Player count options">
          {PLAYER_OPTIONS.map((count) => {
            const isLoadingThis = isSubmitting && selectedCount === count;
            return (
              <motion.button
                key={count}
                type="button"
                whileTap={{ scale: 0.98 }}
                disabled={isSubmitting}
                onClick={() => handleSelectCount(count)}
                className={`min-h-[56px] px-5 py-3.5 rounded-2xl border text-left flex items-center justify-between gap-3 transition-all ${
                  isLoadingThis
                    ? 'bg-[#E84A27] border-[#E84A27] text-white'
                    : 'bg-[#FAF9F5] hover:bg-white border-[#D8D1C5] hover:border-[#E84A27] text-[#151B26] shadow-[0_3px_0_0_#E2DDD3] active:translate-y-[1px]'
                }`}
              >
                <span className="font-display font-bold text-base tracking-wide whitespace-nowrap shrink-0">
                  {count} PLAYERS
                </span>
                <span
                  className={`inline-flex items-center gap-1 text-xs font-medium tabular-nums shrink-0 ${
                    isLoadingThis ? 'text-white/90' : 'text-[#6B7280]'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>{isLoadingThis ? 'Creating...' : `Host + ${count - 1}`}</span>
                </span>
              </motion.button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
