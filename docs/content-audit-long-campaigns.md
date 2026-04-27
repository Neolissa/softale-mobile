# Аудит длинных кампаний (рабочая таблица)

Единый источник шага: `stepLibrary.ts` → `stepLibraryByCampaign` (сцена, оппонент, реплика, вопрос, подсказка, 5 опций — **один индекс**).

## Статус по кампаниям

| Кампания | Шагов | Сцены / вопросы | Реплика оппонента | Опции editorial |
|----------|------:|------------------|-------------------|-----------------|
| sherlock-gaslighter | 35 | из сидов + flatten | из toxicLines + контекст сцены | 35 |
| cinderella-advocate, healer-empathy, partisan-hq, stop-crane-train-18plus, dragon-ultimatum | по 25 | то же | то же | по 25 |
| gryffindor_common_room, ravenclaw_common_room, hufflepuff_common_room, first-word-forest, castle-boundaries | 25 | дефолтные сцены + flatten вопросов | из сидов | 25 |
| narcissist | 35 | ручные ноды + editorial | ручные | 35 |
| forest, romance, slytherin, boss + курсы | см. questContent | ручные | ручные | как в сценарии |

## Порядок ручного дополнения (рекомендация)

1. **Sherlock** (35) — выровнять тон и фактуру реплик под сцены.
2. Пять кампаний **5×5** с готовыми ситуациями — уникальные реплики вместо цикла toxicLines.
3. Пять кампаний **без ручных сцен** — заменить дефолтные сцены на авторские под `arcTextByStage`.
4. Расширить **`reactionPoolsByCampaign.ts`** при необходимости кастомных реакций, затем `npm run build:npc-reactions`.

## Команды

- `npm run content:audit` — запретные маркеры и дубликаты опций.
- `npm run build:npc-reactions` — пересборка `content/npc-reactions/all.json`.
