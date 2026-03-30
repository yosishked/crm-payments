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
│   ├── audit.js            ← מערכת audit log - היסטוריית שינויים (משותף לכל מודולי CRM)
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
- `crm_editing` (קריאה) — שלב עריכה + editing_style_two_cameras (לתוספת 500₪)
- `crm_users` (קריאה) — הרשאות

## Views
- `v_editor_lead_balances` — יתרה לכל עורכת-ליד
- `v_editor_total_balances` — סה"כ יתרה לכל עורכת
- `v_client_paid` — סיכום תשלומים לכל ליד (SUM+GROUP BY מ-crm_client_transactions)

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

## אינטגרציה עם crm-leads
- **בחירת עורכת**: בטאב 2 (אירוע וחבילה) ב-crm-leads יש dropdown בחירת עורכת (`editor_id` FK → crm_team)
- **יצירת תנועה אוטומטית**: כשנבחרת עורכת — נוצרת תנועת "עלות עריכה" אוטומטית עם הסכום מ-`crm_leads.editing_cost`
- **סנכרון עלות עריכה**: כששדה `editing_cost` משתנה ב-crm-leads (עריכה ידנית / שינוי חבילה / בחירת צלם שני) — התנועה מתעדכנת אוטומטית ב-`crm_editor_transactions` דרך `_syncEditingCostTransaction`
- **חשוב**: `package_name` לא קיים על `crm_leads` — אין לכלול אותו בשאילתות. `editing_cost` מגיע ישירות מ-`crm_leads`

## Realtime (עדכונים חיים)
- מאזין ל-4 טבלאות: `crm_editor_transactions`, `crm_client_transactions`, `crm_event_logs`, `crm_leads`
- כשיש שינוי: מרענן את התצוגה הרלוונטית (עורכות/לקוחות)
- cooldown של 3 שניות אחרי שמירה מקומית (למנוע self-trigger)
- **חשוב**: `Realtime.markLocalSave()` נקרא **אחרי** השמירה (לא לפני!) — אחרת ה-cooldown פג לפני שהשמירה הסתיימה
- לא מפריע לעריכה: מזהה כשהמשתמש באמצע עריכה ומדלג
- **debounce 500ms** על refresh + `_isRefreshing` guard למניעת טעינות כפולות
- **`_isSoftRefreshing` guard** על `_softRefreshClientDetail` — מונע רענונים מקבילים
- אחרי שמירה: קריאה ישירה ל-`_softRefreshClientDetail(leadId)` (לא דרך timer)
- `_loadClientDetail(leadId, silent)` — פרמטר `silent` מדלג על ספינר
- **visibilitychange הוסר** — Realtime מטפל בעדכונים, לא צריך רענון בחזרה לטאב
- **לא מרעננים רשימה** כשפותחים/סוגרים פרטים — בדיקה אם כבר יש תוכן מרונדר

## הגנות נגד קפיאת דף
- **form-helpers.js**: `_initColorSelects` מאזין על ה-overlay (לא document) — listener נמחק כשהמודל נסגר
- **editors.js**: version counter (`_detailVersion`, `_listVersion`) — טעינה ישנה מבטלת את עצמה אם חדשה התחילה
- **auth.js**: `SIGNED_IN` כש-כבר מחובר עם הרשאות → מדלג (מונע re-init מיותר בחזרה מטאב)
- **router.js**: debounce על `handleRoute` (hash חדש=מיידי, אותו hash=300ms)

## תנועות לקוח לעורכת (linked transactions)
- כשלקוח משלם ישירות לעורכת, נוצרות 2 תנועות מקושרות:
  1. `crm_client_transactions` עם source "לקוח לעורכת"
  2. `crm_editor_transactions` עם type "העברת תשלום מהלקוח לעורכת"
- קישור: `linked_editor_transaction_id` על `crm_client_transactions` (FK → `crm_editor_transactions.id`)
- עריכה/מחיקה של אחת → מעדכנת/מוחקת גם את המקושרת
- פועל גם מצד הלקוחות וגם מצד העורכות

## מסך לקוחות (clients.js)
- רשימת לידים עם פירוט תשלומים בסיידבר (drawer בטבלה, split במובייל)
- **קטגוריות מתקפלות**: זיכוי (ירוק), חוב (אדום), שולם — עם סכום כולל + ספירה
- **פילטרים צבעוניים** (dropdowns):
  - צלם ראשי: יוסי/אריאל/שלומי/יוסף — פילים צבעוניים
  - צלם שני: כל הצוות — פילים צבעוניים (ידועים בצבעים שלהם, שאר אוטומטי)
  - שלב עריכה: multi-select checkboxes עם פילים צבעוניים (17 שלבים)
- **מיון**: לחיצה על כותרת עמודה (▲/▼) — שם, תאריך, צלם, יתרה, שלב, עורכת
- **חיפוש חופשי**: על כל השדות (שם, תאריך, צלם, עורכת, שלב)
- **header sticky**: חיפוש + פילטרים קבועים למעלה בגלילה
- **שמירת מצב ב-localStorage**: פילטרים, מצב פתוח/סגור של קטגוריות, view mode (cards/table)
- **פרוגרס בר** בטבלה: עמודת "תשלום" עם progress bar קומפקטי (paid/total)
- באדג'ים צבעוניים: צלמים (PHOTOGRAPHER_PILL_COLORS), עורכות (EDITOR_PILL_COLORS), שלבי עריכה (EDITING_STAGE_STYLES — 17 שלבים)
- שדות עריכים: package_extras, discount (עריכה ישירה מהתשלומים)
- מקורות תנועות: CRM, יומן אירוע, לקוח לעורכת

## חישוב מחיר ללקוח
- פירוט: package_price + second_photographer + package_extras - discount + event_extras
- **מע"מ דינמי**: 17% לפני 01.01.2025, 18% אחרי — `_getVatRate(lead)` לפי `event_date`
- **תוספת "2 האופציות"**: 500₪ **כולל מע"מ** כש-`editing_style_two_cameras === '2 האופציות'` ב-crm_editing
- **סף יתרה**: ±1₪ — יתרות קטנות מעיגול מע"מ מוצגות כ"שולם ✓"
- **v_client_paid View**: סיכום תשלומים מהDB (SUM+GROUP BY) — מחליף שליפת כל התנועות
- **מע"מ חל רק על מחיר ללקוח** (לא על עלויות פנימיות/צוות)

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

## Sidebar משותף + ניווט בין מודולים
- Sidebar בהיר (רקע לבן) עם כפתור כיווץ
- לינקים ל-5 מודולים: לקוחות/עורכות/צלמים (פנימי), לידים, עריכות (חיצוני)
- **לינקים דינמיים**: כשנמצאים ב-client detail, הלינקים מעבירים לאותו ליד/עריכה לפי `lead_id`
- SVG icons (ללא אימוג'י), ספריית אייקונים ב-ui-components.js
- Mobile: bottom-nav עם כל המודולים

## Deploy (Cloudflare Pages)
- **GitHub repo:** `yosishked/crm-payments` (private)
- **URL:** `https://payments.yossishaked.net` (custom domain)
- **Deploy:** `git push` → Cloudflare בונה אוטומטית
- **Publish directory:** `.` (שורש הפרויקט)
- **Supabase redirect URLs:** צריך להוסיף `https://payments.yossishaked.net/**` ב-Supabase Auth URL Configuration

## SQL
- תיקיית `sql/` לא ב-git — מיגרציות מריצים ידנית ב-Supabase SQL Editor
- Realtime כבר מופעל על `crm_editor_transactions` (חלק מ-`supabase_realtime` publication)

## מסך לקוחות — תצוגת רשימה/טבלה
- toggle כרטיסיות/רשימה — שמור ב-localStorage ('clients-view-mode')
- טבלה: שם הזוג, תאריך, צלם ראשי/שני (שם פרטי בלבד!), יתרה, שלב עריכה, עורכת
- שלב עריכה: נשלף מ-crm_editing.stage דרך API.fetchClientEditingData() — צבעים זהים לcrm-editing
- לחיצה על שורה: פותחת drawer צדי (position:fixed) עם overlay — לא split רגיל
- _applyTableModeClass() מוסיף clients-table-mode ל-#clients-split
- _openDrawer() / _closeDrawer() — חייב לקרוא _closeDrawer() גם בעת רנדור הרשימה (לא רק בסגירה!)
- clients-drawer-overlay — div דינמי שמתווסף ל-body, מוסר כשיוצאים מ-table mode

## note popup (ui-components.js)
- UI.noteCell(text) — קוצר הערות ארוכות + פופאפ בלחיצה
- משתמש ב-data-note + this.dataset.note (לא JSON.stringify ב-onclick — יגרום לבאג גרשיים)
- escapeAttr() מקודד את ה-attribute, הבראוזר מפענח אוטומטית
- חובה: event.stopPropagation() כדי למנוע בעבוע לשורת הטבלה
- z-index: 9990

## UX patterns — scroll + state (כל המודולים)
- גלילה נשמרת ב-sessionStorage: MODULE-list-scroll, MODULE-detail-scroll
- Scroll listeners מתווספים פעם אחת בלבד (_scrollListenersAdded flag)
- רשומה פתוחה נשמרת ב-sessionStorage: MODULE-expanded-id
- ספינר שקט: guard על .detail-card לפני הצגת spinner
- soft refresh: replaceWith (לא remove+appendChild) — שומר על מיקום גלילה
- מדריך מלא לכל הדפוסים: ../performance-ux-patterns.md

## צבעי שלבי עריכה
- מוגדרים ב-EDITING_STAGE_STYLES ב-clients.js
- חייב להיות זהה לצבעים ב-crm-editing/css/style.css (badge-stage-*)
- מקור אמת: crm-editing/css/style.css — שורות badge-stage-*
