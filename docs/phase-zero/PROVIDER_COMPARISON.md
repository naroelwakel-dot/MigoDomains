# مقارنة المزوّدين — Migo Domains

**تاريخ الاطلاع: 8 نوفمبر 2026.** كل بند من **توثيق رسمي فقط**. مفيش أي مزوّد اتفتح له حساب، ومفيش أي رسوم اتدفعت.

## درجات التحقق

| الدرجة | المعنى |
|---|---|
| **VERIFIED** | منشور صراحةً في التوثيق الرسمي |
| **PARTIALLY VERIFIED** | موصوف عمومًا أو ناقص تفصيلًا |
| **NOT DOCUMENTED** | غير منشور |
| **REQUIRES ACCOUNT ACCESS** | يحتاج دخول حساب لقراءته |

> **تنبيه:** **VERIFIED = موثّق رسميًا، مش مختبر عمليًا.** مفيش أي Sandbox اشتغل، فمفيش ميزة واحدة تتقال عليها «مختبرة». أي ادّعاء تشغيلي = `NOT RUN` لحد اختبار Sandbox فعلي بعد فتح حساب (موافقة).

---

## المصفوفة الحاسمة (البند 14 هو الأهم)

| البند | OpenSRS | Openprovider | Namecheap | Cloudflare Registrar |
|---|---|---|---|---|
| **Reseller program** | ✅ برنامج موزّعين حقيقي | ✅ منصة جملة للموزّعين | ❌ لا يوجد («you can resell using our API») | ❌ غير متاح (قيد التطوير) |
| **شروط الانضمام** | تسجيل ذاتي، بلا حد أدنى للحجم | تسجيل مجاني بلا اشتراك إلزامي | ≥20 دومين أو ≥$50 رصيد أو ≥$50 مصروف سنتين + IP whitelist | حساب + billing + جهة اتصال + اتفاقية التسجيل |
| **رسوم فتح الحساب** | **$95 مرة واحدة، غير قابلة للاسترداد** (VERIFIED) — **لم تُدفع** | مجاني (VERIFIED) | مجاني (VERIFIED) | لا رسوم فتح موثّقة |
| **الحد الأدنى للإيداع** | رصيد للتمويل (بعد تفعيل $95) | لا حد عام موثّق؛ wire min €1,000 (PARTIALLY) | $5 بطاقة / $1 PayPal (VERIFIED) | لا نموذج محفظة (VERIFIED) |
| **نمط الـ API** | XML (OPS_envelope/XCP على منفذ 55443) | REST + XML | **XML فقط** | REST فقط |
| **Sandbox / Test** | ✅ Horizon (رصيد اختبار $5,000) | ✅ sandbox كامل | ✅ sandbox منفصل | ✅ Registrar Sandbox (.com/.net فقط) |
| **14 — Registrant مختلف لكل دومين** | ✅ **نعم** (Owner/Admin/Billing/Tech لكل دومين) | ✅ **نعم** (`owner_handle` لكل دومين) | ✅ **نعم** (Registrant* في create/setContacts) | ✅ **نعم** — يُمرَّر `contacts.registrant` مخصّص داخل طلب التسجيل |
| **15 — إدارة بيانات المالك** | ✅ + COR بموافقة الطرفين | ✅ أو أمر trade | ✅ setContacts + إيميلات ICANN | Dashboard فقط (**مش عبر API**)؛ تغيير الاسم/المنظمة/الإيميل يفعّل قفل 60 يوم **قابل للتجنّب** باختيار المالك الحالي أثناء الموافقة |
| **16 — EPP/Auth Code** | ✅ عرض/إرسال + `send_authcode` | ✅ GET/POST authcode | ⚠️ **غير متاح عبر API** (داشبورد فقط) | ✅ داشبورد فقط |
| **17 — قفل/فتح** | ✅ فردي وجماعي | ✅ is_locked/is_lockable | ✅ setRegistrarLock | داشبورد فقط |
| **18 — Nameservers** | ✅ | ✅ | ✅ | ❌ **إلزامي Cloudflare NS** |
| **19 — إدارة DNS** | ✅ Managed DNS مجاني | ✅ أساسي مجاني + Premium مدفوع | ✅ FreeDNS مجاني + PremiumDNS مدفوع | ✅ Cloudflare DNS مجاني |
| **20 — نقل بين حسابات العملاء** | Push بين حسابي reseller، **مُعطّل افتراضيًا** | غيّر `owner_handle` (أو نقل داخلي بين resellers) | Change Ownership (داشبورد) | Move بين حسابات Cloudflare (داشبورد) |
| **21 — نقل خارجي** | ✅ | ✅ | ✅ (تحويل وارد عبر API محدود) | ⚠️ **Transfer-in مدعوم عبر API بقيود (منذ 30 سبتمبر 2026)** · **Transfer-out منفصل** (داشبورد + Auth Code) |
| **22 — قواعد النقل** | 60 يوم بعد التسجيل/النقل/COR | 60 يوم (ICANN) + FOA | 60 يوم (التحويل الداخلي معفى) | 60 يوم + RGP 30 |
| **24 — الاسترداد عند الفشل** | المبالغ المحجوزة تُعاد **كرصيد**، والإيداع غير قابل للسحب | تُضاف **كرصيد** | استرداد تقديري خلال 5 أيام؛ Premium غير قابل | التسجيل الناجح غير قابل؛ الفشل لا يُخصم |

**المصادر:** OpenSRS: opensrs.com/domains/pricing · opensrs.com/api/overview · opensrs.com/join · support.opensrs.com (Quickstart، Pricing Structure، Payment Terms). Openprovider: docs.openprovider.com · openprovider.help · support.openprovider.eu · openprovider.com/domain-registration-prices. Namecheap: namecheap.com/support/api/intro · knowledgebase/9739/63 (API FAQ) · /527/7 (funds) · /1187/46 (change ownership) · /258/84 (transfer out). Cloudflare: developers.cloudflare.com/registrar/registrar-api/ · developers.cloudflare.com/api/resources/registrar/ · blog.cloudflare.com/registrar-api-beta.

---

## OpenSRS / Tucows — الجدول الكامل (25 بندًا)

| # | البند | القيمة | المصدر | التقييم |
|---|---|---|---|---|
| 1 | شروط الانضمام | تسجيل ذاتي، تأكيد إيميل، لا حد أدنى للحجم؛ الموزّع مسؤول عن علاقة العميل ودعمه | opensrs.com/join · opensrs.com/api/overview | VERIFIED |
| 2 | رسوم فتح الحساب | **$95 مرة واحدة، غير قابلة للاسترداد** (activation fee) | support.opensrs.com (Quickstart · Horizon) | VERIFIED |
| 3 | الحد الأدنى للإيداع | رصيد عند التمويل الأول؛ حدود شحن يومية غير منشورة | opensrs.com/join · support.opensrs.com (Balance) | PARTIALLY |
| 4 | رسوم الإيداع | 3% كارت/PayPal (4% من 1 ديسمبر 2026)؛ ACH بلا رسوم | support.opensrs.com (Deposit Fee) | VERIFIED |
| 5 | أسعار التسجيل | جدول لكل TLD، Essential: .com $15.25، .net $16.50، .org $16، .io $60، 730+ امتداد | opensrs.com/domains/pricing | VERIFIED |
| 6 | أسعار التجديد | عمود Renew؛ .com $15.25؛ Premium تُجدّد يدويًا | opensrs.com/domains/pricing | VERIFIED |
| 7 | أسعار النقل | عمود Transfer؛ .com $15.25؛ بعض الامتدادات $0.00؛ النقل يضيف سنة | opensrs.com/domains/pricing | VERIFIED |
| 8 | رسوم الخصوصية | Contact Privacy = $3/سنة/دومين | opensrs.com/domains/pricing | VERIFIED |
| 9 | رسوم DNS | Managed DNS مجاني مع كل دومين | opensrs.com/domains/pricing | VERIFIED |
| 10 | Premium Domains | مدعوم (3 مجموعات تسعير)، التجديد يدوي | support.opensrs.com | VERIFIED |
| 11 | نمط الـ API | XML (XCP/OPS_envelope، منفذ 55443) | opensrs.com/api/overview | VERIFIED |
| 12 | Sandbox | Horizon، رصيد اختبار $5,000، بلا IP whitelist | support.opensrs.com | VERIFIED |
| 13 | دومينات لعملاء مختلفين | نعم، عدد غير محدود، بروفايل MWI لكل عميل | support.opensrs.com | VERIFIED |
| 14 | **Registrant مختلف لكل دومين** | **نعم** — Owner/Admin/Billing/Tech لكل دومين | support.opensrs.com (Register/Contacts/COR) | VERIFIED |
| 15 | إدارة بيانات المالك | نعم؛ الاسم/الإيميل يفعّل COR بموافقة الطرفين (7 أيام) | support.opensrs.com | VERIFIED |
| 16 | EPP/Auth Code | نعم: RCP/MWI + `send_authcode` | support.opensrs.com | VERIFIED |
| 17 | قفل/فتح | نعم، فردي وجماعي؛ ليست كل TLDs تدعم القفل | support.opensrs.com | VERIFIED |
| 18 | Nameservers | SystemDNS الافتراضية أو خاصة (حد أدنى 2) | support.opensrs.com | VERIFIED |
| 19 | إدارة DNS | Managed DNS (A/AAAA/CNAME/MX/SRV/TXT) + قوالب | support.opensrs.com | VERIFIED |
| 20 | نقل بين الحسابات | Push بين حسابي reseller، **مُعطّل افتراضيًا** ويُفعّل بطلب دعم | support.opensrs.com | PARTIALLY |
| 21 | نقل خارجي | نعم، عملية موصوفة كاملة | support.opensrs.com | VERIFIED |
| 22 | قيود النقل | >60 يوم من التسجيل/آخر نقل؛ قفل 60 يوم بعد COR | support.opensrs.com | VERIFIED |
| 23 | gTLD + ccTLD | نعم، 730+ | opensrs.com/domains/pricing | VERIFIED |
| 24 | الاسترداد عند الفشل | البنود الفاشلة «never captured» وتُعاد كرصيد؛ الإيداع غير قابل للسحب؛ Premium غير قابل للاسترداد | support.opensrs.com | PARTIALLY |
| 25 | الدعم | تذكرة + شات + صفحة حالة؛ لا SLA منشور | support.opensrs.com | PARTIALLY |

---

## Openprovider — الجدول الكامل (25 بندًا)

| # | البند | القيمة | المصدر | التقييم |
|---|---|---|---|---|
| 1 | شروط الانضمام | تسجيل مجاني بلا التزامات (اسم + إيميل + عملة + دولة) | support.openprovider.eu | VERIFIED |
| 2 | رسوم الفتح | مجاني | openprovider.com | VERIFIED |
| 3 | الحد الأدنى للإيداع | لا حد عام؛ wire min €1,000 | openprovider.help (payment methods) | PARTIALLY |
| 4 | رسوم الإيداع | حسب الطريقة؛ عملات رقمية 2%؛ iDEAL/Wero بلا رسوم | openprovider.help | PARTIALLY |
| 5 | أسعار التسجيل | 1,200+ امتداد؛ .com $12.17/$11.17 (غير عضو/عضو) | openprovider.com/domain-registration-prices | PARTIALLY |
| 6 | أسعار التجديد | عمود Renewal؛ التجديدات غير قابلة للاسترداد | openprovider.com | PARTIALLY |
| 7 | أسعار النقل | عمود Transfer؛ النقل الداخلي بين حسابات مجاني عادةً | openprovider.help | PARTIALLY |
| 8 | الخصوصية | WHOIS Privacy مجاني للأعضاء | openprovider.com | VERIFIED |
| 9 | DNS | أساسي مجاني (3 NS)؛ Premium $6.49/$8.99 سنويًا | openprovider.com | VERIFIED |
| 10 | Premium Domains | مدعوم (is_premium + خدمة شراء) | docs.openprovider.com | VERIFIED |
| 11 | نمط الـ API | REST + XML | docs.openprovider.com | VERIFIED |
| 12 | Sandbox | sandbox كامل (لا يدعم النقل، ليس كل الامتدادات) | openprovider.help | VERIFIED |
| 13 | دومينات لعملاء مختلفين | نعم، customer handle لكل عميل | docs.openprovider.com | VERIFIED |
| 14 | **Registrant مختلف لكل دومين** | **نعم** — `owner_handle` لكل دومين | docs.openprovider.com | VERIFIED |
| 15 | إدارة بيانات المالك | نعم؛ لو `modify_owner_allowed=false` يلزم أمر trade | docs.openprovider.com | VERIFIED |
| 16 | EPP/Auth Code | نعم: `GET/POST /domains/{id}/authcode` | docs.openprovider.com | VERIFIED |
| 17 | قفل/فتح | نعم: is_locked/is_lockable | docs.openprovider.com | VERIFIED |
| 18 | Nameservers | نعم: name_servers / ns_group | docs.openprovider.com | VERIFIED |
| 19 | إدارة DNS | نعم: zones/records/templates | docs.openprovider.com | VERIFIED |
| 20 | نقل بين العملاء | غيّر `owner_handle`؛ النقل الداخلي بين resellers (رسم €80 للنقل الجماعي الموقّع) | openprovider.help | VERIFIED (بين resellers) |
| 21 | نقل خارجي | نعم عبر auth code | docs.openprovider.com | VERIFIED |
| 22 | قيود النقل | 60 يوم + FOA عند نقل gTLD | openprovider.com | VERIFIED |
| 23 | gTLD + ccTLD | نعم، 1,200+ | openprovider.com | VERIFIED |
| 24 | الاسترداد عند الفشل | المدفوعات المسبقة لغير المُسجَّل تُضاف كرصيد؛ لا استرداد للتسجيلات الناجحة | openprovider.com/legal | VERIFIED |
| 25 | الدعم | تذاكر + بريد، اثنين–جمعة 4:30–18:00 CET؛ لا SLA رقمي | openprovider.com | PARTIALLY |

---

## Namecheap — الجدول الكامل (25 بندًا)

| # | البند | القيمة | المصدر | التقييم |
|---|---|---|---|---|
| 1 | شروط الانضمام | ≥20 دومين أو ≥$50 رصيد أو ≥$50 مصروف سنتين + IP whitelist | knowledgebase/9739/63 | VERIFIED |
| 2 | رسوم الفتح | مجاني؛ لا رسوم API | knowledgebase/9739/63 | VERIFIED |
| 3 | الحد الأدنى للإيداع | $5 بطاقة/PayPal، $1 عملات رقمية | knowledgebase/527/7 | VERIFIED |
| 4 | رسوم الإيداع | غير موثّقة | — | NOT DOCUMENTED |
| 5 | أسعار التسجيل | منشورة لكل TLD (.com $12.08 سنة أولى)؛ قابلة للسحب بـ getPricing | namecheap.com/domains | VERIFIED |
| 6 | أسعار التجديد | منشورة (.com $19.98/سنة) | namecheap.com/domains | VERIFIED |
| 7 | أسعار النقل | منشورة (.com $12.28/سنة) | namecheap.com/domains | VERIFIED |
| 8 | الخصوصية | WhoisGuard مجاني مدى الحياة (غير متاح لبعض الامتدادات) | namecheap.com/security | VERIFIED |
| 9 | DNS | FreeDNS مجاني؛ PremiumDNS $4.88/$9.98 سنويًا | namecheap.com/security | VERIFIED |
| 10 | Premium Domains | مدعوم (IsPremium) لكن التسعير التفصيلي غير موثّق | knowledgebase | PARTIALLY |
| 11 | نمط الـ API | **XML فقط** (لا REST/JSON) | api/intro | VERIFIED |
| 12 | Sandbox | sandbox.namecheap.com منفصل | api/intro | VERIFIED |
| 13 | دومينات لعملاء مختلفين | نعم؛ users.create لحسابات فرعية | api/intro | VERIFIED |
| 14 | **Registrant مختلف لكل دومين** | **نعم** — Registrant* في create/setContacts | /methods/domains/create/ · /set-contacts/ | VERIFIED |
| 15 | إدارة بيانات المالك | نعم getContacts/setContacts + إيميلات ICANN | /methods/domains/set-contacts/ | VERIFIED |
| 16 | EPP/Auth Code | **غير متاح عبر API** (داشبورد فقط، يُرسل لإيميل المالك) | knowledgebase/258/84 | VERIFIED (غير مدعوم) |
| 17 | قفل/فتح | نعم getRegistrarLock/setRegistrarLock | /methods/domains/set-registrar-lock/ | VERIFIED |
| 18 | Nameservers | نعم setCustom/setDefault + ns.create/delete/update | /methods/ | VERIFIED |
| 19 | إدارة DNS | نعم setHosts/getHosts (setHosts يستبدل كل السجلات) | /methods/ | VERIFIED |
| 20 | نقل بين العملاء | Change Ownership (داشبورد، مجانًا، بلا 60 يوم)؛ لا method في API | knowledgebase/1187/46 | VERIFIED (UI) |
| 21 | نقل خارجي | نعم؛ API يدعم التحويل **الوارد** فقط لامتدادات محدودة | knowledgebase/258/84 | VERIFIED |
| 22 | قيود النقل | 60 يوم؛ التحويل الداخلي معفى؛ تغيير المالك يتجاوز القفل | knowledgebase/1346/219 | VERIFIED |
| 23 | gTLD + ccTLD | تسجيل لكل الامتدادات مع Extended Attributes؛ التحويل الوارد محدود | /methods/domains/create/ | VERIFIED |
| 24 | الاسترداد عند الفشل | استرداد تقديري خلال 120 ساعة؛ Premium غير قابل؛ فشل النقل يُعاد كاملًا | refund-policy | VERIFIED |
| 25 | الدعم | 24/7 شات وتذاكر؛ لا SLA منشور | help-center | PARTIALLY |

---

## Cloudflare Registrar — الجدول الكامل (25 بندًا)

| # | البند | القيمة | المصدر | التقييم |
|---|---|---|---|---|
| 1 | شروط الانضمام | حساب + billing + جهة اتصال + اتفاقية؛ **إلزامي Cloudflare NS**؛ لا دعم IDN | registrar-api | VERIFIED |
| 2 | رسوم الفتح | غير موثّقة | — | NOT DOCUMENTED |
| 3 | الحد الأدنى للإيداع | لا نموذج محفظة | api/resources/registrar | NOT DOCUMENTED |
| 4 | الفواتير | خصم تلقائي من وسيلة الدفع؛ at-cost بلا markup | registrar-api | VERIFIED |
| 5 | أسعار التسجيل | at cost، تُرجع لحظيًا (.com 8.57، .dev 10.11) | registrar-api | VERIFIED |
| 6 | أسعار التجديد | at cost (renewal_cost)؛ تجديد تلقائي | renew-domains | VERIFIED |
| 7 | أسعار النقل | at cost؛ معظم النقل يضيف سنة؛ .uk/.nz بلا رسوم | faq | VERIFIED |
| 8 | الخصوصية | WHOIS redaction مجاني | whois-redaction | VERIFIED |
| 9 | DNS | Cloudflare DNS مجاني + DNSSEC | registrar | VERIFIED |
| 10 | Premium Domains | داشبورد نعم؛ **API beta لا يدعمها** | api/resources/registrar | PARTIALLY |
| 11 | نمط الـ API | REST فقط (v4، JSON) | registrar-api | VERIFIED |
| 12 | Sandbox | Registrar Sandbox API (.com/.net فقط) | registrar_sandbox | VERIFIED |
| 13 | **multi-tenant / registrar-as-a-service** | «غير متاح بعد» («aiming to launch it later this year») — **قيد على نموذج البيع، مش على تمرير بيانات المالك** | blog.cloudflare.com/registrar-api-beta | VERIFIED (كقيد، ميزة مستقبلية) |
| 13b | **دعم بيانات المالك (Registrant)** | **✅ مدعوم** — `POST /accounts/{account_id}/registrar/registrations` يقبل `contacts.registrant` مخصّص داخل الطلب، ولو مفيش يُستخدم Default Address Book (لو مش موجود يفشل التحقق) | https://developers.cloudflare.com/api/resources/registrar/subresources/registrations/methods/create/ (مراجعة 2026-11-08) | VERIFIED |
| 14 | Registrant مختلف لكل دومين | نعم — تمرير inline لكل تسجيل **ولكل نقل** (`contacts.registrant`) | https://developers.cloudflare.com/api/resources/registrar/subresources/registrations/methods/create/ · https://developers.cloudflare.com/api/resources/registrar/subresources/transfer_in/methods/create/ | VERIFIED |
| 15 | إدارة بيانات المالك | **Dashboard**: تحديث كامل. **API**: «Contact updates are not yet available». تغيير الاسم/المنظمة/الإيميل يفعّل Change of Registrant + قفل نقل 60 يوم، **يمكن تجنّبه** لو المالك الحالي اختار «منع القفل» وقت الموافقة | domain-contact-updates | VERIFIED (داشبورد) · قيد (API) |
| 16 | EPP/Auth Code (إدخاله في الداشبورد) | داشبورد فقط | registrar/troubleshooting | VERIFIED (داشبورد) |
| 17 | قفل/فتح | داشبورد فقط (أو عند المزوّد الحالي) | registrar/troubleshooting | VERIFIED (داشبورد) |
| 18 | Nameservers | **ممنوع مزوّد خارجي** | register-domain | VERIFIED |
| 19 | إدارة DNS | Cloudflare DNS مُضمَّن | registrar | VERIFIED |
| 20 | نقل بين حسابات | Move بين حسابات Cloudflare (داشبورد) | inter-account-transfer | VERIFIED (داشبورد) |
| 21a | **Transfer-in (نقل إلى Cloudflare) عبر API** | ✅ **SUPPORTED WITH RESTRICTIONS**. المسار الرسمي: `POST /accounts/{account_id}/registrar/registrations/{domain_name}/transfer-in`، ويرجّع **202 Accepted**؛ التتبّع عبر `GET /accounts/{account_id}/registrar/registrations/{domain_name}/transfer-in-status`. **حقول الطلب:** `auth_code` (مشفَّر **Base64 RFC 4648 §4**، مطلوب لكل الامتدادات **عدا `.uk`**)، و`contacts.registrant` (**اختياري** — كل الامتدادات المدعومة حاليًا تطلب `registrant` بس، وباقي الأدوار تُشتق منه)؛ **لو غاب `contacts.registrant` يُستخدم Default Address Book للحساب**. **متطلبات API:** Zone **موجود** للحساب، DNSSEC معطّل للـ Zone، ملف فواتير بوسيلة دفع افتراضية صالحة، الدومين مفتوح عند المزوّد الحالي. ⚠️ **تنبيه (تصحيح):** في **مسار الداشبورد** لازم الـ Zone تكون **Active** (تحديث الـ NS وانتظار التفعيل) قبل إدخال الـ Auth Code — «مجرّد وجود Zone» كفاية لمتطلب الـ API، لكن **Active شرط عملي قبل النقل**. **حالات الـ Workflow:** `pending` · `in_progress` · `action_required` · `blocked` · `succeeded` · `failed` (Polling على `links.self`). **الرسوم:** **قابلة للفوترة**، تُخصم عند **نجاح** النقل، و**غير قابلة للاسترداد** عند النجاح (امتدادات بتسعير نقل صفري زي `.uk` بلا خصم). **غير مدعوم حاليًا:** نقل **Premium Domains** عبر الـ API | https://developers.cloudflare.com/changelog/post/2026-09-30-registrar-transfer-api-beta/ · https://developers.cloudflare.com/api/resources/registrar/subresources/transfer_in/methods/create/ · https://developers.cloudflare.com/registrar/troubleshooting/ | **VERIFIED (بقيود)** |
| 21b | **Transfer-out (نقل من Cloudflare)** | ⚠️ **غير موجود ضمن واجهة Registrar API التي تم التحقق منها.** مفيش endpoint للنقل الخارجي في مرجع الـ API المُراجَع → النقل الخارجي لسه عبر **الداشبورد** + Auth Code عند الـ registrar الجديد. **مفيش ادّعاء بالاستحالة المطلقة**، ولو ظهر دليل رسمي أحدث نعيد التقييم. **مفيش ادّعاء بدعم الاتجاهين** | https://developers.cloudflare.com/registrar/troubleshooting/ | NOT FOUND IN VERIFIED API |
| 22 | قيود النقل | 60 يوم + RGP 30 يومًا | faq | VERIFIED |
| 23 | gTLD + ccTLD | 400+؛ **لا IDN** | top-level-domains | VERIFIED |
| 24 | الاسترداد عند الفشل | التسجيل الناجح غير قابل؛ الفشل لا يُخصم | faq | PARTIALLY |
| 25 | الدعم | غير موثّق (لا SLA) | faq | NOT DOCUMENTED |

---

---

## المصادر الرسمية وتاريخ المراجعة

**تاريخ المراجعة العام: 2026-11-08.** كل الاستنتاجات أعلاه من الصفحات الرسمية دي، ولم يُشغَّل أي اختبار Sandbox فعلي (مفيش حسابات، والإنترنت مقفول من بيئة التشغيل):

| المزوّد | صفحات رسمية | آخر مراجعة |
|---|---|---|
| OpenSRS | https://opensrs.com/api/overview · https://opensrs.com/domains/pricing · https://opensrs.com/join · https://support.opensrs.com/support/solutions/articles/201000063061-horizon-test-system-accounts · https://support.opensrs.com/support/solutions/articles/201000063408-opensrs-quickstart-guide | 2026-11-08 |
| Openprovider | https://docs.openprovider.com/ · https://developer.openprovider.com/xml-api-reference.html?group=Domain · https://support.openprovider.eu/hc/en-us/articles/360025090374-13-Domains-API-How-to-create-a-domain · https://www.openprovider.com/ | 2026-11-08 |
| Namecheap | https://www.namecheap.com/support/api/intro/ · https://www.namecheap.com/support/knowledgebase/article.aspx/9739/63/api-faq/ · https://www.namecheap.com/support/api/methods/domains/create/ | 2026-11-08 |
| Cloudflare | https://developers.cloudflare.com/registrar/registrar-api/ · https://developers.cloudflare.com/changelog/product/registrar/ · **https://developers.cloudflare.com/changelog/post/2026-09-30-registrar-transfer-api-beta/** · **https://developers.cloudflare.com/api/resources/registrar/subresources/transfer_in/methods/create/** · **https://developers.cloudflare.com/api/resources/registrar/subresources/transfer_in_status/methods/get/** · **https://developers.cloudflare.com/registrar/troubleshooting/** · https://developers.cloudflare.com/registrar/get-started/transfer-domain-to-cloudflare/ · https://developers.cloudflare.com/registrar/account-options/domain-contact-updates/ · https://developers.cloudflare.com/registrar/get-started/register-domain/ · https://developers.cloudflare.com/fundamentals/api/reference/deprecations/ · https://blog.cloudflare.com/simplifying-domains/ | 2026-11-08 |

> **آخر مراجعة لكل مصدر = 2026-11-08** (تاريخ هذه الجولة). المسارات والحالات في الجدول مأخوذة حرفيًا من صفحات المراجع الرسمية أعلاه.

## فصل إلزامي: متطلبات API مقابل متطلبات Dashboard

**ممنوع الخلط بينهما.** بعض الخطوات ليست في الـ API أصلًا؛ دي اللي مطلوبة في كل مسار على حدة:

| الخطوة | متاحة عبر **Registrar API**؟ | مطلوبة عبر **Dashboard**؟ |
|---|---|---|
| إنشاء الطلب والتحقق (`auth_code` Base64) | ✅ API | — |
| Polling لحالة النقل | ✅ API (status endpoint) | — |
| وجود Zone للحساب | ✅ API (zone API) | أو من الداشبورد |
| **Zone تكون Active** (تحديث NS + انتظار التفعيل) | ⚠️ **شرط عملي قبل النقل** (Dاشبورد/DNS) | ✅ مطلوب عمليًا |
| تعطيل DNSSEC | إعداد على الـ Zone | أو من الداشبورد |
| فتح القفل عند المزوّد الحالي | ❌ **عند المزوّد الحالي** (مش Cloudflare) | — |
| إعداد/تعديل **Default Address Book** (Registrant افتراضي) | ❌ **الداشبورد فقط** — «address book entries تُدار من الداشبورد حاليًا» | ✅ مطلوب للافتراضي |
| **تمرير مالك مختلف لكل دومين inline** (`contacts.registrant`) | ✅ **مدعوم عبر API لكل دومين على حدة** | — |
| إدخال Auth Code في مسار النقل اليدوي | ❌ الداشبورد فقط | ✅ في مسار الداشبورد |
| نقل **Premium** | ❌ غير مدعوم، داشبورد فقط | ✅ الداشبورد |
| **Transfer-out** | ❌ مش في الـ API المُراجَع | ✅ الداشبورد + Auth Code عند الجديد |

---

## سجل التغييرات والتناقضات في توثيق Cloudflare

> قاعدة: **ممنوع الاعتماد على صفحة قديمة وحدها.** أي تعارض يُحلّ لصالح **أحدث سجل (Changelog)**.

| التاريخ | التغيير الرسمي | المصدر | أثره على تقريرنا |
|---|---|---|---|
| **2026-09-30** | **«Registrar API beta now supports domain transfers»** — نقل الدومين إلى Cloudflare عبر API + endpoint لحالة النقل. المسار: `POST /accounts/{account_id}/registrar/registrations/{domain_name}/transfer-in`، ويرجّع **202 Accepted**؛ التتبّع: `GET .../registrations/{domain_name}/transfer-in-status`. الشروط: **Zone موجود**، **DNSSEC معطّل**، **فتح القفل عند المزوّد الحالي**، **Auth/EPP Code** لمعظم الامتدادات. النقل غير متزامن 1–10 أيام، والعملية **قابلة للفوترة وغير قابلة للاسترداد عند النجاح**، و**نقل Premium غير مدعوم** عبر الـ API | https://developers.cloudflare.com/changelog/post/2026-09-30-registrar-transfer-api-beta/ · https://developers.cloudflare.com/api/resources/registrar/subresources/transfer_in/methods/create/ | **صحّحنا مسار Transfer-in وتفاصيله** من صيغة قديمة مختصرة إلى المسار الرسمي الكامل + حالات الـ Workflow |
| 2026-09-27 | إيقاف نقاط إدارة الدومين القديمة (EOL) واستبدالها بـ Registrar API الجديد | https://developers.cloudflare.com/fundamentals/api/reference/deprecations/ | نستخدم الـ API الجديد فقط (registrations / transfer-in) |
| 2026-04-15 | Registrar API في **بيتا** (بحث/فحص/تسجيل فقط) | changelog/prod/registrar | الصفحة القديمة كانت **قبل** دعم النقل، فاعتبرناها متجاوَزة بخصوص النقل |
| مستمر | **التجديد** و**تحديث الاتصال عبر API** لسه غير متاحين (الداشبورد فقط) | registrar-api | نُبقيها **قيود API حالية** |
| Nov 2026 | «Simplifying domains» — Sandbox + endpoint للامتدادات (420+) + نقل عبر cf CLI | blog.cloudflare.com/simplifying-domains | تأكيد إضافي لدعم النقل والـ Sandbox |

**تناقض موثّق:** صفحة `registrar-api` القديمة كانت تقول «Transfers are not yet available through the API» — ودي **متناقضة** مع Changelog 30 سبتمبر 2026. اعتمدنا **Changelog** لأنه الأحدث.

---

## جدول المقارنة النهائي (8 أبعاد)

| البعد | OpenSRS | Openprovider | Namecheap | Cloudflare Registrar |
|---|---|---|---|---|
| **تسجيل العميل كمالك** | ✅ Owner/Admin/Billing/Tech لكل دومين | ✅ `owner_handle` لكل دومين | ✅ `Registrant*` في create/setContacts | ✅ `contacts.registrant` inline |
| **التسجيل** | ✅ API كامل | ✅ API كامل | ✅ XML API | ✅ API (beta) — امتدادات محدودة |
| **التجديد** | ✅ | ✅ | ✅ | ❌ **غير متاح عبر API** (يُدار من الداشبورد) |
| **النقل** | ✅ خارجي كامل | ✅ خارجي كامل | ⚠️ وارد محدود عبر API؛ EPP غير متاح عبر API | ✅ **Transfer-in** مدعوم بقيود (من 30 سبتمبر 2026، مسار `.../{domain_name}/transfer-in`) · ⚠️ **Transfer-out** غير موجود ضمن الـ API المُراجَع (داشبورد) |
| **تعديل بيانات المالك** | ✅ COR بموافقة الطرفين | ✅ أو أمر `trade` | ✅ setContacts + إيميلات ICANN | ⚠️ داشبورد فقط، **مش عبر API** |
| **نمط الـ API / Sandbox** | XML (XCP) · Horizon ($5,000 رصيد اختبار) | REST + XML · sandbox كامل | XML فقط · sandbox منفصل | REST (JSON) · Registrar Sandbox (.com/.net) |
| **التكلفة** | **$95 تفعيل مرة واحدة، غير قابلة للاسترداد** (منشورة؛ **لم تُدفع**) + إيداع | حساب **مجاني**؛ **عضوية** مدفوعة اختيارية لتسعير أرخص (مثال .com: $12.17 غير عضو / $11.17 عضو) | بلا رسوم API (تكلفة المنتج عادية) | at-cost بلا markup (مفيش نموذج موزّع) |
| **متطلبات الحساب** | تسجيل ذاتي + تفعيل + رصيد | تسجيل مجاني + رصيد | ≥20 دومين أو ≥$50 رصيد أو ≥$50 مصروف سنتين + IP whitelist | حساب + billing + اتصال افتراضي + اتفاقية |
| **دعم الامتدادات** | 730+ (gTLD + ccTLD) | 1,200+ | واسع (Extended Attributes)، والتحويل الوارد محدود | 400+ بالداشبورد؛ **API لامتدادات محدودة فقط**؛ لا IDN |

---

## الخلاصة

- **الأربعة يدعمون تسجيل دومين ببيانات مالك (Registrant) مختلفة لكل عميل.**
- **Cloudflare Registrar:** دعم بيانات المالك ✅ **مدعوم** عبر API، و**Transfer-in مدعوم عبر API بقيود** (منذ 30 سبتمبر 2026). لكنه **غير مناسب كمنصة بيع** لأن: **التجديد** و**تحديث بيانات الاتصال** لسه **مش عبر API** (الداشبورد فقط)، و**Transfer-out غير موجود ضمن الـ API المُراجَع** (مش ادّعاء استحالة مطلقة)، ونقل **Premium** غير مدعوم عبر الـ API، والـ API بيتا لامتدادات محدودة، وإلزامي استخدام نطاقات Cloudflare، ومفيش نموذج multi-tenant/registrar-as-a-service بعد.
- **المزوّد المعتمد (قرار C، 8 نوفمبر 2026):** **Openprovider** هو المزوّد الأساسي **للتصميم والتكامل المستقبلي** (REST واضح + `owner_handle` لكل دومين + authcode). الاختيار **معماري فقط**: **فتح الحساب/العضوية/أي رسوم = موافقة منفصلة**، والإثبات التشغيلي على Openprovider **لسه NOT RUN** (محتاج Sandbox).
- **OpenSRS · Namecheap** يفضلوا **بدائل موثّقة** لمتطلبات ملكية العميل، لكن مفيش إثبات Sandbox فعلي لأي مزوّد لحد الآن.
