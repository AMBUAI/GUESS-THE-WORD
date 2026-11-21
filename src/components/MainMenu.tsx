import { Volume2, VolumeX } from 'lucide-react';
import { motion } from 'motion/react';
import { FullscreenButton } from './FullscreenButton.tsx';

interface MainMenuProps {
  onHostClick: () => void;
  onJoinClick: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
  errorMessage: string | null;
  onDismissError: () => void;
}

export function MainMenu({
  onHostClick,
  onJoinClick,
  isMuted,
  onToggleMute,
  errorMessage,
  onDismissError,
}: MainMenuProps) {
  return (
    <div className="min-h-[100dvh] flex flex-col justify-between px-4 py-6 sm:px-8 sm:py-8 max-w-5xl mx-auto">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5 shrink-0">
          <img
            src="/logo-icon.png"
            alt="GUESS THE WORD icon"
            width={36}
            height={36}
            className="w-9 h-9 rounded-xl border border-[#E2DDD3] object-cover shrink-0"
          />
          <span className="font-display font-bold text-lg tracking-tight text-[#151B26] whitespace-nowrap shrink-0">
            GUESS THE WORD
          </span>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <FullscreenButton />
          <button
            type="button"
            onClick={onToggleMute}
            aria-label={isMuted ? 'Unmute game sounds' : 'Mute game sounds'}
            className="inline-flex items-center gap-2 px-3 py-2 min-h-[44px] rounded-xl border border-[#E2DDD3] bg-white text-sm font-medium text-[#4B5563] hover:text-[#151B26] hover:border-[#C9C2B4] transition-colors whitespace-nowrap shrink-0"
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            <span className="hidden sm:inline">{isMuted ? 'Sound Off' : 'Sound On'}</span>
          </button>
        </div>
      </header>

      <main className="my-auto py-8 sm:py-12">
        {errorMessage && (
          <div
            role="alert"
            className="max-w-xl mx-auto mb-6 flex items-center justify-between gap-4 px-4 py-3 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-[#991B1B] text-sm font-medium"
          >
            <span>{errorMessage}</span>
            <button
              type="button"
              onClick={onDismissError}
              className="text-xs font-semibold underline underline-offset-2 shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
          <div className="lg:col-span-7 text-center lg:text-left">
            <p className="text-sm font-medium text-[#6B7280] mb-3">
              2 to 6 players · Private rooms · Unlimited rounds
            </p>

            <h1
              className="font-display font-extrabold tracking-tight text-[#151B26] leading-[1.02] mb-4"
              style={{ fontSize: 'clamp(2.5rem, 6vw, 4.25rem)', textWrap: 'balance' }}
            >
              GUESS THE WORD
            </h1>

            <p className="text-lg sm:text-xl text-[#4B5563] font-medium mb-8 max-w-xl mx-auto lg:mx-0">
              Think alike. Type alike. Match minds.
            </p>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 justify-center lg:justify-start max-w-md mx-auto lg:mx-0">
              <motion.button
                type="button"
                whileTap={{ scale: 0.98 }}
                onClick={onHostClick}
                className="flex-1 min-h-[56px] px-8 py-3.5 rounded-2xl bg-[#E84A27] hover:bg-[#D03B1A] text-white font-display font-bold text-lg tracking-wide shadow-[0_4px_0_0_#A82B10] active:translate-y-[2px] active:shadow-[0_2px_0_0_#A82B10] transition-all whitespace-nowrap shrink-0"
              >
                HOST
              </motion.button>

              <motion.button
                type="button"
                whileTap={{ scale: 0.98 }}
                onClick={onJoinClick}
                className="flex-1 min-h-[56px] px-8 py-3.5 rounded-2xl bg-white hover:bg-[#FAF9F5] text-[#151B26] font-display font-bold text-lg tracking-wide border border-[#D8D1C5] shadow-[0_4px_0_0_#D8D1C5] active:translate-y-[2px] active:shadow-[0_2px_0_0_#D8D1C5] transition-all whitespace-nowrap shrink-0"
              >
                JOIN
              </motion.button>
            </div>
          </div>

          <div className="lg:col-span-5">
            <div className="bg-white rounded-3xl border border-[#E2DDD3] shadow-[0_6px_0_0_#E2DDD3] p-6 sm:p-7">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7280] mb-4">
                How a round plays out
              </p>

              <div className="space-y-3 mb-6">
                <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-[#F6F4EE] border border-[#E7E2D8]">
                  <span className="text-sm font-semibold text-[#4B5563]">Player 1</span>
                  <span className="font-mono-code font-bold text-base tracking-wider text-[#151B26]">
                    OCEAN
                  </span>
                </div>
                <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-[#F6F4EE] border border-[#E7E2D8]">
                  <span className="text-sm font-semibold text-[#4B5563]">Player 2</span>
                  <span className="font-mono-code font-bold text-base tracking-wider text-[#151B26]">
                    OCEAN
                  </span>
                </div>
                <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-[#ECFDF5] border border-[#A7F3D0]">
                  <span className="text-sm font-semibold text-[#065F46]">Result</span>
                  <span className="font-display font-bold text-sm text-[#0D9458]">
                    YOUR MIND MATCHED!
                  </span>
                </div>
              </div>

              <ol className="space-y-2.5 text-sm text-[#4B5563]">
                <li className="flex gap-2.5">
                  <span className="font-mono-code font-bold text-[#E84A27] shrink-0">01</span>
                  <span>Host a private 6-character room for 2–6 players.</span>
                </li>
                <li className="flex gap-2.5">
                  <span className="font-mono-code font-bold text-[#E84A27] shrink-0">02</span>
                  <span>Everyone secretly submits one word per round.</span>
                </li>
                <li className="flex gap-2.5">
                  <span className="font-mono-code font-bold text-[#E84A27] shrink-0">03</span>
                  <span>Words reveal simultaneously—keep playing until all match.</span>
                </li>
              </ol>
            </div>
          </div>
        </div>
      </main>

      <footer className="text-center text-xs text-[#6B7280] pt-4 space-y-1.5">
        <div>
          <span>Real-time multiplayer</span>
          <span aria-hidden="true" className="mx-2">·</span>
          <span>Simultaneous server reveal</span>
          <span aria-hidden="true" className="mx-2">·</span>
          <span>No round limit</span>
        </div>
        <p className="text-xs font-medium text-[#4B5563]">
          Developed by <span className="font-display font-bold tracking-wide text-[#151B26]">PRAKALP STUDIOS</span>
        </p>
      </footer>
    </div>
  );
}
