import type { GameState, Player } from '../src/game/types.js'
import { describeChoice } from '../src/game/choice-presentation.js'

function publicPlayer(player: Player, viewerId: string): Player {
  const own = player.id === viewerId
  return {
    ...player,
    hand: own ? player.hand : [],
    handCount: player.hand.length,
    discard: player.discard,
    role: player.role.state === 'FACE_DOWN' && !own
      ? { state: 'FACE_DOWN', card: null }
      : player.role,
  }
}

export function gameView(game: GameState, viewerId: string): GameState {
  return {
    ...game,
    deck: [],
    deckCount: game.deck.length,
    queue: [],
    votes: undefined,
    pendingChoice: game.pendingChoice ? game.pendingChoice.playerId === viewerId
      ? { ...game.pendingChoice, presentation: describeChoice(game, game.pendingChoice), cards: undefined, task: undefined, tasks: undefined }
      : { ...game.pendingChoice, presentation: undefined, options: [], cards: undefined, task: undefined, tasks: undefined, title: '他のプレイヤーが選択中です' }
      : null,
    players: game.players.map((player) => publicPlayer(player, viewerId)),
    log: game.log.filter((entry) => entry.visibility === 'PUBLIC' || entry.playerId === viewerId),
  }
}

