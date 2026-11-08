import test from "node:test";
import assert from "node:assert/strict";

import {
  toMicros,
  toDecimalString,
  toFixedString,
  percentOf,
  roundTo,
  divRoundHalfUp,
  DecimalError,
  MICRO,
} from "../lib/decimal.js";

test("قراءة القيم وكتابتها ذهابًا وإيابًا", () => {
  const cases = ["0", "2.5", "7.99", "30.01", "4.5015", "115", "1000000"];
  for (const c of cases) {
    assert.equal(toDecimalString(toMicros(c)), c, "قيمة: " + c);
  }
});

test("نص العرض بيحافظ على الخانات (فلوس، مش أرقام)", () => {
  assert.equal(toFixedString(toMicros("2.50"), 2), "2.50");
  assert.equal(toFixedString(toMicros("11"), 2), "11.00");
  assert.equal(toFixedString(toMicros("0"), 2), "0.00");
  assert.equal(toFixedString(toMicros("34.5115"), 2), "34.51");
  assert.equal(toFixedString(toMicros("34.5115"), 4), "34.5115");
  assert.equal(toFixedString(toMicros("115"), 0), "115");
  assert.equal(toFixedString(toMicros("-2.5"), 2), "-2.50");
  assert.equal(toFixedString(toMicros("0.005"), 2), "0.01");
});

test("الأرقام العشرية مش بتعمل أخطاء الفاصلة العائمة", () => {
  // 0.1 + 0.2 لازم تكون 0.3 بالظبط
  assert.equal(toDecimalString(toMicros("0.1") + toMicros("0.2")), "0.3");
  assert.equal(toDecimalString(toMicros("30.01")), "30.01");
  assert.equal(toDecimalString(toMicros(30.01)), "30.01");
});

test("النص المكافئ للرقم بيطلع نفس القيمة", () => {
  assert.equal(toMicros(7.99), toMicros("7.99"));
  assert.equal(toMicros(30.01), toMicros("30.01"));
});

test("الأصفار الزايدة والعلامات بتتظبط", () => {
  assert.equal(toDecimalString(toMicros("007.500")), "7.5");
  assert.equal(toDecimalString(toMicros("+2.5")), "2.5");
  assert.equal(toDecimalString(toMicros("-3.25")), "-3.25");
});

test("نسبة مئوية من مبلغ", () => {
  assert.equal(toDecimalString(percentOf(toMicros("30.01"), "15")), "4.5015");
  assert.equal(toDecimalString(percentOf(toMicros("100"), "15")), "15");
  assert.equal(toDecimalString(percentOf(toMicros("10"), "100")), "10");
});

test("القسمة بنص-لأعلى", () => {
  assert.equal(divRoundHalfUp(1n, 2n), 1n);
  assert.equal(divRoundHalfUp(1n, 3n), 0n);
  assert.equal(divRoundHalfUp(2n, 3n), 1n);
  assert.equal(divRoundHalfUp(5n, 2n), 3n);
  assert.equal(divRoundHalfUp(-1n, 2n), -1n);
});

test("التقريب لأوضاعه المختلفة", () => {
  const v = toMicros("34.5115");
  assert.equal(toDecimalString(roundTo(v, 2, "half-up")), "34.51");
  assert.equal(toDecimalString(roundTo(v, 3, "half-up")), "34.512");
  assert.equal(toDecimalString(roundTo(v, 2, "floor")), "34.51");
  assert.equal(toDecimalString(roundTo(v, 2, "ceil")), "34.52");
  assert.equal(toDecimalString(roundTo(toMicros("1.005"), 2, "half-up")), "1.01");
  assert.equal(toDecimalString(roundTo(toMicros("1.005"), 2, "half-even")), "1");
});

test("التقريب بيرفض مُدخلات غلط", () => {
  assert.throws(() => roundTo(MICRO, 7), DecimalError);
  assert.throws(() => roundTo(MICRO, -1), DecimalError);
  assert.throws(() => roundTo(MICRO, 2, "wat"), DecimalError);
});

test("الصيغ غير الصحيحة بتترفض بوضوح", () => {
  assert.throws(() => toMicros(""), DecimalError);
  assert.throws(() => toMicros("abc"), DecimalError);
  assert.throws(() => toMicros("1.2.3"), DecimalError);
  assert.throws(() => toMicros(NaN), DecimalError);
  assert.throws(() => toMicros(Infinity), DecimalError);
  assert.throws(() => toMicros({}), DecimalError);
});
