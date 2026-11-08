/* ==========================================================================
   Migo Domains — جسر المزوّد ↔ محرك التسعير
   --------------------------------------------------------------------------
   الفكرة: المزوّد بيرجّع **تكلفة** (سعر الجملة + الرسوم)، ومحرك التسعير
   بياخد لقطة تكلفة ويطلّع سعر بيع. الجسر ده بيوصّل الاتنين.

   قاعدة أمنية صريحة (من PRICING_ENGINE_REVIEW.md و COST_REASONS):
     • **ممنوع** استخدام أسعار وهمية كأسعار حقيقية.
     • أي لقطة جاية من مزوّد وهمي بتتوسم `trusted: false` افتراضيًا،
       ومحرك التسعير بيرفض يصدر سعر عليها (COST_UNTRUSTED).
     • السماح بذلك لازم يكون **صريح** (allowMock: true) وبيظهر كتحذير.

   يعني: الفلو يشتغل بالكامل محليًا للتجربة، بس مش ممكن يطلّع سعر حقيقي
   بالغلط من بيانات وهمية.
   ========================================================================== */

import {
  makeCostSnapshot,
  issueQuote,
  toClientQuote,
  recheckQuote,
  checkCostFreshness,
} from "../../pricing/lib/index.js";

/** علامة المصدر الوهمي — بندوّر عليها في اللقطة عشان نمنع التسريب. */
export const MOCK_PROVENANCE_TAG = "provenance=mock";

/** سبب الرفض لما نحاول نصدر سعر حقيقي من تكلفة وهمية. */
export const MOCK_COST_REFUSAL = Object.freeze({
  ok: false,
  reason: "MOCK_NOT_A_REAL_PRICE",
  message:
    "المصدر مزوّد وهمي: ممنوع إصدار سعر بيع حقيقي من أسعار اختبار. " +
    "السماح بذلك للتجربة المحلية بس عبر allowMock: true.",
});

function providerProvenance(provider) {
  const meta = provider && provider.meta ? provider.meta : null;
  const production = Boolean(meta && meta.production === true);
  return {
    production,
    providerName: meta && meta.provider ? meta.provider : "unknown",
    environment: meta && meta.environment ? meta.environment : "unknown",
    mock: Boolean(meta && meta.environment === "mock"),
  };
}

/**
 * يحوّل سجل تسعير من المزوّد لِلقطة تكلفة يفهمها محرك التسعير.
 * @param {object} pricing     ناتج provider.getPricing().
 * @param {object} [opts]
 * @param {boolean} [opts.trusted]  افتراضيًا: false لو المصدر وهمي.
 */
export function mockPricingToCostSnapshot(pricing, { trusted, retrievedAt } = {}) {
  if (!pricing || typeof pricing !== "object") {
    throw new Error("سجل تسعير غير صالح للتحويل");
  }
  const source = String(pricing.source || "mock:unknown");
  const isMock = pricing.mock === true || source.includes(MOCK_PROVENANCE_TAG) || pricing.fake === true;
  const sourceWithTag = isMock && !source.includes(MOCK_PROVENANCE_TAG)
    ? source + "#" + MOCK_PROVENANCE_TAG
    : source;

  return makeCostSnapshot({
    wholesale: pricing.wholesaleUsd,
    fees: pricing.feesUsd,
    currency: pricing.currency || "USD",
    source: sourceWithTag,
    retrievedAt: retrievedAt || pricing.retrievedAt || new Date(),
    // الوهمي **مش موثوق** افتراضيًا. ده مش تفصيلة — دي الحماية.
    trusted: trusted === undefined ? !isMock : Boolean(trusted),
  });
}

/** هل اللقطة دي جاية من مصدر وهمي؟ (المصدر موسوم دايمًا، حتى لو سُمح بالتجربة) */
export function isMockSnapshot(snapshot) {
  if (!snapshot) return false;
  return String(snapshot.source || "").includes(MOCK_PROVENANCE_TAG);
}

/**
 * يقرأ التكلفة من المزوّد ويرجّع اللقطة + بيانات المصدر + تحذير لو وهمي.
 *
 * @param {object} provider
 * @param {string} domain
 * @param {object} [opts]
 * @param {string} [opts.operation]
 * @param {Date}   [opts.now]
 * @param {boolean}[opts.acceptMock] قبول صريح لبيانات وهمية **للتجربة المحلية**.
 *   حتى مع القبول، الوسم بيفضل على المصدر و`localTestOnly` بيفضل true.
 * @returns {{snapshot: object, provenance: object, warning: string|null, localTestOnly: boolean}}
 */
export function costSnapshotFromProvider(provider, domain, { operation = "registration", now, acceptMock = false } = {}) {
  if (!provider || typeof provider.getPricing !== "function") {
    throw new Error("المزوّد لازم ينفّذ getPricing");
  }
  const pricing = provider.getPricing(domain, { operation });
  const prov = providerProvenance(provider);
  const mockSource = pricing.mock === true || pricing.fake === true || prov.mock || !prov.production;
  const accepted = mockSource && acceptMock === true;
  const snapshot = mockPricingToCostSnapshot(pricing, {
    retrievedAt: now,
    trusted: prov.production || accepted,
  });
  const warning = prov.production
    ? null
    : "تكلفة من " + prov.providerName + "/" + prov.environment + " — " +
      (accepted ? "مقبولة صريحًا للتجربة المحلية فقط، وممنوعة كسعر حقيقي." : "ممنوعة كأساس لسعر حقيقي.");
  return { snapshot, pricing, provenance: prov, warning, localTestOnly: Boolean(!prov.production) };
}

/**
 * يبني عرض سعر كامل من مزوّد، مع الاحترام الكامل لقاعدة «ممنوع سعر حقيقي
 * من تكلفة وهمية».
 *
 * @param {object} input
 * @param {object} input.provider
 * @param {string} input.domain
 * @param {"registration"|"renewal"|"transfer"} input.operation
 * @param {object} [input.fx]        سعر الصرف (لـ EGP).
 * @param {object} [input.config]
 * @param {Date}   [input.now]
 * @param {boolean}[input.allowMock] السماح الصريح بالتجربة على مصدر وهمي.
 * @returns {object} {ok, quote?, clientQuote?, refusal?, snapshot, provenance, warning}
 */
export function buildQuoteFromProvider(input = {}) {
  const {
    provider,
    domain,
    operation = "registration",
    fx = null,
    config,
    now = new Date(),
    allowMock = false,
  } = input;

  const read = costSnapshotFromProvider(provider, domain, { operation, now, acceptMock: allowMock });

  if (!read.snapshot.trusted && !allowMock) {
    return Object.freeze({
      ...MOCK_COST_REFUSAL,
      snapshot: read.snapshot,
      provenance: read.provenance,
      warning: read.warning,
    });
  }

  const freshness = checkCostFreshness(read.snapshot, { now });
  const quote = issueQuote({
    operation,
    snapshot: read.snapshot,
    domain: String(domain || "").toLowerCase(),
    tld: String(domain || "").split(".").slice(1).join("."),
    fx,
    config,
    now,
  });

  return Object.freeze({
    ok: true,
    localTestOnly: read.localTestOnly,
    quote,
    clientQuote: toClientQuote(quote),
    snapshot: read.snapshot,
    provenance: read.provenance,
    warning: read.warning,
    freshness,
  });
}

/**
 * إعادة التحقق قبل التسجيل — بنفس القواعد.
 * بترجّع {ok:false, ...refusal} لو التكلفة وهمية بدون allowMock.
 */
export function recheckFromProvider(quote, input = {}) {
  const { provider, domain, operation = quote ? quote.operation : "registration", fx, config, now = new Date(), allowMock = false } = input;
  const read = costSnapshotFromProvider(provider, domain, { operation, now, acceptMock: allowMock });
  if (!read.snapshot.trusted && !allowMock) {
    return Object.freeze({ ...MOCK_COST_REFUSAL, snapshot: read.snapshot, provenance: read.provenance, warning: read.warning });
  }
  const result = recheckQuote(quote, { snapshot: read.snapshot, now, config });
  return Object.freeze({
    ...result,
    ok: true,
    localTestOnly: read.localTestOnly,
    provenance: read.provenance,
    warning: read.warning,
  });
}
