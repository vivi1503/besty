# DeepTicker Live

מערכת ניתוח מניות אמריקאיות לפי 5 עקרונות בדיקת נאותות:

1. איכות וריכוזיות הכנסות
2. המרת רווח למזומן ויעילות הון
3. עמידות חוב ומבחני קיצון
4. תמחור מותאם צמיחה
5. איתור מלכודות חשבונאיות

## מקורות נתונים

- **SEC EDGAR** — מקור דיווחים רשמי לדוחות כספיים ו-XBRL.
- **Yahoo Finance via yahoo-finance2** — מקור בלתי רשמי למחיר שוק, פרופיל ומכפילים.

> SEC אינו דורש API key. Yahoo Finance הוא מקור בלתי רשמי ועלול להשתנות או להיחסם.

## התקנה

```bash
npm install
npm run dev
```

פתח:
http://localhost:3000

## פריסה

### Vercel

אפשר להעלות את הפרויקט ל-GitHub ולפרוס ב-Vercel ישירות. הגדר את משתני הסביבה
(ראה `.env.example`) בהגדרות הפרויקט לפני הפריסה — לפחות `SEC_USER_AGENT`.

### Docker

```bash
docker build -t deepticker-live .
docker run -p 3000:3000 \
  -e SEC_USER_AGENT="YourCompany DeepTicker contact@yourdomain.com" \
  deepticker-live
```

התמונה בנויה במצב `standalone` של Next.js (ראה `next.config.ts`), כך שה-runtime
כולל רק את מה שנדרש להרצה — ללא `node_modules` מלא. יש בדיקת בריאות מובנית
ב-`/api/health` (`HEALTHCHECK` ב-Dockerfile).

## תצורת סביבה (Production)

| משתנה | ברירת מחדל | תיאור |
|---|---|---|
| `SEC_USER_AGENT` | ערך גנרי | **חובה בפרודקשן.** SEC דורש User-Agent עם איש קשר אמיתי; ללא כך הבקשות עלולות להיחסם. |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | לא מוגדר | Redis משותף (Upstash REST API) לקאש ול-rate limiting שעובדים נכון גם כשיש כמה instance-ים סימולטנית. בלעדיו המערכת נופלת לזיכרון per-instance — תקין ל-instance יחיד, לא מתואם על פני fleet. |
| `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX` | 60000 / 20 | הגבלת קצב לכל כתובת IP על `/api/analyze/[ticker]`. |
| `YAHOO_TIMEOUT_MS` | 10000 | Timeout קשיח לכל קריאה ל-Yahoo Finance כדי שספק איטי לא יתקע בקשה. |
| `LOG_LEVEL` | `info` | `debug` \| `info` \| `warn` \| `error`. הלוגים נפלטים כ-JSON חד-שורתי. |

## מוכנות לפרודקשן

- **Rate limiting** לכל IP על ה-API עם תמיכה אופציונלית ב-Redis משותף (Upstash) לפריסות multi-instance.
- **Timeouts** על כל קריאה חיצונית (SEC ו-Yahoo) כדי שספק איטי או תקוע לא יתקע את הבקשה.
- **לוגים מובנים (JSON)** עם request id לכל בקשת ניתוח, כולל משך זמן וקוד שגיאה.
- **Health check** ב-`/api/health` לבדיקות liveness/readiness.
- **כותרות אבטחה** (`Content-Security-Policy`, `X-Frame-Options`, `Referrer-Policy` ועוד) דרך `next.config.ts`.
- **Error/Not-Found boundaries** ברמת ה-App Router כך שתקלה בלתי צפויה לא מציגה מסך לבן.
- **בדיקות אוטומטיות** (Vitest) ללוגיקת הניקוד, הקאש וה-rate limiter, ו-CI ב-GitHub Actions (`.github/workflows/deepticker-ci.yml`) שמריץ typecheck + lint + test + build על כל שינוי.
- **פלט standalone + Dockerfile** לפריסה עצמאית ללא תלות ב-Vercel.

### ידוע ומתועד במכוון

`npm audit` מציג 3 אזהרות ברמת high שמקורן ב-`postcss` וב-`sharp` הפנימיים
שחבילת Next.js עצמה גוררת — לא תלויות ישירות של הפרויקט. `sharp` משמש רק את
אופטימיזציית `next/image`, שהאפליקציה הזו לא משתמשת בה כלל, ו-`postcss` משמש
רק בזמן build ולא בזמן ריצה. תיקון מלא דורש שדרוג ל-Next 16 (breaking change);
מומלץ לעקוב אחר יציאת גרסה יציבה ולשדרג בנפרד, עם בדיקות regression.

## הערות חשובות

- חסר מידע? המערכת מחזירה "לא זמין" ולא ממציאה נתון.
- נתון שלא ניתן לבדוק אינו נחשב אוטומטית כ-PASS.
- ציון כולל מנורמל לפי הכללים שניתנים לבדיקה בפועל.
- ריכוזיות לקוחות ו-"הוצאות חד פעמיות" דורשות גילוי מפורש בדוחות ולכן מסומנות כשאין גילוי.
- אין לראות במערכת ייעוץ השקעות.
