# SQL صلاحية الإدارة (جدول admins) - للمراجعة فقط

الحالة: **NOT RUN** · التنفيذ: **APPROVAL REQUIRED**

> ما بيعدّلش على `profiles` خالص، فمفيش ترتيب إلزامي مع SQL الـprofiles. ومفيش أي عمود جديد ولا تريجر.

---

## 1) المشكلة اللي بنحلها

أي مستخدم مسجّل يقدر يعدّل صفّه في `profiles` (سياسة `profiles_update_own`). لو خلّينا الصلاحية عمود هناك، أي مستخدم يقدر **يرقّي نفسه لإداري**. وRLS بتتحكم في الصفوف مش الأعمدة، فكانت هتحتاج تريجر و`revoke` عمود.

**الحل الأنضف: الصلاحية في جدول منفصل مفيش عليه سياسة كتابة أصلًا.** يعني مفيش حاجة تتقفل، لأن مفيش باب مفتوح من الأساس.

---

## 2) الجدول

```sql
create table if not exists public.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  note       text
);

alter table public.admins enable row level security;

-- سياسة قراءة واحدة فقط: المستخدم يشوف صفه هو (يعرف إنه إداري).
-- ومفيش أي سياسة insert / update / delete لأي دور.
-- مع RLS مفعّلة وغياب السياسة، الأوامر دي مرفوضة تلقائيًا على العميل.
create policy "admins_select_self" on public.admins
  for select using (auth.uid() = user_id);
```

**نقطة مهمة:** الأمان هنا مش من `revoke` ولا من تريجر، هو من **غياب سياسة الكتابة**. ده أوضح للقراءة وأصعب إنه يتكسر بالغلط لاحقًا.

---

## 3) دالة مساعدة تستخدمها السياسات الجاية

```sql
create or replace function public.is_admin()
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (select 1 from public.admins a where a.user_id = auth.uid());
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;
```

الدالة **من غير `security definer`** عن قصد: بتشتغل بصلاحيات اللي بيناديها، وسياسة `admins_select_self` كفاية إنها تشوف صفّه. كده مفيش دالة بتشتغل بصلاحيات أعلى من اللازم.

مثال للجداول اللي هتيجي بعدين (مش موجودة دلوقتي):

```sql
create policy "orders_admin_all" on public.orders
  for all using (public.is_admin());
```

---

## 4) إزاي يتحط أول إداري؟

الجدول بيفضل فاضي بعد التنفيذ، ومفيش واجهة بتضيف إداريين عن قصد. الخطوة بيدك في Supabase SQL Editor:

```sql
insert into public.admins (user_id, note)
values ((select id from auth.users where email = '<بريد صاحب المشروع>'), 'مالك المشروع')
on conflict (user_id) do nothing;
```

---

## 5) الرفع العكسي

```sql
drop function if exists public.is_admin();
drop table if exists public.admins;
```

---

## 6) اللي لسه مطلوب من الواجهة بعد التنفيذ

- `admin.html` تسأل `is_admin()` للمستخدم الحالي وتقفل الصفحة لو `false`. القفل ده **شكلي**؛ الحماية الحقيقية من RLS على الجداول الحقيقية.
- سياسات `domains` / `orders` / `customers` تستخدم `public.is_admin()`.

## 7) مفردات القبول

- تنفيذ الـSQL: **NOT RUN** · **APPROVAL REQUIRED**.
- حماية العميل في `admin.html`: **NOT RUN**.
- الفرق بين الحماية الشكلية والحقيقية: **DOCUMENTED**.
