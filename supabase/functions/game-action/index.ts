// Supabase Edge Function: secure server-authoritative game actions for GUESS THE WORD
// Uses SUPABASE_SERVICE_ROLE_KEY strictly on the server (never exposed to clients).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateCode(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const authHeader = req.headers.get('Authorization') ?? '';

  const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const adminClient = createClient(supabaseUrl, serviceKey);

  const {
    data: { user },
    error: authError,
  } = await userClient.auth.getUser();

  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized session' }), { status: 401 });
  }

  const body = await req.json();
  const action = body?.action;

  if (action === 'CREATE_ROOM') {
    const maxPlayers = Number(body?.maxPlayers);
    const displayName = String(body?.displayName ?? '').trim().slice(0, 24);
    if (!Number.isInteger(maxPlayers) || maxPlayers < 2 || maxPlayers > 6 || !displayName) {
      return new Response(JSON.stringify({ error: 'Invalid host parameters' }), { status: 400 });
    }

    let roomCode = generateCode();
    for (let i = 0; i < 10; i++) {
      const { data: dup } = await adminClient
        .from('rooms')
        .select('id')
        .eq('room_code', roomCode)
        .maybeSingle();
      if (!dup) break;
      roomCode = generateCode();
    }

    const { data: room, error: roomErr } = await adminClient
      .from('rooms')
      .insert({ room_code: roomCode, max_players: maxPlayers, room_status: 'WAITING', current_round: 1 })
      .select()
      .single();

    if (roomErr || !room) {
      return new Response(JSON.stringify({ error: roomErr?.message ?? 'Failed to create room' }), { status: 500 });
    }

    const { data: player, error: playerErr } = await adminClient
      .from('players')
      .insert({ room_id: room.id, auth_user_id: user.id, display_name: displayName, is_host: true })
      .select()
      .single();

    if (playerErr || !player) {
      return new Response(JSON.stringify({ error: playerErr?.message ?? 'Failed to add host' }), { status: 500 });
    }

    await adminClient.from('rooms').update({ host_player_id: player.id }).eq('id', room.id);
    return new Response(JSON.stringify({ room, player }), { status: 201 });
  }

  if (action === 'SUBMIT_WORD') {
    const roomCode = String(body?.roomCode ?? '').trim().toUpperCase();
    const rawWord = String(body?.word ?? '').trim();
    if (!rawWord || /\s/.test(rawWord) || rawWord.length > 40) {
      return new Response(JSON.stringify({ error: 'Submit exactly one word (no spaces).' }), { status: 400 });
    }

    const { data: room } = await adminClient.from('rooms').select('*').eq('room_code', roomCode).single();
    if (!room || room.room_status !== 'PLAYING') {
      return new Response(JSON.stringify({ error: 'Round is not accepting submissions.' }), { status: 409 });
    }

    const { data: player } = await adminClient
      .from('players')
      .select('*')
      .eq('room_id', room.id)
      .eq('auth_user_id', user.id)
      .single();

    if (!player) {
      return new Response(JSON.stringify({ error: 'Player not in room.' }), { status: 403 });
    }

    const { error: subErr } = await adminClient.from('submissions').insert({
      room_id: room.id,
      player_id: player.id,
      round_number: room.current_round,
      submitted_word: rawWord.toUpperCase(),
      normalized_word: rawWord.toLowerCase(),
    });

    if (subErr) {
      return new Response(JSON.stringify({ error: 'Already submitted for this round.' }), { status: 409 });
    }

    const { data: allSubs } = await adminClient
      .from('submissions')
      .select('*')
      .eq('room_id', room.id)
      .eq('round_number', room.current_round);

    if (allSubs && allSubs.length >= room.max_players) {
      const uniqueWords = new Set(allSubs.map((s) => s.normalized_word));
      if (uniqueWords.size === 1) {
        await adminClient
          .from('rooms')
          .update({
            room_status: 'FINISHED',
            round_result: 'MATCH',
            winning_word: allSubs[0].submitted_word,
            updated_at: new Date().toISOString(),
          })
          .eq('id', room.id)
          .eq('room_status', 'PLAYING');
      } else {
        await adminClient
          .from('rooms')
          .update({
            room_status: 'REVEAL',
            round_result: 'MISMATCH',
            reveal_ends_at: new Date(Date.now() + 4500).toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', room.id)
          .eq('room_status', 'PLAYING');
      }
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400 });
});
