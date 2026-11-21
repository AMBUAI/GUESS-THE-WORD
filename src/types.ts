export type RoomStatus = 'WAITING' | 'PLAYING' | 'REVEAL' | 'FINISHED';
export type ConnectionStatus = 'connected' | 'disconnected';
export type RoundResult = 'MATCH' | 'MISMATCH' | null;

export interface PlayerPublic {
  id: string;
  displayName: string;
  isHost: boolean;
  joinedAt: number;
  connectionStatus: ConnectionStatus;
  hasSubmitted: boolean;
}

export interface RevealedSubmission {
  playerId: string;
  displayName: string;
  word: string;
}

export interface RoomPublicState {
  roomId: string;
  roomCode: string;
  maxPlayers: number;
  roomStatus: RoomStatus;
  currentRound: number;
  roundResult: RoundResult;
  revealEndsAt: number | null;
  serverTime: number;
  players: PlayerPublic[];
  submittedCount: number;
  revealedSubmissions: RevealedSubmission[];
  winningWord: string | null;
}

export interface SessionCredentials {
  roomCode: string;
  playerId: string;
  sessionToken: string;
  displayName: string;
}

export interface WsServerMessage {
  type: 'room:state' | 'room:closed' | 'error';
  state?: RoomPublicState;
  message?: string;
}
