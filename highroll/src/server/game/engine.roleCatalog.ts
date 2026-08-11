import type { Role, RoleAbility } from '../../shared/types';

// ロールID配列から abilities を収集し、id 重複を除去して返す。
export const collectRoleAbilitiesByIds = (roleMap: Map<string, Role>, roleIds: string[]): RoleAbility[] => {
    if (roleIds.length === 0) {
        return [];
    }
    const abilities: RoleAbility[] = [];
    for (const roleId of roleIds) {
        const role = roleMap.get(roleId);
        if (!role?.abilities?.length) {
            continue;
        }
        abilities.push(...role.abilities);
    }
    if (abilities.length <= 1) {
        return abilities;
    }
    const seen = new Set<string>();
    return abilities.filter((ability) => {
        if (!ability?.id) {
            return true;
        }
        if (seen.has(ability.id)) {
            return false;
        }
        seen.add(ability.id);
        return true;
    });
};
