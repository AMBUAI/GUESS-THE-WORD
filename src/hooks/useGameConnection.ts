import { useCallback, useEffect, useRef, useState } from 'react';
import type { RoomPublicState, SessionCredentials, WsServerMessage } from '../types.ts';
import { playJoinSound, playMismatchSound, playVictorySound } from '../utils/sound.ts';
import { clearActiveSession, loadActiveSession, saveActiveSession } from '../utils/storage.ts';

export type WsConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

interface ApiErrorPayload {
  error?: string;
}

async function apiRequest<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });

  const data = (await response.json().catch(() => ({}))) as T & ApiErrorPayload;
  if (!response.ok) {
    throw new Error(data.error || 'Request failed. Please try again.');
  }
  return data;
}

export function useGameConnection() {
  const [credentials, setCredentials] = useState<SessionCredentials | null>(null);
  const [roomState, setRoomState] = useState<RoomPublicState | null>(null);
  const [wsStatus, setWsStatus] = useState<WsConnectionStatus>('idle');
  const [isRestoring, setIsRestoring] = useState<boolean>(true);
  const [roomError, setRoomError] = useState<string | null>(null);
  const [clockOffsetMs, setClockOffsetMs] = useState<number>(0);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef<number>(0);
  const prevStateRef = useRef<RoomPublicState | null>(null);
  const activeCredsRef = useRef<SessionCredentials | null>(null);

  const applyRoomState = useCallback((next: RoomPublicState) => {
    setClockOffsetMs(next.serverTime - Date.now());
    const prev = prevStateRef.current;

    if (prev && prev.roomCode === next.roomCode) {
      if (next.roomStatus === 'WAITING' && next.players.length > prev.players.length) {
        playJoinSound();
      }
      if (prev.roomStatus === 'PLAYING' && next.roomStatus === 'REVEAL') {
        playMismatchSound();
      }
      if (prev.roomStatus !== 'FINISHED' && next.roomStatus === 'FINISHED') {
        playVictorySound();
      }
    }

    prevStateRef.current = next;
    setRoomState(next);
    setRoomError(null);
  }, []);

  const disconnectSocket = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (wsRef.current) {
      const socket = wsRef.current;
      wsRef.current = null;
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close();
      }
    }
    setWsStatus('idle');
  }, []);

  const connectSocket = useCallback(
    (creds: SessionCredentials) => {
      disconnectSocket();
      activeCredsRef.current = creds;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      setWsStatus(reconnectAttemptRef.current > 0 ? 'reconnecting' : 'connecting');
      const socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        reconnectAttemptRef.current = 0;
        setWsStatus('connected');
        socket.send(
          JSON.stringify({
            type: 'auth',
            roomCode: creds.roomCode,
            sessionToken: creds.sessionToken,
          })
        );
      };

      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(String(event.data)) as WsServerMessage;
          if (msg.type === 'room:state' && msg.state) {
            applyRoomState(msg.state);
          } else if (msg.type === 'room:closed') {
            setRoomError(msg.message || 'This room is no longer available.');
            clearActiveSession();
            activeCredsRef.current = null;
            setCredentials(null);
            setRoomState(null);
            disconnectSocket();
          } else if (msg.type === 'error' && msg.message) {
            setRoomError(msg.message);
          }
        } catch {
          // Ignore malformed frame
        }
      };

      socket.onclose = () => {
        if (wsRef.current !== socket) return;
        wsRef.current = null;
        if (!activeCredsRef.current) {
          setWsStatus('disconnected');
          return;
        }
        reconnectAttemptRef.current += 1;
        const delay = Math.min(4000, 400 * Math.pow(1.5, reconnectAttemptRef.current - 1));
        setWsStatus('reconnecting');
        reconnectTimerRef.current = window.setTimeout(() => {
          if (activeCredsRef.current) {
            connectSocket(activeCredsRef.current);
          }
        }, delay);
      };
    },
    [applyRoomState, disconnectSocket]
  );

  // Restore session on initial page load / refresh
  useEffect(() => {
    let cancelled = false;
    const saved = loadActiveSession();
    if (!saved) {
      setIsRestoring(false);
      return;
    }

    (async () => {
      try {
        const res = await apiRequest<{ roomState: RoomPublicState }>(
          `/api/rooms/${encodeURIComponent(saved.roomCode)}/session`,
          {
            headers: {
              Authorization: `Bearer ${saved.sessionToken}`,
            },
          }
        );
        if (cancelled) return;
        setCredentials(saved);
        applyRoomState(res.roomState);
        connectSocket(saved);
      } catch {
        if (cancelled) return;
        clearActiveSession();
        setCredentials(null);
        setRoomState(null);
      } finally {
        if (!cancelled) {
          setIsRestoring(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applyRoomState, connectSocket]);

  useEffect(() => {
    return () => {
      activeCredsRef.current = null;
      disconnectSocket();
    };
  }, [disconnectSocket]);

  // Periodically sync when REVEAL deadline passes in case a WS packet was missed
  useEffect(() => {
    if (!roomState || roomState.roomStatus !== 'REVEAL' || !roomState.revealEndsAt || !credentials) {
      return;
    }

    const msUntilRevealEnd = roomState.revealEndsAt - (Date.now() + clockOffsetMs);
    const timeout = window.setTimeout(async () => {
      try {
        const res = await apiRequest<{ roomState: RoomPublicState }>(
          `/api/rooms/${encodeURIComponent(credentials.roomCode)}/session`,
          {
            headers: {
              Authorization: `Bearer ${credentials.sessionToken}`,
            },
          }
        );
        applyRoomState(res.roomState);
      } catch {
        // Ignore transient sync error
      }
    }, Math.max(150, msUntilRevealEnd + 200));

    return () => window.clearTimeout(timeout);
  }, [roomState, credentials, clockOffsetMs, applyRoomState]);

  const hostRoom = useCallback(
    async (maxPlayers: number, displayName: string): Promise<void> => {
      const res = await apiRequest<{ roomState: RoomPublicState; credentials: SessionCredentials }>(
        '/api/rooms',
        {
          method: 'POST',
          body: JSON.stringify({ maxPlayers, displayName }),
        }
      );
      saveActiveSession(res.credentials);
      setCredentials(res.credentials);
      prevStateRef.current = res.roomState;
      setRoomState(res.roomState);
      setClockOffsetMs(res.roomState.serverTime - Date.now());
      connectSocket(res.credentials);
    },
    [connectSocket]
  );

  const joinRoom = useCallback(
    async (roomCode: string, displayName: string): Promise<void> => {
      const res = await apiRequest<{ roomState: RoomPublicState; credentials: SessionCredentials }>(
        '/api/rooms/join',
        {
          method: 'POST',
          body: JSON.stringify({ roomCode, displayName }),
        }
      );
      saveActiveSession(res.credentials);
      setCredentials(res.credentials);
      prevStateRef.current = res.roomState;
      setRoomState(res.roomState);
      setClockOffsetMs(res.roomState.serverTime - Date.now());
      connectSocket(res.credentials);
    },
    [connectSocket]
  );

  const startGame = useCallback(async (): Promise<void> => {
    if (!credentials) return;
    const res = await apiRequest<{ roomState: RoomPublicState }>(
      `/api/rooms/${encodeURIComponent(credentials.roomCode)}/start`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${credentials.sessionToken}` },
      }
    );
    applyRoomState(res.roomState);
  }, [credentials, applyRoomState]);

  const submitWord = useCallback(
    async (word: string): Promise<void> => {
      if (!credentials) return;
      const res = await apiRequest<{ roomState: RoomPublicState }>(
        `/api/rooms/${encodeURIComponent(credentials.roomCode)}/submit`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${credentials.sessionToken}` },
          body: JSON.stringify({ word }),
        }
      );
      applyRoomState(res.roomState);
    },
    [credentials, applyRoomState]
  );

  const leaveRoom = useCallback(async (): Promise<void> => {
    const current = credentials;
    activeCredsRef.current = null;
    disconnectSocket();
    clearActiveSession();
    prevStateRef.current = null;
    setCredentials(null);
    setRoomState(null);
    setRoomError(null);

    if (current) {
      await fetch(`/api/rooms/${encodeURIComponent(current.roomCode)}/leave`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${current.sessionToken}`,
        },
      }).catch(() => {});
    }
  }, [credentials, disconnectSocket]);

  const clearError = useCallback(() => setRoomError(null), []);

  return {
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
  };
}
