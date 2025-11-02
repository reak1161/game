export type PID = string;
export type CardID = string;
export type RoleID = string;

export interface RoleParams { hp: number; atk: number; def: number; spe: number; bra: number; }
export interface Role { id: RoleID; name: string; params: RoleParams; text: string; tags?: string[] }

export type CardKind = "skill" | "install" | "boost";
export interface Effect
  = { type: "atkBuff"; value: number; scope: "turn" | "permanent" }
  | { type: "defBuff"; value: number; scope: "turn" | "permanent" }
  | { type: "speBuff"; value: number; scope: "permanent" }
  | { type: "braBuff"; value: number; scope: "permanent" }
  | { type: "heal"; value: number; allowOverheal?: boolean }
  | { type: "pierce"; value: number }
  | { type: "gainCoin"; value: number }
  | { type: "marketDiscount"; value: number }
  | { type: "scry"; count: number; keep: number }
  | { type: "extraAction"; value: 1 }
  | { type: "maxHpBuff"; value: number; scope: "round" | "permanent" };

export interface Card { id: CardID; name: string; cost: number; kind: CardKind; unique?: boolean; text: string; effects: Effect[]; tags?: string[] }

export interface Rules {
  roleAttackConsumesBra: boolean;
  marketMax: 3;
  marketRefillWhenZero: boolean;
  sellPayout: "half_floor";
  allowOverhealTempHP: boolean;
  tempHpDecayAtEndRound: boolean;
}
