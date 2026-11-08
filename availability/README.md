# availability/

محرك التحقق من التوفر: RDAP أولًا، ثم مصادر احتياطية عند الحاجة، مع Cache و Rate Limiting.

حالات النتيجة: `AVAILABLE_CONFIRMED` · `REGISTERED` · `PREMIUM` · `RESERVED` · `RESTRICTED` · `UNKNOWN` · `PROVIDER_ERROR` · `MANUAL_REVIEW`

**قاعدة:** عدم ظهور سجل لا يعني «متاح» تلقائيًا؛ وعدم استجابة المصدر = `UNKNOWN`.

> الحالة: BLOCKED جزئيًا — الإنترنت مقفول من بيئة التشغيل، فالتنفيذ والاختبار الحقيقي على سيرفر.
