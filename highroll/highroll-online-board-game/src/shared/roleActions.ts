import type { RoleActionDefinition, StatKey } from './types';

export const ROLE_ACTION_BASE_STATS: StatKey[] = ['hp', 'atk', 'def', 'spe', 'bra'];

export const ROLE_ACTIONS: Record<string, RoleActionDefinition[]> = {
    discharge: [
        {
            id: 'discharge_release',
            label: '放電',
            description: '蓄電トークンを全放出し、自分以外の全員に (蓄電^2) の感電トークンを与える。',
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
            description: '対象の次のターンに利用できるBraを1減らす。',
            costBra: 1,
            requiresTarget: 'any',
        },
        {
            id: 'doctor_surgery',
            label: '手術',
            description: '対象の次のターンを強制終了させ、その次のターン開始時にHPを15回復させる。',
            costBra: 1,
            requiresTarget: 'any',
        },
        {
            id: 'doctor_reshape',
            label: '整形',
            description: '対象の任意のステータスを1下げ、別のステータスを1上げる。',
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
};

export const getRoleActions = (roleId?: string): RoleActionDefinition[] => {
    if (!roleId) {
        return [];
    }
    return ROLE_ACTIONS[roleId] ?? [];
};
