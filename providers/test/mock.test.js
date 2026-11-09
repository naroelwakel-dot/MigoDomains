/* اختبارات المزوّد الوهمي — providers/test/mock.test.js */
import test from "node:test";
import assert from "node:assert/strict";

import {
  createMockProvider,
  parseDomain,
  ProviderError,
  PROVIDER_ERROR_CODES,
  AVAILABILITY_STATES,
  DOMAIN_STATUSES,
  REGISTRY_LOCKS,
} from "../lib/index.js";

const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date("2026-06-01T00:00:00.000Z");

function fresh({ seed = "unit", now = () => T0 } = {}) {
  return createMockProvider({ seed, now });
}

const CUSTOMER = { name: "أحمد العميل", email: "ahmed@example.test", country: "EG" };
const code = (fn) => {
  try {
    fn();
    return null;
  } catch (err) {
    return err.code;
  }
};

/* ------------------------------------------------------------------ المدخلات */

test("parseDomain بيقبل النطاقات الصحيحة ويرفض الغلط", () => {
  assert.equal(parseDomain("My-Shop.COM").name, "my-shop.com");
  assert.equal(parseDomain("my-shop.co.uk").tld, "co.uk");
  for (const bad of ["my shop.com", "com", ".com", "a..b.com", "-bad.com", "", null, 42]) {
    assert.equal(code(() => parseDomain(bad)), PROVIDER_ERROR_CODES.DOMAIN_INVALID, "المفروض يرفض: " + String(bad));
  }
});

/* ------------------------------------------------------------------ التوفر */

test("حالات التوفر كلها موجودة وقاطعة/غير قاطعة بشكل صحيح", () => {
  const p = fresh({ seed: "avail" });

  const free = p.checkAvailability("my-shop.com");
  assert.equal(free.state, AVAILABILITY_STATES.AVAILABLE_CONFIRMED);
  assert.equal(free.definitive, true);

  assert.equal(p.checkAvailability("example.org").state, AVAILABILITY_STATES.RESERVED);
  assert.equal(p.checkAvailability("premium.io").state, AVAILABILITY_STATES.PREMIUM);

  const restricted = p.checkAvailability("shop.xyz");
  assert.equal(restricted.state, AVAILABILITY_STATES.RESTRICTED);
  assert.equal(restricted.definitive, false, "امتداد غير مدعوم مش نتيجة قاطعة");

  p.registerDomain({ name: "taken.com", registrant: CUSTOMER });
  assert.equal(p.checkAvailability("taken.com").state, AVAILABILITY_STATES.REGISTERED);
});

test("عدم استجابة المصدر = UNKNOWN ومش متاح", () => {
  const p = createMockProvider({ seed: "u", unknownTlds: ["io"], now: () => T0 });
  const r = p.checkAvailability("my-site.io");
  assert.equal(r.state, AVAILABILITY_STATES.UNKNOWN);
  assert.equal(r.definitive, false);
});

test("الردود مجمّدة (immutable) — مفيش تلاعب من برّه", () => {
  const p = fresh();
  const r = p.checkAvailability("my-shop.com");
  assert.throws(() => { r.state = "REGISTERED"; }, TypeError);
  const d = p.registerDomain({ name: "frozen.com", registrant: CUSTOMER });
  assert.throws(() => { d.status = "HACKED"; }, TypeError);
});

/* ------------------------------------------------------------------ التسجيل */

test("تسجيل ناجح: ملف كامل + ملكية العميل + ns افتراضية", () => {
  const p = fresh();
  const r = p.registerDomain({ name: "my-shop.com", registrant: CUSTOMER, years: 2 });
  assert.equal(r.mock, true);
  assert.equal(r.status, DOMAIN_STATUSES.ACTIVE);
  assert.equal(r.registrantOwned, true);
  assert.equal(r.nameservers.length, 2);
  assert.equal(r.expiresAt.slice(0, 4), "2028");

  const details = p.getDomainDetails("my-shop.com");
  assert.equal(details.registrant.email, "ahmed@example.test");
  assert.equal(details.admin.email, "ahmed@example.test", "admin بياخد المالك افتراضيًا");
});

test("الملكية إلزامية: بيان ناقص = مرفوض", () => {
  const p = fresh();
  assert.equal(code(() => p.registerDomain({ name: "a.com" })), PROVIDER_ERROR_CODES.REGISTRANT_REQUIRED);
  assert.equal(
    code(() => p.registerDomain({ name: "a.com", registrant: { name: "بلا بريد" } })),
    PROVIDER_ERROR_CODES.CONTACT_INVALID
  );
  assert.equal(
    code(() => p.registerDomain({ name: "a.com", registrant: { name: "x", email: "مش-بريد" } })),
    PROVIDER_ERROR_CODES.CONTACT_INVALID
  );
});

test("بيانات Migo ممنوعة كمالك رسمي — الملكية لازم تكون للعميل", () => {
  const p = fresh();
  for (const bad of [
    { name: "Migo AI", email: "ops@example.test" },
    { name: "العميل", email: "billing@naroelwakel-dot.test" },
  ]) {
    assert.equal(
      code(() => p.registerDomain({ name: "owned.com", registrant: bad })),
      PROVIDER_ERROR_CODES.REGISTRANT_REQUIRED
    );
  }
});

test("مدخلات التسجيل: سنوات وامتداد", () => {
  const p = fresh();
  assert.equal(code(() => p.registerDomain({ name: "a.com", registrant: CUSTOMER, years: 0 })), PROVIDER_ERROR_CODES.DOMAIN_INVALID);
  assert.equal(code(() => p.registerDomain({ name: "a.com", registrant: CUSTOMER, years: 11 })), PROVIDER_ERROR_CODES.DOMAIN_INVALID);
  assert.equal(code(() => p.registerDomain({ name: "a.zz", registrant: CUSTOMER })), PROVIDER_ERROR_CODES.TLD_NOT_SUPPORTED);
});

test("التسجيل محجوز/مسجّل = مرفوض", () => {
  const p = fresh();
  p.registerDomain({ name: "taken.com", registrant: CUSTOMER });
  assert.equal(code(() => p.registerDomain({ name: "taken.com", registrant: CUSTOMER })), PROVIDER_ERROR_CODES.DOMAIN_ALREADY_REGISTERED);
  assert.equal(code(() => p.registerDomain({ name: "example.org", registrant: CUSTOMER })), PROVIDER_ERROR_CODES.DOMAIN_NOT_ACTIVE);
});

test("Idempotency: نفس المفتاح + نفس الطلب = نفس النتيجة بدون تسجيل تاني", () => {
  const p = fresh();
  const a = p.registerDomain({ name: "idem.com", registrant: CUSTOMER, idempotencyKey: "k1" });
  const b = p.registerDomain({ name: "idem.com", registrant: CUSTOMER, idempotencyKey: "k1" });
  assert.equal(a.providerId, b.providerId);
  assert.deepEqual(a, b);
});

test("Idempotency: نفس المفتاح + طلب مختلف = تعارض صريح", () => {
  const p = fresh();
  p.registerDomain({ name: "idem2.com", registrant: CUSTOMER, idempotencyKey: "k2" });
  assert.equal(
    code(() => p.registerDomain({ name: "idem2.com", years: 3, registrant: CUSTOMER, idempotencyKey: "k2" })),
    PROVIDER_ERROR_CODES.IDEMPOTENCY_CONFLICT
  );
});

/* ------------------------------------------------------------------ التجديد */

test("التجديد بيمد التاريخ من الأبعد بين الانتهاء والآن", () => {
  const p = fresh();
  const reg = p.registerDomain({ name: "renew.com", registrant: CUSTOMER });
  const r = p.renewDomain({ name: "renew.com", years: 1 });
  assert.equal(r.previousExpiresAt, reg.expiresAt);
  assert.equal(new Date(r.expiresAt) - new Date(reg.expiresAt), 365 * DAY);
  assert.equal(r.extendedByMs, 365 * DAY);
});

test("التجديد: حدود السنوات + الدومين لازم يكون موجود", () => {
  const p = fresh();
  p.registerDomain({ name: "r2.com", registrant: CUSTOMER });
  assert.equal(code(() => p.renewDomain({ name: "r2.com", years: 0 })), PROVIDER_ERROR_CODES.DOMAIN_INVALID);
  assert.equal(code(() => p.renewDomain({ name: "r2.com", years: 99 })), PROVIDER_ERROR_CODES.DOMAIN_INVALID);
  assert.equal(code(() => p.renewDomain({ name: "ghost.com" })), PROVIDER_ERROR_CODES.DOMAIN_NOT_FOUND);
});

test("التجديد في مرحلة الحذف النهائي مرفوض — لازم استرداد", () => {
  const p = fresh();
  p.seedDomain("dead.com", { registeredAt: new Date(T0.getTime() - 800 * DAY).toISOString(), years: 1 });
  assert.equal(p.getDomainDetails("dead.com").status, DOMAIN_STATUSES.PENDING_DELETE);
  assert.equal(code(() => p.renewDomain({ name: "dead.com" })), PROVIDER_ERROR_CODES.DOMAIN_NOT_ACTIVE);
});

/* ------------------------------------------------------------------ الأقفال */

test("setLock بيقفل ويفتح قفل النقل", () => {
  const p = fresh();
  p.registerDomain({ name: "lock.com", registrant: CUSTOMER });
  assert.equal(p.setLock("lock.com", false).locked, false);
  assert.equal(p.getDomainDetails("lock.com").locks.includes(REGISTRY_LOCKS.TRANSFER_PROHIBITED), false);
  assert.equal(p.setLock("lock.com", true).locked, true);
  assert.equal(p.getDomainDetails("lock.com").locks.includes(REGISTRY_LOCKS.TRANSFER_PROHIBITED), true);
});

test("setDnssec بيقلب الإعداد", () => {
  const p = fresh();
  p.registerDomain({ name: "sec.com", registrant: CUSTOMER });
  assert.equal(p.setDnssec("sec.com", true).dnssec, true);
  assert.equal(p.getDomainDetails("sec.com").dnssec, true);
});

test("updateContacts بيعدّل الدور ويتحقق من الاسم والبريد", () => {
  const p = fresh();
  p.registerDomain({ name: "contact.com", registrant: CUSTOMER });
  const out = p.updateContacts({ name: "contact.com", contacts: { admin: { name: "سارة", email: "sara@example.test" } } });
  assert.deepEqual(out.updatedRoles, ["admin"]);
  assert.equal(p.getDomainDetails("contact.com").admin.email, "sara@example.test");
  assert.equal(code(() => p.updateContacts({ name: "contact.com", contacts: { admin: { name: "بدون بريد" } } })), PROVIDER_ERROR_CODES.CONTACT_INVALID);
  assert.equal(code(() => p.updateContacts({ name: "contact.com", contacts: {} })), PROVIDER_ERROR_CODES.CONTACT_INVALID);
});

test("updateContacts بيرفض بيانات الموزّع كمالك رسمي", () => {
  const p = fresh();
  p.registerDomain({ name: "owner.com", registrant: CUSTOMER });
  assert.equal(
    code(() => p.updateContacts({ name: "owner.com", contacts: { registrant: { name: "Migo AI", email: "ops@migo.test" } } })),
    PROVIDER_ERROR_CODES.REGISTRANT_REQUIRED
  );
});

/* --------------------------------------------------------------- Nameservers */

test("الـNameservers: من 2 لـ6 وبصيغة صحيحة", () => {
  const p = fresh();
  p.registerDomain({ name: "ns.com", registrant: CUSTOMER });
  assert.equal(code(() => p.updateNameservers({ name: "ns.com", nameservers: ["ns1.a.test"] })), PROVIDER_ERROR_CODES.NAMESERVER_INVALID);
  assert.equal(
    code(() => p.updateNameservers({ name: "ns.com", nameservers: ["bad ns", "ns2.a.test"] })),
    PROVIDER_ERROR_CODES.NAMESERVER_INVALID
  );
  const ok = p.updateNameservers({ name: "ns.com", nameservers: ["NS1.Cloudflare.Test", "ns2.cloudflare.test"] });
  assert.deepEqual(ok.nameservers, ["ns1.cloudflare.test", "ns2.cloudflare.test"]);
  assert.deepEqual(ok.previous, ["ns1.migo-dns.test", "ns2.migo-dns.test"]);
});

/* ------------------------------------------------------------------ DNS */

test("تحديث DNS = استبدال كامل، وسجلات السلطة تفضل", () => {
  const p = fresh();
  p.registerDomain({ name: "dns.com", registrant: CUSTOMER });
  p.updateDnsRecords({ name: "dns.com", records: [{ type: "A", name: "@", value: "192.0.2.1" }] });
  const r = p.updateDnsRecords({
    name: "dns.com",
    records: [
      { type: "A", name: "@", value: "192.0.2.2" },
      { type: "TXT", name: "@", value: "v=spf1 -all" },
    ],
  });
  assert.equal(r.replaced, true);
  const all = p.getDnsRecords("dns.com").records;
  assert.equal(all.filter((x) => !x.authority).length, 2, "السجل القديم اتشال — ده استبدال مش إضافة");
  assert.equal(all.filter((x) => x.authority).length, 2, "سجلات NS محفوظة");
  assert.ok(all.every((x) => typeof x.id === "string" && x.id.length > 0));
});

test("سجلات السلطة محمية: ممنوع تتعدّل أو تتحذف من هنا", () => {
  const p = fresh();
  p.registerDomain({ name: "auth.com", registrant: CUSTOMER });
  assert.equal(
    code(() => p.updateDnsRecords({ name: "auth.com", records: [{ type: "NS", name: "@", value: "ns9.evil.test" }] })),
    PROVIDER_ERROR_CODES.AUTHORITY_RECORD_IMMUTABLE
  );
  assert.equal(
    code(() => p.updateDnsRecords({ name: "auth.com", records: [{ type: "CAA", name: "@", value: "0 issue \"none\"" }] })),
    PROVIDER_ERROR_CODES.AUTHORITY_RECORD_IMMUTABLE
  );
  const authority = p.getDnsRecords("auth.com").records.find((x) => x.authority);
  assert.equal(code(() => p.deleteDnsRecord({ name: "auth.com", recordId: authority.id })), PROVIDER_ERROR_CODES.AUTHORITY_RECORD_IMMUTABLE);
});

test("تحقق السجلات: النوع والقيمة و TTL", () => {
  const p = fresh();
  p.registerDomain({ name: "v.com", registrant: CUSTOMER });
  const bad = (rec) => code(() => p.updateDnsRecords({ name: "v.com", records: [rec] }));
  assert.equal(bad({ type: "HACK", value: "x" }), PROVIDER_ERROR_CODES.DNS_RECORD_INVALID);
  assert.equal(bad({ type: "A", value: "999.999.999.999" }), PROVIDER_ERROR_CODES.DNS_RECORD_INVALID);
  assert.equal(bad({ type: "A", value: "not-an-ip" }), PROVIDER_ERROR_CODES.DNS_RECORD_INVALID);
  assert.equal(bad({ type: "TXT", value: "ok", ttl: 5 }), PROVIDER_ERROR_CODES.DNS_RECORD_INVALID);
  assert.equal(bad({ type: "TXT", value: "ok", ttl: 999999 }), PROVIDER_ERROR_CODES.DNS_RECORD_INVALID);
  assert.equal(bad({ type: "TXT", value: "" }), PROVIDER_ERROR_CODES.DNS_RECORD_INVALID);
  assert.equal(code(() => p.updateDnsRecords({ name: "v.com", records: "مش قايمة" })), PROVIDER_ERROR_CODES.DNS_RECORD_INVALID);
  assert.equal(bad({ type: "AAAA", value: "2001:db8::1" }), null);
});

test("حذف سجل مش موجود = خطأ واضح", () => {
  const p = fresh();
  p.registerDomain({ name: "del.com", registrant: CUSTOMER });
  assert.equal(code(() => p.deleteDnsRecord({ name: "del.com", recordId: "ghost" })), PROVIDER_ERROR_CODES.DNS_RECORD_NOT_FOUND);
});

test("حذف سجل عادي بيشيله فعلًا", () => {
  const p = fresh();
  p.registerDomain({ name: "del2.com", registrant: CUSTOMER });
  p.updateDnsRecords({ name: "del2.com", records: [{ type: "A", name: "@", value: "192.0.2.5" }] });
  const target = p.getDnsRecords("del2.com").records.find((x) => !x.authority);
  const removed = p.deleteDnsRecord({ name: "del2.com", recordId: target.id });
  assert.equal(removed.removed.id, target.id);
  assert.equal(p.getDnsRecords("del2.com").records.filter((x) => !x.authority).length, 0);
});

/* --------------------------------------------------------------- الانتهاء */

test("تاريخ الانتهاء: أيام متبقية + علم السماح", () => {
  const p = fresh();
  p.registerDomain({ name: "exp.com", registrant: CUSTOMER });
  const e = p.getDomainExpiration("exp.com");
  assert.equal(e.status, DOMAIN_STATUSES.ACTIVE);
  assert.equal(e.gracePeriod, false);
  assert.equal(e.daysRemaining, 365);

  p.seedDomain("grace.com", { registeredAt: new Date(T0.getTime() - 375 * DAY).toISOString(), years: 1 });
  const g = p.getDomainExpiration("grace.com");
  assert.equal(g.status, DOMAIN_STATUSES.EXPIRED);
  assert.equal(g.gracePeriod, true);
  assert.ok(g.daysRemaining < 0);
});

test("التسلسل الزمني للحالة: EXPIRED ثم REDEMPTION ثم PENDING_DELETE", () => {
  const cases = [
    [10, DOMAIN_STATUSES.EXPIRED],
    [50, DOMAIN_STATUSES.REDEMPTION_PERIOD],
    [200, DOMAIN_STATUSES.PENDING_DELETE],
  ];
  for (const [daysPast, expected] of cases) {
    const p = fresh();
    p.seedDomain("s.com", { registeredAt: new Date(T0.getTime() - (365 + daysPast) * DAY).toISOString(), years: 1 });
    assert.equal(p.getDomainDetails("s.com").status, expected, "بعد " + daysPast + " يوم");
  }
});

/* ------------------------------------------------------------------ الأسرار */

test("Auth Code ما بيظهرش في التفاصيل، وله دالة خاصة", () => {
  const p = fresh();
  p.registerDomain({ name: "secret.com", registrant: CUSTOMER });
  const d = p.getDomainDetails("secret.com");
  assert.equal(d.authCodeIncluded, false);
  assert.equal(Object.keys(d).includes("authCode"), false);
  assert.equal(JSON.stringify(d).includes("authCode"), true, "بس بيذكر إنه مش مُضمَّن");

  const a = p.getAuthCode("secret.com");
  assert.equal(typeof a.authCode, "string");
  assert.equal(a.authCode.length, 16);
  assert.equal(a.sensitive, true);
});

/* --------------------------------------------------------------- حقن الأعطال */

test("failNext بيفشل مرة واحدة بس", () => {
  const p = fresh();
  p.failNext("checkAvailability", { code: PROVIDER_ERROR_CODES.PROVIDER_TIMEOUT, message: "مهلة" });
  assert.equal(code(() => p.checkAvailability("a.com")), PROVIDER_ERROR_CODES.PROVIDER_TIMEOUT);
  assert.equal(code(() => p.checkAvailability("a.com")), null);
});

test("failAlways بيفضل يفشل لحد ما نمسحه", () => {
  const p = fresh();
  p.failAlways("renewDomain");
  p.registerDomain({ name: "f.com", registrant: CUSTOMER });
  assert.equal(code(() => p.renewDomain({ name: "f.com" })), PROVIDER_ERROR_CODES.PROVIDER_UNAVAILABLE);
  assert.equal(code(() => p.renewDomain({ name: "f.com" })), PROVIDER_ERROR_CODES.PROVIDER_UNAVAILABLE);
  p.clearFailures();
  assert.equal(code(() => p.renewDomain({ name: "f.com" })), null);
});

test("الانقطاع الكامل بيوقف كل شيء ويرجع بالكامل", () => {
  const p = fresh();
  p.registerDomain({ name: "o.com", registrant: CUSTOMER });
  p.setOutage(true);
  for (const call of [
    () => p.checkAvailability("a.com"),
    () => p.getPricing("a.com"),
    () => p.getDomainDetails("o.com"),
    () => p.getDnsRecords("o.com"),
  ]) {
    assert.equal(code(call), PROVIDER_ERROR_CODES.PROVIDER_UNAVAILABLE);
  }
  p.setOutage(false);
  assert.equal(p.getDomainDetails("o.com").status, DOMAIN_STATUSES.ACTIVE);
});

test("reset بيمسح كل الحالة", () => {
  const p = fresh();
  p.registerDomain({ name: "z.com", registrant: CUSTOMER });
  p.reset();
  assert.equal(code(() => p.getDomainDetails("z.com")), PROVIDER_ERROR_CODES.DOMAIN_NOT_FOUND);
  assert.deepEqual(p.stats().domains, 0);
});

/* ------------------------------------------------------------------ الحتمية */

test("نفس البذرة = نفس رموز النقل (حتمية كاملة)", () => {
  const mk = () => {
    const p = createMockProvider({ seed: "same", now: () => T0 });
    p.registerDomain({ name: "d.com", registrant: CUSTOMER });
    return p.getAuthCode("d.com").authCode;
  };
  assert.equal(mk(), mk());
  assert.notEqual(mk(), createMockProvider({ seed: "other", now: () => T0 }).seed);
});

test("أسعار المزوّد الوهمي موسومة إنها وهمية", () => {
  const p = fresh();
  const price = p.getPricing("my-shop.com", { operation: "registration" });
  assert.equal(price.fake, true);
  assert.equal(price.currency, "USD");
  assert.equal(price.operation, "registration");
  assert.equal(typeof price.wholesaleUsd, "string");
});
