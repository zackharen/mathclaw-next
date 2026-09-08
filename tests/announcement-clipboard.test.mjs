import assert from "node:assert/strict";
import test from "node:test";

import { buildAnnouncementClipboardHtml } from "../lib/announcements/clipboard.js";

test("announcement clipboard HTML requests Book Antiqua and preserves lines", () => {
  const html = buildAnnouncementClipboardHtml("Day #4\nLet's explore limits.");

  assert.match(html, /font-family: 'Book Antiqua'/);
  assert.match(html, /Day #4<br>Let&#39;s explore limits\./);
});

test("announcement clipboard HTML escapes announcement content", () => {
  const html = buildAnnouncementClipboardHtml('<script>alert("no")</script>');

  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;alert\(&quot;no&quot;\)&lt;\/script&gt;/);
});
