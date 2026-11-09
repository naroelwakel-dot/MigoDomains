/* ==========================================================================
   Migo Domains — Rate Limiting (Token Bucket)
   --------------------------------------------------------------------------
   إلزامي من مواصفات محرك التوفر: «أضف Rate Limiting وCaching مناسبين.»
   الـbucket بيسمح باندفاعة (capacity) وبعدها بيتعبّى بمعدل ثابت.

   الساعة قابلة للحقن للاختبار بدون انتظار حقيقي.
   ========================================================================== */

export function createTokenBucket({ capacity, refillPerSecond, now = () => Date.now() } = {}) {
  if (!Number.isFinite(capacity) || capacity <= 0) throw new Error("capacity لازم يكون رقم موجب");
  if (!Number.isFinite(refillPerSecond) || refillPerSecond < 0) throw new Error("refillPerSecond لازم يكون رقم غير سالب");

  const refillPerMs = refillPerSecond / 1000;
  let tokens = capacity;
  let last = now();

  function refill() {
    const t = now();
    const elapsed = Math.max(0, t - last);
    if (elapsed > 0) {
      tokens = Math.min(capacity, tokens + elapsed * refillPerMs);
      last = t;
    }
  }

  function tryTake(n = 1) {
    refill();
    if (tokens >= n) {
      tokens -= n;
      return true;
    }
    return false;
  }

  return {
    tryTake,
    get available() {
      refill();
      return Math.floor(tokens);
    },
    get capacity() {
      return capacity;
    },
    reset() {
      tokens = capacity;
      last = now();
    },
  };
}
