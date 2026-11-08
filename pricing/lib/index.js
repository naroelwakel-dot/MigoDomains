/* ==========================================================================
   Migo Domains — الواجهة العامة لمحرك التسعير
   --------------------------------------------------------------------------
   نقطة الدخول الوحيدة. استورد من هنا، ومتستوردش من ملفات lib/ الداخلية
   عشان نفضل قادرين نعيد التنظيم من غير ما نكسر حد.

   مثال:
     import { issueQuote, toClientQuote, makeCostSnapshot } from "./pricing/lib/index.js";

     const snapshot = makeCostSnapshot({
       wholesale: "7.99", source: "openprovider:price-list",
       retrievedAt: new Date(),
     });

     const quote = issueQuote({ operation: "registration", tld: "com",
       snapshot, fx: { rate: "50.10", source: "cbe", fetchedAt: new Date() } });

     const client = toClientQuote(quote);   // بدون تكلفة ولا هامش

   الحساب كله محلي، بدون أي مكتبة خارجية وبدون أي مفاتيح.
   ========================================================================== */

export {
  MICRO,
  MICRO_DECIMALS,
  ROUNDING_MODES,
  DecimalError,
  toMicros,
  toDecimalString,
  toFixedString,
  toNumber,
  compare,
  maxBig,
  minBig,
  divRoundHalfUp,
  percentOf,
  roundTo,
} from "./decimal.js";

export {
  TIER_RULE_VERSION,
  DEFAULT_TIERS,
  MarginError,
  inTier,
  matchingTiers,
  pickTier,
  analyzeTiers,
} from "./tiers.js";

export {
  RULE_MODES,
  ZERO_COST_POLICY,
  computeMargin,
  priceFromCost,
  assertClientSafe,
} from "./margin.js";

export {
  FX_DEFAULT_MAX_AGE_MS,
  FX_DEFAULT_BUFFER_PERCENT,
  FX_REASONS,
  resolveFx,
  convertToEgp,
} from "./fx.js";

export {
  COST_REFRESH_INTERVAL_MS,
  COST_MAX_AGE_MS,
  COST_CHANGE_TOLERANCE_PERCENT,
  COST_REASONS,
  makeCostSnapshot,
  snapshotToRecord,
  checkCostFreshness,
  needsRefresh,
  changePercent,
  detectCostChange,
  planRefresh,
} from "./cost-feed.js";

export {
  OPERATIONS,
  DEFAULT_CONFIG,
  mergeConfig,
  validateConfig,
} from "./config.js";

export {
  QuoteError,
  CLIENT_QUOTE_KEYS,
  issueQuote,
  toClientQuote,
  isQuoteLocked,
  recheckQuote,
  pricePremiumDomain,
} from "./quote.js";
