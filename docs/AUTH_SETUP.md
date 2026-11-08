# ربط تسجيل الدخول - Migo Domains

الحالة: **DOCUMENTED**. الكود جاهز، والربط الفعلي **NOT RUN** ومحتاج خطوات من صاحب المشروع.

**قرار صاحب المشروع (8 نوفمبر 2026): طريقة الدخول = البريد + كلمة السر.** الرابط السحري وGoogle وOTP بالموبايل مش داخلين في النطاق دلوقتي؛ دالة `magicLink` سايبها في `auth.js` كـAPI غير مستخدمة، ومفيش أي واجهة ليها.

---

## 1) إيه اللي اتبنى بالفعل (واجهة فقط، بدون أي مفاتيح)

| الملف | الوظيفة |
|---|---|
| `frontend/login.html` | دخول بالبريد + كلمة السر. |
| `frontend/signup.html` | إنشاء حساب (اسم، هاتف اختياري، بريد، كلمة سر، موافقة على الشروط). |
| `frontend/forgot.html` | طلب رابط إعادة تعيين كلمة السر. |
| `frontend/assets/js/auth.js` | طبقة المصادقة: تكلّم Supabase Auth عبر REST مباشرة (بدون مكتبات خارجية). |
| `frontend/assets/js/auth-guard.js` | حماية الصفحات: تحويل لصفحة الدخول لو مفيش جلسة، وربط زر الخروج. |
| `frontend/assets/js/config.js` | الإعدادات - الرابط والمفتاح العام، **بقيم فاضية** لحد الموافقة. |

كل الصفحات بتستخدم نفس الـDesign System (`tokens.css` + `base.css`)، وبتحترم الوضع التجريبي: لو الإعدادات فاضية، النموذج بيرجّع رسالة واضحة بدل ما يفشل بصمت.

**مش مبني عن قصد:** ربط `auth-guard.js` في `account.html` و`admin.html` (تعديل على صفحات موجودة) - جاهز يتنفّذ بعد ما نتفق على طريقة الدخول.

---

## 2) اللي محتاج صاحب المشروع (من هنا مقدرش أعمله)

أكشنات Supabase المتصلة عندي محدودة: **عرض المشاريع، توليد الأنواع، إنشاء مشروع**. يعني مفيش تفعيل إعدادات ولا تنفيذ SQL ولا قراءة مفاتيح من هنا.

1. **طريقة الدخول:** بريد + كلمة سر (الافتراضي المبني)، رابط سحري، Google، أو OTP بالموبايل.
   - الموبايل OTP محتاج مزوّد SMS (تكلفة منفصلة).
2. **الرابط والمفتاح العام:** `https://<ref>.supabase.co` + المفتاح العام (anon / publishable) بتاع مشروع `migo-domains`، يتكتبوا في `frontend/assets/js/config.js`.
   - المفتاح العام **مقصود** إنه يوصل للمتصفح: الموقع ساكن ومفيش سيرفر يخبّيه. الحماية الحقيقية من RLS على قاعدة البيانات، مش من سرية المفتاح.
   - **ممنوع منعاً تاماً** الـ`service_role` أو أي `secret` key في الملف ده لأنه بيتنشر مع الموقع.
3. **تشغيل SQL الـProfiles** (تحت) في Supabase SQL Editor - **بموافقتك**، لأن قاعدة البيانات الحقيقية ممنوعة عليّ.
4. **Redirect URLs** في Authentication → URL Configuration: أضف رابط الموقع (`https://<domain>` وأي رابط معاينة).

---

## 3) SQL الـProfiles + RLS - جاهز للمراجعة، **NOT RUN**

> ده مخطوط للمراجعة فقط. **مالوش أي تنفيذ على أي قاعدة بيانات حقيقية** لحد موافتك.

```sql
-- جدول الملفات الشخصية: صف واحد لكل مستخدم
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text,
  phone       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- كل مستخدم يقرأ/يعدّل صفه هو فقط
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- إنشاء الصف تلقائيًا بعد التسجيل
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, phone)
  values (new.id, new.email,
          new.raw_user_meta_data->>'full_name',
          new.raw_user_meta_data->>'phone')
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

---

## 5) مفردات القبول (لازم تُستخدم بالحرف)

- الواجهة: **TESTED** (فريمات، صياغة JS، سلوك النموذج في الوضع غير المُهيّأ).
- الربط الفعلي بـSupabase Auth: **NOT RUN**.
- إعدادات المشروع (Auth + Redirect URLs + SQL): **APPROVAL REQUIRED**.
- المفتاح العام في المستودع: **APPROVAL REQUIRED**.
