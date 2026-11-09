-- ==========================================================================
-- Migo Domains - 0000: البيانات المرجعية الأولية (Seed)
-- --------------------------------------------------------------------------
-- الحالة: مكتوب. **لم يُنفَّذ** على أي قاعدة حقيقية.
--
-- قواعد صارمة اتّبعت هنا:
--   1) **ممنوع** أي سعر تكلفة من مزوّد حقيقي — تكاليف المزوّدين بتتجيب من
--      الـAPI وقت التشغيل ومبتتخزّنش كقيم مكتوبة.
--   2) **ممنوع** أي سعر صرف مخترع. لو مفيش سعر معتمد، EGP تفضل موقوفة.
--   3) **ممنوع** أي سرّ (مفتاح/توكن) — عمود credentials_ref مرجع بس.
--   4) الديمومة: كل الإدخالات idempotent (on conflict do nothing/update).
-- ==========================================================================

-- --------------------------------------------------------------------------
-- 1) providers — كتالوج المزوّدين (الشركة، مش الحساب).
--    is_active = false لكل المزوّدين الحقيقيين لحد ما يتفتح ربط الحساب.
-- --------------------------------------------------------------------------
insert into public.providers (code, name, api_base, is_active, notes) values
  ('openprovider', 'Openprovider', 'https://api.openprovider.eu/v1beta', false,
   'المزوّد المعتمد للتسجيل. مقفول لحد ربط الحساب وبيانات الاعتماد.'),
  ('cloudflare',   'Cloudflare Registrar', 'https://api.cloudflare.com/client/v4', false,
   'بديل: التحويل مدعوم بشروط؛ مفيش API لتسجيل دومين جديد.'),
  ('mock',         'مزوّد وهمي (محلي)', null, true,
   'للاختبار المحلي فقط. أي تكلفة منه موسومة provenance=mock وممنوعة كسعر حقيقي.')
on conflict (code) do update
  set name = excluded.name, api_base = excluded.api_base, notes = excluded.notes, updated_at = now();

-- --------------------------------------------------------------------------
-- 2) domain_tlds — الامتدادات المدعومة.
--    ملاحظة مقصودة: عمود rdap_url فاضي (null) — سيرفر RDAP بيتحدّد من ملف
--    IANA Bootstrap الرسمي وقت التشغيل، وده يمنع تجميد عناوين قد تتغيّر.
-- --------------------------------------------------------------------------
insert into public.domain_tlds (tld, registry, rdap_url, country, supports_transfer, notes) values
  ('com', null, null, null, true, 'RDAP يُحدَّد من IANA Bootstrap وقت التشغيل.'),
  ('net', null, null, null, true, 'RDAP يُحدَّد من IANA Bootstrap وقت التشغيل.'),
  ('org', null, null, null, true, 'RDAP يُحدَّد من IANA Bootstrap وقت التشغيل.'),
  ('io',  null, null, null, true, 'RDAP يُحدَّد من IANA Bootstrap وقت التشغيل.'),
  ('app', null, null, null, true, 'RDAP يُحدَّد من IANA Bootstrap وقت التشغيل.'),
  ('dev', null, null, null, true, 'RDAP يُحدَّد من IANA Bootstrap وقت التشغيل.'),
  ('store', null, null, null, true, 'RDAP يُحدَّد من IANA Bootstrap وقت التشغيل.'),
  ('eg',  null, null, 'EG', true, 'الامتداد الوطني المصري.')
on conflict (tld) do update
  set supports_transfer = excluded.supports_transfer, notes = excluded.notes, updated_at = now();

-- --------------------------------------------------------------------------
-- 3) pricing_rules — **الشرائح المعتمدة** (قرار صاحب المشروع).
--    المستويات محفوظة بوحدة ميكرو-دولار (1e-6):
--      أقل من 8$           → +2.50$ ثابت
--      من 8$ لأقل من 15$   → +3.00$ ثابت
--      من 15$ لـ30$ شاملة  → +4.00$ ثابت
--      أكبر من 30$         → 15% بحد أدنى 4.00$
-- --------------------------------------------------------------------------
insert into public.pricing_rules
  (code, label, mode, lower_micros, lower_inclusive, upper_micros, upper_inclusive, flat_micros, percent_bp, floor_micros, rule_version, priority, is_active)
values
  ('tier_under_8', 'أقل من 8 دولار',        'flat',    null,        true,  8000000,  false, 2500000, null, null,    '1.0', 10, true),
  ('tier_8_15',    'من 8 لأقل من 15 دولار', 'flat',    8000000,     true,  15000000, false, 3000000, null, null,    '1.0', 20, true),
  ('tier_15_30',   'من 15 لـ30 دولار',      'flat',    15000000,    true,  30000000, true,  4000000, null, null,    '1.0', 30, true),
  ('tier_over_30', 'أكبر من 30 دولار',      'percent', 30000000,    false, null,     null,  null,    1500, 4000000, '1.0', 40, true)
on conflict (code) do update
  set label = excluded.label, mode = excluded.mode,
      lower_micros = excluded.lower_micros, lower_inclusive = excluded.lower_inclusive,
      upper_micros = excluded.upper_micros, upper_inclusive = excluded.upper_inclusive,
      flat_micros = excluded.flat_micros, percent_bp = excluded.percent_bp, floor_micros = excluded.floor_micros,
      rule_version = excluded.rule_version, priority = excluded.priority, is_active = excluded.is_active,
      updated_at = now();

-- --------------------------------------------------------------------------
-- 4) fx_rates — **لا نزرع أي سعر صرف**.
--    السبب: سعر الصرف مُدخل يدوي معتمد. اختراع رقم هنا يعرض أسعار EGP غلط
--    للناس. لحد ما يتدخّل سعر معتمد بـ is_approved = true، محرك التسعير
--    هيرجّع EGP غير متاحة (وده السلوك المطلوب، مش عطل).
-- --------------------------------------------------------------------------
-- (مقصود: بدون أي صفوف)

-- --------------------------------------------------------------------------
-- 5) dns_plans — خطة أساسية مجانية. الخطة المتقدّمة **مقفولة** لحد ما
--    يتحدّد سعرها المعتمد (مفيش اختراع أسعار).
-- --------------------------------------------------------------------------
insert into public.dns_plans (code, name, max_zones, max_records, price_micros, currency, is_active) values
  ('basic', 'إدارة DNS أساسية', 1, 50,  0, 'USD', true),
  ('advanced', 'إدارة DNS متقدّمة', 10, 500, 0, 'USD', false)
on conflict (code) do update
  set name = excluded.name, max_zones = excluded.max_zones, max_records = excluded.max_records,
      price_micros = excluded.price_micros, currency = excluded.currency, is_active = excluded.is_active,
      updated_at = now();

-- --------------------------------------------------------------------------
-- 6) system_settings — القيم التشغيلية العامة (مفيش أسرار هنا نهائيًا).
-- --------------------------------------------------------------------------
insert into public.system_settings (key, value, description) values
  ('features.real_registrar', 'false'::jsonb, 'فتح المزوّد الحقيقي — قرار صاحب المشروع.'),
  ('features.payments',       'false'::jsonb, 'فتح بوابة الدفع — لسه مش مختارة.'),
  ('features.advanced_dns',   'false'::jsonb, 'فتح خطة DNS المتقدّمة — لسه بلا سعر معتمد.'),
  ('features.admin_writes',   'false'::jsonb, 'فتح الكتابة من لوحة الإدارة — محتاجة RLS مُنفَّذة.'),
  ('provider.default',        '"mock"'::jsonb, 'المزوّد الافتراضي وقت التشغيل.'),
  ('pricing.rule_version',    '"1.0"'::jsonb, 'نسخة شرائح الهامش المعتمدة.'),
  ('availability.definitive_ttl_ms', '300000'::jsonb, 'مدة تخزين نتيجة التوفر الحاسمة (5 دقايق).'),
  ('availability.unknown_ttl_ms',    '30000'::jsonb,  'مدة تخزين النتيجة غير الحاسمة (30 ثانية).'),
  ('availability.rate_limit', '{"capacities":{"availability":30,"registrar":10}}'::jsonb, 'حدود معدّل الاستعلام.')
on conflict (key) do update
  set value = excluded.value, description = excluded.description, updated_at = now();
