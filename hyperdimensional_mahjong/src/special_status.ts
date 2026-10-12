import { isTerminal, tileName, type RoundEvent, type Tile } from './mahjong.ts';

export type SpecialStatusContext = {
  inHand: boolean;
  inRiver: boolean;
  event: RoundEvent;
  irregularKind: number | null;
  drawnTileId?: number;
  ronTileId?: number;
};

/** Conditions shown here do not establish a winning hand or permit an action. */
export function specialStatus(tile: Tile, context: SpecialStatusContext): string {
  const { inHand, inRiver, event, irregularKind, drawnTileId, ronTileId } = context;
  switch (tile.special) {
    case 'musou': return isTerminal(tile.kind, event) ? '么九牌の条件を満たす・国士無双の和了時に判定' : '么九牌ではないため無効';
    case 'irregular': return irregularKind === null ? '変化先を待機中' : `${tileName(irregularKind)}に変化済み・和了時に20翻`;
    case 'zombie': return inHand ? '手牌にあり、この席の打牌ごとに30%で増殖抽選' : '手牌外のため増殖しない';
    case 'trap': return tile.id === ronTileId ? 'この牌へのロン確認中' : inRiver ? '河にある牌・現在この牌へのロン確認はない' : inHand ? '打牌待ち' : '現在この牌へのロン確認はない';
    case 'destiny': return inHand && tile.id === drawnTileId ? '現在のツモ牌・この牌でツモ和了すると5倍' : 'この牌をツモ和了牌にする必要がある';
    case 'triplet': return event === 'memory' ? '神経衰弱では通常牌として使用・追加刻子効果なし' : inHand ? '和了判定で刻子として使用可能・副露で失効' : '手牌外・追加刻子効果なし';
    case 'knockout': return 'この牌を含むロン和了時に判定・ツモ和了には適用しない';
    case 'rainbow': return '和了評価時に最も高い和了点になる変化先を判定';
    case 'shochikubai': return '和了形の索子枚数に応じて加符';
    case 'purify': return '和了時に混一色・混老頭・混全帯幺九の変換を判定';
    case 'ichigo': return '和了時に成立する1翻役の強化を判定';
    case 'pure': return '和了時に清一色・緑一色・字一色・一色三連の強化を判定';
    case 'drumming': return event === 'memory' ? '神経衰弱ではドラとカンを使わないため効果なし' : 'この牌を含むカンと、和了形のドラに応じて適用';
    default: return '特殊効果なし';
  }
}
