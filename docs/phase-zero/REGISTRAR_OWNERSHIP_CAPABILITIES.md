# قدرات الملكية لدى المزوّدين — Migo Domains

**النقطة المحورية:** كل دومين يُباع من Migo لازم يُسجَّل ببيانات **المالك الفعلي (العميل)**، مش ببيانات Migo. أي مزوّد مش بيدعم ده، **مايُستخدمش** كخيار تسجيل إنتاجي.

> **المزوّد المعتمد (قرار C، 8 نوفمبر 2026):** **Openprovider** هو المزوّد الأساسي للتصميم والتكامل المستقبلي. الاختيار **معماري**؛ **فتح الحساب/العضوية/أي رسوم = موافقة منفصلة**، والإثبات التشغيلي على Openprovider **لسه NOT RUN**.

## السؤال الواحد المطلوب إجابته

هل المزوّد يسمح للموزّع يمرّر **Registrant Contact مختلف لكل دومين** من نفس الحساب، ويكون هو المالك الرسمي؟

| المزوّد | الجواب | الدليل الرسمي | التقييم |
|---|---|---|---|
| **OpenSRS** | **نعم** | فورم التسجيل/النقل يحمل Owner/Admin/Billing/Tech منفصلة لكل دومين، مع إنشاء بروفايل مستخدم لكل عميل (support.opensrs.com: Register، Contacts، COR) | **VERIFIED** |
| **Openprovider** | **نعم** | `owner_handle` (المسجّل) يُحدَّد لكل دومين على حدة، مستقلاً عن admin/tech/billing (docs.openprovider.com: Register a domain) | **VERIFIED** |
| **Namecheap** | **نعم** | `RegistrantFirstName … RegistrantEmail` بارامترات مستقلة في `domains.create` و`domains.setContacts` (namecheap.com/support/api/methods/domains/create، /set-contacts) | **VERIFIED** |
| **Cloudflare Registrar** | **نعم (بيانات المالك)** | `POST /accounts/{account_id}/registrar/registrations` يقبل `contacts.registrant` مخصّص داخل الطلب (كل الامتدادات المدعومة حاليًا تطلب `contacts.registrant`). **القيد مش في بيانات المالك**: التجديد وتحديث الاتصالات **مش عبر API**، و**Transfer-out غير موجود ضمن الـ API المُراجَع**، و**Transfer-in** مدعوم بقيود (من 30 سبتمبر 2026) | **VERIFIED** (الدعم) · قيود API منفصلة |

## الأدلة الرسمية (روابط مباشرة، تاريخ المراجعة 2026-11-08)

| المزوّد | الدليل المباشر |
|---|---|
| **OpenSRS** | فورم التسجيل يحمل **Owner** / Administrator / Billing / Technical منفصلة لكل دومين: https://support.opensrs.com/support/solutions/articles/201000063408-opensrs-quickstart-guide · Horizon Sandbox بـ$5,000 رصيد اختبار: https://support.opensrs.com/support/solutions/articles/201000063061-horizon-test-system-accounts |
| **Openprovider** | `createDomainRequest`/`POST /domains` بـ`owner_handle` = «handle of the customer who will be the domain owner»: https://developer.openprovider.com/xml-api-reference.html?group=Domain · https://support.openprovider.eu/hc/en-us/articles/360025090374-13-Domains-API-How-to-create-a-domain |
| **Namecheap** | `namecheap.domains.create` فيه `RegistrantFirstName … RegistrantEmail` حقولًا مستقلة: https://www.namecheap.com/support/api/methods/domains/create/ · تعديل الاتصال: https://www.namecheap.com/support/api/methods/domains/set-contacts/ |
| **Cloudflare** | تمرير `contacts.registrant` **في التسجيل**: https://developers.cloudflare.com/api/resources/registrar/subresources/registrations/methods/create/ · تمرير `contacts.registrant` + `auth_code` **في النقل**: https://developers.cloudflare.com/api/resources/registrar/subresources/transfer_in/methods/create/ · **قيود API الحالية**: التجديد وتحديث الاتصال **مش عبر API**، و**Transfer-out غير موجود ضمن الـ API المُراجَع** (داشبورد). **Transfer-in مدعوم بقيود** من 30 سبتمبر 2026: https://developers.cloudflare.com/changelog/post/2026-09-30-registrar-transfer-api-beta/ |

> **مفيش اختبار Sandbox فعلي اتعمل** (مفيش حسابات، والإنترنت مقفول من بيئة التشغيل). الدليل الحالي = توثيق رسمي مباشر فقط.

### تمييز إلزامي: «وجود حقول الاتصال» ≠ «إثبات تسجيل متعدد لعملاء من حساب واحد»

| السؤال | ما تم إثباته | الحالة |
|---|---|---|
| هل حقول بيانات المالك (Owner/Registrant) **موجودة** في التوثيق؟ | نعم عند الأربعة | **DOCUMENTED** |
| هل ثبت **عمليًا** إن حساب موزّع واحد يسجّل دومينات لعملاء مختلفين ببيانات مالك مختلفة؟ | **لأ** — مفيش Sandbox/عملية حقيقية | **NOT RUN** |
| هل الأهلية الإنتاجية متحققة؟ | **لأ** — Namecheap فيها بوابة أهلية، والباقي يحتاج حساب | **APPROVAL REQUIRED** |

**الخلاصة:** التوثيق يثبت **وجود الحقول**، لكنه **لا يثبت** القدرة التشغيلية الفعلية على تسجيل متعدد لعملاء من حساب موزّع واحد. ده محتاج **اختبار Sandbox حقيقي** بعد فتح حساب (موافقة صريحة).

### تمييز إلزامي (Cloudflare): «Default Address Book» ≠ «تمرير المالك عبر API»

| المسار | الآلية | عبر API؟ | ملاحظة |
|---|---|---|---|
| **Default Address Book** | جهة اتصال **افتراضية واحدة** للحساب، تُستخدم لما الطلب ميبعتش `registrant` | ❌ **الداشبورد فقط** («address book entries تُدار من الداشبورد حاليًا») | مش بديل عن تمرير مالك مختلف لكل عميل |
| **تمرير المالك inline** | `contacts.registrant` **داخل كل طلب** (تسجيل أو نقل) | ✅ **مدعوم عبر API** | ده اللي يسمح بمالك مختلف **لكل دومين** من نفس الحساب |

> **مهم:** Default Address Book هو **احتياطي**، مش طريق الملكية. الملكية الفعلية لكل عميل بتيجي من **تمرير `contacts.registrant` لكل دومين**. ولو التمرير غاب، الطلب يرجع خطأ لو مفيش Default Address Book («No registrant contact provided and no default address book entry found»).

## الفروق المهمة

- **Reseller Account ≠ Registrant Contact.** حساب Migo هو حساب الموزّع؛ بيانات المالك حقل منفصل يُمرَّر لكل دومين. **ممنوع** استخدام بيانات Migo كبيانات مالك.
- **Cloudflare:** **يقبل registrant مختلف لكل دومين عبر API** (مدعوم). لكنه **مش مناسب كمنصة بيع**: التجديد و**Transfer-out** وتحديث الاتصالات **غير متاحة عبر الـ API المُراجَع** (الداشبورد فقط)، و**Transfer-in** بقيود بس، والـ API بيتا لامتدادات محدودة، وإلزامي NS تبع Cloudflare، ومفيش نموذج multi-tenant/registrar-as-a-service بعد (قيد نموذج البيع، **مش** قيد على بيانات المالك).
- **Namecheap:** يقبل المالك المختلف، لكن **EPP/Auth Code غير متاح عبر API** (قيود على النقل الخارجي)، والـ API XML فقط. **تنبيه إضافي:** التوفر الإنتاجي للـ API **مشروط** (≥20 دومين أو ≥$50 رصيد أو ≥$50 مصروف سنتين + IP whitelist)، وبالتالي **وجود حقول Registrant وحده مش إثبات كافٍ لأهلية الإنتاج**. راجع سؤال 7 في `PHASE_ZERO_FINAL_AUDIT.md`.
- **OpenSRS:** الأكمل وظيفيًا (EPP، قفل، DNS، COR)، لكن **رسوم التفعيل غير منشورة** ومحتاجة حساب.
- **Openprovider:** الأوضح توثيقًا (REST، `owner_handle`، authcode)، مع عضويات مدفوعة.

## القدرات المطلوبة لدورة الحياة (كلها موثّقة)

| القدرة | OpenSRS | Openprovider | Namecheap |
|---|---|---|---|
| تسجيل ببيانات مالك مختلفة | ✅ | ✅ | ✅ |
| تعديل بيانات المالك بعد التسجيل | ✅ (COR) | ✅ (أو trade) | ✅ |
| EPP/Auth Code عبر API | ✅ | ✅ | ❌ |
| قفل/فتح عبر API | ✅ | ✅ | ✅ |
| Nameservers | ✅ | ✅ | ✅ |
| إدارة DNS | ✅ | ✅ | ✅ |
| نقل بين عملاء | ⚠️ (push مُعطّل افتراضيًا) | ✅ (owner_handle) | ✅ (UI) |
| نقل خارجي | ✅ | ✅ | ✅ |

## شرط القبول

- [x] توثيق دعم بيانات مالك مختلفة لكل عميل عند **أربعة** مزوّدين (**DOCUMENTED**).
- [x] اختيار المزوّد الأساسي = **Openprovider** (**قرار C معتمد**، 8 نوفمبر 2026).
- [ ] إثباتها **عمليًا** على **Openprovider** (Sandbox) — **NOT RUN** (محتاج فتح حساب = موافقة منفصلة).

**الوضع الموحّد (مطابق لـ `PHASE_ZERO_STATUS.md`): DOCUMENTED (الحقول) · NOT RUN (تشغيليًا) · APPROVAL REQUIRED (فتح حساب Sandbox لدى Openprovider).**
