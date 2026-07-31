# موقع رجب العبود — النسخة النهائية المطورة

موقع عربي RTL مبني بـ Astro ومجهز للتشغيل المحلي، والحفظ في GitHub، والنشر على الخطة المجانية من Cloudflare Workers. تُحفظ طلبات الاستشارة في Cloudflare D1، ويحمي Cloudflare Turnstile النموذج، بينما تبقى لوحة المحتوى المحلية منفصلة تماماً عن لوحة الطلبات السحابية.

## ما تتضمنه النسخة

- واجهة عربية متجاوبة ومختبرة من عرض 320px حتى سطح المكتب.
- إصلاح بطاقة مشروع التخرج بحيث يظهر النص كاملاً مع هوامش صحيحة.
- لوحة محتوى محلية على `/local-dashboard/` تعمل بالأمر `npm run dashboard`.
- تعديل حقول كل خدمة أو حالة أو إنجاز أو قسم أو عنصر صفحة من داخل بطاقته مباشرة، من دون تبويب حقول منفصل.
- زر قلم بجانب عنوان كل حقل، ونافذة سريعة للتسمية والظهور والإلزامية والموضع، مع ترتيب بالسحب والإفلات أو السهمين.
- إضافة حقول جديدة إلى عنصر واحد فقط؛ لا تتغير بقية البطاقات أو الأقسام تلقائياً.
- تبويب مستقل لبناء نموذج الاستشارة: إضافة الحقول، وتعديل عناوينها وأنواعها وخياراتها وترتيبها وظهورها وإلزاميتها.
- اعتماد محتوى لوحة البيانات المرفقة: 9 خدمات، و8 حالات لمعرض الأعمال، و5 إنجازات، والصور المرتبطة بها.
- إلغاء «أفضل وقت للتواصل»، وجعل «وصف مختصر» اختيارياً.
- إخفاء الدعوة الختامية من الموقع العام مع إبقائها داخل منشئ الصفحات لإعادة تفعيلها مستقبلاً.
- لوحة خاصة على `/admin/` لإدارة الطلبات والبحث والفلترة والحالات والملاحظات والأرشفة والحذف وتصدير CSV.
- تخزين الحقول الإضافية لنموذج الاستشارة داخل D1 وعرضها في تفاصيل الطلب وفي التصدير.
- حماية Turnstile وحد إرسال يبلغ 10 طلبات خلال ساعة للبصمة نفسها.
- Astro `7.1.6` ومحول Cloudflare `14.1.7` بإعداد Workers الحديث بدلاً من Pages القديم.

## المتطلبات

- Node.js `22.12.0` أو أحدث.
- npm `9.6.5` أو أحدث.
- Visual Studio Code أو أي محرر.
- حساب GitHub عند الرغبة في حفظ المصدر أو النشر التلقائي.
- حساب Cloudflare مجاني للنشر وD1 وTurnstile.

## التشغيل داخل Visual Studio Code

افتح مجلد المشروع في VS Code، ثم افتح Terminal داخل المجلد ونفّذ:

```bash
npm ci
npm run dashboard
```

افتح:

```text
http://127.0.0.1:4321/local-dashboard/
```

هذه اللوحة تعمل محلياً فقط لأنها تقرأ وتكتب ملفات `content/`. بعد التعديل استخدم زر «حفظ في ملفات المشروع»، ثم نفّذ الاختبارات قبل رفع التغييرات.

### أهم أقسام لوحة المحتوى

- **الخدمات ومعرض الأعمال والإنجازات:** افتح البطاقة وعدّل حقولها من زر القلم بجانب اسم الحقل، أو أضف حقلاً خاصاً بها.
- **منشئ الصفحات:** يتيح الأسلوب نفسه داخل كل قسم وداخل كل عنصر يدوي في القسم.
- **نموذج طلب الاستشارة:** تعديل الحقول وترتيبها وإظهارها وإلزاميتها وإضافة حقول جديدة.
- **منشئ الصفحات:** الدعوة الختامية محفوظة باسم `home-cta` وحالتها الحالية «مخفية».

رقم الهاتف وموافقة الخصوصية محميان من الإخفاء أو التحويل إلى اختياري لأنهما لازمان لمعالجة الطلب بصورة صحيحة.

## تشغيل لوحة `/admin/` محلياً

أنشئ ملف الأسرار المحلي:

```powershell
Copy-Item .dev.vars.example .dev.vars
notepad .dev.vars
```

ضع كلمة مرور قوية وسراً عشوائياً:

```env
ADMIN_PASSWORD=كلمة-مرور-قوية-لا-تقل-عن-16-محرفا
SESSION_SECRET=قيمة-عشوائية-لا-تقل-عن-32-محرفا
ALLOW_DEMO_SUBMISSIONS=true
```

يمكن توليد السر من PowerShell:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

ثم:

```bash
npm run db:migrate:local
npm run cloudflare:dev
```

افتح:

```text
http://127.0.0.1:8788/admin/
```

`/local-dashboard/` لتعديل ملفات الموقع، أما `/admin/` فلإدارة طلبات الاستشارة المخزنة في D1.

## أوامر الفحص

```bash
npm audit --audit-level=low
npm run check
npm test
npm run test:browser
npm run build
```

`npm test` يشمل فحص الواجهة والمحتوى والتفاعلات ومنشئ الصفحات ومخرجات Workers وD1 وواجهات `/admin/`.

## رفع المشروع إلى GitHub

ملفات الأسرار و`node_modules` و`dist` مستبعدة من Git. بعد إنشاء مستودع فارغ:

```bash
git init
git add .
git commit -m "Final developed website"
git branch -M main
git remote add origin https://github.com/USERNAME/REPOSITORY.git
git push -u origin main
```

في التحديثات اللاحقة:

```bash
npm run dashboard
npm test
git add .
git commit -m "Update site content"
git push
```

## النشر على Cloudflare Workers

هذه النسخة تستهدف **Cloudflare Workers** مع Static Assets، وليست مشروع Pages. لا تضف `pages_build_output_dir` ولا تغيّر الربط المولد `ASSETS`.

### 1. إنشاء D1

```bash
npx wrangler login
npx wrangler d1 create rajab-consultations
```

انسخ `database_id` الناتج إلى `wrangler.jsonc` بدلاً من:

```text
00000000-0000-0000-0000-000000000000
```

ثم طبّق جميع الهجرات:

```bash
npm run db:migrate:remote
```

الربط المطلوب اسمه حرفياً `DB`.

### 2. إعداد Turnstile

أنشئ Turnstile Widget وأضف نطاق `workers.dev` أو نطاقك المخصص. ضع Site Key في ملف `.env` المحلي قبل البناء:

```env
PUBLIC_TURNSTILE_SITE_KEY=YOUR_SITE_KEY
SITE_URL=https://rajab-alaboud-site-cloudflare.workers.dev
```

ضع Secret Key في Cloudflare كسِر مشفر:

```bash
npx wrangler secret put TURNSTILE_SECRET_KEY
```

### 3. إعداد أسرار لوحة الإدارة

```bash
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put SESSION_SECRET
```

لا تضع هاتين القيمتين في `.env` أو `wrangler.jsonc` أو GitHub.

### 4. النشر الأول

```bash
npm run deploy
```

عدّل `SITE_URL` في `wrangler.jsonc` إلى الرابط الحقيقي إذا اختلف اسم Worker، ثم أعد النشر. يجهز Astro تلقائياً Static Assets وربط جلسات `SESSION`، بينما يعرّف المشروع ربط D1 باسم `DB`.

بعد النشر:

```text
https://YOUR-WORKER.workers.dev/
https://YOUR-WORKER.workers.dev/admin/
```

### 5. النشر التلقائي من GitHub

بعد نجاح النشر الأول:

1. افتح مشروع Worker في Cloudflare.
2. افتح **Settings → Builds** واربط مستودع GitHub.
3. استخدم أمر البناء `npm ci && npm run build`.
4. استخدم أمر النشر `npx wrangler deploy`.
5. أضف `PUBLIC_TURNSTILE_SITE_KEY` و`SITE_URL` إلى متغيرات بيئة البناء.
6. اترك `ADMIN_PASSWORD` و`SESSION_SECRET` و`TURNSTILE_SECRET_KEY` ضمن أسرار Worker المشفرة.

كل تعديل محفوظ من `npm run dashboard` ثم مرفوع إلى GitHub سيبني نسخة جديدة تلقائياً.

## إدارة الطلبات السحابية

لوحة `/admin/` تتيح:

- إحصاءات إجمالية وحسب الحالة والمحافظة والمصدر.
- البحث بالاسم والهاتف والمرجع والموضوع.
- تغيير حالة الطلب وإضافة ملاحظات داخلية.
- فتح واتساب والاتصال ونسخ البيانات.
- الأرشفة والاستعادة والحذف النهائي بعد تأكيد المرجع.
- تصدير CSV مع حماية القيم من CSV Formula Injection.
- عرض الحقول الإضافية التي أُنشئت من لوحة نموذج الاستشارة.

فتح طلب جديد ينقله إلى «تمت المراجعة». الأرشفة قابلة للاستعادة، أما الحذف النهائي فيزيل الطلب وملاحظاته وسجل نشاطه من D1.

## إشعار البريد الاختياري

يعمل حفظ الطلب وواتساب ولوحة `/admin/` من دون بريد. الإرسال الآلي يحتاج Binding باسم `EMAIL` ومرسلاً موثقاً، ثم:

```text
NOTIFICATION_EMAIL=alabboudrajab@gmail.com
NOTIFICATION_EMAIL_FROM=consultations@your-domain.example
```

يجب أن يكون عنوان `NOTIFICATION_EMAIL_FROM` من دومين موثَّق في Cloudflare Email Service. إذا لم يُضبط البريد تظهر الحالة `not-configured` ولا يفشل حفظ الطلب.

## بنية المشروع

```text
content/                       المحتوى ونموذج الحقول
migrations/                    مخطط D1 وهجراته
public/                        الصور والرؤوس والتحويلات
scripts/                       توليد المحتوى وتشغيل اللوحة والاختبارات
src/pages/api/submit.ts        استقبال طلب الاستشارة
src/pages/api/admin/           إدارة الطلبات والمصادقة
src/pages/admin/               واجهة لوحة الطلبات
src/pages/local-dashboard/     لوحة المحتوى المحلية
src/generated/                 محتوى مولد آلياً من content
wrangler.jsonc                 إعداد Workers وD1
```

## ملاحظات قبل الإطلاق العام

- راجع العناصر المهنية النائبة بين أقواس مربعة واعتمد النص النهائي.
- راجع سياسة الخصوصية قانونياً وفق البلد الذي سيعمل فيه الموقع.
- لا تنشر صور أشخاص من دون موافقة صريحة.
- اترك `ALLOW_DEMO_SUBMISSIONS=false` في الإنتاج.
