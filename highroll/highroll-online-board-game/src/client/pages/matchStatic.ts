import type { CardDefinition, CurseId, TeamColor } from '@shared/types';
import cardsCatalogRaw from '../../../data/cards.json';
import rolesCatalogRaw from '../../../data/roles.json';
import handCardAttackBgUrl from '../assets/match/hand-card-attack-bg.png';
import handCardDefenseBgUrl from '../assets/match/hand-card-defense-bg.png';
import handCardSpellBgUrl from '../assets/match/hand-card-spell-bg.png';
import handCardEquipBgUrl from '../assets/match/hand-card-equip-bg.png';

type CardsFile = {
    cards: CardDefinition[];
};

export type RoleEntry = {
    id: string;
    name: string;
    params: {
        hp: number;
        atk: number;
        def: number;
        spe: number;
        bra: number;
    };
    text?: string;
    detailText?: string;
};

type RolesFile = {
    roles: RoleEntry[];
};

// Match 画面で使うカタログは読み込み時に一度だけ整形する。
export const CARD_LOOKUP = new Map<string, CardDefinition>(((cardsCatalogRaw as CardsFile).cards ?? []).map((card) => [card.id, card]));
export const ROLE_LOOKUP = new Map<string, RoleEntry>(((rolesCatalogRaw as RolesFile).roles ?? []).map((role) => [role.id, role]));
export const ALL_CARDS = (cardsCatalogRaw as CardsFile).cards ?? [];

export const statusColors: Record<string, string> = {
    waiting: '#eab308',
    inProgress: '#22c55e',
    finished: '#ef4444',
};

export const TEAM_OPTIONS: Array<{ id: TeamColor; label: string; bg: string; border: string; text: string }> = [
    { id: 'red', label: '赤', bg: '#fee2e2', border: '#fecaca', text: '#991b1b' },
    { id: 'blue', label: '青', bg: '#dbeafe', border: '#bfdbfe', text: '#1d4ed8' },
    { id: 'green', label: '緑', bg: '#dcfce7', border: '#bbf7d0', text: '#166534' },
    { id: 'yellow', label: '黄', bg: '#fef9c3', border: '#fde68a', text: '#92400e' },
];

export const STAT_OPTIONS: Array<'atk' | 'def' | 'spe' | 'bra'> = ['atk', 'def', 'spe', 'bra'];

const CATEGORY_LABELS: Record<string, string> = {
    attack: '攻撃',
    defense: '防御',
    spell: '呪文',
    equip: '装備',
};

export const getCategoryLabel = (category?: string | null): string | undefined =>
    category ? CATEGORY_LABELS[category] ?? category.toUpperCase() : undefined;

const KIND_LABELS: Record<string, string> = {
    skill: 'スキル',
    install: '設置',
};

export const getKindLabel = (kind?: string | null): string | undefined => (kind ? KIND_LABELS[kind] ?? kind.toUpperCase() : undefined);

export const MATCH_DESIGN_WIDTH = 1920;
export const MATCH_DESIGN_HEIGHT = 1080;

export const HAND_CARD_BG_BY_CATEGORY: Record<string, string> = {
    attack: handCardAttackBgUrl,
    defense: handCardDefenseBgUrl,
    spell: handCardSpellBgUrl,
    equip: handCardEquipBgUrl,
};

const CURSE_LABELS: Record<string, string> = {
    weakness: '弱者の呪い',
    force: '強化の呪い',
    decay: '腐敗の呪い',
    collapse: '崩壊の呪い',
    cost: '重圧の呪い',
    rebuttal: '反撃の呪い',
    enrage: '憤怒の呪い',
    resonate: '共鳴の呪い',
    silence: '沈黙の呪い',
    wear: '摩耗の呪い',
};

export const getCurseLabel = (curseId?: string | null): string | undefined => (curseId ? CURSE_LABELS[curseId] ?? curseId : undefined);

const CURSE_DESCRIPTIONS: Record<CurseId, string> = {
    weakness: '常にDef-1。',
    force: '使用直後のダメージカードの数値を山札に戻るまで使い切れない。',
    decay: 'このカードの数値が-2。',
    collapse: '自分のターン終了時に、このカードを捨て札にする。',
    cost: 'このカード使用時、追加で1ダメージを受ける。',
    rebuttal: 'このカード使用時、山札から1枚選んで捨てる。',
    enrage: 'このカードのBra消費が1増える。',
    resonate: '対象選択がある効果で、このカードの適用先を選べない。',
    silence: 'このカード使用後、ターンを強制終了する。',
    wear: 'このカード使用時、常にAtk-1。',
};

export const getCurseDescription = (curseId?: string | null): string | undefined => {
    if (!curseId) return undefined;
    if (!(curseId in CURSE_DESCRIPTIONS)) return undefined;
    return CURSE_DESCRIPTIONS[curseId as CurseId];
};
