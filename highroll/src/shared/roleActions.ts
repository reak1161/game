import type { RoleActionDefinition, StatKey } from './types';

export const ROLE_ACTION_BASE_STATS: StatKey[] = ['hp', 'atk', 'def', 'spe'];
export const ROLE_ACTION_COMBAT_STATS: StatKey[] = ['atk', 'def', 'spe'];

export const ROLE_ACTIONS: Record<string, RoleActionDefinition[]> = {
    duplicate: [
        {
            id: 'duplicate_copy',
            label: '複製',
            description: '対象の固有能力（パッシブ/アビリティ）を複製する（最大3つまで保持）。',
            costBra: 1,
            requiresTarget: 'any',
        },
    ],
    flame: [
        {
            id: 'flame_apply_burn',
            label: '炎上付与',
            description: '対象に炎上を付与する（ターン終了時に炎上ダメージ）。',
            costBra: 1,
            requiresTarget: 'any',
        },
    ],
    discharge: [
        {
            id: 'discharge_release',
            label: '放電',
            description: '蓄電トークンを消費して感電トークンを付与する。',
            costBra: 0,
        },
    ],
    doctor: [
        {
            id: 'doctor_heal',
            label: '治療',
            description: '対象のHPを3回復する。',
            costBra: 1,
            requiresTarget: 'any',
        },
        {
            id: 'doctor_anesthesia',
            label: '麻酔',
            description: '対象は次のターンBra-1。',
            costBra: 1,
            requiresTarget: 'any',
        },
        {
            id: 'doctor_surgery',
            label: '手術',
            description: '対象の次ターンを休ませ、その次のターン開始時にHP+15。',
            costBra: 1,
            requiresTarget: 'any',
        },
        {
            id: 'doctor_reshape',
            label: '整形',
            description: '対象のステータスを1減らし、別のステータスを1増やす。',
            costBra: 1,
            requiresTarget: 'any',
            choices: [
                {
                    key: 'statDown',
                    label: '減らすステータス',
                    type: 'stat',
                    options: ROLE_ACTION_COMBAT_STATS,
                },
                {
                    key: 'statUp',
                    label: '増やすステータス',
                    type: 'stat',
                    options: ROLE_ACTION_COMBAT_STATS,
                },
            ],
        },
    ],
    jester: [
        {
            id: 'jester_random',
            label: '道化のランダム効果',
            description: 'Braを1消費してランダム効果を得る。',
            costBra: 1,
        },
    ],
    suppress: [
        {
            id: 'suppress_lock',
            label: '抑制',
            description: '対象は次のラウンド終了まで固有能力を失う。',
            costBra: 1,
            requiresTarget: 'any',
        },
    ],
    shed: [
        {
            id: 'shed_molt',
            label: '脱皮',
            description: 'Defを0にし、失ったDefの半分（切り捨て）をAtk/Speの追加トークンとして得る。',
            costBra: 1,
        },
    ],
    seal: [
        {
            id: 'seal_chain_atk',
            label: '攻鎖',
            description: '基礎Atkを2獲得する。',
            costBra: 1,
        },
        {
            id: 'seal_chain_def',
            label: '防鎖',
            description: '基礎Defを1獲得する。',
            costBra: 1,
        },
        {
            id: 'seal_chain_spe',
            label: '速鎖',
            description: '基礎Speを3獲得する。',
            costBra: 1,
        },
        {
            id: 'seal_lock',
            label: '封鎖',
            description: '対象の手札からランダムに1枚を「封印」する（封印された手札は使用できない）。',
            costBra: 1,
            requiresTarget: 'any',
        },
    ],
    witch: [
        {
            id: 'witch_curse',
            label: '呪い付与',
            description: '対象の手札からランダムに1枚に呪いを付与する。',
            costBra: 1,
            requiresTarget: 'any',
        },
    ],
    vampire: [
        {
            id: 'vampire_blood_pattern',
            label: '血の紋様',
            description: 'HPを2消費して、手札1枚に「血の紋様」を付与する（血の紋様1枚につき追加Atk+1）。',
            costBra: 0,
        },
    ],
    bomb: [
        {
            id: 'bomb_timed_bomb',
            label: '時限爆弾',
            description:
                '対象に「時限爆弾」を設置する（カウント3→毎ターン終了で-1、0で固定10ダメージ）。',
            costBra: 1,
            requiresTarget: 'others',
        },
    ],
    tsunami: [
        { id: 'tsunami_ultimate', label: 'アルティメット: 大津波', description: '手札を条件分捨てて全体固定ダメージ+水びたし。', costBra: 2 },
    ],
    earthquake: [
        { id: 'earthquake_ultimate', label: 'アルティメット: 大地震', description: '手札全捨てで全体固定ダメージ+めまい。', costBra: 2 },
    ],
    meteor: [
        { id: 'meteor_ultimate', label: 'アルティメット: 隕石落下', description: '手札3枚を捨てて対象に固定10ダメージ。', costBra: 2, requiresTarget: 'others' },
    ],
    tornado: [
        { id: 'tornado_ultimate', label: 'アルティメット: 超竜巻', description: '手札全捨てで対象に連撃+手札破壊。', costBra: 2, requiresTarget: 'others' },
    ],
    balance: [
        {
            id: 'balance_average',
            label: '平均化',
            description: '対象と指定ステータスを平均化する。',
            costBra: 1,
            requiresTarget: 'others',
            choices: [{ key: 'stat', label: '平均化するステータス', type: 'stat', options: ROLE_ACTION_COMBAT_STATS }],
        },
    ],
    flash: [{ id: 'flash_gain_spe', label: '加速', description: '次の自分ターン中のみ追加Spe+4。', costBra: 1 }],
    discard: [{ id: 'discard_mill3', label: '廃棄', description: '山札の上から3枚を捨て札にする。', costBra: 1 }],
    recycle: [
        { id: 'recycle_pick', label: '回収', description: '捨て札から1枚選んで手札に加える。', costBra: 1, requiresTarget: 'self' },
    ],
    gaze: [{ id: 'gaze_mark', label: '凝視付与', description: '対象に凝視を1付与する。', costBra: 1, requiresTarget: 'others' }],
    silence_role: [
        { id: 'silence_mark', label: '沈黙付与', description: '対象に沈黙1を付与する。', costBra: 1, requiresTarget: 'others' },
    ],
    shadowbind: [
        { id: 'shadowbind_reduce_max_hp', label: '影縫い', description: '対象の最大HPを2減らす。', costBra: 1, requiresTarget: 'others' },
    ],
};

export const getRoleActions = (roleId?: string): RoleActionDefinition[] => {
    if (!roleId) {
        return [];
    }
    return ROLE_ACTIONS[roleId] ?? [];
};

export const getRoleActionsForRoleIds = (roleIds: Array<string | undefined | null>): RoleActionDefinition[] => {
    const uniqueRoleIds = Array.from(new Set(roleIds.filter((id): id is string => Boolean(id))));
    const seen = new Set<string>();
    const out: RoleActionDefinition[] = [];
    uniqueRoleIds.forEach((roleId) => {
        (ROLE_ACTIONS[roleId] ?? []).forEach((action) => {
            if (seen.has(action.id)) return;
            seen.add(action.id);
            out.push(action);
        });
    });
    return out;
};
