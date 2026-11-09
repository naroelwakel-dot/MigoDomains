/* ==========================================================================
   Migo Domains — الواجهة العامة لمحرك التوفر
   --------------------------------------------------------------------------
   مثال (كله محلي، الشبكة قابلة للحقن):

     import { createAvailabilityEngine, parseBootstrap } from "./availability/lib/index.js";

     const servers = parseBootstrap(ianaDoc);            // مستند IANA واحد
     const engine = createAvailabilityEngine({ fetch, servers });
     const result = await engine.check("my-shop.com");   // RDAP + cache + rate limit
   ========================================================================== */

export { IANA_RDAP_BOOTSTRAP_URL, parseBootstrap, serverForTld, buildRdapUrl, tldOf } from "./bootstrap.js";
export { createTtlCache } from "./cache.js";
export { createTokenBucket } from "./ratelimit.js";
export { rdapLookup, RDAP_REASONS } from "./rdap.js";
export { createAvailabilityEngine, normalizeDomain, isDefinitive } from "./engine.js";
