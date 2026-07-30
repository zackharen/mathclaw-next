// Geometry for the flattened drawing snapshots a receiver sends to the teacher.
// Kept free of canvas and DOM so the placement rules can be tested directly —
// the snapshot itself can only be inspected by rasterizing a live screen.

// Largest centered rect that preserves aspect ratio, matching `object-fit:
// contain`. `offsetY` shifts the box down into a reserved region: on screen the
// top text stacks above the media, so a snapshot that painted media across the
// full frame would bury the title. Returns null when the source has no
// intrinsic size, which is how a not-yet-decoded image or video reports itself.
export function containedRect(sourceWidth, sourceHeight, width, height, offsetY = 0) {
  if (!sourceWidth || !sourceHeight || !(width > 0) || !(height > 0)) return null;
  const scale = Math.min(width / sourceWidth, height / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  return {
    x: (width - drawWidth) / 2,
    y: offsetY + (height - drawHeight) / 2,
    width: drawWidth,
    height: drawHeight,
  };
}
