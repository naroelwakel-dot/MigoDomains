/* ==========================================================================
   Migo Domains — حساب عشري دقيق
   --------------------------------------------------------------------------
   كل الأرقام المالية بتتخزّن كـ BigInt بوحدة 1e-6 دولار (ميكرو-دولار).
   ليه؟ لأن 0.1 + 0.2 بالأرقام العشرية العادية بيطلع 0.30000000000000004،
   وإحنا بنحسب فلوس. مثال من السياسة المعتمدة: تكلفة 30.01 → هامش 4.5015.
   لو استخدمنا Number، الـ 4 شهور دي ممكن تتفوّت.

   مفيش أي مكتبة خارجية. الملف ده شغال في Node وفي Cloudflare Workers.
   ========================================================================== */

/** عدد الخانات العشرية الداخلية (1e-6 دولار). */
export const MICRO_DECIMALS = 6;

/** معامل التحويل: 1 دولار = 1,000,000 ميكرو. */
export const MICRO = 10n ** BigInt(MICRO_DECIMALS);

/** أوضاع التقريب المدعومة. */
export const ROUNDING_MODES = Object.freeze(["half-up", "floor", "ceil", "half-even"]);

/** خطأ حساب أو صيغة رقمية غلط. */
export class DecimalError extends Error {
  constructor(message, code = "DECIMAL_ERROR") {
    super(message);
    this.name = "DecimalError";
    this.code = code;
  }
}

/* --------------------------------------------------------------------------
   قراءة القيم
   -------------------------------------------------------------------------- */

/** يحوّل رقمًا بالصيغة الأسية (1e-7) إلى نص عشري عادي. */
function expandExponent(n) {
  const s = n.toFixed(20);
  if (/[eE]/.test(s)) {
    throw new DecimalError("صيغة رقمية غير مدعومة: " + String(n), "DECIMAL_BAD_SYNTAX");
  }
  return s;
}

/**
 * يحوّل قيمة (نص أو رقم) إلى ميكرو-دولار BigInt.
 * التقريب لـ6 خانات بيحصل بنص-لأعلى، وأي خانات بعد كده بتتقرّب.
 */
export function toMicros(value) {
  if (typeof value === "bigint") return value * MICRO;

  let s;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new DecimalError("قيمة غير رقمية: " + String(value), "DECIMAL_NOT_FINITE");
    }
    s = String(value);
  } else if (typeof value === "string") {
    s = value.trim();
  } else {
    throw new DecimalError("قيمة غير مدعومة: " + typeof value, "DECIMAL_UNSUPPORTED");
  }

  if (s === "") throw new DecimalError("قيمة فاضية", "DECIMAL_EMPTY");
  if (/[eE]/.test(s)) s = expandExponent(Number(s));

  const m = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(s);
  if (!m || (m[2] === "" && (m[3] === undefined || m[3] === ""))) {
    throw new DecimalError("صيغة رقمية غير صحيحة: " + String(value), "DECIMAL_BAD_SYNTAX");
  }

  const sign = m[1] === "-" ? -1n : 1n;
  const intPart = m[2] || "0";
  const frac = m[3] || "";
  const kept = (frac + "000000").slice(0, MICRO_DECIMALS);
  const rest = frac.slice(MICRO_DECIMALS);

  let v = BigInt(intPart) * MICRO + BigInt(kept);
  if (rest && rest.charCodeAt(0) - 48 >= 5) v += 1n;
  return sign * v;
}

/** يحوّل ميكرو-دولار إلى نص عشري بلا أصفار زايدة. */
export function toDecimalString(micros) {
  if (typeof micros !== "bigint") {
    throw new DecimalError("المتوقّع BigInt ميكرو", "DECIMAL_EXPECTS_BIGINT");
  }
  const neg = micros < 0n;
  const v = neg ? -micros : micros;
  const int = v / MICRO;
  let frac = (v % MICRO).toString().padStart(MICRO_DECIMALS, "0");
  frac = frac.replace(/0+$/, "");
  return (neg ? "-" : "") + int.toString() + (frac ? "." + frac : "");
}

/**
 * يحوّل ميكرو-دولار إلى نص **عرض** بعدد خانات ثابت.
 * الفرق عن toDecimalString: ده بيفضل محتفظ بالأصفار — 11 تطلع "11.00".
 * ده للنص اللي بيتعرض للمستخدم، مش للحساب ولا للتخزين.
 */
export function toFixedString(micros, decimals, mode = "half-up") {
  if (typeof micros !== "bigint") {
    throw new DecimalError("المتوقّع BigInt ميكرو", "DECIMAL_EXPECTS_BIGINT");
  }
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > MICRO_DECIMALS) {
    throw new DecimalError(
      "عدد خانات العرض لازم يكون بين 0 و " + MICRO_DECIMALS,
      "DECIMAL_BAD_DECIMALS"
    );
  }
  const r = roundTo(micros, decimals, mode);
  const neg = r < 0n;
  const v = neg ? -r : r;
  const factor = 10n ** BigInt(MICRO_DECIMALS - decimals);
  const units = v / factor;
  let s = units.toString();
  if (decimals > 0) {
    s = s.padStart(decimals + 1, "0");
    s = s.slice(0, s.length - decimals) + "." + s.slice(s.length - decimals);
  }
  return (neg ? "-" : "") + s;
}

/** يحوّل ميكرو-دولار إلى Number (للعرض فقط — لا تستخدمه في الحساب). */
export function toNumber(micros) {
  return Number(toDecimalString(micros));
}

/** يقارن قيمتين ميكرو. */
export function compare(a, b) {
  return a === b ? 0 : a > b ? 1 : -1;
}

/** الأكبر. */
export function maxBig(a, b) {
  return a > b ? a : b;
}

/** الأصغر. */
export function minBig(a, b) {
  return a < b ? a : b;
}

/* --------------------------------------------------------------------------
   الحساب
   -------------------------------------------------------------------------- */

/** قسمة مع تقريب نص-لأعلى (بعيدًا عن الصفر). */
export function divRoundHalfUp(numerator, denominator) {
  if (denominator === 0n) throw new DecimalError("قسمة على صفر", "DECIMAL_DIV_BY_ZERO");
  const neg = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  let q = n / d;
  if ((n % d) * 2n >= d) q += 1n;
  return neg ? -q : q;
}

/**
 * نسبة مئوية من مبلغ ميكرو بأقصى دقة ممكنة.
 * مثال: percentOf(toMicros("30.01"), "15") === toMicros("4.5015")
 */
export function percentOf(micros, percent) {
  const p = toMicros(percent);
  // micros * (p / 1e6) / 100  =  micros * p / (1e8)
  return divRoundHalfUp(micros * p, 100n * MICRO);
}

/**
 * تقريب مبلغ ميكرو لعدد خانات محدّد.
 * ملاحظة: floor/ceil هنا متماثلين حوالين الصفر (بعيدًا عن الصفر)،
 * وده مقصود عشان الفواتير السالبة (الاسترداد) تتعامل بنفس العدالة.
 */
export function roundTo(micros, decimals, mode = "half-up") {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > MICRO_DECIMALS) {
    throw new DecimalError(
      "عدد خانات التقريب لازم يكون بين 0 و " + MICRO_DECIMALS,
      "DECIMAL_BAD_DECIMALS"
    );
  }
  if (!ROUNDING_MODES.includes(mode)) {
    throw new DecimalError("وضع تقريب غير معروف: " + mode, "DECIMAL_BAD_MODE");
  }

  const neg = micros < 0n;
  const v = neg ? -micros : micros;
  const factor = 10n ** BigInt(MICRO_DECIMALS - decimals);
  const q = v / factor;
  const r = v % factor;

  let out = q;
  if (mode === "half-up") {
    if (r * 2n >= factor) out = q + 1n;
  } else if (mode === "ceil") {
    if (r > 0n) out = q + 1n;
  } else if (mode === "half-even") {
    if (r * 2n > factor) out = q + 1n;
    else if (r * 2n === factor) out = q % 2n === 0n ? q : q + 1n;
  }
  // floor: لا حاجة لتعديل

  out *= factor;
  return neg ? -out : out;
}
