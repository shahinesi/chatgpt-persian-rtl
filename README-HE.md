<div align="center">
  <img src="chrome-plugin/assets/hero.svg" alt="ChatGPT Persian RTL" width="100%">

  <br>

  [![Manifest V3](https://img.shields.io/badge/Manifest-V3-10a37f)](chrome-plugin/manifest.json)
  [![Validation](https://github.com/shahinesi/chatgpt-persian-rtl/actions/workflows/validate.yml/badge.svg)](https://github.com/shahinesi/chatgpt-persian-rtl/actions/workflows/validate.yml)
  [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
  [![No tracking](https://img.shields.io/badge/tracking-none-success)](SECURITY.md)

  <br>

  <strong>npm version</strong> · <strong>License: MIT</strong> · <strong>PRs Welcome</strong> · <strong>GitHub stars</strong>

  <br><br>

  [🇮🇷 نسخه فارسی](README-FA.md) | [🇸🇦 العربية](README-AR.md) | [🇮🇱 עברית](README-HE.md) | [🌍 English](README-EN.md)
</div>

# 🌟 ChatGPT Persian RTL Patcher
**תיקון אוטומטי לכתיבה מימין לשמאל וטיפוגרפיה נעימה ל־ChatGPT Desktop ולגרסת האינטרנט.**

זהו מארז חכם לתמיכה ב־RTL ב־ChatGPT, עם שני מסלולים עיקריים:

<p align="center">
✨ *באהבה לטקסטים בעברית, בערבית, בפרסית ובכל שפה שנכתבת מימין לשמאל; ו־Vazirmatn לזכרו של סאבר ראסטיקרדאר.* ✨
</p>

- `chrome-plugin/` עבור תוסף Chrome וגרסת האינטרנט
- `desktop/` עבור חבילת הפאץ' והשחזור ל־ChatGPT Desktop ב־macOS ו־Windows

> הפרויקט הזה עצמאי לחלוטין ואינו קשור ל־OpenAI או מאושר על ידה.

## למה הפרויקט הזה?

<p align="center">
  <img src="docs/diagrams/rtl-problem.svg" alt="השוואת בעיית RTL לפני ואחרי ChatGPT Persian RTL" width="100%">
</p>

- מציג טקסטים בעברית ובערבית כ־RTL עם עדיפות לקריאות
- מטפל בטקסטים מעורבים באנגלית בלי לשבור את הפריסה
- תבליטים, מספור, ציטוטים וכתובות URL לא שוברים את כיוון הטקסט
- קוד, טבלאות, נוסחאות ותוכן טכני נשארים LTR
- גופן Vazirmatn כלול בפרויקט כדי שהפלט יהיה זמין גם ללא רשת
- מקור הגופן הרשמי: [rastikerdar.github.io/vazirmatn/fa](https://rastikerdar.github.io/vazirmatn/fa)

## מה יש כאן?

<p align="center">
  <img src="docs/diagrams/project-map.svg" alt="מפת המסלולים של האינטרנט, מק ו־Windows בפרויקט" width="100%">
</p>

| מסלול | פלט |
|---|---|
| `chrome-plugin/` | תוסף Manifest V3 עבור ChatGPT באינטרנט |
| `desktop/macos/` | התקנה ושחזור של ChatGPT Desktop ב־macOS |
| `desktop/windows/` | התקנה ושחזור של ChatGPT Desktop ב־Windows |

## תכונות

- זיהוי RTL/LTR על בסיס טקסט מנוקה ולא רק התו הראשון
- תמיכה בהודעות שנכתבות ובתיבת הקלט
- שמירה על LTR עבור `code`, `pre`, `table`, `math` ותוכן טכני
- Vazirmatn עבור טקסטים טבעיים בעברית/ערבית/פרסית וממשק התוסף
- ללא מעקב, אנליטיקה או בקשות רשת בזמן ריצה
- שמירת ההגדרות מקומית בלבד

## התקנה בלחיצה אחת

<div dir="ltr" align="left">

```bash
git clone --depth 1 https://github.com/shahinesi/chatgpt-persian-rtl.git
cd chatgpt-persian-rtl/desktop
npm install
npm run patch:macos
```

</div>

<div dir="ltr" align="left">

```powershell
git clone --depth 1 https://github.com/shahinesi/chatgpt-persian-rtl.git
Set-Location chatgpt-persian-rtl\desktop
npm install
npm run patch:windows
```

</div>

### התקנה ישירה מהאינטרנט

<div dir="ltr" align="left">

```bash
git clone --depth 1 https://github.com/shahinesi/chatgpt-persian-rtl.git /tmp/chatgpt-persian-rtl && cd /tmp/chatgpt-persian-rtl/desktop && npm install && npm run patch:macos
```

</div>

<div dir="ltr" align="left">

```powershell
git clone --depth 1 https://github.com/shahinesi/chatgpt-persian-rtl.git $env:TEMP\chatgpt-persian-rtl; Set-Location $env:TEMP\chatgpt-persian-rtl\desktop; npm install; npm run patch:windows
```

</div>

## שחזור למצב המקורי

<div dir="ltr" align="left">

```bash
cd chatgpt-persian-rtl/desktop
npm run restore:macos
```

</div>

<div dir="ltr" align="left">

```powershell
Set-Location chatgpt-persian-rtl\desktop
npm run restore:windows
```

</div>

## תרומה והזמנה לפיתוח

אם אתה רוצה לעזור, אלה התחומים בעלי הערך הגבוה ביותר:

- שיפור זיהוי כיוון לטקסטים מעורבים מורכבים יותר
- התאמה טובה יותר לגרסאות החדשות של ChatGPT באינטרנט ובדסקטופ
- בדיקות על macOS ובדפדפני Chromium אחרים
- שיפור חוויית ההתקנה, השחזור והאריזה
- שיפור הפונט, הריווח והרנדרינג ב־RTL

Pull requests ו־issues נקיים ומתועדים תמיד מבורכים.

## תמיכה בפרויקט

- אפשר לתמוך בפרויקט באמצעות כוכב ב־GitHub
- אם מצאת תקלה או מצב קצה, שלח issue מדויק עם דוגמת שחזור קצרה
- אם יש לך זמן, שלח PR ועזור לייצב תמיכה בגרסאות החדשות יותר של ChatGPT

## תודה

הפרויקט הזה נבנה מתוך כבוד למאמציו של יוצר הגופן Vazirmatn, המנוח **סאבר ראסטיקרדאר**.

## רישיון

הפרויקט מופץ תחת רישיון [MIT](LICENSE).
