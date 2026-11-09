/* ==========================================================================
   Migo Domains — سجل تدقيق (Append-only)
   --------------------------------------------------------------------------
   كل عملية حسّاسة (طلب، دفع، تسجيل، تجديد، تحويل، تعديل DNS) لازم تسيب أثر:
   مين، عمل إيه، على أي دومين/طلب، إمتى، وبنوع نتيجة.

   السجل **للكتابة فقط** — مفيش تعديل ولا حذف. والتخزين هنا في الذاكرة
   (الاختبارات والتشغيل المحلي)؛ في الإنتاج بيتكتب في جدول `audit_log`.
   ========================================================================== */

export function createAuditLog({ now = () => new Date(), maxEntries = 10000 } = {}) {
  const entries = [];

  function append(entry = {}) {
    const record = Object.freeze({
      at: (entry.at instanceof Date ? entry.at : now()).toISOString(),
      actor: entry.actor || "anonymous",
      action: entry.action || "unknown",
      target: entry.target || null,
      outcome: entry.outcome || "ok",
      detail: entry.detail ? Object.freeze({ ...entry.detail }) : null,
    });
    entries.push(record);
    if (entries.length > maxEntries) entries.shift();
    return record;
  }

  function list({ actor, action, target, since } = {}) {
    return entries.filter((e) => {
      if (actor && e.actor !== actor) return false;
      if (action && e.action !== action) return false;
      if (target && e.target !== target) return false;
      if (since && new Date(e.at).getTime() < new Date(since).getTime()) return false;
      return true;
    });
  }

  return {
    append,
    list,
    get length() {
      return entries.length;
    },
    all: () => entries.slice(),
  };
}
