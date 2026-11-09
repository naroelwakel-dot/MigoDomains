import { test } from "node:test";
import assert from "node:assert/strict";
import { createTtlCache } from "../lib/cache.js";

function fakeClock(start = 0) {
  let t = start;
  return { now: () => t, advance: (ms) => (t += ms) };
}

test("get يرجّع القيمة داخل المدة ويرجّع undefined بعدها", () => {
  const clock = fakeClock();
  const cache = createTtlCache({ now: clock.now });
  cache.set("k", "v", 1000);
  assert.equal(cache.get("k"), "v");
  clock.advance(999);
  assert.equal(cache.get("k"), "v");
  clock.advance(2);
  assert.equal(cache.get("k"), undefined, "بعد انتهاء المدة تختفي");
});

test("ttl <= 0 لا يخزّن شيئًا", () => {
  const cache = createTtlCache();
  cache.set("k", "v", 0);
  assert.equal(cache.has("k"), false);
});

test("maxEntries يطرد الأقدم", () => {
  const cache = createTtlCache({ maxEntries: 2 });
  cache.set("a", 1, 1000);
  cache.set("b", 2, 1000);
  cache.set("c", 3, 1000);
  assert.equal(cache.size, 2);
  assert.equal(cache.has("a"), false, "a اتطُرد");
  assert.equal(cache.get("c"), 3);
});

test("peek يبلّغ عن الانتهاء بدون حذف", () => {
  const clock = fakeClock();
  const cache = createTtlCache({ now: clock.now });
  cache.set("k", "v", 10);
  clock.advance(11);
  const p = cache.peek("k");
  assert.equal(p.expired, true);
  assert.equal(cache.size, 1);
});
