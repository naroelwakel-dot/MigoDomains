import { test } from "node:test";
import assert from "node:assert/strict";
import { createTokenBucket } from "../lib/ratelimit.js";

function fakeClock(start = 0) {
  let t = start;
  return { now: () => t, advance: (ms) => (t += ms) };
}

test("يسمح بالاندفاعة كاملة ثم يرفض", () => {
  const bucket = createTokenBucket({ capacity: 3, refillPerSecond: 0 });
  assert.equal(bucket.tryTake(), true);
  assert.equal(bucket.tryTake(), true);
  assert.equal(bucket.tryTake(), true);
  assert.equal(bucket.tryTake(), false, "الرصيد خلص");
});

test("يتعبّى بمعدل ثابت مع الوقت", () => {
  const clock = fakeClock();
  const bucket = createTokenBucket({ capacity: 2, refillPerSecond: 1, now: clock.now });
  bucket.tryTake();
  bucket.tryTake();
  assert.equal(bucket.tryTake(), false);
  clock.advance(1000);
  assert.equal(bucket.tryTake(), true, "توكن واحد بعد ثانية");
  assert.equal(bucket.tryTake(), false);
});

test("لا يتجاوز السعة القصوى عند التعبئة", () => {
  const clock = fakeClock();
  const bucket = createTokenBucket({ capacity: 2, refillPerSecond: 10, now: clock.now });
  clock.advance(60_000);
  assert.equal(bucket.available, 2, "مش هيتعدّى السعة");
});

test("reset يرجّع الرصيد كامل", () => {
  const bucket = createTokenBucket({ capacity: 1, refillPerSecond: 0 });
  bucket.tryTake();
  assert.equal(bucket.tryTake(), false);
  bucket.reset();
  assert.equal(bucket.tryTake(), true);
});

test("يرفض إعدادات غير صالحة", () => {
  assert.throws(() => createTokenBucket({ capacity: 0, refillPerSecond: 1 }), /capacity/);
  assert.throws(() => createTokenBucket({ capacity: 1, refillPerSecond: -1 }), /refillPerSecond/);
});
