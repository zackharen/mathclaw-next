-- Tighten Connect4 match update policy so only the current-turn player can update
-- an active match. The previous policy allowed any participant to update any field,
-- leaving turn enforcement solely at the application layer.
--
-- Rematch (resetting a finished match) is now handled via the service-role admin client
-- in the API route, so it does not need to pass through this policy.

drop policy if exists "connect4 participant update" on public.connect4_matches;

create policy "connect4 current turn update"
on public.connect4_matches
for update
to authenticated
using (
  current_turn_id = auth.uid()
  and status = 'active'
  and (player_one_id = auth.uid() or player_two_id = auth.uid())
)
with check (
  player_one_id = auth.uid() or player_two_id = auth.uid()
);
