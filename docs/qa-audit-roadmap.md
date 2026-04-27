# QA-аудит сценариев: дорожная карта

Документ фиксирует результаты ручного дramaturgical-аудита кампаний и список того,
что ещё предстоит проверить. Любые правки контента делаются вручную — без автогенерации.

## Цикл проверки одной кампании

Для каждой кампании последовательно:

1. **Audit** — прогнать `npx tsx scripts/campaign-flow-dump.ts <campaignId>` и прочитать
   глазами связку `сцена → реплика NPC → вопрос → 5 вариантов → реакция` для всех шагов.
2. **Report** — собрать список конкретных проблем (рассинхрон сцены/реплики/опций,
   повторы, плоский тон реакций, нарушение сюжетной арки, технические формулировки).
3. **Manual fix** — точечно переписать в `questContent.ts`, `scenarioBible.ts`,
   `stepLibrary.ts` и при необходимости — в `reactionPoolsByCampaign.ts`
   (унікальные пулы по 3 реакции на ветку + сцен-специфичные оверрайды
   на каждый 4-й шаг: индексы 3, 7, 11, 15, 19, 23).
4. **Verify** — `npm run build:npc-reactions`, `npm run content:duplicates`,
   `npm run content:scene-dialogue`, `npx tsc --noEmit`, повторный прогон
   `campaign-flow-dump.ts` для контроля.

Кампания считается готовой только после успешной верификации.

## Формат ремарок NPC

Все реакции в `reactionPoolsByCampaign.ts` приведены к единому формату:

- Без имени NPC: `(действие) «реплика»`.
- С именем NPC: `Имя (действие): «реплика»`.

Действие — в нижнем регистре, в скобках. Слова реплики и ремарки не меняются.

## Готовые кампании (первая половина пуша)

Курсы:

- `office-icebreaker`
- `boundary-keeper`
- `serpentine-diplomat`
- `heart-lines`
- `mirror-of-truth`

Long-кампании:

- `sherlock-gaslighter`
- `castle-boundaries`
- `dragon-ultimatum`
- `partisan-hq`
- `stop-crane-train-18plus`
- `healer-empathy`
- `first-word-forest`
- `gryffindor_common_room`
- `ravenclaw_common_room`

Итого: 14 кампаний прошли цикл `audit → manual fix → verify`.

## Что осталось проверить

Long-кампании:

- `hufflepuff_common_room`
- `cinderella-advocate`

Квесты:

- `forest`
- `romance`
- `slytherin`
- `boss`
- `narcissist`

Сезонные ивенты:

- `mindful-communication-month`

Финальный сводный прогон:

- `npm run build:npc-reactions`
- `npm run content:duplicates`
- `npm run content:scene-dialogue`
- Сводный отчёт в чате со списком кампаний, ключевыми правками
  и подтверждением, что все проверки чистые.

## Скрипты-помощники

- `scripts/campaign-flow-dump.ts` — read-only дамп всей кампании в stdout
  (`сцена / реплика / вопрос / варианты / ветка / реакция`).
- `scripts/content-duplicates-report.ts` — отчёт по дублям вопросов и опций
  (не падает, только репортит в `docs/content-duplicates-report.md`).
- `scripts/content-scene-dialogue-duplicates-report.ts` — отчёт по дублям сцен
  и реплик NPC (`docs/content-scene-dialogue-duplicates-report.md`).
- `scripts/build-npc-reactions.ts` — пересборка `content/npc-reactions/all.json`
  из `reactionPoolsByCampaign.ts`. Запускать после любой правки реакций.
