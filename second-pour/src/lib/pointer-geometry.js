export const boxCenter = (box) => ({
  x: box.x + box.w / 2,
  y: box.y + box.h / 2,
});
export const insideBox = (point, box) =>
  !!box &&
  point.x >= box.x &&
  point.x <= box.x + box.w &&
  point.y >= box.y &&
  point.y <= box.y + box.h;
const distanceToBox = (point, box) =>
  Math.hypot(
    Math.max(box.x - point.x, 0, point.x - box.x - box.w),
    Math.max(box.y - point.y, 0, point.y - box.y - box.h),
  );

// Mouse pickups preserve their offset; touch previews sit above the finger.
// Rendering and hit testing both use this visible center.
export function dragAnchor(pointer, source, start, pointerType = "mouse") {
  if (pointerType === "touch") return { x: pointer.x, y: pointer.y - 36 };
  const center = boxCenter(source);
  return {
    x: pointer.x + center.x - start.x,
    y: pointer.y + center.y - start.y,
  };
}

// Small, explicit targets (tabs, Serve) win over surrounding panels. Where
// both centers hit different panels, the finger chooses. An incompatible hit is retained
// so dropping onto the wrong station explains the problem instead of moving
// an item to a nearby destination the player did not choose.
export function resolveDrop(zones, item, anchor, pointer = anchor) {
  const order = (a, b) =>
    (b.priority || 0) - (a.priority || 0) || a.w * a.h - b.w * b.h;
  // Returning the finger to the rack cancels. A deliberate finger hit on an
  // action button wins when only the lifted preview overlaps the rack.
  if (
    zones.some((zone) => zone.exclude?.some((box) => insideBox(pointer, box)))
  )
    return undefined;
  const explicit = zones
    .filter((zone) => (zone.priority || 0) >= 2 && insideBox(pointer, zone))
    .sort(order)[0];
  if (explicit) return explicit;
  if (zones.some((zone) => zone.exclude?.some((box) => insideBox(anchor, box))))
    return undefined;
  const direct = zones
    .flatMap((zone) => [
      ...(insideBox(pointer, zone) ? [{ zone, atPointer: true }] : []),
      ...(insideBox(anchor, zone) ? [{ zone, atPointer: false }] : []),
    ])
    .sort(
      (a, b) =>
        (b.zone.priority || 0) - (a.zone.priority || 0) ||
        Number(b.atPointer) - Number(a.atPointer) ||
        order(a.zone, b.zone),
    );
  if (direct.length) return direct[0].zone;
  const tolerance = item.pointerType === "touch" ? 20 : 10;
  return zones
    .filter((zone) => zone.accepts?.includes(item.kind))
    .map((zone) => ({
      zone,
      distance: Math.min(
        distanceToBox(anchor, zone),
        distanceToBox(pointer, zone),
      ),
    }))
    .filter((candidate) => candidate.distance <= tolerance)
    .sort((a, b) => a.distance - b.distance || order(a.zone, b.zone))[0]?.zone;
}

export function returnedToSource(item, anchor, pointer, sources, zones = []) {
  const matching = sources.filter(
    (source) =>
      source.id === item.id ||
      (item.kind === "pastry" && source.kind === "pastry"),
  );
  if (matching.some((source) => insideBox(pointer, source))) return true;
  if (
    zones.some(
      (zone) =>
        (zone.priority || 0) >= 2 &&
        zone.accepts?.includes(item.kind) &&
        insideBox(pointer, zone),
    )
  )
    return false;
  return matching.some((source) => insideBox(anchor, source));
}

export function movedEnough(start, point, pointerType = "mouse") {
  return (
    Math.hypot(point.x - start.x, point.y - start.y) >=
    (pointerType === "touch" ? 14 : 5)
  );
}
