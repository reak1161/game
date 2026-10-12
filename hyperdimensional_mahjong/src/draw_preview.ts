import { changeTileKind, type Player, type RoundEvent, type Tile } from './mahjong.ts';

export type DrawPreview = { tile: Tile; seat: number; reservedKind?: number; additional: boolean };

/** Preview current turn order without consuming the wall or reservations. */
export function drawPreview(wall: readonly Tile[], players: readonly Pick<Player, 'drawReservations'>[], firstSeat: number, count: number, event: RoundEvent, owedDraw: readonly number[] = [], additionalDraws = true): DrawPreview[] {
  if (!players.length || count <= 0) return [];
  const owed = players.map((_, seat) => additionalDraws ? Math.max(0, Math.floor(owedDraw[seat] ?? 0)) : 0);
  const seen = players.map(() => 0);
  let seat = firstSeat, remaining = owed[seat], additional = false;
  owed[seat] = 0;
  return wall.slice(-Math.min(count, wall.length)).reverse().map(tile => {
    const reserved = players[seat].drawReservations?.[seen[seat]++];
    const changed = { ...tile, compressedMate: tile.compressedMate ? { ...tile.compressedMate } : undefined };
    if (reserved !== undefined) changeTileKind(changed, reserved, event);
    const entry = { tile, seat, reservedKind: reserved === undefined ? undefined : changed.kind, additional };
    if (remaining > 0) { remaining--; additional = true; }
    else {
      seat = (seat + 1) % players.length;
      remaining = owed[seat];
      owed[seat] = 0;
      additional = false;
    }
    return entry;
  });
}
