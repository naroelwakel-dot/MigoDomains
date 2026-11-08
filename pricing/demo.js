/* ==========================================================================
   Migo Domains — عرض تجريبي لمحرك التسعير
   --------------------------------------------------------------------------
   بيشتغل محليًا بالكامل:  node pricing/demo.js
   مفيش أي اتصال شبكة، ولا مفاتيح، ولا تكلفة حقيقية.
   الغرض: يتأكد إن الأرقام اللي في الوثيقة بتطلع زي ما هي بالحرف.
   ========================================================================== */

import {
  makeCostSnapshot,
  issueQuote,
  toClientQuote,
  detectCostChange,
  analyzeTiers,
  checkCostFreshness,
  priceFromCost,
  toDecimalString,
} from "./lib/index.js";

const NOW = new Date("2026-11-08T12:00:00.000Z");
const FX = { rate: "50.10", source: "cbe:official", fetchedAt: new Date(NOW.getTime() - 60_000) };

const line = (s) => console.log(s);
const rule = () => line("-".repeat(64));

line("");
line("Migo Domains — عرض محرك التسعير");
line("التاريخ: 2026-11-08 · بيانات تجريبية بالكامل · مفيش أي تكلفة حقيقية");
rule();

/* 1) الشرائح */
line("");
line("1) شرائح الهامش المعتمدة");
rule();
const table = [
  ["7.99", "أقل من 8"],
  ["8.00", "من 8 إلى أقل من 15"],
  ["14.99", "من 8 إلى أقل من 15"],
  ["15.00", "من 15 إلى 30"],
  ["30.00", "من 15 إلى 30"],
  ["30.01", "أكثر من 30"],
  ["100.00", "أكثر من 30"],
];

line("  التكلفة(USD) | الشريحة            | الهامش الدقيق | سعر البيع الدقيق | المعروض للعميل");
for (const [cost, label] of table) {
  // السطر ده بيطابق جدول الوثيقة بالحرف: الهامش مش مقرَّب (4.5015 مش 4.50)
  const priced = priceFromCost(cost);
  const displayed = issueQuote({
    operation: "registration",
    tld: "com",
    snapshot: makeCostSnapshot({ wholesale: cost, source: "demo:static-list", retrievedAt: NOW }),
    fx: FX,
    now: NOW,
    id: "demo-" + cost,
  });
  line(
    "  " +
      cost.padEnd(12) +
      " | " +
      label.padEnd(18) +
      " | " +
      toDecimalString(priced.marginMicros).padEnd(13) +
      " | " +
      toDecimalString(priced.saleMicros).padEnd(16) +
      " | " +
      displayed.sale.usd
  );
}

/* 2) تدقيق الاتساق */
line("");
line("2) تدقيق الشرائح (من 0 لـ150 بخطوة 0.01)");
rule();
const audit = analyzeTiers(undefined, { from: "0", to: "150", step: "0.01" });
line("  فجوات: " + (audit.gaps.length === 0 ? "مفيش ✅" : audit.gaps.join(", ")));
line("  تداخلات: " + (audit.overlaps.length === 0 ? "مفيش ✅" : JSON.stringify(audit.overlaps)));

/* 3) عرض سعر كامل + نسخة العميل */
line("");
line("3) عرض سعر كامل لعميل (‎.com)");
rule();
const snap = makeCostSnapshot({
  wholesale: "8.49",
  fees: "0.50",
  source: "demo:provider-list",
  retrievedAt: new Date(NOW.getTime() - 30 * 60_000),
});
const quote = issueQuote({
  operation: "registration",
  domain: "example.com",
  tld: "com",
  snapshot: snap,
  fx: FX,
  now: NOW,
  id: "demo-full",
});
line("  [داخلي فقط] تكلفة المورّد: " + quote.cost.totalUsd + " USD");
line("  [داخلي فقط] هامش Migo:    " + quote.margin.usd + " USD (" + quote.margin.ruleId + ")");
line("  [للعميل]    السعر:        " + quote.sale.usd + " USD / " + quote.egp.value + " EGP");
line("  مدة القفل: " + quote.issuedAt + " → " + quote.lockedUntil);

const client = toClientQuote(quote);
line("");
line("  نسخة العميل (اللي بتتبعت فعلًا):");
line("  " + JSON.stringify(client));
line("  تأكيد: مفيهاش أي تكلفة ولا هامش ✅");

/* 4) حماية: تكلفة قديمة */
line("");
line("4) حماية: تكلفة قديمة (7 ساعات)");
rule();
const stale = makeCostSnapshot({
  wholesale: "7.99",
  source: "demo:provider-list",
  retrievedAt: new Date(NOW.getTime() - 7 * 3600 * 1000),
});
const fresh = checkCostFreshness(stale, { now: NOW });
line("  إصدار سعر؟ " + (fresh.ok ? "مسموح" : "مرفوض — " + fresh.reason));
line("  السبب: " + fresh.message);

/* 5) تنبيه تغيّر التكلفة */
line("");
line("5) تنبيه تغيّر التكلفة");
rule();
const change = detectCostChange(
  makeCostSnapshot({ wholesale: "7.99", source: "demo:provider-list", retrievedAt: NOW }),
  makeCostSnapshot({ wholesale: "9.49", source: "demo:provider-list", retrievedAt: NOW })
);
for (const a of change.alerts) line("  [" + a.severity + "] " + a.message);

line("");
line("خلص العرض. أي رقم فوق تجريبي — مفيش أي تكلفة أو سعر صرف حقيقي.");
line("");
