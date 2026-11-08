# tests/

اختبارات التوفر والأمان والوظائف. النتائج تُسجَّل في `../docs/TEST_REPORT.md`.

> الحالة: NOT_IMPLEMENTED (تبدأ من المرحلة 3 — التسعير أول اختبار قابل للتشغيل محليًا).
> اختبارات **التسعير** موجودة جوه الوحدة نفسها في `../pricing/test/` وبتتّشغّل بـ:
>
> ```bash
> node --test pricing/test/*.test.js
> ```
>
> 72 اختبار ناجح، والتفاصيل مسجّلة في `../docs/TEST_REPORT.md`.
>
> اختبارات **المزوّد الوهمي** موجودة جوه وحدتها في `../providers/test/`:
>
> ```bash
> node --test providers/test/*.test.js
> ```
>
> 66 اختبار ناجح. **تنبيه:** على Node 22، صيغة المجلد `node --test providers/test/`
> لوحدها بتفشل — لازم الـglob.
