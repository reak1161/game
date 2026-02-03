import type { RoleActionDefinition, StatKey } from './types';

export const ROLE_ACTION_BASE_STATS: StatKey[] = ['hp', 'atk', 'def', 'spe'];

export const ROLE_ACTIONS: Record<string, RoleActionDefinition[]> = {
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
                    options: ROLE_ACTION_BASE_STATS,
                },
                {
                    key: 'statUp',
                    label: '増やすステータス',
                    type: 'stat',
                    options: ROLE_ACTION_BASE_STATS,
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
};

export const getRoleActions = (roleId?: string): RoleActionDefinition[] => {
    if (!roleId) {
        return [];
    }
    return ROLE_ACTIONS[roleId] ?? [];
};
