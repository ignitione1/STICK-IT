# Материалы бумажных стикеров

Фотографическая фактура создана встроенным инструментом imagegen; оригинал сохранён в `public/assets/paper-crumpled-v2.png`, а приложение использует оптимизированную копию `paper-crumpled-v2.webp` с теми же размерами. Это только чистая бумага: текст, аватар, штамп, вложения и элементы управления остаются HTML-элементами.

Фактура накладывается через multiply на пять цветов бумаги. Разные участки изображения используются для разных персональных пресетов; ответный лист использует отдельный масштаб и участок фактуры. Внешних запросов при отображении нет.

Контактная, рассеянная и тень приподнятого края отделены от текстуры. Неровный контур, толщина и загибы формируются в CSS. Падающие тени и металлические/пластиковые блики креплений находятся в SVG-компоненте `Fastening.tsx`; волокна и обрывки скотча — в CSS/SVG.

## Финальный запрос генерации

Использован встроенный imagegen, без CLI/API.

```text
Use case: photorealistic-natural. Asset type: high-resolution material texture for HTML sticky-note backgrounds, not a complete interface. Generate a single square close-up photographic texture of warm white uncoated cellulose stationery paper that was lightly crumpled and carefully flattened again. Camera exactly perpendicular, orthographic, surface fills the ENTIRE frame right to all edges, no sheet outline and no background. Fine visible paper fibres, organic irregular shallow creases and rounded wrinkles of multiple sizes, soft raised ridges with narrow light-facing highlights and corresponding grey-beige shadow valleys; clear tactile three-dimensional relief, but mostly bright ivory with low-to-medium contrast so black HTML text layered over it will remain very readable. Large-scale irregular creases, not a repetitive pattern or orderly folds. Diffused raking natural light from upper left, realistic material photograph, elegant office paper, never distressed parchment. No writing, print, ruled lines, text, letters, logos, stationery, pins, tape, objects, borders, collage, dirt, stains, vignette, or watermark. Keep texture exposure evenly bright across all corners. 1024 square.
```
