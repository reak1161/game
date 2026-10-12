import { rankOf, suitOf, tileGlyph, tileName } from './mahjong';

const assetBase = `${import.meta.env.BASE_URL}assets/tiles/`;
const honors = ['Ton', 'Nan', 'Shaa', 'Pei', 'Haku', 'Hatsu', 'Chun'];

/** The label remains readable when images fail, and is hidden only after loading. */
export function tileFaceHtml(kind: number, red = false): string {
  const suit = suitOf(kind), rank = rankOf(kind);
  const name = suit === null ? honors[kind - 27]
    : rank! <= 9 ? `${['Man', 'Pin', 'Sou'][suit]}${rank}${red && rank === 5 ? '-Dora' : ''}` : null;
  if (!name) return `<span class="tile-face extended-face" aria-label="${tileName(kind)}"><span class="tile-text">${tileGlyph(kind)}</span><b aria-hidden="true">${rank}</b><small aria-hidden="true">${['萬', '筒', '索'][suit!]}</small></span>`;
  return `<span class="tile-face"><span class="tile-text">${tileGlyph(kind)}</span><img src="${assetBase}${name}.svg" alt="" draggable="false" width="300" height="400">${rank ? `<small class="tile-rank" aria-hidden="true">${rank}</small>` : ''}</span>`;
}

export const tileGuideHtml = '<h3>牌の見方</h3><p>萬子は漢数字と「萬」、筒子は丸、索子は竹の絵柄です。左上の数字で数牌の数も確認できます。白は白い無地の牌です。<b>赤</b>は赤ドラ、<b>✦</b>は特殊牌、<b>対</b>は2枚分をまとめた圧縮牌を示します。手牌の「ツモ」は今引いた牌、河の金色の枠は直前の打牌です。</p><p>動きを控えたい場合は、端末の「視差効果を減らす」「アニメーションを減らす」設定、または対局設定の「演出を有効にする」をOFFにしてください。</p><h3>素材・クレジット</h3><p>牌画像：<a href="https://github.com/FluffyStuff/riichi-mahjong-tiles" target="_blank" rel="noopener noreferrer">FluffyStuff / riichi-mahjong-tiles</a>（<a href="https://creativecommons.org/publicdomain/zero/1.0/" target="_blank" rel="noopener noreferrer">CC0</a>）</p>';

let motion = true;
export const specialShapeGuideHtml = '<h3>特殊な和了形</h3><p><b>連子</b>は、同じ種類の数牌4枚が連続した組です。通常の3枚の順子とは別に、3連子と雀頭で和了する形があります。<b>一色三連</b>は3組の連子がすべて同じ種類のときに成立し、雀頭の種類は問いません。</p><p><b>圧縮牌</b>は対子祭りで同じ牌2枚をまとめた牌です。和了判定では2枚分として数え、異なる牌の対子を8〜14組揃えた八対子〜十四対子も判定します。</p><p>同じ牌で複数の和了形を作れる場合、最も高い和了点になる解釈を採用します。別の和了形の役を同時に足すことはありません。神経衰弱では、獲得した面子と雀頭を固定して判定します。</p>';
try { motion = localStorage.getItem('mahjong-motion') !== 'off'; } catch { /* Storage is optional. */ }
export function motionEnabled(): boolean { return motion && !matchMedia('(prefers-reduced-motion: reduce)').matches; }
function syncMotion(): void {
  document.documentElement.classList.toggle('motion-off', !motionEnabled());
  if (!motionEnabled()) document.getAnimations().forEach(animation => animation.cancel());
}
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', syncMotion);
syncMotion();
export function setMotion(enabled: boolean): void {
  motion = enabled;
  try { localStorage.setItem('mahjong-motion', enabled ? 'on' : 'off'); } catch { /* Storage is optional. */ }
  syncMotion();
}
export function motionPreferred(): boolean { return motion; }

let previous = new Map<string, string>();
let previousRound = '';

/** Compare rendered state, so opening a popup never replays a draw or discard. */
export function finishVisuals(roundKey: string): void {
  document.querySelectorAll<HTMLImageElement>('.tile-face img').forEach(img => {
    const loaded = () => img.parentElement?.classList.toggle('image-ready', img.naturalWidth > 0);
    const failed = () => { img.hidden = true; loaded(); };
    if (img.complete) { if (img.naturalWidth) loaded(); else failed(); }
    else { img.addEventListener('load', loaded, { once: true }); img.addEventListener('error', failed, { once: true }); }
  });
  if (previousRound !== roundKey) previous.clear();
  const next = new Map<string, string>();
  document.querySelectorAll<HTMLElement>('[data-visual-key]').forEach(element => {
    const key = element.dataset.visualKey!;
    const face = element.dataset.face ?? '';
    next.set(key, face);
    if (motionEnabled() && previous.get(key) !== face) {
      const changed = previous.has(key);
      const flip = key.startsWith('memory:');
      const result = key.startsWith('result:');
      const river = key.startsWith('river:');
      element.animate([
        { opacity: changed ? 0.5 : 0, transform: flip ? 'perspective(500px) rotateY(-85deg)' : changed ? 'scale(.92)' : result ? 'translateY(14px)' : river ? 'translateY(-22px) rotate(-7deg)' : 'translate(16px, -12px)' },
        { opacity: 1, transform: 'none' },
      ], { duration: result ? 400 : 260, easing: 'cubic-bezier(.2,.75,.25,1)' });
    }
  });
  previous = next;
  previousRound = roundKey;
}
