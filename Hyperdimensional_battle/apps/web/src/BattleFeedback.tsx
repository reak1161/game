import { useCallback, useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import type { Attribute, ReplayEvent, ReplayScore } from "@hyperdimensional-battle/shared";
import { advanceBattlePlayback, idleBattlePlayback, type BattlePlaybackState, type MultiHitProgress } from "./battle-presentation";

const colors: Record<Attribute, string> = {
  none: "#fbbf24", fire: "#fb733c", water: "#38bdf8", ice: "#67e8f9",
  wind: "#4ade80", thunder: "#facc15", earth: "#d6a46b", dark: "#c084fc"
};
const milestones = [5, 10, 20, 35, 50];
const numberFormat = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 1 });
const formatScore = (value: number) => value >= 1e12 ? value.toExponential(2) : value >= 1e9 ? `${(value / 1e9).toFixed(2)}B`
  : value >= 1e6 ? `${(value / 1e6).toFixed(2)}M` : numberFormat.format(value);
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Retarget from the visible number so rapid hits never restart from an old score. */
export function AnimatedScore({ value, format }: { value: number; format: (value: number) => string }) {
  const [display, setDisplay] = useState(value);
  const current = useRef(value);
  useEffect(() => {
    if (value <= current.current || reducedMotion()) {
      current.current = value;
      setDisplay(value);
      return;
    }
    const from = current.current;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / 280);
      current.current = progress === 1 ? value : from + (value - from) * (1 - (1 - progress) ** 3);
      setDisplay(current.current);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <strong className="animated-score" aria-label={format(value)}>{format(Number.isInteger(value) ? Math.floor(display) : display)}</strong>;
}

type Hit = { id: number; amount: number; final: boolean; charging: boolean; power: number; multi?: MultiHitProgress };
type Combo = { id: number; count: number; attribute: Attribute };
type Flight = { id: number; x: number; y: number; dx: number; dy: number; color: string; final: boolean; duration: number };
type Options = {
  identity: string;
  volume: number;
  audio: RefObject<AudioContext | null>;
  fieldCards: RefObject<Map<string, HTMLDivElement>>;
  definitionId: (instanceId: string) => string | undefined;
  scoreAnchor: () => HTMLElement | undefined;
  frame: RefObject<HTMLDivElement | null>;
};

export function useBattleFeedback(options: Options) {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const [combo, setCombo] = useState<Combo | null>(null);
  const [hit, setHit] = useState<Hit | null>(null);
  const [flights, setFlights] = useState<Flight[]>([]);
  const [score, setScore] = useState<ReplayScore>({ scoreThisRound: 0, totalScore: 0 });
  const [scoreEpoch, setScoreEpoch] = useState(0);
  const [playback, setPlayback] = useState<BattlePlaybackState>(idleBattlePlayback);
  const playbackRef = useRef(playback);
  const scoreRef = useRef(score);
  const countRef = useRef(0);
  const sourceRef = useRef<string | null>(null);
  const attributeRef = useRef<Attribute>("none");
  const timers = useRef(new Set<number>());
  const animations = useRef(new Map<HTMLElement, Animation>());
  const serial = useRef(0);
  const lastSound = useRef(0);

  const later = useCallback((callback: () => void, delay: number) => {
    const timer = window.setTimeout(() => { timers.current.delete(timer); callback(); }, delay);
    timers.current.add(timer);
  }, []);
  const clear = useCallback(() => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current.clear();
    animations.current.forEach((animation) => animation.cancel());
    animations.current.clear();
  }, []);
  const syncScore = useCallback((next: ReplayScore) => {
    scoreRef.current = next;
    setScore((current) => current.scoreThisRound === next.scoreThisRound && current.totalScore === next.totalScore ? current : next);
  }, []);
  const updatePlayback = useCallback((next: BattlePlaybackState) => {
    playbackRef.current = next;
    setPlayback(next);
  }, []);
  const finish = useCallback(() => updatePlayback(idleBattlePlayback), [updatePlayback]);
  const reset = useCallback((count = 0, nextScore?: ReplayScore) => {
    clear();
    countRef.current = count;
    sourceRef.current = null;
    attributeRef.current = "none";
    setCombo(null);
    setHit(null);
    setFlights([]);
    finish();
    if (nextScore) {
      syncScore(nextScore);
      setScoreEpoch((value) => value + 1);
    }
  }, [clear, syncScore, finish]);
  useEffect(() => { reset(0, { scoreThisRound: 0, totalScore: 0 }); return clear; }, [options.identity, reset, clear]);

  const animate = useCallback((element: HTMLElement | null | undefined, frames: Keyframe[], duration: number) => {
    if (!element || reducedMotion()) return;
    animations.current.get(element)?.cancel();
    const animation = element.animate(frames, { duration, easing: "cubic-bezier(.16,1,.3,1)" });
    animations.current.set(element, animation);
    animation.onfinish = () => {
      if (animations.current.get(element) === animation) animations.current.delete(element);
    };
  }, []);

  const sound = useCallback((final: boolean, power: number, multi?: MultiHitProgress) => {
    const { audio, volume } = optionsRef.current;
    const context = audio.current;
    if (!context || context.state !== "running" || volume <= 0) return;
    const now = context.currentTime;
    if (!final && now - lastSound.current < 0.07) return;
    lastSound.current = now;
    // A short low impact under a bright fifth; the finale opens into a major chord.
    const pitch = multi ? 523.25 * 2 ** (Math.min(12, (multi.current - 1) * 2) / 12) : 523.25;
    const notes = final ? [130.81, 261.63, 329.63, 392, 523.25] : [110 + power * 15, pitch];
    if (multi && multi.current === multi.count) notes.push(pitch * 1.5);
    notes.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const at = now + (final ? index * 0.035 : index * 0.014);
      const duration = final ? 0.48 : 0.11;
      oscillator.type = index === 0 ? "triangle" : "sine";
      oscillator.frequency.setValueAtTime(frequency, at);
      if (index === 0) oscillator.frequency.exponentialRampToValueAtTime(frequency / 2, at + duration);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume / (final ? 2300 : 3400)), at + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      oscillator.start(at);
      oscillator.stop(at + duration + 0.02);
    });
  }, []);

  const present = useCallback((event: ReplayEvent, callbacks?: { launch: () => void; impact: (multiHit: boolean) => void }) => {
    if (event.type === "ROUND_START") {
      reset(0, { ...scoreRef.current, scoreThisRound: 0 });
      return 0;
    }
    const definitionId = event.type === "MULTI_HIT_STARTED" ? optionsRef.current.definitionId(event.instanceId) : undefined;
    const nextPlayback = advanceBattlePlayback(playbackRef.current, event, definitionId);
    if (event.type !== "DAMAGE_DEALT" && nextPlayback !== playbackRef.current) updatePlayback(nextPlayback);
    if (event.type === "STATUS_CHANGED" && event.score) syncScore(event.score);
    if (event.type === "CARD_ACTIVATED") {
      sourceRef.current = event.instanceId;
      attributeRef.current = event.attribute;
      const count = ++countRef.current;
      const id = ++serial.current;
      setCombo({ id, count, attribute: event.attribute });
      later(() => setCombo((current) => current?.id === id ? null : current), 900);
      const card = optionsRef.current.fieldCards.current.get(event.instanceId);
      animate(card, [
        { transform: "translateY(0) scale(1)" },
        { transform: "translateY(3px) scale(.96)", offset: 0.12 },
        { transform: "translateY(-9px) scale(1.035)", offset: 0.4, filter: "brightness(1.2)" },
        { transform: "translateY(0) scale(1)", filter: "brightness(1)" }
      ], Math.max(140, 350 - count * 4));
      return Math.max(140, 350 - count * 4);
    }
    if (event.type === "MULTI_HIT_STARTED") {
      sourceRef.current = event.instanceId;
      attributeRef.current = event.attribute;
      setHit(null);
      return 140;
    }
    if (event.type !== "DAMAGE_DEALT" && event.type !== "FINAL_ATTACK") return 0;
    const multi = event.type === "DAMAGE_DEALT" && nextPlayback.multiHit !== playbackRef.current.multiHit
      ? nextPlayback.multiHit ?? undefined : undefined;
    if (event.amount <= 0 && !multi) {
      if (event.score) syncScore(event.score);
      return 0;
    }
    const final = event.type === "FINAL_ATTACK";
    const power = Math.min(4, Math.max(1, Math.log10(Math.max(10, event.amount)) / 1.5));
    const id = ++serial.current;
    const quiet = reducedMotion();
    const charge = final && !quiet ? 160 : 0;
    const travel = quiet ? 0 : multi ? 80 : Math.max(70, 180 - countRef.current * 2);
    if (final) setHit({ id, amount: event.amount, final, charging: true, power });
    const impact = () => {
      if (event.score) syncScore(event.score);
      if (event.type === "DAMAGE_DEALT") updatePlayback(nextPlayback);
      setHit({ id, amount: event.amount, final, charging: false, power, multi });
      callbacks?.impact(Boolean(multi));
      sound(final, power, multi);
      const { scoreAnchor, frame } = optionsRef.current;
      const target = scoreAnchor();
      animate(target, [
        { transform: "scale(1)" },
        { transform: `scale(${final ? 1.065 : 1.035})`, background: final ? "#fde68a" : "#dbeafe", offset: 0.25 },
        { transform: "scale(1)" }
      ], final ? 460 : 240);
      if (final) animate(frame.current, [
        { transform: "translate(0, 0)" }, { transform: "translate(-3px, 2px)", offset: 0.2 },
        { transform: "translate(3px, -1px)", offset: 0.4 }, { transform: "translate(-1px, 0)", offset: 0.65 },
        { transform: "translate(0, 0)" }
      ], 280);
      later(() => setHit((current) => current?.id === id ? null : current), final ? 1800 : 950);
    };
    const launch = () => {
      callbacks?.launch();
      const { fieldCards, scoreAnchor } = optionsRef.current;
      const target = scoreAnchor();
      const source = sourceRef.current ? fieldCards.current.get(sourceRef.current) : null;
      const damageSource = event.type === "DAMAGE_DEALT" && event.sourceInstanceId
        ? fieldCards.current.get(event.sourceInstanceId) : source;
      if (multi) animate(damageSource, [
        { transform: "translateX(-2px) scale(.985)", filter: "brightness(1.1)" },
        { transform: "translateX(2px) scale(1.025)", filter: "brightness(1.3)", offset: 0.35 },
        { transform: "none", filter: "brightness(1)" }
      ], 150);
      const from = damageSource?.getBoundingClientRect();
      const to = target?.getBoundingClientRect();
      if (from && to && !reducedMotion()) {
        const x = from.left + from.width / 2;
        const y = from.top + from.height / 2;
        const flight: Flight = {
          id, x, y, dx: to.left + to.width / 2 - x, dy: to.top + to.height / 2 - y,
          color: final ? "#fbbf24" : colors[event.type === "DAMAGE_DEALT" ? event.attribute ?? attributeRef.current : attributeRef.current], final, duration: travel
        };
        setFlights((current) => [...current.slice(-11), flight]);
        later(() => setFlights((current) => current.filter((entry) => entry.id !== id)), 620);
      }
      if (travel) later(impact, travel);
      else impact();
    };
    if (charge) later(launch, charge);
    else launch();
    return charge + travel + (multi ? multi.current === multi.count ? 240 : 100 : 32);
  }, [animate, later, reset, sound, syncScore, updatePlayback]);

  const cardFeedback = (instanceId: string) => {
    const multi = playback.multiHit;
    return multi?.instanceId === instanceId ? (
      <div className="card-multi-hit" aria-label={`${multi.current} / ${multi.count}回攻撃`}>
        <div key={multi.current} className="card-hit-beat">
          {multi.current > 0 && <strong>+{formatScore(multi.lastAmount)}</strong>}
          <span><b>{multi.current}</b> / {multi.count} HIT</span>
        </div>
      </div>
    ) : null;
  };

  const overlay = (
    <div className="battle-combo-overlay" aria-live="off">
      {combo && <div key={combo.id} className={`battle-combo${milestones.includes(combo.count) ? " is-milestone" : ""}`}
        aria-label={`${combo.count}回発動`} style={{ "--combo-color": colors[combo.attribute] } as CSSProperties}>
        <strong>{combo.count}</strong><span>COMBO</span>
      </div>}
      {hit && <div key={`${hit.id}-${hit.charging}`} data-heavy={hit.power >= 2.5}
        className={`battle-impact${hit.final ? " is-finale" : ""}${hit.charging ? " is-charging" : ""}${hit.multi ? " is-multi-hit" : ""}`}>
          {hit.final && <span>最終攻撃</span>}
          {hit.multi && <span className="hit-count">{hit.multi.current} / {hit.multi.count} HIT</span>}
          {!hit.charging && <strong>{`+${formatScore(hit.amount)}`}</strong>}
          {hit.multi && <small>計 {formatScore(hit.multi.total)}</small>}
      </div>}
    </div>
  );
  const effects = <div className="battle-feedback-layer" aria-hidden="true">
    {flights.map((flight) => <div key={flight.id} className={`score-flight${flight.final ? " is-final" : ""}`}
      style={{ left: flight.x, top: flight.y, "--flight-x": `${flight.dx}px`, "--flight-y": `${flight.dy}px`, "--flight-color": flight.color, "--flight-duration": `${flight.duration}ms` } as CSSProperties}>
      <i /><i /><i />
    </div>)}
  </div>;
  return { present, reset, finish, syncScore, score, scoreEpoch, activeInstanceId: playback.activeInstanceId, cardFeedback, overlay, effects };
}
