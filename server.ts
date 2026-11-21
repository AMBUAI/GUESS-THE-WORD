import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import Database from 'better-sqlite3';
import dotenv from 'dotenv';
import express, { type NextFunction, type Request, type Response } from 'express';
import { WebSocket, WebSocketServer } from 'ws';
import type {
  ConnectionStatus,
  PlayerPublic,
  RevealedSubmission,
  RoomPublicState,
  RoomStatus,
  RoundResult,
  WsServerMessage,
} from './src/types.ts';

dotenv.config();

const PORT = Number(process.env.PORT) || 3000;
const REVEAL_DURATION_MS = 4500;
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const dataDir = path.resolve(process.cwd(), 'data');
fs.mkdirSync(dataDir, { recursive: true });
const dbPath = path.join(dataDir, 'guess-the-word.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    room_code TEXT NOT NULL UNIQUE,
    host_player_id TEXT,
    max_players INTEGER NOT NULL CHECK (max_players BETWEEN 2 AND 6),
    room_status TEXT NOT NULL CHECK (room_status IN ('WAITING', 'PLAYING', 'REVEAL', 'FINISHED')),
    current_round INTEGER NOT NULL DEFAULT 1,
    round_result TEXT CHECK (round_result IN ('MATCH', 'MISMATCH') OR round_result IS NULL),
    reveal_ends_at INTEGER,
    winning_word TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL,
    session_token TEXT NOT NULL UNIQUE,
    is_host INTEGER NOT NULL DEFAULT 0,
    joined_at INTEGER NOT NULL,
    connection_status TEXT NOT NULL DEFAULT 'connected' CHECK (connection_status IN ('connected', 'disconnected'))
  );

  CREATE TABLE IF NOT EXISTS submissions (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    round_number INTEGER NOT NULL,
    submitted_word TEXT NOT NULL,
    normalized_word TEXT NOT NULL,
    submitted_at INTEGER NOT NULL,
    UNIQUE(room_id, player_id, round_number)
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_rooms_code ON rooms(room_code);
  CREATE INDEX IF NOT EXISTS idx_players_room ON players(room_id, joined_at);
  CREATE INDEX IF NOT EXISTS idx_submissions_room_round ON submissions(room_id, round_number);
`);

interface RoomRow {
  id: string;
  room_code: string;
  host_player_id: string | null;
  max_players: number;
  room_status: RoomStatus;
  current_round: number;
  round_result: RoundResult;
  reveal_ends_at: number | null;
  winning_word: string | null;
  created_at: number;
  updated_at: number;
}

interface PlayerRow {
  id: string;
  room_id: string;
  display_name: string;
  session_token: string;
  is_host: number;
  joined_at: number;
  connection_status: ConnectionStatus;
}

interface SubmissionRow {
  id: string;
  room_id: string;
  player_id: string;
  round_number: number;
  submitted_word: string;
  normalized_word: string;
  submitted_at: number;
}

interface ClientSocketMeta {
  ws: WebSocket;
  roomId: string;
  playerId: string;
  isAlive: boolean;
}

const roomClients = new Map<string, Set<ClientSocketMeta>>();
const revealTimers = new Map<string, NodeJS.Timeout>();

function generateRoomCode(): string {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    let code = '';
    for (let i = 0; i < 6; i += 1) {
      code += ROOM_CODE_ALPHABET[crypto.randomInt(0, ROOM_CODE_ALPHABET.length)];
    }
    const existing = db.prepare('SELECT 1 FROM rooms WHERE room_code = ?').get(code);
    if (!existing) {
      return code;
    }
  }
  throw new Error('Failed to generate a unique room code.');
}

function sanitizeDisplayName(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().replace(/\s+/g, ' ').slice(0, 24);
}

function validateWordSubmission(raw: unknown): { ok: true; displayWord: string; normalizedWord: string } | { ok: false; error: string } {
  if (typeof raw !== 'string') {
    return { ok: false, error: 'Please enter a word before sending.' };
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, error: 'Empty submissions are not allowed.' };
  }
  if (/\s/.test(trimmed)) {
    return { ok: false, error: 'Enter exactly one word (multiple words are not allowed).' };
  }
  if (trimmed.length > 40) {
    return { ok: false, error: 'Word must be 40 characters or fewer.' };
  }
  return {
    ok: true,
    displayWord: trimmed.toUpperCase(),
    normalizedWord: trimmed.toLowerCase(),
  };
}

function getRoomPublicState(roomId: string): RoomPublicState | null {
  const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId) as RoomRow | undefined;
  if (!room) return null;

  const playerRows = db
    .prepare('SELECT * FROM players WHERE room_id = ? ORDER BY joined_at ASC')
    .all(roomId) as PlayerRow[];

  const submissionRows = db
    .prepare('SELECT * FROM submissions WHERE room_id = ? AND round_number = ?')
    .all(roomId, room.current_round) as SubmissionRow[];

  const submittedIds = new Set(submissionRows.map((s) => s.player_id));

  const players: PlayerPublic[] = playerRows.map((p) => ({
    id: p.id,
    displayName: p.display_name,
    isHost: p.is_host === 1,
    joinedAt: p.joined_at,
    connectionStatus: p.connection_status,
    hasSubmitted: submittedIds.has(p.id),
  }));

  let revealedSubmissions: RevealedSubmission[] = [];
  if (room.room_status === 'REVEAL' || room.room_status === 'FINISHED') {
    const subByPlayer = new Map(submissionRows.map((s) => [s.player_id, s.submitted_word]));
    revealedSubmissions = playerRows.map((p) => ({
      playerId: p.id,
      displayName: p.display_name,
      word: subByPlayer.get(p.id) ?? '',
    }));
  }

  return {
    roomId: room.id,
    roomCode: room.room_code,
    maxPlayers: room.max_players,
    roomStatus: room.room_status,
    currentRound: room.current_round,
    roundResult: room.round_result,
    revealEndsAt: room.reveal_ends_at,
    serverTime: Date.now(),
    players,
    submittedCount: submissionRows.length,
    revealedSubmissions,
    winningWord: room.room_status === 'FINISHED' ? room.winning_word : null,
  };
}

function broadcastRoomState(roomId: string): void {
  const clients = roomClients.get(roomId);
  if (!clients || clients.size === 0) return;

  const state = getRoomPublicState(roomId);
  const payload: WsServerMessage = state
    ? { type: 'room:state', state }
    : { type: 'room:closed', message: 'This room is no longer available.' };

  const serialized = JSON.stringify(payload);
  for (const client of clients) {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(serialized);
    }
  }
}

const advanceRoundTx = db.transaction((roomId: string, expectedRound: number): boolean => {
  const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId) as RoomRow | undefined;
  if (!room) return false;
  if (room.room_status !== 'REVEAL' || room.current_round !== expectedRound) {
    return false;
  }

  const now = Date.now();
  db.prepare(
    `UPDATE rooms
     SET room_status = 'PLAYING',
         current_round = current_round + 1,
         round_result = NULL,
         reveal_ends_at = NULL,
         updated_at = ?
     WHERE id = ?`
  ).run(now, roomId);

  return true;
});

function scheduleNextRound(roomId: string, roundNumber: number, delayMs: number): void {
  const existing = revealTimers.get(roomId);
  if (existing) {
    clearTimeout(existing);
  }

  const timer = setTimeout(() => {
    revealTimers.delete(roomId);
    const advanced = advanceRoundTx(roomId, roundNumber);
    if (advanced) {
      broadcastRoomState(roomId);
    }
  }, Math.max(0, delayMs));

  revealTimers.set(roomId, timer);
}

function ensureRevealTimerSynced(roomId: string): void {
  const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId) as RoomRow | undefined;
  if (!room || room.room_status !== 'REVEAL' || !room.reveal_ends_at) return;

  const remaining = room.reveal_ends_at - Date.now();
  if (remaining <= 0) {
    const existing = revealTimers.get(roomId);
    if (existing) {
      clearTimeout(existing);
      revealTimers.delete(roomId);
    }
    if (advanceRoundTx(roomId, room.current_round)) {
      broadcastRoomState(roomId);
    }
  } else if (!revealTimers.has(roomId)) {
    scheduleNextRound(roomId, room.current_round, remaining);
  }
}

// Re-hydrate any active REVEAL timers if server restarted
const pendingReveals = db
  .prepare("SELECT id, current_round, reveal_ends_at FROM rooms WHERE room_status = 'REVEAL'")
  .all() as Array<{ id: string; current_round: number; reveal_ends_at: number | null }>;

for (const r of pendingReveals) {
  const remaining = (r.reveal_ends_at ?? 0) - Date.now();
  if (remaining <= 0) {
    advanceRoundTx(r.id, r.current_round);
  } else {
    scheduleNextRound(r.id, r.current_round, remaining);
  }
}

function getBearerToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7).trim();
  return token || null;
}

function authenticatePlayer(req: Request, roomCodeParam: string): { room: RoomRow; player: PlayerRow } | { status: number; error: string } {
  const token = getBearerToken(req);
  if (!token) {
    return { status: 401, error: 'Missing player session token.' };
  }

  const roomCode = roomCodeParam.trim().toUpperCase();
  const room = db.prepare('SELECT * FROM rooms WHERE room_code = ?').get(roomCode) as RoomRow | undefined;
  if (!room) {
    return { status: 404, error: 'Room not found.' };
  }

  const player = db
    .prepare('SELECT * FROM players WHERE session_token = ? AND room_id = ?')
    .get(token, room.id) as PlayerRow | undefined;

  if (!player) {
    return { status: 403, error: 'You are not an active member of this room.' };
  }

  return { room, player };
}

const createRoomTx = db.transaction((maxPlayers: number, displayName: string) => {
  const now = Date.now();
  const roomId = crypto.randomUUID();
  const hostId = crypto.randomUUID();
  const sessionToken = crypto.randomBytes(32).toString('hex');
  const roomCode = generateRoomCode();

  db.prepare(
    `INSERT INTO rooms (id, room_code, host_player_id, max_players, room_status, current_round, round_result, reveal_ends_at, winning_word, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'WAITING', 1, NULL, NULL, NULL, ?, ?)`
  ).run(roomId, roomCode, hostId, maxPlayers, now, now);

  db.prepare(
    `INSERT INTO players (id, room_id, display_name, session_token, is_host, joined_at, connection_status)
     VALUES (?, ?, ?, ?, 1, ?, 'connected')`
  ).run(hostId, roomId, displayName, sessionToken, now);

  return { roomId, roomCode, hostId, sessionToken };
});

const joinRoomTx = db.transaction((roomCode: string, displayName: string):
  | { ok: true; roomId: string; playerId: string; sessionToken: string }
  | { ok: false; status: number; error: string } => {
  const room = db.prepare('SELECT * FROM rooms WHERE room_code = ?').get(roomCode) as RoomRow | undefined;
  if (!room) {
    return { ok: false, status: 404, error: 'Room not found. Check the 6-character code and try again.' };
  }

  if (room.room_status !== 'WAITING') {
    return {
      ok: false,
      status: 409,
      error:
        room.room_status === 'FINISHED'
          ? 'This game has already finished.'
          : 'This game has already started. New players cannot join.',
    };
  }

  const countRow = db
    .prepare('SELECT COUNT(*) as count FROM players WHERE room_id = ?')
    .get(room.id) as { count: number };

  if (countRow.count >= room.max_players) {
    return { ok: false, status: 409, error: 'This room is full.' };
  }

  const playerId = crypto.randomUUID();
  const sessionToken = crypto.randomBytes(32).toString('hex');
  const now = Date.now();

  db.prepare(
    `INSERT INTO players (id, room_id, display_name, session_token, is_host, joined_at, connection_status)
     VALUES (?, ?, ?, ?, 0, ?, 'connected')`
  ).run(playerId, room.id, displayName, sessionToken, now);

  db.prepare('UPDATE rooms SET updated_at = ? WHERE id = ?').run(now, room.id);

  return { ok: true, roomId: room.id, playerId, sessionToken };
});

const startRoomTx = db.transaction((roomId: string, playerId: string):
  | { ok: true }
  | { ok: false; status: number; error: string } => {
  const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId) as RoomRow | undefined;
  if (!room) {
    return { ok: false, status: 404, error: 'Room not found.' };
  }

  const player = db
    .prepare('SELECT * FROM players WHERE id = ? AND room_id = ?')
    .get(playerId, roomId) as PlayerRow | undefined;

  if (!player || player.is_host !== 1) {
    return { ok: false, status: 403, error: 'Only the host can start the game.' };
  }

  if (room.room_status !== 'WAITING') {
    return { ok: false, status: 409, error: 'The game has already started.' };
  }

  const countRow = db
    .prepare('SELECT COUNT(*) as count FROM players WHERE room_id = ?')
    .get(roomId) as { count: number };

  if (countRow.count < room.max_players) {
    return {
      ok: false,
      status: 409,
      error: `Waiting for all ${room.max_players} players to join before starting.`,
    };
  }

  const now = Date.now();
  db.prepare(
    `UPDATE rooms
     SET room_status = 'PLAYING',
         current_round = 1,
         round_result = NULL,
         reveal_ends_at = NULL,
         updated_at = ?
     WHERE id = ?`
  ).run(now, roomId);

  return { ok: true };
});

const submitWordTx = db.transaction(
  (
    roomId: string,
    playerId: string,
    displayWord: string,
    normalizedWord: string
  ):
    | { ok: true; triggeredReveal: boolean; isMatch: boolean; roundNumber: number }
    | { ok: false; status: number; error: string } => {
    const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId) as RoomRow | undefined;
    if (!room) {
      return { ok: false, status: 404, error: 'Room not found.' };
    }

    if (room.room_status !== 'PLAYING') {
      return { ok: false, status: 409, error: 'Submissions are closed right now.' };
    }

    const existing = db
      .prepare('SELECT 1 FROM submissions WHERE room_id = ? AND player_id = ? AND round_number = ?')
      .get(roomId, playerId, room.current_round);

    if (existing) {
      return { ok: false, status: 409, error: 'You have already submitted your word for this round.' };
    }

    const now = Date.now();
    db.prepare(
      `INSERT INTO submissions (id, room_id, player_id, round_number, submitted_word, normalized_word, submitted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(crypto.randomUUID(), roomId, playerId, room.current_round, displayWord, normalizedWord, now);

    const subs = db
      .prepare('SELECT * FROM submissions WHERE room_id = ? AND round_number = ?')
      .all(roomId, room.current_round) as SubmissionRow[];

    if (subs.length < room.max_players) {
      db.prepare('UPDATE rooms SET updated_at = ? WHERE id = ?').run(now, roomId);
      return { ok: true, triggeredReveal: false, isMatch: false, roundNumber: room.current_round };
    }

    // All players in the room have submitted: perform atomic server-controlled reveal
    const uniqueNormalized = new Set(subs.map((s) => s.normalized_word));
    const isMatch = uniqueNormalized.size === 1;

    if (isMatch) {
      db.prepare(
        `UPDATE rooms
         SET room_status = 'FINISHED',
             round_result = 'MATCH',
             winning_word = ?,
             reveal_ends_at = NULL,
             updated_at = ?
         WHERE id = ?`
      ).run(subs[0].submitted_word, now, roomId);
    } else {
      db.prepare(
        `UPDATE rooms
         SET room_status = 'REVEAL',
             round_result = 'MISMATCH',
             reveal_ends_at = ?,
             updated_at = ?
         WHERE id = ?`
      ).run(now + REVEAL_DURATION_MS, now, roomId);
    }

    return { ok: true, triggeredReveal: true, isMatch, roundNumber: room.current_round };
  }
);

const leaveWaitingRoomTx = db.transaction((roomId: string, playerId: string): { deletedRoom: boolean } => {
  const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId) as RoomRow | undefined;
  if (!room || room.room_status !== 'WAITING') {
    return { deletedRoom: false };
  }

  db.prepare('DELETE FROM players WHERE id = ? AND room_id = ?').run(playerId, roomId);

  const remaining = db
    .prepare('SELECT * FROM players WHERE room_id = ? ORDER BY joined_at ASC')
    .all(roomId) as PlayerRow[];

  if (remaining.length === 0) {
    db.prepare('DELETE FROM rooms WHERE id = ?').run(roomId);
    return { deletedRoom: true };
  }

  if (room.host_player_id === playerId) {
    const newHost = remaining[0];
    db.prepare('UPDATE players SET is_host = 1 WHERE id = ?').run(newHost.id);
    db.prepare('UPDATE rooms SET host_player_id = ?, updated_at = ? WHERE id = ?').run(
      newHost.id,
      Date.now(),
      roomId
    );
  }

  return { deletedRoom: false };
});

async function startServer() {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.post('/api/rooms', (req, res) => {
    const maxPlayers = Number(req.body?.maxPlayers);
    if (!Number.isInteger(maxPlayers) || maxPlayers < 2 || maxPlayers > 6) {
      res.status(400).json({ error: 'Player count must be 2, 3, 4, 5, or 6.' });
      return;
    }

    const displayName = sanitizeDisplayName(req.body?.displayName);
    if (!displayName) {
      res.status(400).json({ error: 'Please enter your display name.' });
      return;
    }

    const created = createRoomTx(maxPlayers, displayName);
    const roomState = getRoomPublicState(created.roomId);

    res.status(201).json({
      roomState,
      credentials: {
        roomCode: created.roomCode,
        playerId: created.hostId,
        sessionToken: created.sessionToken,
        displayName,
      },
    });
  });

  app.post('/api/rooms/join', (req, res) => {
    const rawCode = typeof req.body?.roomCode === 'string' ? req.body.roomCode.trim().toUpperCase() : '';
    if (!/^[A-Z0-9]{6}$/.test(rawCode)) {
      res.status(400).json({ error: 'Enter a valid 6-character alphanumeric room code.' });
      return;
    }

    const displayName = sanitizeDisplayName(req.body?.displayName);
    if (!displayName) {
      res.status(400).json({ error: 'Please enter your display name.' });
      return;
    }

    const result = joinRoomTx(rawCode, displayName);
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    const roomState = getRoomPublicState(result.roomId);
    broadcastRoomState(result.roomId);

    res.status(200).json({
      roomState,
      credentials: {
        roomCode: rawCode,
        playerId: result.playerId,
        sessionToken: result.sessionToken,
        displayName,
      },
    });
  });

  app.get('/api/rooms/:code/session', (req, res) => {
    const auth = authenticatePlayer(req, req.params.code);
    if ('error' in auth) {
      res.status(auth.status).json({ error: auth.error });
      return;
    }

    ensureRevealTimerSynced(auth.room.id);
    const roomState = getRoomPublicState(auth.room.id);
    res.json({
      roomState,
      player: {
        id: auth.player.id,
        displayName: auth.player.display_name,
        isHost: auth.player.is_host === 1,
      },
    });
  });

  app.post('/api/rooms/:code/start', (req, res) => {
    const auth = authenticatePlayer(req, req.params.code);
    if ('error' in auth) {
      res.status(auth.status).json({ error: auth.error });
      return;
    }

    const result = startRoomTx(auth.room.id, auth.player.id);
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    broadcastRoomState(auth.room.id);
    res.json({ roomState: getRoomPublicState(auth.room.id) });
  });

  app.post('/api/rooms/:code/submit', (req, res) => {
    const auth = authenticatePlayer(req, req.params.code);
    if ('error' in auth) {
      res.status(auth.status).json({ error: auth.error });
      return;
    }

    const validated = validateWordSubmission(req.body?.word);
    if (!validated.ok) {
      res.status(400).json({ error: validated.error });
      return;
    }

    const result = submitWordTx(
      auth.room.id,
      auth.player.id,
      validated.displayWord,
      validated.normalizedWord
    );
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    if (result.triggeredReveal && !result.isMatch) {
      scheduleNextRound(auth.room.id, result.roundNumber, REVEAL_DURATION_MS);
    }

    broadcastRoomState(auth.room.id);
    res.json({ roomState: getRoomPublicState(auth.room.id) });
  });

  app.post('/api/rooms/:code/leave', (req, res) => {
    const auth = authenticatePlayer(req, req.params.code);
    if ('error' in auth) {
      res.status(auth.status).json({ error: auth.error });
      return;
    }

    if (auth.room.room_status !== 'WAITING') {
      res.json({ ok: true });
      return;
    }

    const { deletedRoom } = leaveWaitingRoomTx(auth.room.id, auth.player.id);
    if (!deletedRoom) {
      broadcastRoomState(auth.room.id);
    }
    res.json({ ok: true });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Unhandled server error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const urlPath = (request.url || '').split('?')[0];
    if (urlPath !== '/ws') {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  wss.on('connection', (ws) => {
    let clientMeta: ClientSocketMeta | null = null;

    ws.on('pong', () => {
      if (clientMeta) {
        clientMeta.isAlive = true;
      }
    });

    ws.on('message', (rawData) => {
      try {
        const msg = JSON.parse(rawData.toString()) as {
          type?: string;
          roomCode?: string;
          sessionToken?: string;
        };

        if (msg.type === 'ping') {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'pong' }));
          }
          return;
        }

        if (msg.type === 'auth') {
          const code = typeof msg.roomCode === 'string' ? msg.roomCode.trim().toUpperCase() : '';
          const token = typeof msg.sessionToken === 'string' ? msg.sessionToken.trim() : '';

          const room = db.prepare('SELECT * FROM rooms WHERE room_code = ?').get(code) as RoomRow | undefined;
          if (!room) {
            ws.send(JSON.stringify({ type: 'room:closed', message: 'Room not found.' }));
            return;
          }

          const player = db
            .prepare('SELECT * FROM players WHERE session_token = ? AND room_id = ?')
            .get(token, room.id) as PlayerRow | undefined;

          if (!player) {
            ws.send(JSON.stringify({ type: 'error', message: 'Session is invalid for this room.' }));
            return;
          }

          if (clientMeta) {
            roomClients.get(clientMeta.roomId)?.delete(clientMeta);
          }

          clientMeta = {
            ws,
            roomId: room.id,
            playerId: player.id,
            isAlive: true,
          };

          let set = roomClients.get(room.id);
          if (!set) {
            set = new Set();
            roomClients.set(room.id, set);
          }
          set.add(clientMeta);

          db.prepare("UPDATE players SET connection_status = 'connected' WHERE id = ?").run(player.id);
          ensureRevealTimerSynced(room.id);
          broadcastRoomState(room.id);
        }
      } catch {
        // Ignore malformed websocket frames
      }
    });

    ws.on('close', () => {
      if (!clientMeta) return;
      const meta = clientMeta;
      clientMeta = null;

      const set = roomClients.get(meta.roomId);
      if (set) {
        set.delete(meta);
        if (set.size === 0) {
          roomClients.delete(meta.roomId);
        }
      }

      // Check if player still has another open socket in the same room
      const hasOtherSocket = Array.from(roomClients.get(meta.roomId) ?? []).some(
        (c) => c.playerId === meta.playerId && c.ws.readyState === WebSocket.OPEN
      );

      if (!hasOtherSocket) {
        const existingPlayer = db.prepare('SELECT id FROM players WHERE id = ?').get(meta.playerId);
        if (existingPlayer) {
          db.prepare("UPDATE players SET connection_status = 'disconnected' WHERE id = ?").run(meta.playerId);
          broadcastRoomState(meta.roomId);
        }
      }
    });
  });

  const heartbeatInterval = setInterval(() => {
    for (const [, set] of roomClients) {
      for (const client of set) {
        if (!client.isAlive) {
          client.ws.terminate();
          continue;
        }
        client.isAlive = false;
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.ping();
        }
      }
    }
  }, 20000);

  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`GUESS THE WORD server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
