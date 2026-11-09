/* ==========================================================================
   Migo Domains — Cache بسيط بمدة صلاحية
   --------------------------------------------------------------------------
   قاعدة إلزامية: «لا تعتمد على نتيجة مخزّنة قديمة عند تنفيذ عملية تسجيل
   حقيقية». عشان كده المدة بتتوقف على نوع النتيجة: النتيجة الحاسمة (مسجّل /
   متاح مؤكد) تعيش أطول، والنتيجة غير الحاسمة (UNKNOWN / PROVIDER_ERROR)
   تعيش ثواني بس.

   الساعة قابلة للحقن عشان الاختبارات تتحكم في الوقت بدون انتظار.
   ========================================================================== */

export function createTtlCache({ now = () => Date.now(), maxEntries = Infinity } = {}) {
  const store = new Map();

  function get(key) {
    const entry = store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= now()) {
      store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  function set(key, value, ttlMs) {
    if (ttlMs <= 0) return value;
    if (store.size >= maxEntries && !store.has(key)) {
      const oldest = store.keys().next().value;
      if (oldest !== undefined) store.delete(oldest);
    }
    store.set(key, { value, expiresAt: now() + ttlMs, storedAt: now() });
    return value;
  }

  function peek(key) {
    const entry = store.get(key);
    return entry ? { value: entry.value, expiresAt: entry.expiresAt, storedAt: entry.storedAt, expired: entry.expiresAt <= now() } : null;
  }

  return {
    get,
    set,
    peek,
    has: (key) => get(key) !== undefined,
    delete: (key) => store.delete(key),
    clear: () => store.clear(),
    get size() {
      return store.size;
    },
  };
}
