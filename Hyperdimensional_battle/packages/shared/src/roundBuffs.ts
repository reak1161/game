import type { RoundBuffDefinition } from "./types";

export const sampleRoundBuffs: RoundBuffDefinition[] = [
  {
    id: "round_buff_voltessimo",
    name: "ボルテッシモ",
    description: "雷出現度+1。自分の場の雷属性のカードの数値を10%上げる。",
    iconAsset: null
  },
  {
    id: "round_buff_tailwind_rush",
    name: "追い風ラッシュ",
    description: "風出現度+1。自分の場の風属性のカードはラウンド終了時に数値×1.3。",
    iconAsset: null
  },
  {
    id: "round_buff_mirror",
    name: "映しミラー",
    description: "自分のほかのラウンドバフの効果をすべてこのバフに複製する。",
    iconAsset: null
  },
  {
    id: "round_buff_freezing_wind",
    name: "こごえるかぜ",
    description: "氷出現度+1。自分の場の氷属性のカードに「きらめく雪景色」を付与する。",
    iconAsset: null
  },
  {
    id: "round_buff_one_more",
    name: "もう一回",
    description: "自分の場の一番右に配置されているカードが1回追加発動する。",
    iconAsset: null
  },
  {
    id: "round_buff_information_society",
    name: "情報社会",
    description: "各ラウンドの最大手札数+1。各ラウンドの設置可能数+1。",
    iconAsset: null
  }
];
