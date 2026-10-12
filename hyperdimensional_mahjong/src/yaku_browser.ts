import { yakuExamples } from './yaku_examples';
import { yakuInfo, type YakuCategory } from './yaku_catalog';
import { tileFaceHtml } from './visuals';
import type { Settings, RoundEvent } from './mahjong';

const escape = (text: string): string => text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const state = { tab: '1翻', category: 'all', availability: 'all', query: '' };
const categoryNames: Record<YakuCategory, string> = { normal: '通常役', local: 'ローカル役', special: '特殊役' };

export function mountYakuBrowser(dialog: HTMLElement, rules: Settings, event: RoundEvent, memory = false): void {
  const entries = Object.entries(yakuExamples).flatMap(([tab, examples]) => examples.map(example => {
    const info = yakuInfo(example.name, example.han, rules, event);
    return { ...example, ...info, tab: info.tab ?? tab };
  }));
  dialog.innerHTML = `${memory ? '<button class="close" id="memoryYakuClose" aria-label="役一覧を閉じる">×</button>' : '<button class="close" data-action="yaku" aria-label="役一覧を閉じる">×</button>'}<h2>役一覧</h2><div class="yaku-browser"><div class="yaku-tools"><input type="search" data-yaku-search aria-label="役名で検索" placeholder="役名で検索"><label>種類<select data-yaku-category><option value="all">すべて</option><option value="normal">通常役</option><option value="local">ローカル役</option><option value="special">特殊役</option></select></label><label>表示<select data-yaku-availability><option value="all">すべて</option><option value="enabled">この局で有効</option><option value="inactive">無効・対象外</option></select></label></div><details class="yaku-priority"><summary>この局で有効な特殊役</summary><div></div></details><div class="yaku-tabs"></div><small class="yaku-count" aria-live="polite"></small><div class="yaku-grid"></div></div><p>「有効」は対局設定で使える役を示します。和了には手牌全体と各役の条件が必要です。「無効」は設定OFF、「対象外」はこの局の進行では使わない役です。${memory ? '神経衰弱では獲得した4面子と雀頭の形で役を判定します。' : ''}牌は構成例です。</p>`;
  const root = dialog.querySelector<HTMLElement>('.yaku-browser')!;
  root.querySelector<HTMLDetailsElement>('.yaku-priority')!.open = true;
  const search = root.querySelector<HTMLInputElement>('[data-yaku-search]')!;
  const category = root.querySelector<HTMLSelectElement>('[data-yaku-category]')!;
  const availability = root.querySelector<HTMLSelectElement>('[data-yaku-availability]')!;
  search.value = state.query; category.value = state.category; availability.value = state.availability;
  function refresh(): void {
    const query = state.query.trim();
    const filtered = entries.filter(entry => (state.category === 'all' || entry.category === state.category)
      && (state.availability === 'all' || (state.availability === 'enabled' ? entry.status === 'enabled' : entry.status !== 'enabled'))
      && (!query || entry.name.includes(query)));
    const tabs = Object.keys(yakuExamples);
    if (!query && !filtered.some(entry => entry.tab === state.tab)) state.tab = filtered[0]?.tab ?? state.tab;
    root.querySelector('.yaku-tabs')!.innerHTML = tabs.map(tab => `<button type="button" ${memory ? 'data-memory-yaku-tab' : 'data-yaku-tab'}="${tab}" aria-pressed="${tab === state.tab}" ${tab === state.tab ? 'class="primary"' : ''}>${tab}</button>`).join('');
    const visible = filtered.filter(entry => query || entry.tab === state.tab).sort((a, b) => Number(b.status === 'enabled') - Number(a.status === 'enabled'));
    root.querySelector('.yaku-count')!.textContent = `${visible.length}件${query ? '（全タブから検索）' : ''}`;
    root.querySelector('.yaku-grid')!.innerHTML = visible.map(entry => `<section class="yaku-example ${entry.status !== 'enabled' ? 'inactive' : ''}" data-yaku-name="${escape(entry.name)}" data-yaku-status="${entry.status}"><strong>${escape(entry.name)} <small>${escape(entry.han)}</small></strong><div class="yaku-badges"><span>${categoryNames[entry.category]}</span><span class="yaku-status ${entry.status}">${entry.status === 'enabled' ? '有効' : entry.status === 'disabled' ? '無効' : '対象外'}</span></div><div class="candidate-tiles">${entry.kinds.map(kind => `<span class="candidate-tile">${tileFaceHtml(kind)}</span>`).join('')}</div><p>${escape(entry.note)}</p>${entry.reason.startsWith('この対局') ? '' : `<p class="yaku-reason">${escape(entry.reason)}</p>`}</section>`).join('') || '<p class="yaku-empty">条件に合う役はありません。</p>';
    const active = entries.filter(entry => entry.category === 'special' && entry.status === 'enabled');
    root.querySelector('.yaku-priority div')!.innerHTML = active.map(entry => `<button type="button" data-yaku-find="${escape(entry.name)}">${escape(entry.name)}</button>`).join('') || '<span>この局で有効な特殊役はありません。</span>';
    root.querySelectorAll<HTMLImageElement>('.tile-face img').forEach(img => {
      const ready = () => { if (img.naturalWidth) img.parentElement?.classList.add('image-ready'); else img.hidden = true; };
      if (img.complete) ready(); else { img.addEventListener('load', ready, { once: true }); img.addEventListener('error', ready, { once: true }); }
    });
  }
  search.addEventListener('input', () => { state.query = search.value; refresh(); });
  category.addEventListener('change', () => { state.category = category.value; refresh(); });
  availability.addEventListener('change', () => { state.availability = availability.value; refresh(); });
  root.addEventListener('click', event => {
    const target = event.target as HTMLElement;
    const tab = target.closest<HTMLElement>('[data-yaku-tab], [data-memory-yaku-tab]');
    if (tab) { state.tab = tab.dataset.yakuTab ?? tab.dataset.memoryYakuTab!; state.query = ''; search.value = ''; refresh(); }
    const find = target.closest<HTMLElement>('[data-yaku-find]');
    if (find) { state.query = find.dataset.yakuFind!; state.category = state.availability = 'all'; search.value = state.query; category.value = availability.value = 'all'; refresh(); }
  });
  refresh();
}
