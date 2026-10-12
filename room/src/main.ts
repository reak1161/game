import './style.css';
import { ABILITIES, availableAdditionalSkills, CHARACTERS, CharacterId, COMMON_SKILLS, E_SKILLS, MOB_DEFINITIONS, TERMS } from './config';
import { RoomGame } from './room-game';

const effectTooltip = document.createElement('div');
effectTooltip.id = 'effect-tooltip';
effectTooltip.className = 'effect-tooltip';
effectTooltip.role = 'tooltip';
effectTooltip.hidden = true;
const effectTitle = document.createElement('strong');
const effectDescription = document.createElement('p');
effectTooltip.append(effectTitle, effectDescription);
document.body.append(effectTooltip);
let tooltipPointer: { x: number; y: number } | undefined;

function hideEffectTooltip() {
  effectTooltip.hidden = true;
  document.querySelectorAll('[aria-describedby="effect-tooltip"]').forEach((entry) => entry.removeAttribute('aria-describedby'));
}

function showEffectTooltip(entry: HTMLElement | null, x: number, y: number) {
  if (!entry?.dataset.effect || !entry.closest('dialog[open], #game-screen.active .skill-bar')) { hideEffectTooltip(); return; }
  effectTitle.textContent = entry.dataset.effectName ?? '';
  effectDescription.textContent = entry.dataset.effect;
  effectTooltip.hidden = false;
  entry.setAttribute('aria-describedby', effectTooltip.id);
  const bounds = effectTooltip.getBoundingClientRect();
  const left = x + 16 + bounds.width <= innerWidth - 12 ? x + 16 : x - bounds.width - 16;
  const top = y + 16 + bounds.height <= innerHeight - 12 ? y + 16 : y - bounds.height - 16;
  effectTooltip.style.left = `${Math.max(12, Math.min(left, innerWidth - bounds.width - 12))}px`;
  effectTooltip.style.top = `${Math.max(12, Math.min(top, innerHeight - bounds.height - 12))}px`;
}

document.addEventListener('pointermove', (event) => {
  tooltipPointer = { x: event.clientX, y: event.clientY };
  showEffectTooltip((event.target as Element).closest<HTMLElement>('[data-effect]'), event.clientX, event.clientY);
});
document.addEventListener('focusin', (event) => {
  tooltipPointer = undefined;
  const entry = (event.target as Element).closest<HTMLElement>('[data-effect]');
  const bounds = entry?.getBoundingClientRect();
  showEffectTooltip(entry, bounds?.left ?? 0, bounds?.bottom ?? 0);
});
document.addEventListener('focusout', hideEffectTooltip);
document.addEventListener('build-info-updated', () => {
  if (!tooltipPointer) return;
  const { x, y } = tooltipPointer;
  showEffectTooltip(document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-effect]') ?? null, x, y);
});
document.addEventListener('scroll', hideEffectTooltip, true);
document.addEventListener('close', hideEffectTooltip, true);
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') hideEffectTooltip(); });
document.documentElement.addEventListener('pointerleave', hideEffectTooltip);
window.addEventListener('blur', hideEffectTooltip);
window.addEventListener('resize', hideEffectTooltip);

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('#app が見つかりません');
const attributePrefix = (attributes: readonly string[]) => attributes.length ? `${attributes.join(' / ')} / ` : '';

app.innerHTML = `
  <main class="shell">
    <header class="topbar">
      <button class="brand" data-action="home" aria-label="タイトルへ戻る">
        <span class="brand-mark">R</span>
        <span><b>ROOM</b><small>Royale Of Outlaws & Monsters</small></span>
      </button>
      <div class="build-tag"><i></i> PROTOTYPE 0.2.5</div>
      <button class="monster-button" data-action="abilities">能力一覧</button>
      <button class="monster-button" data-action="monsters">モンスター一覧</button>
      <button class="icon-button" data-action="help" aria-label="ヘルプを開く">?</button>
    </header>

    <section id="title-screen" class="screen title-screen active">
      <div class="hero-copy">
        <p class="eyebrow">REAL-TIME PVPVE BATTLE ROYALE</p>
        <h1><span>R</span>OYALE <span>O</span>F<br><span>O</span>UTLAWS &amp;<br><span>M</span>ONSTERS</h1>
        <p class="lead">狩れ。育て。最後の一人になれ。</p>
        <div class="actions">
          <button class="primary" data-action="characters"><span>ソロ訓練を開始</span><kbd>ENTER</kbd></button>
          <button class="secondary" data-action="training">射撃訓練場</button>
          <button class="secondary" data-action="help">操作・用語を確認</button>
        </div>
      </div>
      <div class="hero-art" aria-hidden="true">
        <div class="storm-ring ring-a"></div><div class="storm-ring ring-b"></div>
        <div class="bolt bolt-a"></div><div class="bolt bolt-b"></div>
        <div class="hero-sigil">Ζ</div>
        <div class="scanline"></div>
      </div>
      <div class="phase-card">
        <span class="phase-label">AVAILABLE NOW</span>
        <strong>戦闘プロトタイプ</strong>
        <p>アウトローの選択、アビリティ選択、通常攻撃・Qスキルとモンスター戦を検証できます。</p>
      </div>
    </section>

    <section id="character-screen" class="screen character-screen">
      <div class="section-head"><p class="eyebrow">SELECT YOUR OUTLAW</p><h2>アウトロー選択</h2><p>戦闘スタイルを選択してください</p></div>
      <div class="character-grid" tabindex="0" aria-label="アウトロー一覧。左右キーまたは横スクロールで移動できます">
        ${CHARACTERS.map((character, index) => `
          <article class="character-card ${character.status === 'playable' ? (index === 0 ? 'selected' : '') : 'locked'}" data-character="${character.id}">
            <div class="card-index">0${index + 1}</div>
            <div class="portrait ${character.id}"><span>${character.id === 'zeus' ? 'Ζ' : character.id === 'melodia' ? '♪' : character.id === 'skater' ? '❄' : character.id === 'future' ? '⧖' : 'P'}</span></div>
            <div class="character-info">
              <div class="attribute">${character.attribute}</div>
              <h3>${character.name}</h3><p class="epithet">${character.epithet}</p>
              <dl><div><dt>HP</dt><dd>${character.hp}</dd></div><div><dt>攻撃力</dt><dd>${character.attackPower}</dd></div><div><dt>移動速度</dt><dd>${character.movementSpeed}</dd></div><div><dt>通常攻撃</dt><dd>${character.attackType}</dd></div></dl>
              <div class="ability-line"><span>PASSIVE / ${character.passiveName}</span><p>${character.passive}</p></div>
              <div class="ability-line"><span>Q / ${character.q.name}</span><p>${character.q.description}</p></div>
            </div>
            ${character.status === 'playable' ? '<div class="selected-tag">PLAYABLE</div>' : '<div class="locked-tag">仕様確定待ち</div>'}
          </article>`).join('')}
      </div>
      <div class="select-actions"><button class="secondary" data-action="home">戻る</button><button class="primary" data-action="play">ゼウスで出撃 <kbd>ENTER</kbd></button></div>
    </section>

    <section id="game-screen" class="screen game-screen">
      <canvas id="game-canvas"></canvas>
      <div class="game-vignette"></div>
      <div class="hud-top-left">
        <div class="match-label"><span>SOLO TRAINING <b id="match-clock">00:00</b></span><strong id="match-mode">戦闘訓練場</strong></div>
        <div id="health-panel" class="health-panel"><div><strong id="hud-character">ゼウス</strong><span><b id="hud-health-status">HP</b> <b id="hud-hp">240 / 240</b></span></div><div class="health-track"><i id="hud-hp-fill"></i></div></div>
        <div class="stat-row"><span>LV <b id="level-value">1</b></span><span>XP <b id="xp-value">0 / 20</b></span><span>COIN <b id="coin-value">0</b></span></div>
        <div class="xp-track"><i id="xp-fill"></i></div>
        <small id="progress-note">モンスターを倒して経験値を獲得</small>
      </div>
      <div class="hud-top-right">
        <div class="minimap"><canvas id="minimap" width="160" height="160"></canvas><span>N</span></div>
        <button class="minimap-mode" data-action="minimap-mode"><b id="minimap-mode-label">付近表示</b> / 切替</button>
      </div>
      <div class="combat-dock">
        <div id="action-feedback" class="action-feedback" role="status" aria-live="polite" hidden></div>
        <div class="attack-readout"><span class="live-dot"></span><strong id="attack-mode">近接・自動攻撃</strong><span id="attack-status">扇形に敵を入れると攻撃</span></div>
        <div class="skill-bar" aria-label="スキルとクールダウン">
          ${['q', 'e', 'c', 'space'].map((slot) => `<div id="skill-${slot}" class="skill-slot" tabindex="0" role="group" data-state="locked"><div class="skill-slot-head"><kbd>${slot === 'space' ? 'SPACE' : slot.toUpperCase()}</kbd><b id="skill-${slot}-value">—</b></div><strong id="skill-${slot}-name">未取得</strong><small id="skill-${slot}-status">アビリティで取得</small><div class="skill-recovery"><i></i></div></div>`).join('')}
        </div>
      </div>
      <div class="controls-hint"><span><kbd>WASD</kbd> 移動</span><span><kbd>マウス</kbd> 照準</span><span><kbd>M</kbd> マップ</span><span><kbd>ESC</kbd> メニュー</span></div>
      <div id="announcement" class="announcement" role="status"></div>
      <section id="shop-panel" class="shop-panel" hidden><p class="eyebrow">FIELD SHOP</p><h2>ショップ</h2><small>移動中も購入できます／距離3以上で閉じます</small><div id="shop-stock"></div></section>
      <div class="item-slots">${Array.from({ length: 3 }, (_, index) => `<button type="button" id="item-slot-${index}" data-action="use-item" data-item-slot="${index}"><kbd>${index + 1}</kbd><span>空きスロット</span><small></small></button>`).join('')}</div>
      <button class="build-button" data-action="build-info">ビルド情報</button>
      <div id="training-stats" class="training-stats" hidden><b>DECOY</b><span id="training-total">総ダメージ 0</span><span id="training-dps">平均DPS 0</span><span id="training-dps-recent">直近1秒DPS 0</span><button data-action="position-decoy">デコイを前方へ</button><button data-action="training-manager">訓練管理</button><button data-action="reset-decoy">計測リセット</button></div>
      <button class="game-menu" data-action="pause" aria-label="メニュー">Ⅱ</button>
    </section>

    <dialog id="help-dialog">
      <button class="dialog-close" data-action="close-dialog" aria-label="閉じる">×</button>
      <p class="eyebrow">FIELD MANUAL</p><h2>操作・用語</h2>
      <div class="help-grid"><div><h3>操作</h3><p><kbd>W A S D</kbd><span>移動</span></p><p><kbd>マウス</kbd><span>照準。近接は前方の扇形に敵が入ると自動攻撃、遠距離は照準方向へ自動発射。クリック不要。</span></p><p><kbd>Space</kbd><span>取得したSpaceアクション</span></p><p><kbd>Q</kbd><span>キャラクタースキル</span></p><p><kbd>E / C</kbd><span>取得した追加スキル</span></p><p><kbd>1 / 2 / 3</kbd><span>アイテム使用</span></p><p><kbd>F</kbd><span>近くのショップを開く</span></p><p><kbd>M</kbd><span>全体マップ</span></p></div><div><h3>用語</h3>${TERMS.map(([term, description]) => `<p><strong>${term}</strong><span>${description}</span></p>`).join('')}</div></div>
      <aside><b>スキルと成長</b> 開始時にEスキルを選択します。5の倍数のレベルでは、アビリティ、スキルの順に選択できます。追加スキルはEとCで使用します。ビルド情報の項目にカーソルを合わせると効果を確認できます。</aside>
    </dialog>

    <dialog id="pause-dialog" class="pause-dialog">
      <p class="eyebrow">PAUSED</p><h2>訓練を中断中</h2>
      <button class="primary" data-action="resume">訓練に戻る</button>
      <button class="secondary" data-action="quit">キャラクター選択へ</button>
    </dialog>
    <dialog id="result-dialog" class="result-dialog" aria-labelledby="result-title">
      <p class="eyebrow">TRAINING COMPLETE</p><h2 id="result-title">次の一戦へ。</h2>
      <p id="result-character" class="result-character"></p>
      <dl class="result-stats"><div><dt>生存時間</dt><dd id="result-time">00:00</dd></div><div><dt>到達レベル</dt><dd id="result-level">1</dd></div><div><dt>撃破数</dt><dd id="result-kills">0</dd></div><div><dt>所持コイン</dt><dd id="result-coins">0</dd></div></dl>
      <button class="primary" data-action="retry">同じアウトローでもう一度</button>
      <button class="secondary" data-action="quit">アウトローを選び直す</button>
      <p class="result-note">レベル・ビルドをリセットして、新しい訓練を開始します。</p>
    </dialog>
    <dialog id="ability-dialog" class="ability-dialog">
      <p class="eyebrow">BUILD SELECTION</p><h2 id="ability-choice-title">アビリティ選択</h2>
      <p>次のうちどれか選ぶ</p>
      <div id="ability-choices" class="ability-choices"></div>
    </dialog>
    <dialog id="build-dialog" class="build-dialog">
      <button class="dialog-close" data-action="build-info" aria-label="閉じる">×</button>
      <p class="eyebrow">CURRENT BUILD</p><h2>ビルド情報</h2>
      <div id="build-info-content" class="build-info-content"></div>
    </dialog>
    <dialog id="world-map-dialog" class="world-map-dialog">
      <button class="dialog-close" data-action="close-world-map" aria-label="閉じる">×</button>
      <p class="eyebrow">WORLD MAP</p><h2>全体マップ 100×100</h2>
      <canvas id="world-map" width="600" height="600"></canvas>
      <p id="mapped-shop-info" class="mapped-info">ショップはまだ発見されていません。</p>
    </dialog>
    <dialog id="training-dialog" class="training-dialog">
      <button class="dialog-close" data-action="close-training-manager" aria-label="閉じる">×</button>
      <button class="training-collapse" data-action="collapse-training-manager" aria-label="折りたたむ">−</button>
      <p class="eyebrow">TRAINING CONTROL</p><h2>訓練場管理</h2>
      <div class="training-panel-body"><label>アウトロー<select id="training-character">${CHARACTERS.map((character) => `<option value="${character.id}">${character.name}</option>`).join('')}</select></label>
        <label>レベル<input id="training-level" type="number" min="1" max="25" value="1"><button data-action="apply-training-level">適用</button></label>
        <h3>Eスキル</h3><div class="training-options" id="training-e-options"></div>
        <h3>Cスキル</h3><div class="training-options" id="training-c-options"></div>
        <h3>所持アビリティ（クリックで0/1スタック切替）</h3><div class="training-options">${ABILITIES.filter((ability) => ability.status === 'playable' && !ability.characterId).map((ability) => `<button data-training-ability="${ability.id}">${ability.name}</button>`).join('')}</div>
        <button class="secondary" data-action="training-reset-cd">HP・CDをリセット</button></div>
    </dialog>
    <dialog id="monster-dialog" class="monster-dialog list-dialog">
      <header class="dialog-header"><div><p class="eyebrow">MONSTER DATABASE</p><h2>モンスター一覧</h2></div><button class="dialog-close" data-action="close-monsters" aria-label="閉じる">×</button></header>
      <div class="dialog-body"><div class="monster-list">
        ${Object.values(MOB_DEFINITIONS).map((monster) => `<article>
          <div class="monster-look ${monster.attackType === '近接' ? 'melee' : 'ranged'}"></div>
          <div><span>${monster.category}</span><h3>${monster.name}</h3><p>${monster.spawnCondition}</p></div>
          <dl><div><dt>HP</dt><dd>${monster.hp}</dd></div><div><dt>移動速度</dt><dd>${monster.movementSpeed}</dd></div><div><dt>攻撃タイプ</dt><dd>${monster.attackType}</dd></div><div><dt>攻撃射程</dt><dd>${monster.attackRange}</dd></div><div><dt>探知範囲</dt><dd>${monster.detectionRange}</dd></div><div><dt>攻撃力</dt><dd>${monster.damage}</dd></div><div><dt>攻撃CD</dt><dd>${monster.attackIntervalSeconds}秒</dd></div><div><dt>取得経験値</dt><dd>${monster.xpMin}～${monster.xpMax}</dd></div><div><dt>取得コイン</dt><dd>${monster.coinMin}～${monster.coinMax}</dd></div></dl>
        </article>`).join('')}
      </div></div>
    </dialog>
    <dialog id="ability-catalog-dialog" class="catalog-dialog list-dialog">
      <header class="dialog-header"><div><p class="eyebrow">ABILITY DATABASE</p><h2>アウトロー・能力一覧</h2></div><button class="dialog-close" data-action="close-abilities" aria-label="閉じる">×</button></header>
      <div class="dialog-body"><div class="catalog-list">
        <section class="catalog-outlaw"><h3>共通追加スキル</h3>${COMMON_SKILLS.map((skill) => `<article><b>${skill.name}</b><small>${skill.description}／CD ${skill.cooldownSeconds}秒</small></article>`).join('')}</section>
        ${CHARACTERS.map((character) => `<section class="catalog-outlaw"><h3>${character.name}</h3><p>${character.epithet}／HP ${character.hp}／攻撃力 ${character.attackPower}／移動速度 ${character.movementSpeed}／${character.attackType}</p><article><b>◆ ${character.passiveName}</b><small>${character.passive}</small></article><article><b>${character.attribute} / Q ${character.q.name}</b><small>${character.q.description}${character.q.cooldownSeconds ? `／CD ${character.q.cooldownSeconds}秒` : ''}</small></article>${E_SKILLS[character.id].map((skill) => `<article><b>${skill.attribute ? `${skill.attribute} / ` : ''}E候補 ${skill.name}</b><small>${skill.description}／CD ${skill.cooldownSeconds}秒</small></article>`).join('')}${ABILITIES.filter((ability) => ability.characterId === character.id).map((ability) => `<article><b>${attributePrefix(ability.attributes)}専用${ability.types.join('・')} ${ability.name}</b><small>${ability.description ?? ''}</small></article>`).join('')}</section>`).join('')}
        <section class="catalog-outlaw"><h3>共通追加スキル</h3>${COMMON_SKILLS.map((skill) => `<article><b>${skill.name}</b><small>${skill.description}／CD ${skill.cooldownSeconds}秒</small></article>`).join('')}</section>
        <section class="catalog-outlaw catalog-abilities"><h3>共通アビリティ</h3>${ABILITIES.filter((ability) => !ability.characterId).map((ability) => `<article><b>${attributePrefix(ability.attributes)}${ability.name}</b><small>${ability.description ?? ''}${ability.requires?.length ? `／前提：${ability.requires.join('、')}` : ''}${ability.incompleteReason ? `／保留：${ability.incompleteReason}` : ''}</small></article>`).join('')}</section>
      </div></div>
    </dialog>
  </main>`;

const screens = [...document.querySelectorAll<HTMLElement>('.screen')];
const helpDialog = document.querySelector<HTMLDialogElement>('#help-dialog')!;
const pauseDialog = document.querySelector<HTMLDialogElement>('#pause-dialog')!;
const resultDialog = document.querySelector<HTMLDialogElement>('#result-dialog')!;
resultDialog.addEventListener('cancel', (event) => event.preventDefault());
const monsterDialog = document.querySelector<HTMLDialogElement>('#monster-dialog')!;
const abilityCatalogDialog = document.querySelector<HTMLDialogElement>('#ability-catalog-dialog')!;
const worldMapDialog = document.querySelector<HTMLDialogElement>('#world-map-dialog')!;
const trainingDialog = document.querySelector<HTMLDialogElement>('#training-dialog')!;
const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas')!;
const minimap = document.querySelector<HTMLCanvasElement>('#minimap')!;
const announcement = document.querySelector<HTMLElement>('#announcement')!;
const characterGrid = document.querySelector<HTMLElement>('.character-grid')!;
const characterScreen = document.querySelector<HTMLElement>('#character-screen')!;
let game: RoomGame | undefined;
let selectedCharacter: CharacterId = 'zeus';
let pendingGameMode: 'combat' | 'training' = 'combat';

function showScreen(id: string) {
  screens.forEach((screen) => screen.classList.toggle('active', screen.id === id));
}

function startGame(mode = pendingGameMode) {
  pendingGameMode = mode;
  showScreen('game-screen');
  game?.destroy();
  game = new RoomGame(canvas, minimap, announcement, selectedCharacter, mode);
  game.start();
}

function syncModalPause() {
  if (document.querySelector('dialog:modal')) game?.pause();
  else game?.resume();
}

for (const dialog of [helpDialog, pauseDialog, monsterDialog, abilityCatalogDialog, worldMapDialog]) {
  dialog.addEventListener('close', syncModalPause);
}

function pauseWhenAway() {
  if (!game || !document.querySelector('#game-screen.active')) return;
  game.pause();
  if (!document.querySelector('dialog:modal')) pauseDialog.showModal();
}
window.addEventListener('blur', pauseWhenAway);
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseWhenAway(); });

function selectCharacter(characterId: CharacterId, behavior: ScrollBehavior = 'smooth') {
  const character = CHARACTERS.find((item) => item.id === characterId);
  const characterCard = document.querySelector<HTMLElement>(`[data-character="${characterId}"]`);
  if (!character || !characterCard) return;
  selectedCharacter = characterId;
  document.querySelectorAll('.character-card').forEach((card) => card.classList.toggle('selected', card === characterCard));
  const playButton = document.querySelector<HTMLElement>('[data-action="play"]');
  if (playButton) playButton.innerHTML = `${character.name}で出撃 <kbd>ENTER</kbd>`;
  characterCard.scrollIntoView({ behavior, block: 'nearest', inline: 'center' });
}

function refreshTrainingESkills(characterId: CharacterId) {
  const setup = game?.trainingSetup();
  for (const slot of ['e', 'c']) {
    const container = document.querySelector<HTMLElement>(`#training-${slot}-options`);
    const selected = slot === 'e' ? setup?.e : setup?.c;
    const other = slot === 'e' ? setup?.c : setup?.e;
    if (container) container.innerHTML = availableAdditionalSkills(characterId).map((skill) => `<button data-training-${slot}="${skill.id}" class="${selected === skill.id ? 'selected' : ''}" aria-pressed="${selected === skill.id}" ${other === skill.id ? 'disabled title="もう一方のスロットで取得済み"' : ''}>${skill.name}</button>`).join('');
  }
  document.querySelectorAll<HTMLElement>('[data-training-ability]').forEach((button) => {
    const selected = setup?.abilities.includes(button.dataset.trainingAbility ?? '') ?? false;
    button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected));
  });
  const levelInput = document.querySelector<HTMLInputElement>('#training-level');
  if (levelInput && setup) levelInput.value = String(setup.level);
}

characterScreen.addEventListener('wheel', (event) => {
  if (characterGrid.scrollWidth <= characterGrid.clientWidth) return;
  const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 24 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? characterGrid.clientWidth : 1;
  const delta = (Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY) * unit;
  if (delta === 0) return;
  event.preventDefault();
  event.stopPropagation();
  characterGrid.scrollLeft = Math.max(0, Math.min(characterGrid.scrollWidth - characterGrid.clientWidth, characterGrid.scrollLeft + delta));
}, { passive: false, capture: true });

document.addEventListener('click', (event) => {
  const characterCard = (event.target as HTMLElement).closest<HTMLElement>('[data-character]');
  if (characterCard?.dataset.character) {
    selectCharacter(characterCard.dataset.character as CharacterId);
  }
  const button = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
  const trainingE = (event.target as HTMLElement).closest<HTMLElement>('[data-training-e]');
  if (trainingE?.dataset.trainingE) { game?.setTrainingESkill(trainingE.dataset.trainingE); refreshTrainingESkills(selectedCharacter); }
  const trainingC = (event.target as HTMLElement).closest<HTMLElement>('[data-training-c]');
  if (trainingC?.dataset.trainingC) { game?.setTrainingSkill('C', trainingC.dataset.trainingC); refreshTrainingESkills(selectedCharacter); }
  const trainingAbility = (event.target as HTMLElement).closest<HTMLElement>('[data-training-ability]');
  if (trainingAbility?.dataset.trainingAbility) { game?.toggleTrainingAbility(trainingAbility.dataset.trainingAbility); refreshTrainingESkills(selectedCharacter); }
  if (!button) return;
  const action = button.dataset.action;
  if (action === 'home') { game?.destroy(); game = undefined; showScreen('title-screen'); }
  if (action === 'characters') { pendingGameMode = 'combat'; showScreen('character-screen'); }
  if (action === 'training') { pendingGameMode = 'training'; showScreen('character-screen'); }
  if (action === 'play') startGame();
  if (action === 'retry') startGame();
  if (action === 'use-item') game?.useItem(Number(button.dataset.itemSlot));
  if (action === 'position-decoy') game?.positionTrainingDecoy();
  if (action === 'reset-decoy') game?.resetTrainingMetrics();
  if (action === 'training-manager') { refreshTrainingESkills(selectedCharacter); (document.querySelector<HTMLSelectElement>('#training-character')!).value = selectedCharacter; trainingDialog.classList.remove('collapsed'); if (!trainingDialog.open) trainingDialog.show(); }
  if (action === 'close-training-manager') trainingDialog.close();
  if (action === 'collapse-training-manager') trainingDialog.classList.toggle('collapsed');
  if (action === 'apply-training-level') game?.setTrainingLevel(Number(document.querySelector<HTMLInputElement>('#training-level')?.value));
  if (action === 'training-reset-cd') game?.resetTrainingState();
  if (action === 'build-info') game?.toggleBuildInfo();
  if (action === 'minimap-mode') game?.cycleMinimapMode();
  if (action === 'help') { game?.pause(); helpDialog.showModal(); }
  if (action === 'monsters') { game?.pause(); monsterDialog.showModal(); }
  if (action === 'close-monsters') { monsterDialog.close(); game?.resume(); }
  if (action === 'abilities') { game?.pause(); abilityCatalogDialog.showModal(); }
  if (action === 'close-abilities') abilityCatalogDialog.close();
  if (action === 'close-world-map') worldMapDialog.close();
  if (action === 'close-dialog') helpDialog.close();
  if (action === 'pause') { game?.pause(); pauseDialog.showModal(); }
  if (action === 'resume') { pauseDialog.close(); game?.resume(); }
  if (action === 'quit') { pauseDialog.close(); game?.destroy(); game = undefined; showScreen('character-screen'); }
});

document.querySelector('#shop-panel')?.addEventListener('click', (event) => {
  const slot = (event.target as HTMLElement).closest<HTMLElement>('[data-shop-slot]');
  if (slot?.dataset.shopSlot) game?.buyShopItem(Number(slot.dataset.shopSlot));
});

document.querySelector<HTMLSelectElement>('#training-character')?.addEventListener('change', (event) => {
  selectedCharacter = (event.target as HTMLSelectElement).value as CharacterId;
  refreshTrainingESkills(selectedCharacter);
  trainingDialog.close();
  startGame('training');
});

window.addEventListener('keydown', (event) => {
  if (resultDialog.open) { if (event.key === 'Escape') event.preventDefault(); return; }
  if (event.isComposing || (event.key !== 'Escape' && event.target instanceof HTMLElement && event.target.matches('input,select,textarea,[contenteditable="true"]'))) return;
  if (event.key.toLowerCase() === 'm' && worldMapDialog.open) { event.preventDefault(); worldMapDialog.close(); return; }
  if (event.key === 'Escape') {
    if (pauseDialog.open) { event.preventDefault(); pauseDialog.close(); game?.resume(); return; }
    if (abilityCatalogDialog.open) { event.preventDefault(); abilityCatalogDialog.close(); return; }
    if (monsterDialog.open) { event.preventDefault(); monsterDialog.close(); game?.resume(); return; }
    if (helpDialog.open) { event.preventDefault(); helpDialog.close(); return; }
    if (worldMapDialog.open) { event.preventDefault(); worldMapDialog.close(); return; }
    if (trainingDialog.open) { event.preventDefault(); trainingDialog.close(); return; }
    const buildDialog = document.querySelector<HTMLDialogElement>('#build-dialog');
    if (buildDialog?.open) { event.preventDefault(); buildDialog.close(); return; }
  }
  if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && document.querySelector('#character-screen.active')) {
    event.preventDefault();
    characterGrid.scrollBy({ left: event.key === 'ArrowLeft' ? -340 : 340, behavior: 'smooth' });
    return;
  }
  if ((event.key.toLowerCase() === 'a' || event.key.toLowerCase() === 'd') && document.querySelector('#character-screen.active')) {
    event.preventDefault();
    const currentIndex = CHARACTERS.findIndex((character) => character.id === selectedCharacter);
    const direction = event.key.toLowerCase() === 'a' ? -1 : 1;
    const nextIndex = Math.max(0, Math.min(CHARACTERS.length - 1, currentIndex + direction));
    if (nextIndex !== currentIndex) selectCharacter(CHARACTERS[nextIndex].id);
    return;
  }
  if (event.key === 'Enter' && document.querySelector('#title-screen.active')) showScreen('character-screen');
  else if (event.key === 'Enter' && document.querySelector('#character-screen.active')) startGame();
  else if (event.key === 'Escape' && document.querySelector('#game-screen.active') && !pauseDialog.open) {
    event.preventDefault();
    game?.pause(); pauseDialog.showModal();
  }
});
