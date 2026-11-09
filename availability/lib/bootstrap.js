/* ==========================================================================
   Migo Domains — IANA RDAP Bootstrap
   --------------------------------------------------------------------------
   **ممنوع** نستخدم rdap.org كمصدر وحيد، وممنوع نفترض إن حد الطلبات اللي
   عنده عالمي. المسار الصح: نقرا ملف الـBootstrap الرسمي من IANA، ونحدّد
   سيرفر RDAP المختص بالامتداد بنفسنا.

   المصدر الرسمي: https://data.iana.org/rdap/dns.json
   الشكل: { services: [ [ [ "com", "net" ], [ "https://rdap.verisign.com/com/v1/" ] ], ... ] }
   ========================================================================== */

export const IANA_RDAP_BOOTSTRAP_URL = "https://data.iana.org/rdap/dns.json";

/** يحوّل مستند الـBootstrap لخريطة: tld → base URL. */
export function parseBootstrap(doc) {
  if (!doc || typeof doc !== "object" || !Array.isArray(doc.services)) {
    throw new Error("مستند RDAP Bootstrap غير صالح: مفيش services");
  }
  const map = new Map();
  for (const entry of doc.services) {
    if (!Array.isArray(entry) || entry.length < 2) continue;
    const [tlds, urls] = entry;
    if (!Array.isArray(tlds) || !Array.isArray(urls) || urls.length === 0) continue;
    const base = normalizeBase(urls[0]);
    for (const t of tlds) {
      if (typeof t !== "string") continue;
      map.set(t.toLowerCase(), base);
    }
  }
  if (map.size === 0) throw new Error("مستند RDAP Bootstrap مفيهوش امتدادات صالحة");
  return map;
}

function normalizeBase(url) {
  const s = String(url);
  return s.endsWith("/") ? s : s + "/";
}

/** سيرفر الـRDAP المختص بالامتداد، أو null لو الامتداد مش مدعوم RDAP. */
export function serverForTld(servers, tld) {
  if (!servers) return null;
  if (servers instanceof Map) return servers.get(String(tld).toLowerCase()) || null;
  return servers[String(tld).toLowerCase()] || null;
}

/** يبني رابط استعلام RDAP من الـbase URL واسم الدومين. */
export function buildRdapUrl(base, domain) {
  return normalizeBase(base) + "domain/" + encodeURIComponent(String(domain).toLowerCase());
}

/** يستخرج الامتداد من اسم دومين مطبَّع. */
export function tldOf(domain) {
  const parts = String(domain || "").toLowerCase().split(".").filter(Boolean);
  return parts.length < 2 ? null : parts.slice(1).join(".");
}
