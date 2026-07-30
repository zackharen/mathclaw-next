import test from "node:test";
import assert from "node:assert/strict";

import { containedRect } from "../lib/projector/snapshot-layout.js";

const FRAME = { width: 1280, height: 720 };

test("a wider-than-frame source is letterboxed and centred", () => {
  const rect = containedRect(1000, 250, FRAME.width, FRAME.height);
  assert.equal(rect.width, 1280);
  assert.equal(rect.height, 320);
  assert.equal(rect.x, 0);
  assert.equal(rect.y, 200);
});

test("a taller-than-frame source is pillarboxed and centred", () => {
  const rect = containedRect(360, 720, FRAME.width, FRAME.height);
  assert.equal(rect.width, 360);
  assert.equal(rect.height, 720);
  assert.equal(rect.x, 460);
  assert.equal(rect.y, 0);
});

test("aspect ratio survives the fit", () => {
  const rect = containedRect(604, 340, FRAME.width, FRAME.height);
  assert.ok(Math.abs(rect.width / rect.height - 604 / 340) < 1e-9);
});

test("the source is never enlarged past the frame", () => {
  const rect = containedRect(4000, 3000, FRAME.width, FRAME.height);
  assert.ok(rect.width <= FRAME.width);
  assert.ok(rect.height <= FRAME.height);
});

// The regression this module exists for: media used to paint across the whole
// snapshot, burying the screen's top text.
test("a reserved top region pushes media below it and never above", () => {
  const reserved = 108;
  const rect = containedRect(604, 340, FRAME.width, FRAME.height - reserved, reserved);
  assert.ok(rect.y >= reserved, `media started at ${rect.y}, inside the reserved ${reserved}px`);
  assert.ok(rect.y + rect.height <= FRAME.height);
});

test("reserving space shrinks the media rather than cropping it", () => {
  const full = containedRect(604, 340, FRAME.width, FRAME.height);
  const reserved = containedRect(604, 340, FRAME.width, FRAME.height - 200, 200);
  assert.ok(reserved.height <= full.height);
  assert.ok(Math.abs(reserved.width / reserved.height - 604 / 340) < 1e-9);
});

test("no reserved region leaves placement unchanged", () => {
  assert.deepEqual(
    containedRect(604, 340, FRAME.width, FRAME.height, 0),
    containedRect(604, 340, FRAME.width, FRAME.height)
  );
});

test("a source with no intrinsic size yields no rect", () => {
  // How an undecoded image or a video without metadata reports itself.
  assert.equal(containedRect(0, 0, FRAME.width, FRAME.height), null);
  assert.equal(containedRect(604, 0, FRAME.width, FRAME.height), null);
  assert.equal(containedRect(undefined, undefined, FRAME.width, FRAME.height), null);
});

test("a degenerate frame yields no rect", () => {
  // Hidden receivers can report a 0x0 layout box.
  assert.equal(containedRect(604, 340, 0, 0), null);
});
