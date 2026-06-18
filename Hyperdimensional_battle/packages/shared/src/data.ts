import type { CardDefinition, RoleDefinition } from "./types";
import enchantAttackPlus10 from "../data/cards/enchant_attack_plus_10.json";
import enchantAttackPlus5 from "../data/cards/enchant_attack_plus_5.json";
import enchantColdSleep from "../data/cards/enchant_cold_sleep.json";
import enchantFrozenAir from "../data/cards/enchant_frozen_air.json";
import enchantJamming from "../data/cards/enchant_jamming.json";
import enchantJikoYudo from "../data/cards/enchant_jiko_yudo.json";
import enchantKiramekuYukigeshiki from "../data/cards/enchant_kirameku_yukigeshiki.json";
import enchantMagicPlus10 from "../data/cards/enchant_magic_plus_10.json";
import enchantMagicPlus5 from "../data/cards/enchant_magic_plus_5.json";
import enchantPhoenix from "../data/cards/enchant_phoenix.json";
import enchantReikyakuHannou from "../data/cards/enchant_reikyaku_hannou.json";
import enchantTenshiNoHashigo from "../data/cards/enchant_tenshi_no_hashigo.json";
import enchantToushou from "../data/cards/enchant_toushou.json";
import enchantYureruTamashii from "../data/cards/enchant_yureru_tamashii.json";
import enchantZombie from "../data/cards/enchant_zombie.json";
import darkAkumaSasayaki from "../data/cards/dark_akuma_sasayaki.json";
import darkDarkHole from "../data/cards/dark_dark_hole.json";
import darkDoppelganger from "../data/cards/dark_doppelganger.json";
import darkGunzei from "../data/cards/dark_gunzei.json";
import darkHaiyoruKage from "../data/cards/dark_haiyoru_kage.json";
import darkKagefumi from "../data/cards/dark_kagefumi.json";
import darkNecro from "../data/cards/dark_necro.json";
import darkNecromancer from "../data/cards/dark_necromancer.json";
import darkPandemic from "../data/cards/dark_pandemic.json";
import darkPoltergeist from "../data/cards/dark_poltergeist.json";
import darkRenkinjutsu from "../data/cards/dark_renkinjutsu.json";
import darkRequiem from "../data/cards/dark_requiem.json";
import darkShadowStep from "../data/cards/dark_shadow_step.json";
import darkShinenBlade from "../data/cards/dark_shinen_blade.json";
import darkYamiNoGamble from "../data/cards/dark_yami_no_gamble.json";
import fireAokiHonoo from "../data/cards/fire_aoki_honoo.json";
import fireAkaiHonoo from "../data/cards/fire_akai_honoo.json";
import fireBending from "../data/cards/fire_bending.json";
import fireBurnout from "../data/cards/fire_burnout.json";
import fireEruption from "../data/cards/fire_eruption.json";
import fireFellowFire from "../data/cards/fire_fellow_fire.json";
import fireHellflame from "../data/cards/fire_hellflame.json";
import fireKieyukuTomoshibi from "../data/cards/fire_kieyuku_tomoshibi.json";
import fireKaryokuHatsuden from "../data/cards/fire_karyoku_hatsuden.json";
import fireKagerou from "../data/cards/fire_kagerou.json";
import firePhoenixLike from "../data/cards/fire_phoenix_like.json";
import fireShoukyaku from "../data/cards/fire_shoukyaku.json";
import iceAbsoluteZero from "../data/cards/ice_absolute_zero.json";
import iceBlizzard from "../data/cards/ice_blizzard.json";
import iceField from "../data/cards/ice_field.json";
import iceHoushaReikyaku from "../data/cards/ice_housha_reikyaku.json";
import iceIcePick from "../data/cards/ice_ice_pick.json";
import iceMeltdown from "../data/cards/ice_meltdown.json";
import iceSnowstorm from "../data/cards/ice_snowstorm.json";
import iceTouketsuNoroi from "../data/cards/ice_touketsu_noroi.json";
import iceTsuranaruTsurara from "../data/cards/ice_tsuranaru_tsurara.json";
import iceWall from "../data/cards/ice_wall.json";
import noneBuildup from "../data/cards/none_buildup.json";
import noneChantPractice from "../data/cards/none_chant_practice.json";
import noneColorfulPalette from "../data/cards/none_colorful_palette.json";
import noneHadou from "../data/cards/none_hadou.json";
import noneHyakkaRyoran from "../data/cards/none_hyakka_ryoran.json";
import noneHybrid from "../data/cards/none_hybrid.json";
import noneIkkitsukan from "../data/cards/none_ikkitsukan.json";
import noneKintore from "../data/cards/none_kintore.json";
import nonePunch from "../data/cards/none_punch.json";
import noneSuperChain from "../data/cards/none_super_chain.json";
import noneTakumi from "../data/cards/none_takumi.json";
import noneTakumiKodawari from "../data/cards/none_takumi_kodawari.json";
import thunderElectric from "../data/cards/thunder_electric.json";
import thunderEmpPulse from "../data/cards/thunder_emp_pulse.json";
import thunderDenjiCoil from "../data/cards/thunder_denji_coil.json";
import thunderHendenShisetsu from "../data/cards/thunder_henden_shisetsu.json";
import thunderKowaretaKikai from "../data/cards/thunder_kowareta_kikai.json";
import thunderOvercharge from "../data/cards/thunder_overcharge.json";
import thunderShock from "../data/cards/thunder_shock.json";
import thunderSpeedOfLight from "../data/cards/thunder_speed_of_light.json";
import thunderStatic from "../data/cards/thunder_static.json";
import thunderTaikoNoKikai from "../data/cards/thunder_taiko_no_kikai.json";
import thunderVoltage from "../data/cards/thunder_voltage.json";
import thunderVortex from "../data/cards/thunder_vortex.json";
import waterAqua from "../data/cards/water_aqua.json";
import waterBubble from "../data/cards/water_bubble.json";
import waterBubbleBlink from "../data/cards/water_bubble_blink.json";
import waterCascade from "../data/cards/water_cascade.json";
import waterDiving from "../data/cards/water_diving.json";
import waterDropout from "../data/cards/water_dropout.json";
import waterHydropump from "../data/cards/water_hydropump.json";
import waterMarineVeil from "../data/cards/water_marine_veil.json";
import waterOverflow from "../data/cards/water_overflow.json";
import waterRyutaiRikigaku from "../data/cards/water_ryutai_rikigaku.json";
import waterSlime from "../data/cards/water_slime.json";
import waterTakiShugyo from "../data/cards/water_taki_shugyo.json";
import windCharge from "../data/cards/wind_charge.json";
import windAirSlash from "../data/cards/wind_air_slash.json";
import windAmakakeruTsubasa from "../data/cards/wind_amakakeru_tsubasa.json";
import windDaichiNoIbuki from "../data/cards/wind_daichi_no_ibuki.json";
import windKamaitachi from "../data/cards/wind_kamaitachi.json";
import windKazematoi from "../data/cards/wind_kazematoi.json";
import windKyojinNoHaniki from "../data/cards/wind_kyojin_no_haniki.json";
import windOkaNoUeNoFuusha from "../data/cards/wind_oka_no_ue_no_fuusha.json";
import windRewind from "../data/cards/wind_rewind.json";
import windSukimakaze from "../data/cards/wind_sukimakaze.json";
import windSummerFurin from "../data/cards/wind_summer_furin.json";
import windTachikomeruKemuri from "../data/cards/wind_tachikomeru_kemuri.json";
import windTsumujikaze from "../data/cards/wind_tsumujikaze.json";
import roleBalance from "../data/roles/role_balance.json";
import roleBlaze from "../data/roles/role_blaze.json";
import roleCharge from "../data/roles/role_charge.json";
import roleDolphin from "../data/roles/role_dolphin.json";
import roleFinale from "../data/roles/role_finale.json";
import roleSimple from "../data/roles/role_simple.json";

const rawCards = [
  enchantAttackPlus10,
  enchantAttackPlus5,
  enchantColdSleep,
  enchantFrozenAir,
  enchantJamming,
  enchantJikoYudo,
  enchantKiramekuYukigeshiki,
  enchantMagicPlus10,
  enchantMagicPlus5,
  enchantPhoenix,
  enchantReikyakuHannou,
  enchantTenshiNoHashigo,
  enchantToushou,
  enchantYureruTamashii,
  enchantZombie,
  darkAkumaSasayaki,
  darkDarkHole,
  darkDoppelganger,
  darkGunzei,
  darkHaiyoruKage,
  darkKagefumi,
  darkNecro,
  darkNecromancer,
  darkPandemic,
  darkPoltergeist,
  darkRenkinjutsu,
  darkRequiem,
  darkShadowStep,
  darkShinenBlade,
  darkYamiNoGamble,
  fireAokiHonoo,
  fireAkaiHonoo,
  fireBending,
  fireBurnout,
  fireEruption,
  fireFellowFire,
  fireHellflame,
  fireKieyukuTomoshibi,
  fireKaryokuHatsuden,
  fireKagerou,
  firePhoenixLike,
  fireShoukyaku,
  iceAbsoluteZero,
  iceBlizzard,
  iceField,
  iceHoushaReikyaku,
  iceIcePick,
  iceMeltdown,
  iceSnowstorm,
  iceTouketsuNoroi,
  iceTsuranaruTsurara,
  iceWall,
  noneBuildup,
  noneChantPractice,
  noneColorfulPalette,
  noneHadou,
  noneHyakkaRyoran,
  noneHybrid,
  noneIkkitsukan,
  noneKintore,
  nonePunch,
  noneSuperChain,
  noneTakumi,
  noneTakumiKodawari,
  thunderElectric,
  thunderEmpPulse,
  thunderDenjiCoil,
  thunderHendenShisetsu,
  thunderKowaretaKikai,
  thunderOvercharge,
  thunderShock,
  thunderSpeedOfLight,
  thunderStatic,
  thunderTaikoNoKikai,
  thunderVoltage,
  thunderVortex,
  waterAqua,
  waterBubble,
  waterBubbleBlink,
  waterCascade,
  waterDiving,
  waterDropout,
  waterHydropump,
  waterMarineVeil,
  waterOverflow,
  waterRyutaiRikigaku,
  waterSlime,
  waterTakiShugyo,
  windCharge,
  windAirSlash,
  windAmakakeruTsubasa,
  windDaichiNoIbuki,
  windKamaitachi,
  windKazematoi,
  windKyojinNoHaniki,
  windOkaNoUeNoFuusha,
  windRewind,
  windSukimakaze,
  windSummerFurin,
  windTachikomeruKemuri,
  windTsumujikaze
] as CardDefinition[];

const tokenDefinitionIds = new Set(
  rawCards.flatMap((card) =>
    card.effects.flatMap((effect) =>
      effect.operations.flatMap((operation) =>
        operation.kind === "create_token" || operation.kind === "create_token_random_count_random_positions"
          ? [operation.tokenDefinitionId]
          : []
      )
    )
  )
);

function normalizeCard(definition: CardDefinition): CardDefinition {
  const isEnchantCard = definition.timings.length === 1 && definition.timings[0] === "enchant";
  const isTokenCard = tokenDefinitionIds.has(definition.id);
  return {
    ...definition,
    deckEligible: definition.deckEligible ?? (!isEnchantCard && !isTokenCard)
  };
}

export const sampleCards: CardDefinition[] = rawCards.map((card) => normalizeCard(card as CardDefinition));

export const sampleRoles: RoleDefinition[] = [roleBalance, roleBlaze, roleCharge, roleDolphin, roleFinale, roleSimple] as RoleDefinition[];
