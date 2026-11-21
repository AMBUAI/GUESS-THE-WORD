import { useState } from 'react';
import { GameplayScreen } from './components/GameplayScreen.tsx';
import { HostSetup } from './components/HostSetup.tsx';
import { JoinDialog } from './components/JoinDialog.tsx';
import { LobbyScreen } from './components/LobbyScreen.tsx';
import { MainMenu } from './components/MainMenu.tsx';
import { useGameConnection } from './hooks/useGameConnection.ts';
import { isSoundMuted, setSoundMuted } from './utils/sound.ts';

type MenuView = 'HOME' | 'HOST' | 'JOIN';

export default function App() {
  const [menuView, setMenuView] = useState<MenuView>('HOME');
  const [muted, setMuted] = useState<boolean>(() => isSoundMuted());

  const {
    credentials,
    roomState,
    wsStatus,
    isRestoring,
    roomError,
    clockOffsetMs,
    hostRoom,
    joinRoom,
    startGame,
    submitWord,
    leaveRoom,
    clearError,
  } = useGameConnection();

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    setSoundMuted(next);
  };

  if (isRestoring) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center px-4">
        <div className="text-center space-y-2">
          <p className="font-display font-bold text-2xl text-[#151B26]">GUESS THE WORD</p>
          <p className="text-sm font-medium text-[#6B7280]">Reconnecting to your room...</p>
        </div>
      </div>
    );
  }

  if (roomState && credentials) {
    if (roomState.roomStatus === 'WAITING') {
      return (
        <LobbyScreen
          roomState={roomState}
          currentPlayerId={credentials.playerId}
          wsStatus={wsStatus}
          onStartGame={startGame}
          onLeaveRoom={async () => {
            await leaveRoom();
            setMenuView('HOME');
          }}
        />
      );
    }

    return (
      <GameplayScreen
        roomState={roomState}
        currentPlayerId={credentials.playerId}
        wsStatus={wsStatus}
        clockOffsetMs={clockOffsetMs}
        isMuted={muted}
        onToggleMute={toggleMute}
        onSubmitWord={submitWord}
        onReturnToMenu={async () => {
          await leaveRoom();
          setMenuView('HOME');
        }}
      />
    );
  }

  if (menuView === 'HOST') {
    return (
      <HostSetup
        onBack={() => setMenuView('HOME')}
        onCreateRoom={async (maxPlayers, displayName) => {
          await hostRoom(maxPlayers, displayName);
        }}
      />
    );
  }

  if (menuView === 'JOIN') {
    return (
      <JoinDialog
        onBack={() => setMenuView('HOME')}
        onJoinRoom={async (roomCode, displayName) => {
          await joinRoom(roomCode, displayName);
        }}
      />
    );
  }

  return (
    <MainMenu
      onHostClick={() => {
        clearError();
        setMenuView('HOST');
      }}
      onJoinClick={() => {
        clearError();
        setMenuView('JOIN');
      }}
      isMuted={muted}
      onToggleMute={toggleMute}
      errorMessage={roomError}
      onDismissError={clearError}
    />
  );
}
