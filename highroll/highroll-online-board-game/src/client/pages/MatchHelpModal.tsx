import React from 'react';
import type { CardDefinition, Player } from '@shared/types';
import styles from './Match.module.css';
import type { RoleEntry } from './matchStatic';

type DeckCategoryFilter = 'all' | 'attack' | 'defense' | 'spell' | 'equip';
type DeckZoneFilter = 'all' | 'deck' | 'hand' | 'discard' | 'install' | 'remaining' | 'empty';
type DeckSortKey = 'name' | 'remaining' | 'total' | 'cost' | 'category';
type DeckSortDir = 'asc' | 'desc';

type DeckCountEntry = {
    cardId: string;
    count: {
        total: number;
        remaining: number;
        inDeck: number;
        inHand: number;
        inDiscard: number;
        inInstall: number;
    };
    info?: CardDefinition;
};

type MatchHelpModalProps = {
    mode: 'deck' | 'rules' | 'roles';
    onClose: () => void;
    deckSearchText: string;
    onDeckSearchTextChange: (value: string) => void;
    deckCategoryFilter: DeckCategoryFilter;
    onDeckCategoryFilterChange: (value: DeckCategoryFilter) => void;
    deckZoneFilter: DeckZoneFilter;
    onDeckZoneFilterChange: (value: DeckZoneFilter) => void;
    deckInspectMode: 'remaining' | 'all';
    onDeckInspectModeChange: (value: 'remaining' | 'all') => void;
    deckSortKey: DeckSortKey;
    onDeckSortKeyChange: (value: DeckSortKey) => void;
    deckSortDir: DeckSortDir;
    onDeckSortDirChange: (value: DeckSortDir) => void;
    deckCounts: DeckCountEntry[];
    deckCountsToDisplay: DeckCountEntry[];
    players: Player[];
    roleLookup: Map<string, RoleEntry>;
    getCategoryLabel: (category?: string | null) => string | undefined;
    getKindLabel: (kind?: string | null) => string | undefined;
};

const MatchHelpModal: React.FC<MatchHelpModalProps> = ({
    mode,
    onClose,
    deckSearchText,
    onDeckSearchTextChange,
    deckCategoryFilter,
    onDeckCategoryFilterChange,
    deckZoneFilter,
    onDeckZoneFilterChange,
    deckInspectMode,
    onDeckInspectModeChange,
    deckSortKey,
    onDeckSortKeyChange,
    deckSortDir,
    onDeckSortDirChange,
    deckCounts,
    deckCountsToDisplay,
    players,
    roleLookup,
    getCategoryLabel,
    getKindLabel,
}) => {
    const visibleRoles = React.useMemo(
        () =>
            Array.from(
                new Map(
                    players
                        .map((player) => player.roleId)
                        .filter(Boolean)
                        .map((roleId) => [roleId as string, roleLookup.get(roleId as string)])
                ).entries()
            ).filter(([, role]) => Boolean(role)),
        [players, roleLookup]
    );

    return (
        <div className={styles.modalOverlay} onClick={onClose}>
            <div className={styles.modalPanel} onClick={(e) => e.stopPropagation()}>
                <div className={styles.modalHeader}>
                    <h2>{mode === 'deck' ? 'デッキ内容' : mode === 'roles' ? 'ロール詳細' : 'ルール / 進め方'}</h2>
                    <button type="button" className={styles.modalClose} onClick={onClose}>
                        閉じる
                    </button>
                </div>
                <div className={styles.modalBody}>
                    {mode === 'deck' ? (
                        <>
                            <div className={styles.deckTools}>
                                <label className={styles.deckTool}>
                                    <span className={styles.deckToolLabel}>検索（名前/効果）</span>
                                    <input
                                        className={styles.deckSearchInput}
                                        value={deckSearchText}
                                        onChange={(e) => onDeckSearchTextChange(e.target.value)}
                                        placeholder="例: 未来予知 / 炎上 / 防御"
                                    />
                                </label>
                                <label className={styles.deckTool}>
                                    <span className={styles.deckToolLabel}>種別</span>
                                    <select
                                        className={styles.select}
                                        value={deckCategoryFilter}
                                        onChange={(e) => onDeckCategoryFilterChange(e.target.value as DeckCategoryFilter)}
                                    >
                                        <option value="all">すべて</option>
                                        <option value="attack">攻撃</option>
                                        <option value="defense">防御</option>
                                        <option value="spell">呪文</option>
                                        <option value="equip">装備</option>
                                    </select>
                                </label>
                                <label className={styles.deckTool}>
                                    <span className={styles.deckToolLabel}>場所</span>
                                    <select
                                        className={styles.select}
                                        value={deckZoneFilter}
                                        onChange={(e) => onDeckZoneFilterChange(e.target.value as DeckZoneFilter)}
                                    >
                                        <option value="all">すべて</option>
                                        <option value="deck">山札にある</option>
                                        <option value="hand">手札にある</option>
                                        <option value="discard">捨て札にある</option>
                                        <option value="install">設置にある</option>
                                        <option value="remaining">残りあり</option>
                                        <option value="empty">残り0</option>
                                    </select>
                                </label>
                                <label className={styles.deckTool}>
                                    <span className={styles.deckToolLabel}>表示</span>
                                    <select
                                        className={styles.select}
                                        value={deckInspectMode}
                                        onChange={(e) => onDeckInspectModeChange(e.target.value as 'remaining' | 'all')}
                                    >
                                        <option value="remaining">残りありのみ</option>
                                        <option value="all">全カード</option>
                                    </select>
                                </label>
                                <label className={styles.deckTool}>
                                    <span className={styles.deckToolLabel}>ソート</span>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <select
                                            className={styles.select}
                                            value={deckSortKey}
                                            onChange={(e) => onDeckSortKeyChange(e.target.value as DeckSortKey)}
                                            style={{ minWidth: 160 }}
                                        >
                                            <option value="name">名前</option>
                                            <option value="category">種別</option>
                                            <option value="cost">コスト</option>
                                            <option value="remaining">残り</option>
                                            <option value="total">総数</option>
                                        </select>
                                        <select
                                            className={styles.select}
                                            value={deckSortDir}
                                            onChange={(e) => onDeckSortDirChange(e.target.value as DeckSortDir)}
                                            style={{ minWidth: 110 }}
                                        >
                                            <option value="asc">昇順</option>
                                            <option value="desc">降順</option>
                                        </select>
                                    </div>
                                </label>
                            </div>
                            <div className={styles.deckSummaryRow}>表示: {deckCountsToDisplay.length} 件（全 {deckCounts.length} 種類）</div>
                            <ul className={styles.cardList}>
                                {deckCounts.length === 0 && <li className={styles.cardItem}>デッキ情報がありません。</li>}
                                {deckCounts.length > 0 && deckCountsToDisplay.length === 0 && (
                                    <li className={styles.cardItem}>条件に一致するカードがありません。</li>
                                )}
                                {deckCountsToDisplay.map(({ cardId, count, info }) => (
                                    <li key={cardId} className={styles.cardItem}>
                                        <div className={styles.cardNameRow}>
                                            <strong>{info?.name ?? cardId}</strong>
                                            <span
                                                className={styles.cardMetaChip}
                                                style={count.remaining === 0 ? { color: '#b91c1c', background: '#fee2e2' } : undefined}
                                            >
                                                残り {count.remaining} / {count.total}
                                            </span>
                                            <span className={styles.cardMetaChip}>コスト {info?.cost ?? 1}</span>
                                            {info?.category && <span className={styles.cardMetaChip}>{getCategoryLabel(info.category)}</span>}
                                            {info?.kind && <span className={styles.cardMetaChip}>{getKindLabel(info.kind)}</span>}
                                            <span className={styles.cardMetaChip}>
                                                山札 {count.inDeck} / 手札 {count.inHand} / 捨て札 {count.inDiscard} / 設置 {count.inInstall}
                                            </span>
                                        </div>
                                        {info?.text && <p>{info.text}</p>}
                                    </li>
                                ))}
                            </ul>
                        </>
                    ) : mode === 'roles' ? (
                        <div className={styles.ruleBlock}>
                            <p>現在のマッチに登場しているロールの詳細です。</p>
                            <ul>
                                {visibleRoles.map(([roleId, role]) => (
                                    <li key={roleId}>
                                        <strong>{role?.name ?? roleId}</strong>
                                        {role?.text ? `：${role.text}` : ''}
                                        {role?.detailText ? (
                                            <div style={{ marginTop: 6, color: '#334155', whiteSpace: 'pre-wrap' }}>{role.detailText}</div>
                                        ) : null}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ) : (
                        <div className={styles.ruleBlock}>
                            <p>目的: 相手のHPを0にして勝利します。</p>
                            <ul>
                                <li>手番: Spe順に進行します。</li>
                                <li>Bra: 行動ポイントとして消費します。</li>
                                <li>行動: ドロー（Bra-1）、カード使用（基本Bra-1）、ロール攻撃、ターン終了。</li>
                                <li>カード: 対象指定やステータス選択が必要なものがあります。</li>
                                <li>ログ: 右側で直近の行動履歴を確認できます。</li>
                            </ul>
                            <h3 style={{ marginTop: 12 }}>用語</h3>
                            <ul>
                                <li>通常ダメージ: Defで軽減されるダメージ（例: ジャブ、ボディプレス、ロール攻撃など）。</li>
                                <li>固定ダメージ: Defで軽減されないダメージ（例: ダイナマイトなど）。</li>
                                <li>特殊ダメージ: 炎上/出血などのダメージ。基本的に防御カードで防げない（例外あり）。</li>
                                <li>次のうちどれか選ぶ: 効果の候補から1つを選んで発動する形式。</li>
                            </ul>
                            <h3 style={{ marginTop: 12 }}>状態異常 / バフ / デバフ一覧</h3>
                            <p style={{ marginTop: 6, fontSize: 12, color: '#64748b' }}>
                                画面上のチップの数字は「スタック」または「残りターン/ラウンド」を表します。
                            </p>
                            <ul>
                                <li><strong>炎上（🔥）</strong>: ターン終了時にダメージ（炎上-1）。※［火炎］は回復に変化</li>
                                <li><strong>出血（🩸）</strong>: 行動時に特殊1ダメージ / ターン終了時に特殊1ダメージ＋出血-1</li>
                                <li><strong>感電（⚡）</strong>: 5ごとにBra-1し、その度に感電を消費</li>
                                <li><strong>蓄電（🔋）</strong>: ロール/カード効果で消費されるトークン</li>
                                <li><strong>スタン（STN）</strong>: Speが0になる</li>
                                <li><strong>めまい（💫）</strong>: ターン終了時に-1。手札からカードを使うと50%で不発</li>
                                <li><strong>時限爆弾（💣）</strong>: ターン終了ごとに-1 / 0で固定10ダメージ</li>
                                <li><strong>麻酔（💉）</strong>: 次のターン Bra-◯</li>
                                <li><strong>弱体（DEB）</strong>: 次にダメージを受けるまで対象ステータスが変化</li>
                                <li><strong>手術準備中（🩺）</strong>: 次のターンは行動不可</li>
                                <li><strong>手術回復待ち（❤️‍🩹）</strong>: 次のターン開始時にHP+15</li>
                                <li><strong>アドレナリン（💉）</strong>: 一定ターン 追加Spe/Atk 上昇（終了後に反動）</li>
                                <li><strong>反動（🥶）</strong>: アドレナリンの反動で 追加Spe/Atk 低下</li>
                                <li><strong>はやてのつばさ（🪽）</strong>: 次のラウンドでSpeを無視して最優先で行動（トリックルーム中は最後）</li>
                                <li>
                                    <strong>このゆびとまれ（🧲）</strong>:
                                    次の自分ターン開始まで、他プレイヤーの対象選択が自分に固定（使用者本人は自由に選択可能）
                                </li>
                                <li><strong>抑制（LOCK）</strong>: 次のラウンド終了まで固有能力なし</li>
                                <li><strong>アイテム強化（ITEM+）</strong>: 次に使うアイテムの数値が上昇</li>
                                <li><strong>次攻撃強化（🗡️）</strong>: 次のロール攻撃のAtk+◯（攻撃後に消費）</li>
                                <li><strong>封印（×）</strong>: 封印された手札は使用できない（封印解除/減少で戻る）</li>
                                <li><strong>呪い（🪄）</strong>: 呪いの種類に応じて追加効果/デバフ（ツールチップに表示）</li>
                                <li><strong>血の紋様（🩸）</strong>: 手札の血の紋様の枚数に応じて追加効果（ツールチップに表示）</li>
                            </ul>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default MatchHelpModal;
