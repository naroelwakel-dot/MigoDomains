/* ==========================================================================
   Migo Domains — الواجهة العامة لطبقة المزوّدين
   --------------------------------------------------------------------------
   كل حاجة تتعامل مع مزوّد دومينات تمرّ من هنا.

   مثال (كله محلي، بدون شبكة وبدون مفاتيح):

     import { createMockProvider, assertProvider, buildQuoteFromProvider } from "./providers/lib/index.js";

     const provider = createMockProvider({ seed: "demo" });
     assertProvider(provider);

     const q = buildQuoteFromProvider({
       provider, domain: "my-shop.com", operation: "registration",
       allowMock: true,           // تجربة محلية صريحة
       fx: { rate: "50.10", source: "cbe", fetchedAt: new Date() },
     });

   ⚠️ المزوّد الوهمي **للتطوير والاختبار فقط**. ممنوع أي تسجيل حقيقي.
   ========================================================================== */

export {
  PROVIDER_ERROR_CODES,
  ProviderError,
  CapabilityError,
  TransferEligibilityError,
} from "./errors.js";

export {
  AVAILABILITY_STATES,
  AVAILABILITY_IS_DEFINITIVE,
  DOMAIN_STATUSES,
  REGISTRY_LOCKS,
  CAPABILITIES,
  TRANSFER_RULES,
  TRANSFER_REASON_CODES,
} from "./states.js";

export {
  REQUIRED_METHODS,
  RECOMMENDED_METHODS,
  SENSITIVE_METHODS,
  assertProvider,
  guardCapability,
} from "./contract.js";

export {
  createMockProvider,
  MOCK_PRICE_LIST,
  parseDomain,
} from "./mock.js";

export {
  MOCK_PROVENANCE_TAG,
  MOCK_COST_REFUSAL,
  mockPricingToCostSnapshot,
  isMockSnapshot,
  costSnapshotFromProvider,
  buildQuoteFromProvider,
  recheckFromProvider,
} from "./bridge.js";
