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

## קבצים משותפים עם crm-leads
- `supabase-config.js` — זהה
- `ui-components.js` — זהה
- `form-helpers.js` — זהה
- `css/style.css` — מבוסס על crm-leads + תוספות ספציפיות

## Deploy
- TBD — Cloudflare Pages (payments.yossishaked.net או crm.yossishaked.net/payments)

## SQL
- תיקיית `sql/` לא ב-git — מיגרציות מריצים ידנית ב-Supabase SQL Editor
