(function (root) {
  'use strict';
  function movement(yaw, forward, strafe) {
    const x = Math.cos(yaw) * forward - Math.sin(yaw) * strafe;
    const y = Math.sin(yaw) * forward + Math.cos(yaw) * strafe;
    const length = Math.max(1, Math.hypot(x, y));
    return { x: x / length, y: y / length };
  }
  function inAttackArc(origin, target, yaw, halfAngle = Math.PI * .29) {
    const dx = target.x - origin.x, dy = target.y - origin.y;
    const length = Math.hypot(dx, dy);
    return length < .001 || (dx * Math.cos(yaw) + dy * Math.sin(yaw)) / length >= Math.cos(halfAngle);
  }
  const api = { movement, inAttackArc };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.VillanisControls = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
