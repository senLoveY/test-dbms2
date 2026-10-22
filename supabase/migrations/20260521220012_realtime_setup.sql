-- Run in Supabase SQL Editor if lobby/game do not update without page refresh.
-- Safe to re-run: ignore "already member of publication" errors.

alter table public.rooms replica identity full;
alter table public.room_players replica identity full;

alter publication supabase_realtime add table public.rooms;
alter publication supabase_realtime add table public.room_players;
