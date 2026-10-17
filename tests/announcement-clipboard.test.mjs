import assert from "node:assert/strict";
import test from "node:test";

import { buildAnnouncementClipboardHtml } from "../lib/announcements/clipboard.js";

test("announcement clipboard HTML requests Book Antiqua and preserves lines", () => {
  const html = buildAnnouncementClipboardHtml("Day #4\nLet's explore limits.");

  assert.match(html, /font-family: 'Book Antiqua'/);
  assert.match(html, /Day #4<\/b><br>Let&#39;s explore limits\./);
});

test("announcement clipboard HTML escapes announcement content", () => {
  const html = buildAnnouncementClipboardHtml('<script>alert("no")</script>');

  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;alert\(&quot;no&quot;\)&lt;\/script&gt;/);
});

test("announcement clipboard HTML bolds only the first line", () => {
  const html = buildAnnouncementClipboardHtml("Day #28 | Tuesday, 10/13/2026 | B Day\r\n2.04: Derivative Patterns\r\nF-BF.B.5(+)");

  assert.match(html, /<b style="font-weight: bold;">Day #28 \| Tuesday, 10\/13\/2026 \| B Day<\/b><br>2\.04: Derivative Patterns<br>F-BF\.B\.5\(\+\)/);
  assert.equal(html.match(/<b /g).length, 1);
});
