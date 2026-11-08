# دورة حياة الدومين — Migo Domains

**الوحدة: Domain Lifecycle Engine.** الحالات والانتقالات المنطقية فقط.

## الحالات

```
AVAILABLE → QUOTED → PAYMENT_PENDING → PAID
   → REGISTRATION_PENDING → REGISTRATION_PROCESSING
   → REGISTERED → VERIFICATION_PENDING → ACTIVE
   ↘ REGISTRATION_FAILED → MANUAL_REVIEW

ACTIVE → RENEWAL_PENDING → RENEWED → ACTIVE
                        ↘ RENEWAL_FAILED → MANUAL_REVIEW
ACTIVE → EXPIRED → REDEMPTION_PERIOD → PENDING_DELETE

ACTIVE → TRANSFER_REQUESTED → TRANSFER_PENDING → TRANSFER_COMPLETED
                                              ↘ TRANSFER_FAILED → MANUAL_REVIEW
أي حالة غير مؤكدة → MANUAL_REVIEW
```

> **`TRANSFER_LOCKED` و`TRANSFER_ELIGIBLE` مش حالات دورة حياة** — دول **نتيجة حساب** من قواعد النقل (تفصيلها تحت). الدومين يفضل **`ACTIVE`** وقت ما تكون أهليته محسوبة، ومفيش حالة «بديلة» عن ACTIVE بسبب القفل.

## قواعد الانتقال

| من | إلى | مسموح؟ |
|---|---|---|
| AVAILABLE | QUOTED | ✅ |
| QUOTED | PAYMENT_PENDING | ✅ (بعد تثبيت السعر) |
| PAYMENT_PENDING | PAID | ✅ (بعد Webhook موثوق) |
| PAID | REGISTRATION_PENDING | ✅ |
| REGISTRATION_PENDING | REGISTRATION_PROCESSING | ✅ |
| REGISTRATION_PROCESSING | REGISTERED | ✅ (بعد إثبات المزوّد) |
| REGISTRATION_PROCESSING | REGISTRATION_FAILED | ✅ |
| REGISTERED | VERIFICATION_PENDING | ✅ |
| VERIFICATION_PENDING | ACTIVE | ✅ |
| أي حالة | MANUAL_REVIEW | ✅ (عند عدم اليقين) |
| PAID | REGISTERED | ❌ **ممنوع** — لازم مرور REGISTRATION_* |
| REGISTRATION_FAILED | REGISTERED | ❌ **ممنوع** بدون إثبات التسجيل |
| EXPIRED | ACTIVE | ❌ بدون تجديد مؤكد |

**ممنوع أي انتقال غير منطقي.** الانتقالات تُنفَّذ عبر جدول مسموح ومُدقّق.

## فصل إلزامي: Domain Status ≠ Transfer Eligibility

**`TRANSFER_LOCKED` و`TRANSFER_ELIGIBLE` مش حالات دورة حياة** — دول **نتيجة حساب (derived)** بتتحسب لحظيًا من قواعد النقل، مش بديل عن حالة الدومين. الخلط بينهم غلط في التصميم.

| المفهوم | إيه هو؟ | المصدر |
|---|---|---|
| **Domain Status** (حالة الدومين) | حالة دورة الحياة/السجل الرسمي: `ACTIVE` · `EXPIRED` · `REDEMPTION_PERIOD` · `PENDING_DELETE` · أو حالة قفل من الـ registry/registrar (زي `clientTransferProhibited` · `serverHold`) | دورة حياة Migo + WHOIS/RDAP |
| **Transfer Eligibility** (أهلية النقل) | **دالة محسوبة** (boolean + سبب) من: **60 يوم** من التسجيل/آخر نقل · **حالة القفل** (`clientTransferProhibited`) · **DNSSEC نشط** · حالة `redemptionPeriod`/`pendingDelete`/`clientHold` · **موافقة العميل** (FOA) · **Auth Code صالح** | قواعد ICANN/الامتداد + المزوّد |

**قاعدة:** الأهلية **تُحسب** من الحالة والقواعد، ومش تُخزَّن كحالة أساسية. تتخزّن كـ **snapshot + سبب** وقت الطلب لأغراض التدقيق.

## دورة التجديد: حالات النجاح والفشل

| المسار | الحالة | ملاحظة |
|---|---|---|
| **نجاح** | `RENEWAL_PENDING → PAID → RENEWED → ACTIVE` (تاريخ الانتهاء يزيد، غالبًا +سنة) | يُؤكَّد من رد المزوّد، مش من الدفع لوحده |
| **فشل دفع** | `RENEWAL_PENDING → PAYMENT_FAILED → RENEWAL_RETRY → (PAID / MANUAL_REVIEW)` | لا تجديد بدون دفع مؤكد |
| **فشل تجديد عند المزوّد** | `PAID → RENEWAL_PROCESSING → RENEWAL_FAILED → MANUAL_REVIEW` | **مهم:** الدفع نجح والتجديد فشل → **ممنوع** اعتبار الدومين متجدد أو سحب دون مراجعة |
| **انتهاء بلا تجديد** | `ACTIVE → RENEWAL_PENDING → EXPIRED → REDEMPTION_PERIOD → PENDING_DELETE` | كل مرحلة لها نافذة زمنية وقواعد استعادة |
| **الاسترداد** | `REDEMPTION_PERIOD → RESTORED → ACTIVE` (رسوم استرداد + تجديد) | يتطلب تجديد مؤكد؛ **ممنوع** `PENDING_DELETE → ACTIVE` |

**ممنوع** أي ادّعاء تجديد ناجح قبل إثبات المزوّد. وأي فشل تجديد يمر على `MANUAL_REVIEW` قبل أي إجراء تجاه العميل.

## العمليات المنفصلة (لكل واحدة API وحالة وموافقات وسجل تدقيق مستقل)

| العملية | الوصف |
|---|---|
| **Change of Registrant** | تغيير المالك الرسمي (يمرّ عبر COR لدى المزوّد) |
| **Internal Account Push** | نقل الدومين بين عميلين داخل حساب Migo |
| **External Registrar Transfer** | نقل إلى registrar آخر |
| **Nameserver Update** | تغيير الـ NS |
| **DNS Zone Migration** | نقل الـ zone |

> النقل بين حسابات العملاء **ليس** نقلًا خارجيًا بين شركات التسجيل.

## مسارات العمليات: الانتقالات المسموحة والممنوعة

| العملية | من | إلى | مسموح؟ | شرط الانتقال |
|---|---|---|---|---|
| **Change of Registrant (COR)** | ACTIVE | COR_PENDING → COR_APPROVED → ACTIVE | ✅ | موافقة الطرفين (قديم/جديد) + سجل تدقيق؛ يفعّل قفل 60 يوم (قابل للتجنّب باختيار المالك في Cloudflare) |
| **Change of Registrant (COR)** | TRANSFER_PENDING / EXPIRED | أي | ❌ | ممنوع أثناء نقل جارٍ أو دومين منتهي |
| **Internal Account Push** | ACTIVE | PUSH_PENDING → ACTIVE (مالك جديد) | ✅ | العميلان داخل Migo؛ بلا نقل بين registrars؛ قد يكون مُعطّلًا افتراضيًا عند المزوّد ويحتاج تفعيل |
| **External Transfer-in** | ACTIVE | TRANSFER_REQUESTED → TRANSFER_PENDING → TRANSFER_COMPLETED | ✅ | **أهلية محسوبة = true** (بلا قفل، DNSSEC مقفول، مرّت 60 يوم، Zone موجود/Active) |
| **External Transfer-in** | TRANSFER_PENDING | TRANSFER_FAILED | ✅ | رفض/انتهاء/خطأ مزوّد → MANUAL_REVIEW |
| **External Transfer-out** | ACTIVE | TRANSFER_REQUESTED → TRANSFER_PENDING → TRANSFERRED_OUT | ✅ | Auth Code يُعرض لصاحب الدومين فقط؛ متابعة الحالة |
| **أي نقل خارجي** | — | — | ❌ | ممنوع مع قفل `clientTransferProhibited`، أو DNSSEC نشط، أو داخل 60 يوم، أو حالة `redemptionPeriod`/`pendingDelete` |

> **قاعدة:** الأهلية **تُحسب** (بلا قفل + DNSSEC مقفول + مرور 60 يوم + Zone)، ومش حالة أساسية. لو الأهلية false ⇒ الطلب يرفض مع سبب واضح، والدومين يفضل `ACTIVE`.

## دورة النقل الخارجي (10 خطوات)

1. العميل يقدم طلب النقل.
2. النظام يتحقق من أهلية الدومين.
3. التحقق من قيود 60 يومًا حسب الامتداد والمزوّد.
4. التحقق من حالة القفل.
5. طلب موافقة العميل.
6. توفير Auth Code / EPP عبر قناة آمنة.
7. العميل يبدأ النقل لدى الـ registrar الجديد.
8. متابعة حالة النقل.
9. تأكيد اكتمال النقل.
10. تحديث حالة الدومين وسجلاته.

**ممنوع** عرض رمز النقل في روابط عامة أو سجلات غير محمية.
