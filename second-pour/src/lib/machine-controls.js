const clamp = (value) => Math.max(0, Math.min(1, value));

// A dial can be turned clockwise or dragged upward; a lever is pulled down.
// Measuring from the pickup point lets small pointer slips stay harmless.
export function machineDragProgress(control, start, point) {
  if (!control || !start || !point) return 0;
  if (control.kind !== "dial") return clamp((point.y - start.y) / 48);
  const cx = control.x + control.w / 2,
    cy = control.y + control.h / 2;
  let turn = 0;
  if (
    Math.hypot(start.x - cx, start.y - cy) >= 6 &&
    Math.hypot(point.x - cx, point.y - cy) >= 6
  ) {
    const angle =
      Math.atan2(point.y - cy, point.x - cx) -
      Math.atan2(start.y - cy, start.x - cx);
    turn = Math.atan2(Math.sin(angle), Math.cos(angle)) / (Math.PI / 2);
  }
  return clamp(Math.max((start.y - point.y) / 48, turn));
}

export function machineDragCommitted(progress) {
  return Number.isFinite(progress) && progress >= 0.55;
}
