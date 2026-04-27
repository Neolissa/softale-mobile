import type { CampaignContentId } from "./questContent";

/** Совпадает с BranchId в stepLibrary / App — отдельный тип, чтобы избежать циклических импортов. */
export type ReactionBranchId = "strategist" | "empath" | "boundary" | "challenger" | "architect";

const baseReactionPoolByBranch: Record<ReactionBranchId, string[]> = {
  strategist: [
    "Кивает: «Хорошо, давай по фактам и по шагам».",
    "Сжимает губы и отступает на полшага: «Окей, структура. Продолжай».",
    "Бросает коротко: «Логика ясна. Зафиксируем так».",
    "Хмурится, но голос ровнее: «Понял(а). Сверим с планом».",
    "Отвечает сухо: «Допустим. Тогда без лишних эмоций».",
  ],
  empath: [
    "Выдыхает: «Ладно… Я слышу тебя. Это правда важно».",
    "Кивает мягче: «Окей, попробуем иначе, без давления».",
    "Тихо: «Спасибо, что сказала спокойно. Мне легче».",
    "Протирает лоб: «Понял(а). Давай бережнее».",
    "Короткая пауза: «Слышу. Давай дальше по-человечески».",
  ],
  boundary: [
    "Отшатывается: «Ясно. Тогда без перехода на личности».",
    "Поднимает ладонь: «Стоп. Так — нормально. Дальше — по правилам».",
    "Кивает жестко: «Принято. Граница понятна».",
    "Холоднее: «Окей. Уважаю рамку. Продолжим в ней».",
    "Коротко: «Понял(а). Без унижений — договорились».",
  ],
  challenger: [
    "Щурится: «Ого. Прямо. Ладно, отвечу по сути».",
    "Смешок без тепла: «Хитро. Но ок, держу удар».",
    "Кивает с вызовом: «Ладно, посмотрим на деле».",
    "Отводит взгляд: «Жестко, но честно. Продолжай».",
    "Резче, но без взрыва: «Окей, ты выбрала тон. Я подстроюсь — пока».",
  ],
  architect: [
    "Кивает: «Окей. Тогда зафиксируем процесс и критерии».",
    "Складывает пальцы: «Понял(а). Давай протокол и роли».",
    "Ровно: «Хорошо. Следующий шаг — измеримый».",
    "Коротко: «Принято. Правила ясны — идем дальше».",
    "Спокойно: «Окей. Так устойчивее для всех».",
  ],
};

const allCampaignIds: CampaignContentId[] = [
  "forest",
  "romance",
  "slytherin",
  "boss",
  "narcissist",
  "partisan-hq",
  "stop-crane-train-18plus",
  "first-word-forest",
  "dragon-ultimatum",
  "castle-boundaries",
  "sherlock-gaslighter",
  "cinderella-advocate",
  "healer-empathy",
  "gryffindor_common_room",
  "ravenclaw_common_room",
  "hufflepuff_common_room",
  "office-icebreaker",
  "boundary-keeper",
  "serpentine-diplomat",
  "heart-lines",
  "mirror-of-truth",
];

/**
 * Редакторский пул реакций NPC по кампании и ветке.
 * По умолчанию все кампании получают единый базовый пул; редактор может
 * точечно заменить строки для конкретной кампании/ветки.
 */
export const reactionPoolsByCampaign: Record<CampaignContentId, Record<ReactionBranchId, string[]>> = allCampaignIds.reduce(
  (acc, campaignId) => {
    acc[campaignId] = {
      strategist: [...baseReactionPoolByBranch.strategist],
      empath: [...baseReactionPoolByBranch.empath],
      boundary: [...baseReactionPoolByBranch.boundary],
      challenger: [...baseReactionPoolByBranch.challenger],
      architect: [...baseReactionPoolByBranch.architect],
    };
    return acc;
  },
  {} as Record<CampaignContentId, Record<ReactionBranchId, string[]>>
);
