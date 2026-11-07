SafeWork AI + Gemini

1. GEMINI_API_KEY должна быть в Netlify Environment variables, scope Functions, context Production.
2. Разверните содержимое ZIP через Netlify Deploys (перетащите распакованную папку).
3. Важно: Netlify Drop/manual deploy может не собирать Functions из исходников. Если функция недоступна (404), используйте Git-based deploy с репозиторием и netlify.toml.
4. Ключ никогда не вставляйте в HTML.
5. Бесплатные квоты Gemini могут быть ограничены.
