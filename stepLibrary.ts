/**
 * Единый источник истины для шага LitRPG-квеста:
 * сцена, оппонент, реплика, вопрос (instruction), подсказка и пять вариантов
 * всегда согласованы по одному индексу шага.
 */
import { editorialStepOptionsByCampaign, manualInstructionByCampaign, manualOpponentLineByCampaign } from "./scenarioBible";
import type { ScenarioCampaignId } from "./scenarioBible";
import { reactionOverridesByCampaignStep } from "./reactionPoolsByCampaign";
import {
  longCampaignSeeds,
  questContentByCampaign,
  type CampaignContentId,
  type LongCampaignSeed,
  type QuestNarrativeNode,
  type QuestCampaignContent,
} from "./questContent";

export type BranchId = "strategist" | "empath" | "boundary" | "challenger" | "architect";

export type StepLibraryEntry = {
  campaignId: CampaignContentId;
  scene: string;
  opponentName: string;
  opponentEmotion: string;
  opponentLine: string;
  instruction: string;
  hint: string;
  emoji: string;
  stageIdx: number;
  turnsPerStage: number;
  arcBeat: string;
  options: [string, string, string, string, string];
  correctSingle: number;
  trapIndex: number;
  branchEffectsByOption: [BranchId, BranchId, BranchId, BranchId, BranchId];
};

const DEFAULT_STAGE_SITUATIONS: string[][] = [
  [
    "Перед стартом общего решения ты предлагаешь зафиксировать рамку разговора.",
    "На первом собрании ты просишь обсуждать критерии, а не личности.",
    "В дебюте конфликта ты возвращаешь разговор к общей цели команды.",
    "В начале этапа ты предлагаешь порядок реплик, чтобы не тонуть в хаосе.",
    "Ты открываешь обсуждение и просишь отделить факты от уколов.",
  ],
  [
    "Под давлением сроков ты удерживаешь фокус на приоритетах, а не на панике.",
    "Когда спор раскаляется, ты переводишь эмоции в проверяемые тезисы.",
    "В середине этапа ты останавливаешь взаимные обвинения и возвращаешь структуру.",
    "Ты фиксируешь, кто за что отвечает, чтобы снять хаос и взаимные претензии.",
    "После резкого выпада ты просишь обсуждать действия и последствия, а не ярлыки.",
  ],
  [
    "В переломной точке ты отказываешься от удобного молчания и говоришь прямо.",
    "Ты замечаешь манипуляцию и спокойно разворачиваешь разговор к сути.",
    "Под попыткой продавить решение ты удерживаешь границу и предлагаешь альтернативу.",
    "На критическом узле ты выбираешь ясность вместо самооправданий.",
    "Ты берешь инициативу и задаешь формат, в котором слышны обе стороны.",
  ],
  [
    "На высоких ставках ты защищаешь позицию без агрессии и без капитуляции.",
    "Когда давление становится личным, ты возвращаешь разговор к правилам процесса.",
    "В предфинале ты гасишь конфликт у ворот и возвращаешь всех к конкретным мерам.",
    "Ты закрываешь дыру в договоренностях, чтобы конфликт не повторился.",
    "В сложном повороте ты удерживаешь контакт и требуешь конкретики.",
  ],
  [
    "В финальной сцене ты подводишь конфликт к ясному решению и последствиям.",
    "Перед развязкой ты фиксируешь, что меняется после этого разговора.",
    "В последнем раунде ты выбираешь формулу, которая выдержит следующий кризис.",
    "Финальный узел: ты соединяешь границы, уважение и результат в одно решение.",
    "В развязке ты закрепляешь правила, по которым команда будет жить дальше.",
  ],
];

const DEFAULT_DECISION_PROMPTS: string[][] = [
  [
    "Как отвечаешь, чтобы задать здоровую рамку разговора с первого хода?",
    "Что скажешь, чтобы сохранить контакт и не отдать контроль?",
    "Какой первый ответ сразу снижает риск эскалации?",
    "Что выберешь в этом узле, чтобы не отдать инициативу давлению?",
    "Как удержишь курс сцены без резкости и без капитуляции?",
  ],
  [
    "Как отвечаешь под давлением, чтобы не потерять позицию?",
    "Что выберешь, чтобы напряжение не сломало результат?",
    "Какой ответ держит и границы, и рабочий темп?",
    "Что скажешь, чтобы сохранить результат и не потерять себя?",
    "Какой ход гасит шум и возвращает разговор к сути?",
  ],
  [
    "Какой ход ломает токсичный сценарий, не ломая диалог?",
    "Что скажешь, чтобы остановить манипуляцию и вернуть факты?",
    "Как отвечаешь в переломе, чтобы не уйти в оправдания или атаку?",
    "Что выберешь, чтобы развернуть сценарий в сторону зрелого решения?",
    "Какой ответ оставит опору на факты и границы одновременно?",
  ],
  [
    "Как удержишь инициативу, когда ставки уже высокие?",
    "Какой ответ не даст конфликту сорваться в личную войну?",
    "Что выбрать, чтобы вывести разговор к взрослой договоренности?",
    "Какой шаг удержит контакт, когда давление становится личным?",
    "Что скажешь сейчас, чтобы не сорваться в старый паттерн?",
  ],
  [
    "Какой финальный ответ закрепит решение и последствия?",
    "Что скажешь, чтобы после развязки система работала устойчиво?",
    "Как завершишь разговор так, чтобы конфликт не вернулся завтра?",
    "Какой финальный ход делает развязку устойчивой, а не разовой?",
    "Что закрепишь в финале, чтобы система не откатилась после сцены?",
  ],
];

function inferBestBranchByHint(hint: string, stageIdx: number, idx: number): BranchId {
  const lowered = hint.toLowerCase();
  if (lowered.includes("границ") || lowered.includes("рамк") || lowered.includes("неприемлем")) return "boundary";
  if (lowered.includes("эмпат") || lowered.includes("эмоц") || lowered.includes("слы") || lowered.includes("контакт")) return "empath";
  if (lowered.includes("правил") || lowered.includes("протокол") || lowered.includes("систем")) return "architect";
  if (lowered.includes("манипул") || lowered.includes("ультимат") || lowered.includes("вызов") || lowered.includes("прям")) return "challenger";
  if (lowered.includes("факт") || lowered.includes("структур") || lowered.includes("приоритет") || lowered.includes("план")) return "strategist";
  const fallbackByStage: BranchId[] = ["strategist", "empath", "boundary", "challenger", "architect"];
  return fallbackByStage[(stageIdx + idx) % fallbackByStage.length];
}

function computeBranchEffects(
  hint: string,
  stageIdx: number,
  idx: number,
  correctSingle: number,
  trapIndex: number
): [BranchId, BranchId, BranchId, BranchId, BranchId] {
  void hint;
  void stageIdx;
  void idx;
  void correctSingle;
  void trapIndex;
  // Восстанавливаем стабильный 1:1 маппинг "вариант ответа -> тактика".
  // Это дает предсказуемый тон NPC-реакции и совпадение с цветами/статистикой.
  return ["strategist", "empath", "boundary", "challenger", "architect"];
}

export function resolveNpcReactionLine(
  campaign: string,
  globalStepIdx: number,
  optionIdx: number,
  branch: BranchId,
  opponentName: string
): string {
  const overrideLine = reactionOverridesByCampaignStep[campaign as CampaignContentId]?.[globalStepIdx]?.[optionIdx];
  if (overrideLine) {
    return overrideLine;
  }

  // Жесткий маппинг: optionIdx (код ответа) задает тон реакции.
  // 0/1/2 — отрицательная динамика, 3/4 — принятие и конструктив.
  // Дополнительно поддерживаем атмосферные матрицы под конкретные кампании.
  const baseToneMatrixByBranch: Record<BranchId, [string, string, string, string, string]> = {
    strategist: [
      "(резко) «Ты сейчас не собираешь картину, ты режешь ее под удобный вывод».",
      "(настороженно) «План есть, но в нем пока больше уверенности, чем опоры».",
      "(с напряжением) «Вижу логику, но она еще слишком хрупкая для доверия».",
      "(ровнее) «Так лучше. По шагам и без скачков — уже рабоче».",
      "(с уважением) «Да, это сильный разбор: ясно, точно и без лишней драмы».",
    ],
    empath: [
      "(резко) «Это не забота, это нажим в мягкой упаковке».",
      "(настороженно) «Слышу слова, но пока не чувствую, что мне здесь безопасно».",
      "(с напряжением) «Тон спокойнее, но внутри еще держу оборону».",
      "(ровнее) «Окей, так я могу слушать, не закрываясь».",
      "(с уважением) «Спасибо. С таким тоном хочется говорить дальше, а не защищаться».",
    ],
    boundary: [
      "(резко) «Стоп. Это уже за гранью — в таком формате дальше не идем».",
      "(настороженно) «Границу услышал(а), но пока держу дистанцию».",
      "(с напряжением) «Рамка обозначена, но осадок еще не ушел».",
      "(ровнее) «Окей, так граница звучит честно, без унижения».",
      "(с уважением) «Принято. Четкая граница здесь абсолютно по делу».",
    ],
    challenger: [
      "(резко) «Это не сила позиции, это срыв в лобовую».",
      "(настороженно) «Прямо сказано, но пока слишком на грани».",
      "(с напряжением) «Ход сильный, только не дай ему сорваться в давление».",
      "(ровнее) «Ого. Прямо. Ладно, отвечу по сути».",
      "(с уважением) «Сильный прорыв: твердо по делу и без дешевой войны».",
    ],
    architect: [
      "(резко) «Сейчас это звучит как бумага ради бумаги, не как решение».",
      "(настороженно) «Правило разумное, но пока не верю, что его дожмут до практики».",
      "(с напряжением) «Каркас собран, но держится пока на честном слове».",
      "(ровнее) «Окей, уже похоже на процесс, который переживет эмоции».",
      "(с уважением) «Отлично. Это можно спокойно закреплять как новую норму».",
    ],
  };

  const sherlockToneMatrixByBranch: Record<BranchId, [string, string, string, string, string]> = {
    strategist: [
      "(холодно) «Ты сейчас подгоняешь картину. Суд такое снесет за две минуты».",
      "(с прищуром) «Версия стройная, но улик под нее пока не хватает».",
      "(сдержанно) «Логика есть, но без второго подтверждения это все еще гипотеза».",
      "(ровнее) «Так уже лучше: факт, источник, проверка. Продолжай».",
      "(с уважением) «Вот это уровень следователя: хронология, верификация и чистый контур доказательств».",
    ],
    empath: [
      "(сухо) «Не лечи меня тоном. Мне нужны факты, а не сочувственный дым».",
      "(настороженно) «Слышу тебя, но пока пахнет попыткой смягчить провал».",
      "(напряженно) «Человечно — да. Но дело все еще держится на тонком льду».",
      "(ровнее) «Окей, в таком тоне можно работать без взаимных уколов».",
      "(с уважением) «Хорошо. Мягко по форме, жестко по фактам — редкое сочетание».",
    ],
    boundary: [
      "(жестко) «Границу вижу. Еще шаг в давление — и разговор закончится протоколом».",
      "(сдержанно) «Рамка обозначена, но я пока держу тебя на проверке».",
      "(напряженно) «Формат выровнен, но доверия тут еще на пол-оборота».",
      "(ровнее) «Принято. Без личных выпадов мы хотя бы видим дело, а не спектакль».",
      "(с уважением) «Да, такая граница держит допрос в правовом поле».",
    ],
    challenger: [
      "(с усмешкой) «Красиво бьешь, но пока мимо доказательной базы».",
      "(с прищуром) «Прямо. Слишком прямо. На таком градусе легко сорваться в шум».",
      "(напряженно) «Ход дерзкий, но если не подкрепишь фактами — сгорит».",
      "(ровнее) «Ого. Прямо. Ладно, отвечу по сути».",
      "(с уважением) «Сильный ход. Ты давишь не громкостью, а точностью — это чувствуется».",
    ],
    architect: [
      "(холодно) «Пока это выглядит как процесс ради оправданий».",
      "(настороженно) «Схема здравая, но я не вижу, кто ответит за срыв».",
      "(напряженно) «Каркас есть, вопрос — выдержит ли он первый перекрестный допрос».",
      "(ровнее) «Окей, так уже похоже на контур, который можно защищать в суде».",
      "(с уважением) «Отлично. Такой протокол переживает и шум, и давление сверху».",
    ],
  };

  const romanceToneMatrixByBranch: Record<BranchId, [string, string, string, string, string]> = {
    strategist: [
      "(с обидной усмешкой) «Ты говоришь как на планерке, а не как человек рядом».",
      "(настороженно) «Логика правильная, но тепла в ней пока ноль».",
      "(сдержанно) «Головой понимаю, сердцем пока не отпускает».",
      "(ровнее) «Окей, так хотя бы ясно, о чем мы и куда идем».",
      "(теплее) «Вот это взрослая близость: и сердце на месте, и мысли в порядке».",
    ],
    empath: [
      "(с отторжением) «Не гладь меня словами, если внутри ты уже ушла».",
      "(настороженно) «Слышу нежность, но пока боюсь снова обжечься».",
      "(напряженно) «Тон мягкий, боль еще громкая».",
      "(ровнее) «Так уже легче. Я могу слышать тебя без брони».",
      "(с благодарностью) «Да... Вот так и звучит забота, в которой не теряешь себя».",
    ],
    boundary: [
      "(жестко) «Нет. Любовь не дает права заходить за мою черту».",
      "(настороженно) «Границу приняла, но доверие возвращается медленно».",
      "(с напряжением) «Формат ровный, осадок еще остался».",
      "(ровнее) «Окей, так можно: и честно, и без удара по мне».",
      "(с уважением) «Принято. Эта граница защищает нас обоих, не только тебя».",
    ],
    challenger: [
      "(колко) «Это не прямота, это попытка победить любой ценой».",
      "(настороженно) «Смело, но пока слишком остро для хрупкого разговора».",
      "(напряженно) «Ход сильный, только не превращай его в бойню».",
      "(ровнее) «Ого... Ладно, услышала. Отвечаю без игр».",
      "(с уважением) «Сильный шаг. Ты назвала правду и не разрушила контакт».",
    ],
    architect: [
      "(сухо) «План отношений — красиво на бумаге, но где в нем мы?».",
      "(настороженно) «Правила звучат разумно, но я боюсь, что их забудут в первом шторме».",
      "(сдержанно) «Каркас есть, тепла в нем пока маловато».",
      "(ровнее) «Окей, теперь это похоже на ритм, в котором можно жить».",
      "(с теплом) «Да, вот это опора: не обещание на вечер, а путь на каждый день».",
    ],
  };

  const bossToneMatrixByBranch: Record<BranchId, [string, string, string, string, string]> = {
    strategist: [
      "(резко) «Мне не нужна презентация, мне нужен результат».",
      "(с прищуром) «План приличный, но риск пока недооценен».",
      "(сдержанно) «Логика есть, но запас прочности пока тонкий».",
      "(ровнее) «Так, уже лучше. Это можно отдать в работу».",
      "(с уважением) «Сильный управленческий ход: четко, трезво и в срок».",
    ],
    empath: [
      "(холодно) «Мы не в кружке поддержки, держи фокус на задаче».",
      "(настороженно) «Тон бережный, но не уводи этим от сути».",
      "(с напряжением) «Человечно, да. Только бизнес-боль от этого не исчезла».",
      "(ровнее) «Окей, в таком формате можно спорить без пожара».",
      "(с уважением) «Хорошо. Команда услышана, решение не размазано».",
    ],
    boundary: [
      "(жестко) «Стоп. На крик я не работаю».",
      "(сдержанно) «Граница обозначена, проверю, как ты ее удержишь под давлением».",
      "(напряженно) «Рамка выровнена, но доверие еще в тестовом режиме».",
      "(ровнее) «Принято. Так разговаривают взрослые люди, а не пожарная сирена».",
      "(с уважением) «Да, эта граница держит и людей, и результат».",
    ],
    challenger: [
      "(колко) «Громко. Но пока это больше про амбицию, чем про решение».",
      "(настороженно) «Прямо, но еще шаг — и сорвемся в конфликт ради конфликта».",
      "(напряженно) «Ход сильный, только удержи контроль над тоном».",
      "(ровнее) «Ого. Ладно, беру. Отвечаю по делу».",
      "(с уважением) «Вот это удар в точку: жестко к проблеме, не к людям».",
    ],
    architect: [
      "(сухо) «Процедура ради процедуры нам сейчас не поможет».",
      "(настороженно) «Схема здравая, но в пике ее обычно забывают».",
      "(с напряжением) «Каркас есть, но пока держится на энтузиазме пары людей».",
      "(ровнее) «Окей, это уже система, а не ручное геройство».",
      "(с уважением) «Отлично. Такую рамку можно внедрять как новый стандарт отдела».",
    ],
  };

  const narcissistToneMatrixByBranch: Record<BranchId, [string, string, string, string, string]> = {
    strategist: [
      "(с холодной улыбкой) «Любишь схемы? Удобно прятать в них страх».",
      "(вкрадчиво) «План красивый. Почти верю, что ты сама в него веришь».",
      "(с напряжением) «Логика есть, но я все еще вижу твои сомнения».",
      "(ровнее) «Хм. Уже ближе к реальности, а не к самообману».",
      "(с уважением) «Сильный ход. Ты держишь факты, и мной уже не поиграть».",
    ],
    empath: [
      "(ядовито мягко) «О, забота. Как трогательно и как предсказуемо».",
      "(настороженно) «Слышу тепло, но пока проверяю, не крючок ли это».",
      "(напряженно) «Тон бережный, а воздух все еще колючий».",
      "(ровнее) «Ладно. Так хотя бы можно говорить без спектакля».",
      "(с уважением) «Да, это взрослая эмпатия: без спасательства и без самоотмены».",
    ],
    boundary: [
      "(холодно) «Граница? Смело. Обычно на этом ты сдавалась».",
      "(с прищуром) «Рамку обозначила, посмотрим, не дрогнешь ли через минуту».",
      "(напряженно) «Формат стал чище, но игра на нервах еще жива».",
      "(ровнее) «Окей. Эту границу я услышал(а) и обойти не выйдет».",
      "(с уважением) «Принято. Вот так и выглядит человек, которого нельзя продавить».",
    ],
    challenger: [
      "(смешливо) «Ударила в лоб. Красиво, но рискованно».",
      "(настороженно) «Прямо — да. Но не сорвись в войну ради самооценки».",
      "(напряженно) «Ход острый. Держи его точным, не шумным».",
      "(ровнее) «Ого. Ладно, это было по делу. Отвечаю без маски».",
      "(с уважением) «Сильный прорыв. Ты вскрыла манипуляцию и не потеряла себя».",
    ],
    architect: [
      "(сухо) «Правила? Для тебя или для нас обоих — вопрос интересный».",
      "(настороженно) «Схема разумная, но мне нужен не лозунг, а последствия».",
      "(с напряжением) «Каркас есть, только проверка начнется на первом триггере».",
      "(ровнее) «Окей, это уже похоже на контракт с реальными границами».",
      "(с уважением) «Да, так и нужно: прозрачные правила, в которых манипуляции не выживают».",
    ],
  };

  const healerEmpathyToneMatrixByBranch: Record<BranchId, [string, string, string, string, string]> = {
    strategist: [
      "(сдержанно) «Схема есть, но без клинических приоритетов она опасна».",
      "(настороженно) «План звучит разумно, проверь триггеры ухудшения».",
      "(с напряжением) «Логика выстроена, но нагрузка команды на пределе».",
      "(ровнее) «Так уже безопаснее: приоритет, ресурс, следующий шаг».",
      "(с уважением) «Отличный клинический ход: точно, бережно и с учетом последствий».",
    ],
    empath: [
      "(мягко, но твердо) «Сочувствие важно, но без рамки оно нас истощит».",
      "(настороженно) «Слышу заботу, проверь, не идешь ли в самопожертвование».",
      "(с напряжением) «Тон теплый, ресурс все еще на красной зоне».",
      "(ровнее) «Окей, так работает: и человеку легче, и ты не распадаешься».",
      "(с уважением) «Да. Это зрелая эмпатия: контакт есть, самоуничтожения нет».",
    ],
    boundary: [
      "(строго) «Стоп. Помощь без границ превращается в скрытый вред».",
      "(настороженно) «Граница названа, важно теперь удержать ее в смене».",
      "(с напряжением) «Рамка есть, но триггеры перегруза еще рядом».",
      "(ровнее) «Принято. Так можно помогать, не теряя себя».",
      "(с уважением) «Отлично. Эта граница защищает и пациента, и тебя».",
    ],
    challenger: [
      "(резче) «Смело, но не путай решительность с импульсом».",
      "(настороженно) «Прямо сказано, держи фокус на клинической цели».",
      "(с напряжением) «Ход сильный, проверь, не растет ли риск побочки».",
      "(ровнее) «Окей, это уже не реактивность, а точное вмешательство».",
      "(с уважением) «Сильный разворот: ты остановила токсичный сценарий без лишней травмы».",
    ],
    architect: [
      "(сухо) «Регламент ради галочки не лечит».",
      "(настороженно) «Схема здравая, но кто закрывает контроль исполнения?».",
      "(с напряжением) «Каркас собран, теперь нужен ритм и супервизия».",
      "(ровнее) «Окей, так уже похоже на устойчивый контур помощи».",
      "(с уважением) «Да, это профессионально: система, в которой люди не выгорают».",
    ],
  };

  const dragonUltimatumToneMatrixByBranch: Record<BranchId, [string, string, string, string, string]> = {
    strategist: [
      "(с ледяным презрением) «Счеты без воли к действию — лишь красивый свиток».",
      "(настороженно) «План ясен, но цена короны еще не учтена до конца».",
      "(с напряжением) «Логика крепка, однако поле битвы любит ломать расчеты».",
      "(ровнее) «Так уже лучше: шаг, риск и щит для людей названы».",
      "(с уважением) «Это ход правителя: холодный расчет и ясный горизонт».",
    ],
    empath: [
      "(холодно) «Сердце без воли — роскошь перед пламенем».",
      "(настороженно) «Слышу сострадание, не дай ему превратиться в слабость».",
      "(с напряжением) «Тон бережный, ставки все еще на грани катастрофы».",
      "(ровнее) «Окей, так звучит сила без жестокости».",
      "(с уважением) «Редкое искусство: защитить людей и не потерять трон в тумане страха».",
    ],
    boundary: [
      "(жестко) «Стоп. Ультиматум не коронует, он порабощает».",
      "(настороженно) «Граница обозначена, теперь удержи ее под ревом огня».",
      "(с напряжением) «Рамка выстроена, но враг еще ищет трещину».",
      "(ровнее) «Принято. Так держат линию без унижения и паники».",
      "(с уважением) «Да. Эта граница защищает достоинство королевства».",
    ],
    challenger: [
      "(с насмешкой) «Броский выпад. Не всякий клинок выдержит обратный удар».",
      "(настороженно) «Прямота сильна, но шаг до безрассудства еще мал».",
      "(с напряжением) «Ход дерзкий, пусть дерзость служит делу, а не гордыне».",
      "(ровнее) «Ого. Прямо. Хорошо, отвечаю без завес».",
      "(с уважением) «Сильный прорыв: ты не кланяешься угрозе и не срываешься в хаос».",
    ],
    architect: [
      "(сухо) «Пустые указы не остановят ни дракона, ни голод».",
      "(настороженно) «Архитектура верна, проверь, где рухнет первая опора».",
      "(с напряжением) «Каркас есть, но шторм уже проверяет его на прочность».",
      "(ровнее) «Окей, это уже контур державы, а не импровизация двора».",
      "(с уважением) «Отлично. Такой договор переживет и пламя, и предательство».",
    ],
  };

  const cinderellaAdvocateToneMatrixByBranch: Record<BranchId, [string, string, string, string, string]> = {
    strategist: [
      "(с холодной вежливостью) «Схема без статуса и подписи в этом доме ничего не стоит».",
      "(настороженно) «План аккуратный, но его легко размоют в улыбках».",
      "(с напряжением) «Логика есть, а вот опора пока слишком тонкая».",
      "(ровнее) «Окей, так уже звучит как позиция, а не оправдание».",
      "(с уважением) «Сильный ход: ясно, достойно и с защитой своих прав».",
    ],
    empath: [
      "(колко) «Нежность без границы здесь читают как слабость».",
      "(настороженно) «Слышу тепло, но проверяю, не попросят ли за него расплатиться собой».",
      "(с напряжением) «Тон мягкий, но старые крючки еще рядом».",
      "(ровнее) «Окей, так можно: бережно и без самоунижения».",
      "(с уважением) «Да, это редкая сила — сохранять сердце и не отдавать достоинство».",
    ],
    boundary: [
      "(жестко) «Стоп. Семейный титул не дает права переходить твою черту».",
      "(настороженно) «Границу услышали, но будут проверять на прочность».",
      "(с напряжением) «Рамка названа, воздух все еще колючий».",
      "(ровнее) «Принято. Эта граница звучит взрослой и спокойной».",
      "(с уважением) «Да. Так и держат себя в доме, где любят давить «заботой»».",
    ],
    challenger: [
      "(с усмешкой) «Прямо сказано. Почти дерзко для этой гостиной».",
      "(настороженно) «Сильный тон, но шаг до скандала еще близко».",
      "(с напряжением) «Ход острый, не дай ему стать войной ради статуса».",
      "(ровнее) «Ого. Ладно, в этот раз играем по сути».",
      "(с уважением) «Сильный прорыв: ты не прогнулась и не сорвалась в ярость».",
    ],
    architect: [
      "(сухо) «Без правил этот дом всегда возвращается к старой жестокости».",
      "(настороженно) «Контур разумный, но без последствий его быстро забудут».",
      "(с напряжением) «Каркас есть, осталось вшить его в ритуалы дома».",
      "(ровнее) «Окей, это уже похоже на договор, который переживет ужин».",
      "(с уважением) «Отлично. Такой порядок защищает и тебя, и тех, кто рядом».",
    ],
  };

  const officeIcebreakerToneMatrixByBranch: Record<BranchId, [string, string, string, string, string]> = {
    strategist: [
      "(резко) «Слайды красивые, но релиз от этого сам не починится».",
      "(настороженно) «План неплохой, риск по срокам еще недооценен».",
      "(с напряжением) «Логика собрана, но команда пока на грани срыва».",
      "(ровнее) «Окей, так уже можно отдавать в работу».",
      "(с уважением) «Сильный управленческий ход: приоритеты ясны, ответственность обозначена».",
    ],
    empath: [
      "(сухо) «Поддержка важна, но не подменяй ей решение».",
      "(настороженно) «Слышу тон, проверяю, останется ли в нем место для результата».",
      "(с напряжением) «Атмосфера стала мягче, дедлайн все еще горит».",
      "(ровнее) «Окей, так и команда слышна, и задача не потеряна».",
      "(с уважением) «Да, это зрелая коммуникация: люди не ломаются, работа идет».",
    ],
    boundary: [
      "(жестко) «Стоп. На крике и уколах мы не собираем продукт».",
      "(настороженно) «Граница поставлена, посмотрим, удержишь ли ее в пике».",
      "(с напряжением) «Формат выровнен, осадок в команде еще есть».",
      "(ровнее) «Принято. Так можно спорить и не жечь друг друга».",
      "(с уважением) «Да. Эта граница держит и качество, и людей».",
    ],
    challenger: [
      "(колко) «Сильно сказано, только не сорвись в демонстрацию силы».",
      "(настороженно) «Прямо. Полезно, если останемся в деловом контуре».",
      "(с напряжением) «Ход мощный, удержи его без лишней эскалации».",
      "(ровнее) «Ого. Ладно, давай без театра — к сути».",
      "(с уважением) «Сильный прорыв: удар по проблеме, а не по людям».",
    ],
    architect: [
      "(сухо) «Процесс ради процесса нам сейчас не поможет».",
      "(настороженно) «Схема здравая, вопрос — кто будет держать ее в шторм».",
      "(с напряжением) «Каркас есть, но пока держится на ручном контроле».",
      "(ровнее) «Окей, это уже система, а не пожарный режим».",
      "(с уважением) «Отлично. Такой контур можно фиксировать как стандарт команды».",
    ],
  };

  const campaignToneMatrixById: Partial<Record<CampaignContentId, Record<BranchId, [string, string, string, string, string]>>> = {
    "sherlock-gaslighter": sherlockToneMatrixByBranch,
    romance: romanceToneMatrixByBranch,
    boss: bossToneMatrixByBranch,
    narcissist: narcissistToneMatrixByBranch,
    "healer-empathy": healerEmpathyToneMatrixByBranch,
    "dragon-ultimatum": dragonUltimatumToneMatrixByBranch,
    "cinderella-advocate": cinderellaAdvocateToneMatrixByBranch,
    "office-icebreaker": officeIcebreakerToneMatrixByBranch,
  };

  const toneMatrixByBranch = campaignToneMatrixById[campaign as CampaignContentId] ?? baseToneMatrixByBranch;
  const toneRows = toneMatrixByBranch[branch] ?? toneMatrixByBranch.strategist;
  const safeIdx = Math.max(0, Math.min(4, optionIdx));
  return `${opponentName.trim()}: ${toneRows[safeIdx]}`;
}

function editorialFor(campaign: CampaignContentId) {
  const ed = editorialStepOptionsByCampaign[campaign as ScenarioCampaignId];
  if (!ed) {
    throw new Error(`[stepLibrary] Нет editorialStepOptionsByCampaign для кампании "${campaign}"`);
  }
  return ed;
}

function buildFromHandCampaign(campaign: CampaignContentId, data: QuestCampaignContent): StepLibraryEntry[] {
  const editorial = editorialFor(campaign);
  const tps = data.blocks[0]?.nodes.length ?? 5;
  data.blocks.forEach((b, i) => {
    if (b.nodes.length !== tps) {
      throw new Error(`[stepLibrary] Неравное число узлов в блоках кампании "${campaign}" (блок ${i})`);
    }
  });
  const out: StepLibraryEntry[] = [];
  let globalIdx = 0;
  data.blocks.forEach((block, blockIdx) => {
    block.nodes.forEach((node) => {
      const ed = editorial[globalIdx];
      if (!ed) {
        throw new Error(`[stepLibrary] Нет ручных опций для "${campaign}" шаг ${globalIdx + 1}`);
      }
      const options = ed.options.map((line) => line.replace(/\s+/g, " ").trim()) as StepLibraryEntry["options"];
      const correctSingle = Math.max(0, Math.min(4, ed.correctSingle));
      const trapIndex = Math.max(0, Math.min(4, ed.trapIndex ?? 1));
      const branchEffectsByOption = computeBranchEffects(node.hint, blockIdx, globalIdx, correctSingle, trapIndex);
      out.push({
        campaignId: campaign,
        scene: node.disposition,
        opponentName: node.opponentDescription,
        opponentEmotion: node.opponentEmotion,
        opponentLine: node.opponentReplica,
        instruction: node.decisionPrompt.trim(),
        hint: node.hint,
        emoji: node.emoji,
        stageIdx: blockIdx,
        turnsPerStage: tps,
        arcBeat: block.arcText,
        options,
        correctSingle,
        trapIndex,
        branchEffectsByOption,
      });
      globalIdx += 1;
    });
  });
  return out;
}

function flattenSituations(seed: LongCampaignSeed, stages: number, tps: number): string[] {
  const out: string[] = [];
  for (let s = 0; s < stages; s += 1) {
    const row =
      seed.stageSituationsByStage?.[s] ?? DEFAULT_STAGE_SITUATIONS[s % DEFAULT_STAGE_SITUATIONS.length];
    for (let t = 0; t < tps; t += 1) {
      // Строгое выравнивание: scene/реплика/вопрос/опции должны жить на одном индексe шага.
      out.push(row[t % row.length] ?? row[0]);
    }
  }
  return out;
}

function flattenInstructions(seed: LongCampaignSeed, scenes: string[], stages: number, tps: number): string[] {
  const out: string[] = [];
  for (let s = 0; s < stages; s += 1) {
    const row =
      seed.decisionPromptTemplatesByStage?.[s] ?? DEFAULT_DECISION_PROMPTS[s % DEFAULT_DECISION_PROMPTS.length];
    for (let t = 0; t < tps; t += 1) {
      // Вопрос должен соответствовать той же позиции внутри этапа, что и сцена.
      const base = row[t % row.length] ?? row[0];
      const i = s * tps + t;
      const lead = scenes[i]?.split(/[.!?]/)[0]?.trim() ?? "";
      out.push(lead.length > 14 ? `${base} (опираясь на ситуацию: ${lead})` : base);
    }
  }
  return out;
}

function assertUniqueQuestions(campaign: string, questions: string[]) {
  const seen = new Set<string>();
  for (let i = 0; i < questions.length; i += 1) {
    const normalized = questions[i].replace(/\s+/g, " ").trim().toLowerCase();
    if (!normalized) {
      throw new Error(`[stepLibrary] Пустой вопрос в кампании "${campaign}" шаг ${i + 1}`);
    }
    if (seen.has(normalized)) {
      throw new Error(`[stepLibrary] Повтор вопроса в кампании "${campaign}" на шаге ${i + 1}: "${questions[i]}"`);
    }
    seen.add(normalized);
  }
}

function flattenOpponentLines(seed: LongCampaignSeed, scenes: string[], stages: number, tps: number): string[] {
  const out: string[] = [];
  const total = stages * tps;
  const recentWindow = Math.min(8, Math.max(1, Math.floor(seed.toxicLines.length / 3)));
  const recent: string[] = [];
  const usedFullLines = new Set<string>();
  for (let i = 0; i < total; i += 1) {
    const s = Math.floor(i / tps);
    const name = seed.opponents[s % seed.opponents.length];
    const emo = seed.emotions[s % seed.emotions.length];
    const baseIdx = (i * 3 + s) % seed.toxicLines.length;
    let line = seed.toxicLines[baseIdx];
    if (recent.includes(line)) {
      for (let shift = 1; shift < seed.toxicLines.length; shift += 1) {
        const candidate = seed.toxicLines[(baseIdx + shift) % seed.toxicLines.length];
        if (!recent.includes(candidate)) {
          line = candidate;
          break;
        }
      }
    }
    // Не повторяем точную реплику (имя+эмоция+текст) внутри одной кампании, если есть альтернатива в пуле.
    const compose = (candidate: string) => `${name} ${emo}: «${candidate}»`;
    if (usedFullLines.has(compose(line))) {
      for (let shift = 1; shift < seed.toxicLines.length; shift += 1) {
        const candidate = seed.toxicLines[(baseIdx + shift) % seed.toxicLines.length];
        if (!usedFullLines.has(compose(candidate))) {
          line = candidate;
          break;
        }
      }
    }
    recent.push(line);
    if (recent.length > recentWindow) {
      recent.shift();
    }
    const fullLine = `${name} ${emo}: «${line}»`;
    usedFullLines.add(fullLine);
    out.push(fullLine);
  }
  return out;
}

function buildFromLongSeed(seed: LongCampaignSeed): StepLibraryEntry[] {
  const editorial = editorialFor(seed.id as CampaignContentId);
  const stages = seed.arcTextByStage.length;
  const tps = Number.isFinite(seed.turnsPerStage) ? Math.max(1, Number(seed.turnsPerStage)) : 5;
  const total = stages * tps;
  if (editorial.length < total) {
    throw new Error(`[stepLibrary] Кампания "${seed.id}": в сценарной библиотеке ${editorial.length} наборов опций, нужно ${total}`);
  }
  const scenes = flattenSituations(seed, stages, tps);
  const manual = manualInstructionByCampaign[seed.id as ScenarioCampaignId];
  const instructions = manual?.length
    ? manual.map((q) => q.trim())
    : flattenInstructions(seed, scenes, stages, tps);
  if (manual?.length && manual.length !== total) {
    throw new Error(`[stepLibrary] Кампания "${seed.id}": manualInstructionByCampaign содержит ${manual.length} вопросов, нужно ${total}`);
  }
  assertUniqueQuestions(seed.id, instructions);
  const manualOpponentLines = manualOpponentLineByCampaign[seed.id as ScenarioCampaignId];
  const opponentLines = manualOpponentLines?.length
    ? manualOpponentLines.map((line) => line.trim())
    : flattenOpponentLines(seed, scenes, stages, tps);
  if (manualOpponentLines?.length && manualOpponentLines.length !== total) {
    throw new Error(`[stepLibrary] Кампания "${seed.id}": manualOpponentLineByCampaign содержит ${manualOpponentLines.length} реплик, нужно ${total}`);
  }
  const out: StepLibraryEntry[] = [];
  for (let i = 0; i < total; i += 1) {
    const stageIdx = Math.floor(i / tps);
    const ed = editorial[i];
    const options = ed.options.map((line) => line.replace(/\s+/g, " ").trim()) as StepLibraryEntry["options"];
    const correctSingle = Math.max(0, Math.min(4, ed.correctSingle));
    const trapIndex = Math.max(0, Math.min(4, ed.trapIndex ?? 1));
    const hint = seed.hintByStage[stageIdx] ?? seed.hintByStage[seed.hintByStage.length - 1] ?? "";
    const branchEffectsByOption = computeBranchEffects(hint, stageIdx, i, correctSingle, trapIndex);
    out.push({
      campaignId: seed.id as CampaignContentId,
      scene: scenes[i],
      opponentName: seed.opponents[stageIdx % seed.opponents.length],
      opponentEmotion: seed.emotions[stageIdx % seed.emotions.length],
      opponentLine: opponentLines[i],
      instruction: instructions[i],
      hint,
      emoji: seed.emojiByStage[stageIdx] ?? seed.emojiByStage[seed.emojiByStage.length - 1] ?? "🎯",
      stageIdx,
      turnsPerStage: tps,
      arcBeat: seed.arcTextByStage[stageIdx],
      options,
      correctSingle,
      trapIndex,
      branchEffectsByOption,
    });
  }
  return out;
}

function buildAllStepLibraries(): Record<CampaignContentId, StepLibraryEntry[]> {
  const result = {} as Record<CampaignContentId, StepLibraryEntry[]>;
  (Object.keys(questContentByCampaign) as CampaignContentId[]).forEach((id) => {
    result[id] = buildFromHandCampaign(id, questContentByCampaign[id]);
  });
  longCampaignSeeds.forEach((seed) => {
    result[seed.id as CampaignContentId] = buildFromLongSeed(seed);
  });
  return result;
}

export const stepLibraryByCampaign: Record<CampaignContentId, StepLibraryEntry[]> = buildAllStepLibraries();

export function getTurnsPerStage(campaign: string): number {
  const steps = stepLibraryByCampaign[campaign as CampaignContentId];
  return steps?.[0]?.turnsPerStage ?? 5;
}

export function getStageIdxLinear(campaign: string, stepIdx: number): number {
  const tps = getTurnsPerStage(campaign);
  return Math.floor(Math.max(0, stepIdx) / tps);
}

export function getCampaignBlockArc(campaign: string, stageIdx: number): string {
  const steps = stepLibraryByCampaign[campaign as CampaignContentId];
  if (!steps?.length) {
    return "";
  }
  const safe = Math.max(0, Math.min(steps[steps.length - 1].stageIdx, stageIdx));
  const row = steps.find((s) => s.stageIdx === safe);
  return row?.arcBeat ?? steps[0].arcBeat;
}

/** Совместимость: старый движок ожидал QuestNarrativeNode[] */
export function getCampaignNodes(campaign: CampaignContentId): QuestNarrativeNode[] {
  return (stepLibraryByCampaign[campaign] ?? []).map((e) => ({
    disposition: e.scene,
    opponentDescription: e.opponentName,
    opponentEmotion: e.opponentEmotion,
    opponentReplica: e.opponentLine,
    decisionPrompt: e.instruction,
    emoji: e.emoji,
    hint: e.hint,
  }));
}
