import type { SessionCredentials } from '../types.ts';

const SESSION_KEY = 'gtw_active_session';
const NAME_KEY = 'gtw_display_name';

export function loadActiveSession(): SessionCredentials | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SessionCredentials>;
    if (
      typeof parsed.roomCode === 'string' &&
      typeof parsed.playerId === 'string' &&
      typeof parsed.sessionToken === 'string' &&
      typeof parsed.displayName === 'string'
    ) {
      return {
        roomCode: parsed.roomCode,
        playerId: parsed.playerId,
        sessionToken: parsed.sessionToken,
        displayName: parsed.displayName,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function saveActiveSession(creds: SessionCredentials): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(creds));
    localStorage.setItem(NAME_KEY, creds.displayName);
  } catch {
    // Ignore storage errors
  }
}

export function clearActiveSession(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Ignore storage errors
  }
}

export function loadSavedDisplayName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}
