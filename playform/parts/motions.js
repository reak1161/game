/* PLAYFORM: standalone, finite animations. No dependency on the component library. */
(function () {
  'use strict';
  const presets = Object.freeze({
    place: { duration: 130, frames: [{ transform: 'translateY(-6px)' }, { transform: 'translateY(0)' }] },
    deal: { duration: 210, frames: [{ opacity: 0, transform: 'translateY(18px) rotate(3deg)' }, { opacity: 1, transform: 'translateY(0) rotate(0)' }] },
    handoff: { duration: 160, frames: [{ opacity: .45, transform: 'translateX(-9px)' }, { opacity: 1, transform: 'translateX(0)' }] },
    hit: { duration: 170, frames: [{ transform: 'translateX(0)' }, { transform: 'translateX(-4px)', offset: .25 }, { transform: 'translateX(3px)', offset: .55 }, { transform: 'translateX(0)' }] },
    resolve: { duration: 300, frames: [{ transform: 'translateY(0)' }, { transform: 'translateY(-6px)', offset: .35 }, { transform: 'translateY(-6px)', offset: .65 }, { transform: 'translateY(0)' }] },
  });
  const active = new WeakMap();
  function play(element, name, { reducedMotion = false, signal } = {}) {
    const preset = presets[name];
    if (!preset) throw new TypeError('Unknown motion: ' + name);
    if (!element || typeof element.animate !== 'function') throw new TypeError('An animatable element is required.');
    active.get(element)?.cancel();
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    if (signal?.aborted) return { finished: Promise.resolve(false), cancel() {} };
    if (reducedMotion || preference.matches) return { finished: Promise.resolve(true), cancel() {} };
    const animation = element.animate(preset.frames, { duration: preset.duration, easing: 'cubic-bezier(.2,.7,.3,1)' });
    let cancelled = false;
    const cancel = () => { cancelled = true; animation.cancel(); };
    const onPreference = () => { if (preference.matches) animation.finish(); };
    signal?.addEventListener('abort', cancel, { once: true });
    preference.addEventListener('change', onPreference);
    const finished = animation.finished.then(() => !cancelled, () => false).finally(() => {
      signal?.removeEventListener('abort', cancel);
      preference.removeEventListener('change', onPreference);
      if (active.get(element)?.finished === finished) active.delete(element);
    });
    const handle = { finished, cancel };
    active.set(element, handle);
    return handle;
  }
  globalThis.GamePartsMotion = Object.freeze({ names: Object.freeze(Object.keys(presets)), play });
})();
