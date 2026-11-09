# config/

إعدادات المشروع والقيم الافتراضية: حدود البحث، Rate Limiting، مدد الـCache،
ومفاتيح الميزات.

**ممنوع** أي مفتاح أو سرّ أو سعر صرف ثابت هنا — وفي تحقّق آلي (`assertNoSecrets`)
بيرمي فورًا لو أي اسم حقل شبه سرّي (key · token · secret · service_role …).

## الميزات
كلها `false` افتراضيًا، وفتحها **قرار صاحب المشروع** مش الكود:
`realRegistrar` · `payments` · `advancedDns` · `adminWrites`.

```bash
cd config && node --test "test/*.test.js"   # 7 اختبارات ناجحة
```

> الحالة: **منفَّذ ومُختبَر**.
