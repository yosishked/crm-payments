# CRM Payments - מודול תשלומים

## מה זה?
מודול עצמאי לניהול תשלומים לעורכות, חלק ממערכת ה-CRM.
אותו Supabase, אותן טבלאות — רק הפרונטאנד נפרד.
**בנוי בתיקייה נפרדת כדי לא לשבור את crm-leads.**

## מבנה הפרויקט
```
crm-payments/
├── index.html              ← שלד האפליקציה (SPA)
├── css/style.css           ← עיצוב (מבוסס על crm-leads + תוספות)
├── js/
│   ├── supabase-config.js  ← הגדרות Supabase (זהה ל-crm-leads)
│   ├── state.js            ← ניהול state (editors, leads, transactions)
│   ├── realtime.js         ← Supabase Realtime subscriptions (עדכונים חיים)
│   ├── auth.js             ← Google OAuth + הרשאות (מותאם)
│   ├── ui-components.js    ← רכיבי UI משותפים (זהה ל-crm-leads)
│   ├── form-helpers.js     ← תשתית CRUD (זהה ל-crm-leads)
│   ├── router.js           ← ניתוב (editors, editors/:id)
│   ├── api.js              ← שאילתות Supabase לתשלומים
│   └── editors.js          ← תצוגת עורכות + תשלומים + קיזוזים
├── sql/                    ← מיגרציות SQL (לא ב-git)
└── CLAUDE.md
```

## טבלאות Supabase בשימוש
- `crm_team` (קריאה) — עורכות, is_editor=true
- `crm_leads` (קריאה + כתיבה editor_id) — לידים, editing_cost
- `crm_editor_transactions` (קריאה + כתיבה) — תנועות עורכות
- `crm_editor_offsets` (קריאה + כתיבה) — קיזוזים בין אירועים
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
- מאזין לשינויים ב-`crm_editor_transactions` דרך Supabase Realtime (WebSocket)
- כשיש שינוי: מרענן את תצוגת העורכת הנוכחית או רשימת העורכות
- cooldown של 3 שניות אחרי שמירה מקומית (למנוע self-trigger)
- לא מפריע לעריכה: מזהה כשהמשתמש באמצע עריכה ומדלג
- `Realtime.markLocalSave()` נקרא לפני כל create/delete ב-api.js
- **debounce 500ms** על refresh + `_isRefreshing` guard למניעת טעינות כפולות

## הגנות נגד קפיאת דף
- **form-helpers.js**: `_initColorSelects` מאזין על ה-overlay (לא document) — listener נמחק כשהמודל נסגר
- **editors.js**: version counter (`_detailVersion`, `_listVersion`) — טעינה ישנה מבטלת את עצמה אם חדשה התחילה
- **auth.js**: `SIGNED_IN` כש-כבר מחובר עם הרשאות → מדלג (מונע re-init מיותר בחזרה מטאב)
- **router.js**: debounce על `handleRoute` (hash חדש=מיידי, אותו hash=300ms). `visibilitychange` listener לרענון נקי בחזרה מטאב

## קבצים משותפים עם crm-leads
- `supabase-config.js` — זהה
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
