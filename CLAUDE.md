# CRM Payments - מודול תשלומים

## מה זה?
מודול עצמאי לניהול תשלומים — 3 מסכים: לקוחות, עורכות, צלמים. חלק ממערכת ה-CRM.
אותו Supabase, אותן טבלאות — רק הפרונטאנד נפרד.
**בנוי בתיקייה נפרדת כדי לא לשבור את crm-leads.**

## מבנה הפרויקט
```
crm-payments/
├── index.html              ← שלד האפליקציה (SPA, 3 split-views)
├── css/style.css           ← עיצוב (מבוסס על crm-leads + תוספות)
├── js/
│   ├── supabase-config.js  ← הגדרות Supabase + שמירת hash לפני init
│   ├── state.js            ← ניהול state (editors, leads, transactions)
│   ├── realtime.js         ← Supabase Realtime (4 טבלאות)
│   ├── auth.js             ← Google OAuth + הרשאות (מותאם)
│   ├── ui-components.js    ← רכיבי UI משותפים (זהה ל-crm-leads)
│   ├── form-helpers.js     ← תשתית CRUD (זהה ל-crm-leads)
│   ├── router.js           ← ניתוב (clients, editors, photographers + /:id)
│   ├── api.js              ← שאילתות Supabase לתשלומים
│   ├── clients.js          ← תצוגת לקוחות + תשלומים + פירוט מחיר
│   ├── editors.js          ← תצוגת עורכות + תשלומים + קיזוזים
│   └── photographers.js    ← תצוגת צלמים (planned)
├── sql/                    ← מיגרציות SQL (לא ב-git)
└── CLAUDE.md
```

## טבלאות Supabase בשימוש
- `crm_team` (קריאה) — עורכות (is_editor=true), צלמים
- `crm_leads` (קריאה + כתיבה) — לידים, editing_cost, package_extras, discount
- `crm_client_transactions` (קריאה + כתיבה) — תנועות לקוחות (תשלומים, CRM, יומן אירוע, לקוח לעורכת)
- `crm_editor_transactions` (קריאה + כתיבה) — תנועות עורכות
- `crm_editor_offsets` (קריאה + כתיבה) — קיזוזים בין אירועים
- `crm_event_logs` (קריאה) — יומני אירוע (שעות נוספות, extras)
- `crm_users` (קריאה) — הרשאות

## סוגי תנועות (transaction_type)
- `עלות עריכה` — עלות קבועה לאירוע
- `העברת תשלום מהלקוח לעורכת` — לקוח משלם ישירות
- `העברת תשלום מהמשרד לעורכת` — יוסי משלם
- `קיזוז` — העברת יתרה בין אירועים

## חישוב יתרה
```
יתרה_לאירוע = עלות_עריכה - (שולם_מלקוח + שולם_מהמשרד + קיזוזים)
יתרה_כוללת = סכום(יתרה_לכל_אירוע)

יתרה > 0 = חייבים לעורכת
יתרה < 0 = זיכוי (תשלום עודף)
יתרה = 0 = מסולק
```

## קיזוז (offset)
מעביר זיכוי מאירוע אחד לאירוע אחר:
1. נוצרת רשומת `crm_editor_offsets`
2. נוצרות 2 תנועות `קיזוז`:
   - שלילית על אירוע המקור (מורידה זיכוי)
   - חיובית על אירוע היעד (מחילה זיכוי)

## Trigger — crm_team.balance
Trigger על crm_editor_transactions מעדכן אוטומטית את crm_team.balance

## Views
- `v_editor_lead_balances` — יתרה לכל עורכת-ליד
- `v_editor_total_balances` — סה"כ יתרה לכל עורכת

## אינטגרציה עם crm-leads
- **בחירת עורכת**: בטאב 2 (אירוע וחבילה) ב-crm-leads יש dropdown בחירת עורכת (`editor_id` FK → crm_team)
- **יצירת תנועה אוטומטית**: כשנבחרת עורכת — נוצרת תנועת "עלות עריכה" אוטומטית עם הסכום מ-`crm_leads.editing_cost`
- **סנכרון עלות עריכה**: כששדה `editing_cost` משתנה ב-crm-leads (עריכה ידנית / שינוי חבילה / בחירת צלם שני) — התנועה מתעדכנת אוטומטית ב-`crm_editor_transactions` דרך `_syncEditingCostTransaction`
- **חשוב**: `package_name` לא קיים על `crm_leads` — אין לכלול אותו בשאילתות. `editing_cost` מגיע ישירות מ-`crm_leads`

## Realtime (עדכונים חיים)
- מאזין ל-4 טבלאות: `crm_editor_transactions`, `crm_client_transactions`, `crm_event_logs`, `crm_leads`
- כשיש שינוי: מרענן את התצוגה הרלוונטית (עורכות/לקוחות)
- cooldown של 3 שניות אחרי שמירה מקומית (למנוע self-trigger)
- לא מפריע לעריכה: מזהה כשהמשתמש באמצע עריכה ומדלג
- `Realtime.markLocalSave()` נקרא לפני כל create/update/delete
- **debounce 500ms** על refresh + `_isRefreshing` guard למניעת טעינות כפולות
- `_loadClientDetail(leadId, silent)` — פרמטר `silent` מדלג על ספינר (לרענון חלק אחרי שמירה)

## הגנות נגד קפיאת דף
- **form-helpers.js**: `_initColorSelects` מאזין על ה-overlay (לא document) — listener נמחק כשהמודל נסגר
- **editors.js**: version counter (`_detailVersion`, `_listVersion`) — טעינה ישנה מבטלת את עצמה אם חדשה התחילה
- **auth.js**: `SIGNED_IN` כש-כבר מחובר עם הרשאות → מדלג (מונע re-init מיותר בחזרה מטאב)
- **router.js**: debounce על `handleRoute` (hash חדש=מיידי, אותו hash=300ms). `visibilitychange` listener לרענון נקי בחזרה מטאב

## תנועות לקוח לעורכת (linked transactions)
- כשלקוח משלם ישירות לעורכת, נוצרות 2 תנועות מקושרות:
  1. `crm_client_transactions` עם source "לקוח לעורכת"
  2. `crm_editor_transactions` עם type "העברת תשלום מהלקוח לעורכת"
- קישור: `linked_editor_transaction_id` על `crm_client_transactions` (FK → `crm_editor_transactions.id`)
- עריכה/מחיקה של אחת → מעדכנת/מוחקת גם את המקושרת
- פועל גם מצד הלקוחות וגם מצד העורכות

## מסך לקוחות (clients.js)
- רשימת לידים עם פירוט תשלומים בסיידבר
- סינון: הכל / לא שולם / שולם
- חיפוש חופשי
- באדג'ים צבעוניים לצלמים (כחול, אדום, צהוב, טורקיז)
- פירוט מחיר משוקלל: package_price + second_photographer + package_extras - discount + event_extras × 1.18
- שדות עריכים: package_extras, discount (עריכה ישירה מהתשלומים)
- מקורות תנועות: CRM, יומן אירוע, לקוח לעורכת

## Supabase .in() באג
- `.in('lead_id', leadIds)` עם UUIDs לפעמים מחזיר תוצאות ריקות בשקט
- פתרון: לשלוף הכל בלי `.in()` ולסנן בקוד

## Hash persistence
- Supabase implicit flow עלול לנקות את ה-hash בטעינה
- פתרון: `_savedRouteHash` נשמר לפני `createClient` ומשוחזר אחריו
- מאפשר שמירת מסך נוכחי (editors/photographers) ברענון

## קבצים משותפים עם crm-leads
- `supabase-config.js` — מבוסס על crm-leads + תיקון hash
- `ui-components.js` — זהה
- `form-helpers.js` — זהה
- `css/style.css` — מבוסס על crm-leads + תוספות ספציפיות

## Deploy (Cloudflare Pages)
- **GitHub repo:** `yosishked/crm-payments` (private)
- **URL:** `https://payments.yossishaked.net` (custom domain)
- **Deploy:** `git push` → Cloudflare בונה אוטומטית
- **Publish directory:** `.` (שורש הפרויקט)
- **Supabase redirect URLs:** צריך להוסיף `https://payments.yossishaked.net/**` ב-Supabase Auth URL Configuration

## SQL
- תיקיית `sql/` לא ב-git — מיגרציות מריצים ידנית ב-Supabase SQL Editor
- Realtime כבר מופעל על `crm_editor_transactions` (חלק מ-`supabase_realtime` publication)
