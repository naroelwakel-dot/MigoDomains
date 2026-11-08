/* ==========================================================================
   Migo Domains — سكربت عرض المزوّد الوهمي
   --------------------------------------------------------------------------
   التشغيل:  node providers/demo.js
   كله محلي: مفيش شبكة، مفيش مفاتيح، مفيش تسجيل حقيقي.
   ========================================================================== */

import {
  createMockProvider,
  assertProvider,
  buildQuoteFromProvider,
  isMockSnapshot,
} from "./lib/index.js";

const line = (t) => console.log("\n=== " + t + " ===");
const ok = (t) => console.log("  ✓ " + t);
const no = (t) => console.log("  ✗ " + t);
const info = (k, v) => console.log("    " + k + ": " + v);

function attempt(label, fn) {
  try {
    const r = fn();
    ok(label);
    return r;
  } catch (err) {
    no(label + " → [" + err.code + "] " + err.message);
    return { error: err };
  }
}

const provider = createMockProvider({ seed: "migo-demo-2026" });

/* -------------------------------------------------------------------------- */
line("1) العقد الموحّد");
const contract = assertProvider(provider, { name: "mock" });
ok("كل الدوال الإلزامية موجودة (11)");
info("دوال موصى بها ناقصة", contract.missingRecommended.length === 0 ? "لا يوجد" : contract.missingRecommended.join(", "));
info("البيئة", provider.meta.environment + " / إنتاج: " + provider.meta.production);
const caps = provider.capabilities();
info("قدرات مفعّلة", Object.keys(caps).filter((k) => caps[k] === true).join(", "));

/* -------------------------------------------------------------------------- */
line("2) التحقق من التوفر — كل الحالات");
for (const d of ["my-shop.com", "example.org", "premium.io", "shop.xyz", "cloudflare.com", "mystery.zz"]) {
  const r = provider.checkAvailability(d);
  const tag = r.definitive ? "قاطعة" : "غير قاطعة";
  info(d.padEnd(16), r.state + "  (" + tag + ")");
}
const unknownSource = createMockProvider({ unknownTlds: ["io"] });
info("مصدر مش مستجيب (io)", unknownSource.checkAvailability("my-site.io").state);

/* -------------------------------------------------------------------------- */
line("3) التسجيل من الأول للآخر");
const reg = attempt("تسجيل migo-test.com باسم العميل", () =>
  provider.registerDomain({
    name: "migo-test.com",
    years: 1,
    registrant: { name: "أحمد العميل", email: "ahmed@example.test", country: "EG" },
    idempotencyKey: "reg-1",
  })
);
if (!reg.error) {
  info("الحالة", reg.status);
  info("ينتهي", reg.expiresAt.slice(0, 10));
  info("ملكية العميل", reg.registrantOwned);
}
const replay = attempt("نفس مفتاح Idempotency → نفس النتيجة بدون تسجيل تاني", () =>
  provider.registerDomain({
    name: "migo-test.com",
    years: 1,
    registrant: { name: "أحمد العميل", email: "ahmed@example.test" },
    idempotencyKey: "reg-1",
  })
);
if (!replay.error) info("نفس providerId", replay.providerId === (reg.providerId || replay.providerId));
info("حالة الدومين بعد التسجيل", provider.checkAvailability("migo-test.com").state);
attempt("تسجيل من غير مفتاح → مرفوض (مسجّل بالفعل)", () =>
  provider.registerDomain({ name: "migo-test.com", registrant: { name: "تاني", email: "x@example.test" } })
);
attempt("تسجيل بيانات Migo كمالك → مرفوض", () =>
  provider.registerDomain({
    name: "bad-owner.com",
    registrant: { name: "Migo AI", email: "billing@migo-ai.test" },
  })
);

/* -------------------------------------------------------------------------- */
line("4) التجديد");
const ren = attempt("تجديد سنة", () => provider.renewDomain({ name: "migo-test.com", years: 1 }));
if (!ren.error) info("الانتهاء الجديد", ren.expiresAt.slice(0, 10));
attempt("تجديد 15 سنة → مرفوض", () => provider.renewDomain({ name: "migo-test.com", years: 15 }));

/* -------------------------------------------------------------------------- */
line("5) أهلية النقل — الأهلية محسوبة مش مخزّنة");
const old = { registeredAt: new Date(Date.now() - 400 * 864e5).toISOString(), years: 2 };
provider.seedDomain("fresh.com", { registeredAt: new Date(Date.now() - 10 * 864e5).toISOString() });
provider.seedDomain("eligible.com", { ...old, authCode: "ELIGIBLE-CODE-1" });
provider.seedDomain("locked.com", old);
provider.setLock("locked.com", true);
provider.seedDomain("dnssec.com", { ...old, dnssec: true });
provider.seedDomain("pending.com", { ...old, locks: ["clientHold"] });
provider.seedDomain("expired.com", { registeredAt: new Date(Date.now() - 800 * 864e5).toISOString(), years: 2 });
for (const d of ["fresh.com", "eligible.com", "locked.com", "dnssec.com", "pending.com", "expired.com"]) {
  const e = provider.checkTransferEligibility(d);
  info(d.padEnd(14), (e.eligible ? "مؤهّل" : "غير مؤهّل") + "  [" + e.reasons.map((r) => r.code).join(", ") + "]");
}
attempt("نقل فعلي بدون رمز → مرفوض", () => provider.transferDomain({ name: "eligible.com" }));
attempt("نقل فعلي برمز غلط → مرفوض", () => provider.transferDomain({ name: "eligible.com", authCode: "WRONG" }));
const tr = attempt("نقل فعلي برمز صحيح", () =>
  provider.transferDomain({ name: "eligible.com", authCode: "ELIGIBLE-CODE-1", idempotencyKey: "tr-1" })
);
if (!tr.error) {
  info("حالة النقل", tr.status + " (مش مكتمل)");
  info("بعد تأكيد المزوّد", provider.simulateTransferOutcome(tr.transferId, "completed").status);
}

/* -------------------------------------------------------------------------- */
line("6) الـAuth Code — منفصل عن التفاصيل");
const details = provider.getDomainDetails("migo-test.com");
info("التفاصيل بتشمل Auth Code؟", details.authCodeIncluded);
info("مفاتيح التفاصيل فيها authCode؟", Object.keys(details).includes("authCode"));
const code = provider.getAuthCode("migo-test.com");
info("دالة مستقلة بترجّع رمز", Boolean(code.authCode) && code.sensitive === true);

/* -------------------------------------------------------------------------- */
line("7) DNS — استبدال كامل، وسجلات السلطة محمية");
attempt("تحديث السجلات (استبدال)", () =>
  provider.updateDnsRecords({
    name: "migo-test.com",
    records: [
      { type: "A", name: "@", value: "192.0.2.10", ttl: 3600 },
      { type: "CNAME", name: "www", value: "my-shop.com", ttl: 3600 },
      { type: "MX", name: "@", value: "mail.example.test", ttl: 3600 },
    ],
  })
);
const recs = provider.getDnsRecords("migo-test.com").records;
info("عدد السجلات", recs.length);
info("السلطة (NS) محفوظة", recs.filter((r) => r.authority).map((r) => r.value).join(", "));
attempt("تعديل سجل NS من هنا → مرفوض", () =>
  provider.updateDnsRecords({ name: "migo-test.com", records: [{ type: "NS", name: "@", value: "ns9.evil.test" }] })
);
attempt("حذف سجل سلطة → مرفوض", () =>
  provider.deleteDnsRecord({ name: "migo-test.com", recordId: recs.find((r) => r.authority).id })
);
attempt("A غير صحيح → مرفوض", () =>
  provider.updateDnsRecords({ name: "migo-test.com", records: [{ type: "A", value: "999.1.1.1" }] })
);

/* -------------------------------------------------------------------------- */
line("8) حقن الأعطال");
provider.failNext("checkAvailability");
attempt("أول نداء يفشل (عطل محقون)", () => provider.checkAvailability("another.com"));
attempt("النداء اللي بعده ينجح", () => provider.checkAvailability("another.com"));
provider.setOutage(true);
attempt("انقطاع كامل", () => provider.getDomainDetails("migo-test.com"));
provider.setOutage(false);
ok("رجعنا بعد إيقاف الانقطاع: " + provider.getDomainDetails("migo-test.com").status);

/* -------------------------------------------------------------------------- */
line("9) الجسر مع محرك التسعير");
const refused = buildQuoteFromProvider({ provider, domain: "my-shop.com", operation: "registration" });
info("بدون allowMock", refused.ok === false ? "مرفوض: " + refused.reason : "مقبول (غلط!)");
info("هل اللقطة وهمية؟", isMockSnapshot(refused.snapshot));
const allowed = buildQuoteFromProvider({
  provider,
  domain: "my-shop.com",
  operation: "registration",
  allowMock: true,
  fx: { rate: "50.10", source: "cbe", fetchedAt: new Date() },
});
if (allowed.ok) {
  info("تكلفة المورّد (وهمية)", allowed.quote.cost.totalUsd + " USD");
  info("قاعدة الهامش", allowed.quote.margin.rule + " (" + allowed.quote.margin.usd + " USD)");
  info("سعر البيع", allowed.quote.sale.usd + " USD");
  info("بالجنيه", allowed.quote.egp.available ? allowed.quote.egp.value + " EGP" : "غير متاح");
  info("العرض للعميل فيه تكلفة؟", Object.keys(allowed.clientQuote).includes("cost"));
  info("localTestOnly", allowed.localTestOnly);
}

/* -------------------------------------------------------------------------- */
line("10) التسعير الوهمي عبر كل العمليات");
for (const op of ["registration", "renewal", "transfer"]) {
  const r = buildQuoteFromProvider({ provider, domain: "my-shop.com", operation: op, allowMock: true });
  if (r.ok) info(op.padEnd(13), r.quote.cost.totalUsd + " → " + r.quote.sale.usd + " USD");
}

console.log("\nالمزوّد الوهمي شغّال بالكامل محليًا. مفيش شبكة، ومفيش تسجيل حقيقي.\n");
