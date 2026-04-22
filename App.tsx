import { StatusBar } from "expo-status-bar";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { type ComponentProps, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  type StyleProp,
  Text,
  type TextStyle,
  TextInput,
  View,
  type ViewStyle,
} from "react-native";

type Tab = "map" | "quest" | "event" | "feedback" | "profile" | "admin";
type AnalyticsEventType =
  | "session_start"
  | "session_end"
  | "auth_register"
  | "auth_login"
  | "tab_view"
  | "diagnostic_answer"
  | "diagnostic_complete"
  | "course_start"
  | "course_complete"
  | "quest_start"
  | "quest_complete"
  | "step_pass"
  | "step_fail"
  | "penalty_applied"
  | "hint_opened"
  | "drop_off"
  | "branch_shift"
  | "ending_unlock";

type AnalyticsEvent = {
  id: string;
  at: string;
  type: AnalyticsEventType;
  details?: string;
  tab?: Tab;
  courseId?: CourseId;
  storyId?: QuestStory;
  difficulty?: QuestDifficulty;
  stepIndex?: number;
};

type UserAnalytics = {
  firstSeenAt: string;
  lastSeenAt: string;
  totalSessions: number;
  totalTimeSec: number;
  diagnosticAnswers: { questionId: string; optionIndex: number; style: ConflictStyleId; at: string }[];
  events: AnalyticsEvent[];
  counters: {
    courseStarts: number;
    courseCompletions: number;
    questStarts: number;
    questCompletions: number;
    stepFails: number;
    penalties: number;
    dropOffs: number;
  };
};

type Quest = {
  id: string;
  biome: string;
  title: string;
  prompt: string;
  reward: number;
};

type IconName = ComponentProps<typeof Feather>["name"];
type IllustrationName = ComponentProps<typeof MaterialCommunityIcons>["name"];
type VisualSlot = {
  id: string;
  zone: string;
  size: string;
  source: "Feather" | "MaterialCommunityIcons" | "Emoji" | "Fallback";
  content: string;
};
type ForestStepType = "single" | "multiple" | "builder";
type BranchId = "strategist" | "empath" | "boundary" | "challenger" | "architect";
type EndingRouteId = "order" | "harmony" | "boundary" | "breakthrough";
type ForestStep = {
  id: string;
  title: string;
  type: ForestStepType;
  phase?: "prefs" | "sugar" | "abuse" | "breakup";
  acceptAny?: boolean;
  scene: string;
  instruction: string;
  options?: string[];
  correctSingle?: number;
  correctMultiple?: number[];
  tokenBank?: string[];
  targetBuilder?: string[];
  branchEffects?: Record<number, BranchId>;
  sceneByBranch?: Record<BranchId, string>;
  endingHint?: string;
  skillSignals?: string[];
  sceneEmoji?: string;
  hint: string;
  reward: number;
  image: IllustrationName;
};
type QuestDifficulty = 5 | 10 | 15 | 25;
type QuestStory = "forest" | "romance" | "slytherin" | "boss" | "narcissist";
type DifficultyConfig = {
  questions: QuestDifficulty;
  label: string;
  color: string;
  rewardMultiplier: number;
  penalty: number;
  description: string;
  expectedPenaltyRate: number;
};
type StoryConfig = {
  id: QuestStory;
  label: string;
  emoji: string;
  description: string;
  difficulties: QuestDifficulty[];
};
type ConflictStyleId = "competitive" | "avoiding" | "accommodating" | "passive_aggressive" | "constructive";
type UserProfile = {
  xp: number;
  completedCount: number;
  lastFeedback: string;
  selectedQuestId: string;
  eventJoined: boolean;
  selectedDifficulty: QuestDifficulty;
  selectedStory: QuestStory;
  activeTab: Tab;
  conflictPrimaryStyle: ConflictStyleId;
  conflictSecondaryStyles: ConflictStyleId[];
  diagnosticCompleted: boolean;
  selectedCourseId: CourseId;
  activeProgramMode: ProgramMode;
  unlockedEndings: string[];
  unlockedAchievements: string[];
};
type AuthUser = {
  email: string;
  password: string;
  profile: UserProfile;
  analytics?: UserAnalytics;
};
type AuthStore = {
  users: Record<string, AuthUser>;
  currentEmail: string | null;
};
type DiagnosticOption = {
  text: string;
  style: ConflictStyleId;
};
type DiagnosticQuestion = {
  id: string;
  prompt: string;
  options: DiagnosticOption[];
};
type DiagnosticReport = {
  summary: string;
  strengths: string[];
  growth: string[];
  recommendedCourseId: CourseId;
};
type CourseId = "office-icebreaker" | "boundary-keeper" | "serpentine-diplomat" | "heart-lines" | "mirror-of-truth";
type ProgramMode = "story" | "course";
type CourseConfig = {
  id: CourseId;
  title: string;
  lore: string;
  focus: string;
  features: string[];
  recommendedFor: ConflictStyleId[];
  preferredQuestions: QuestDifficulty;
};

const AUTH_STORAGE_KEY = "softale_auth_v1";
const ANALYTICS_EVENTS_LIMIT = 400;

function makeEventId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildDefaultAnalytics(nowIso: string): UserAnalytics {
  return {
    firstSeenAt: nowIso,
    lastSeenAt: nowIso,
    totalSessions: 0,
    totalTimeSec: 0,
    diagnosticAnswers: [],
    events: [],
    counters: {
      courseStarts: 0,
      courseCompletions: 0,
      questStarts: 0,
      questCompletions: 0,
      stepFails: 0,
      penalties: 0,
      dropOffs: 0,
    },
  };
}

const conflictStyles: { id: ConflictStyleId; label: string; short: string; focus: string }[] = [
  { id: "competitive", label: "Конкурент / Атакующий", short: "Давление и резкость", focus: "Учимся паузе и вопросам вместо атаки." },
  { id: "avoiding", label: "Избегающий", short: "Уход от темы", focus: "Учимся входить в сложный разговор короткой фразой." },
  { id: "accommodating", label: "Уступчивый / Жертва", short: "Чрезмерные уступки", focus: "Тренируем границы без лишних извинений." },
  { id: "passive_aggressive", label: "Пассивно-агрессивный", short: "Сарказм и обида", focus: "Переводим намеки в прямую спокойную речь." },
  { id: "constructive", label: "Конструктивный", short: "Здоровая коммуникация", focus: "Закрепляем навык на сложных сценариях." },
];

const recommendedStoryByConflictStyle: Record<ConflictStyleId, QuestStory> = {
  competitive: "boss",
  avoiding: "forest",
  accommodating: "romance",
  passive_aggressive: "slytherin",
  constructive: "narcissist",
};

const recommendedCourseByConflictStyle: Record<ConflictStyleId, CourseId> = {
  competitive: "office-icebreaker",
  avoiding: "boundary-keeper",
  accommodating: "heart-lines",
  passive_aggressive: "serpentine-diplomat",
  constructive: "mirror-of-truth",
};

const courses: CourseConfig[] = [
  {
    id: "office-icebreaker",
    title: "Ледокол переговоров",
    lore: "Лед трещит под ногами команды: дедлайны, резкие письма и созвоны на грани срыва. Ты выходишь на капитанский мостик, где одно неверное слово может пустить корабль ко дну.",
    focus: "Освоить переговоры под давлением: удерживать курс, когда штормит всех, и переводить конфликт в рабочее решение.",
    features: ["Три хода капитана: назвать напряжение, вернуть цель, дать следующий шаг", "Пауза как тактическое преимущество, а не слабость", "Реплики, которые охлаждают эскалацию и сохраняют уважение"],
    recommendedFor: ["competitive", "passive_aggressive"],
    preferredQuestions: 10,
  },
  {
    id: "boundary-keeper",
    title: "Хранитель границ",
    lore: "В крепости клятв стены слышат каждое \"ладно\" и каждое \"я потерплю\". Здесь побеждает не громкость, а умение сказать \"нет\" так, чтобы достоинство осталось у всех.",
    focus: "Научиться входить в трудный разговор без бегства и без нападения, сохраняя себя и контакт.",
    features: ["Фразы-мостики для старта неприятной темы", "Спокойная прямота вместо оправданий и резкости", "Пошаговое укрепление личных границ в реальных сценах"],
    recommendedFor: ["avoiding", "accommodating"],
    preferredQuestions: 10,
  },
  {
    id: "serpentine-diplomat",
    title: "Слизеринская дипломатия",
    lore: "Под сводами подземелий каждое слово пахнет интригой. Ты входишь в круг, где улыбка может быть ловушкой, а молчание - приговором.",
    focus: "Превращать ядовитые выпады в хладнокровные договоренности и удерживать влияние без унижения собеседника.",
    features: ["Темное академическое фэнтези с жесткими развилками", "Каждый выбор меняет баланс статуса и доверия", "Длинная арка о власти, риске и цене решений"],
    recommendedFor: ["passive_aggressive", "competitive"],
    preferredQuestions: 25,
  },
  {
    id: "heart-lines",
    title: "Линии сердца",
    lore: "Ночной город учит близости без растворения в другом. Здесь каждое признание может стать мостом - или трещиной, если предать себя.",
    focus: "Строить близость через честность, границы и уважение к своим чувствам.",
    features: ["Мягкое \"нет\" без вины и самонаказания", "Разговор о боли и желаниях без обвинений", "Романтическая арка, где выборы меняют доверие и тепло"],
    recommendedFor: ["accommodating", "avoiding"],
    preferredQuestions: 10,
  },
  {
    id: "mirror-of-truth",
    title: "Зеркало правды",
    lore: "В цитадели отражений маски не держатся долго. Каждый шаг возвращается эхом и показывает, кем ты становишься в конфликте, когда ставки высоки.",
    focus: "Сохранить зрелость под давлением: не уходить в крайности и находить решение, за которое не стыдно после.",
    features: ["Психологические развилки повышенной сложности", "Сцены ультиматума, лжи, срыва и восстановления", "Финал, где последствия решений ощущаются по-настоящему"],
    recommendedFor: ["constructive", "competitive"],
    preferredQuestions: 10,
  },
];

const diagnosticReportByStyle: Record<ConflictStyleId, DiagnosticReport> = {
  competitive: {
    summary: "Ты быстро берешь лидерство в напряженных ситуациях и умеешь отстаивать позицию.",
    strengths: ["Решительность в конфликте", "Умение не теряться под давлением", "Высокая энергия действий"],
    growth: ["Добавить паузы перед ответом", "Снизить резкость формулировок", "Чаще задавать уточняющие вопросы"],
    recommendedCourseId: "office-icebreaker",
  },
  avoiding: {
    summary: "Ты хорошо избегаешь эскалации, но иногда теряешь возможность защитить свои границы.",
    strengths: ["Способность не разжигать спор", "Самоконтроль в эмоциях", "Наблюдательность в сложных сценах"],
    growth: ["Начинать разговор одной короткой фразой", "Проговаривать проблему прямо", "Не уходить в молчание"],
    recommendedCourseId: "boundary-keeper",
  },
  accommodating: {
    summary: "Ты ценишь отношения и умеешь сглаживать напряжение, но иногда делаешь это ценой себя.",
    strengths: ["Эмпатия к людям", "Готовность к сотрудничеству", "Мягкий тон общения"],
    growth: ["Уменьшить лишние извинения", "Удерживать свои границы", "Говорить «нет» без чувства вины"],
    recommendedCourseId: "heart-lines",
  },
  passive_aggressive: {
    summary: "Ты тонко считываешь ситуацию, но можешь прятать прямую позицию за сарказмом или дистанцией.",
    strengths: ["Чувствительность к подтексту", "Хорошее понимание динамики отношений", "Способность замечать нестыковки"],
    growth: ["Переводить намеки в прямую речь", "Честно называть чувства", "Убирать сарказм из ответа"],
    recommendedCourseId: "serpentine-diplomat",
  },
  constructive: {
    summary: "У тебя уже зрелый стиль общения: ты удерживаешь границы и ищешь решение без лишней драмы.",
    strengths: ["Баланс фактов и эмоций", "Уважительный стиль даже в конфликте", "Ориентация на решение"],
    growth: ["Отработка сложных кейсов (ложь, ультиматум)", "Восстановление после срывов", "Усиление лидерской коммуникации"],
    recommendedCourseId: "mirror-of-truth",
  },
};

const styleMicroExercises: Record<ConflictStyleId, string[]> = {
  competitive: [
    "Пауза 3 секунды перед ответом в конфликтной реплике.",
    "Замени обвинение на вопрос: «Что для тебя сейчас критично?»",
    "Перед критикой добавь одну фразу признания вклада собеседника.",
  ],
  avoiding: [
    "Скажи одну фразу-мостик: «Мне важно это обсудить»",
    "Ответь в течение 10 секунд, не уходя в молчание.",
    "Назови проблему прямо без извинений за эмоции.",
  ],
  accommodating: [
    "Убери из ответа слово «извини», если ты не виновата.",
    "Обозначь маленькую границу одной короткой фразой.",
    "Замени «как скажешь» на «мне так не подходит».",
  ],
  passive_aggressive: [
    "Перепиши саркастичную реплику в прямую и спокойную.",
    "Вместо «всё нормально» назови реальное чувство.",
    "Озвучь просьбу без намеков и подколов.",
  ],
  constructive: [
    "Отработай сценарий с ультиматумом без потери границы.",
    "Сделай разбор после срыва: как вернуться в диалог.",
    "Сформулируй решение в формате «факт -> чувство -> шаг».",
  ],
};

const diagnosticQuestions: DiagnosticQuestion[] = [
  {
    id: "d-01",
    prompt: "Коллега резко критикует твою идею на встрече. Что ты чаще делаешь?",
    options: [
      { text: "Жестко отвечаю и доказываю свою правоту", style: "competitive" },
      { text: "Молчу и не продолжаю обсуждение", style: "avoiding" },
      { text: "Соглашаюсь, даже если внутри не согласна", style: "accommodating" },
      { text: "Говорю «ок», но потом демонстративно игнорирую", style: "passive_aggressive" },
      { text: "Уточняю факты и предлагаю обсудить спокойно", style: "constructive" },
    ],
  },
  {
    id: "d-02",
    prompt: "Партнер забывает важное обещание. Как реагируешь первой?",
    options: [
      { text: "Атакую: «Ты всегда всё портишь»", style: "competitive" },
      { text: "Делаю вид, что всё в порядке", style: "avoiding" },
      { text: "Извиняюсь за то, что расстроилась", style: "accommodating" },
      { text: "Колю фразами с сарказмом", style: "passive_aggressive" },
      { text: "Говорю, что мне больно, и обсуждаю решение", style: "constructive" },
    ],
  },
  {
    id: "d-03",
    prompt: "Тебя перебивают в разговоре. Какой твой типичный ответ?",
    options: [
      { text: "Перебиваю в ответ, чтобы «вернуть контроль»", style: "competitive" },
      { text: "Замолкаю и отхожу в сторону", style: "avoiding" },
      { text: "Говорю: «Ничего, продолжай»", style: "accommodating" },
      { text: "Сухо отвечаю: «Как скажешь»", style: "passive_aggressive" },
      { text: "Прошу договорить и вернуться к моей мысли", style: "constructive" },
    ],
  },
  {
    id: "d-04",
    prompt: "В чате появляется токсичное сообщение в твой адрес.",
    options: [
      { text: "Пишу резкий ответ сразу", style: "competitive" },
      { text: "Не отвечаю вообще", style: "avoiding" },
      { text: "Извиняюсь, чтобы закрыть тему", style: "accommodating" },
      { text: "Отвечаю намеками и холодным тоном", style: "passive_aggressive" },
      { text: "Прошу конкретику и перевожу в рабочий формат", style: "constructive" },
    ],
  },
  {
    id: "d-05",
    prompt: "Нужно отказать человеку, который давит на тебя.",
    options: [
      { text: "Давлю в ответ еще сильнее", style: "competitive" },
      { text: "Избегаю разговора до последнего", style: "avoiding" },
      { text: "Соглашаюсь, хотя мне неудобно", style: "accommodating" },
      { text: "Говорю «да», но потом саботирую", style: "passive_aggressive" },
      { text: "Коротко и уважительно обозначаю границу", style: "constructive" },
    ],
  },
  {
    id: "d-06",
    prompt: "После ссоры ты обычно…",
    options: [
      { text: "Продолжаю спор, чтобы победить", style: "competitive" },
      { text: "Ухожу в тишину и не обсуждаю", style: "avoiding" },
      { text: "Иду мириться первой, даже если не права", style: "accommodating" },
      { text: "Показываю обиду молчаливыми уколами", style: "passive_aggressive" },
      { text: "Делаю паузу и возвращаюсь к разговору по фактам", style: "constructive" },
    ],
  },
  {
    id: "d-07",
    prompt: "Когда чувствуешь несправедливость, что происходит с речью?",
    options: [
      { text: "Становится резкой и обвиняющей", style: "competitive" },
      { text: "Почти перестаю говорить", style: "avoiding" },
      { text: "Становится мягкой до потери границ", style: "accommodating" },
      { text: "Становится колкой и двусмысленной", style: "passive_aggressive" },
      { text: "Стараюсь говорить о фактах и чувствах", style: "constructive" },
    ],
  },
  {
    id: "d-08",
    prompt: "В команде не учитывают твоё мнение.",
    options: [
      { text: "Продавлю решение силой", style: "competitive" },
      { text: "Смирюсь и отойду", style: "avoiding" },
      { text: "Соглашусь ради мира", style: "accommodating" },
      { text: "Скажу «делайте как хотите» с раздражением", style: "passive_aggressive" },
      { text: "Повторю позицию и предложу критерии выбора", style: "constructive" },
    ],
  },
  {
    id: "d-09",
    prompt: "Если человек нарушает твою границу второй раз, ты…",
    options: [
      { text: "Жестко ставлю на место", style: "competitive" },
      { text: "Терплю и ухожу в себя", style: "avoiding" },
      { text: "Снова уступаю, чтобы не ссориться", style: "accommodating" },
      { text: "Наказываю холодом и дистанцией", style: "passive_aggressive" },
      { text: "Ясно называю границу и последствия", style: "constructive" },
    ],
  },
  {
    id: "d-10",
    prompt: "Твоя главная цель в конфликте обычно какая?",
    options: [
      { text: "Выиграть", style: "competitive" },
      { text: "Избежать стресса любой ценой", style: "avoiding" },
      { text: "Сохранить отношения через уступку", style: "accommodating" },
      { text: "Показать недовольство, не говоря прямо", style: "passive_aggressive" },
      { text: "Решить проблему и сохранить уважение", style: "constructive" },
    ],
  },
];

const tabs: { key: Tab; label: string }[] = [
  { key: "map", label: "Карта" },
  { key: "quest", label: "Квест" },
  { key: "event", label: "Ивент" },
  { key: "feedback", label: "AI" },
  { key: "profile", label: "Профиль" },
  { key: "admin", label: "Админка" },
];

const dailyQuests: Quest[] = [
  {
    id: "q-01",
    biome: "Лес Эмоций",
    title: "Пульс Дракона",
    prompt: "Опиши ситуацию, где ты злилась. Что это защищало: границу, справедливость или уважение?",
    reward: 10,
  },
  {
    id: "q-02",
    biome: "Долина Диалога",
    title: "Эхо Эмпатии",
    prompt: "Перефразируй сложную фразу собеседника без советов и оценок.",
    reward: 8,
  },
  {
    id: "q-03",
    biome: "Башня Границ",
    title: "Врата Отказа",
    prompt: "Сформулируй мягкое, но твердое \"нет\" без оправданий.",
    reward: 12,
  },
];

const forestEasySteps: ForestStep[] = [
  {
    id: "f-01",
    title: "Пульс Дракона",
    type: "single",
    scene:
      "На встрече коллега обесценила твой вклад: «Это и так было очевидно». Ты чувствуешь вспышку злости.",
    instruction: "Выбери лучший первый ответ, который не разгоняет конфликт.",
    options: [
      "«Сама попробуй сделать лучше, а потом говори»",
      "«Мне важно, чтобы мой вклад признавался. Давай обсудим без обесценивания»",
      "Промолчать и написать пассивно-агрессивное сообщение позже",
      "«Ты всегда так делаешь, с тобой невозможно работать»",
    ],
    correctSingle: 1,
    hint: "Ищи вариант с ясной границей и без нападения.",
    reward: 8,
    image: "fire",
  },
  {
    id: "f-02",
    title: "Эхо Леса",
    type: "multiple",
    scene:
      "Друг опаздывает в третий раз и пишет: «Ну чего ты заводишься, расслабься». Выбери 2 ответа, которые сохраняют контакт и границу.",
    instruction: "Выбери ровно 2 конструктивных ответа.",
    options: [
      "«Мне неприятно ждать, давай заранее предупреждать за 20 минут»",
      "«Ок, тогда и я буду пропадать без предупреждения»",
      "«Я ценю встречи с тобой, но мне важно уважение к моему времени»",
      "«Ты ведешь себя очень эгоистично»",
      "«Ладно, ничего страшного»",
    ],
    correctMultiple: [0, 2],
    hint: "Нужны 2 фразы: факт + граница, без ярлыков.",
    reward: 10,
    image: "pine-tree",
  },
  {
    id: "f-03",
    title: "Сборка Спокойствия",
    type: "builder",
    scene:
      "Руководитель просит срочную задачу вечером. Тебе важно не сорваться, но обозначить границы.",
    instruction: "Собери фразу из слов. Лишние слова в банке тоже есть.",
    tokenBank: [
      "Когда",
      "задача",
      "появляется",
      "после",
      "рабочего",
      "дня,",
      "я",
      "не",
      "могу",
      "взять",
      "ее",
      "сегодня.",
      "Давайте",
      "согласуем",
      "приоритет",
      "на",
      "утро.",
      "всегда",
      "никогда",
      "виноваты",
    ],
    targetBuilder: [
      "Когда",
      "задача",
      "появляется",
      "после",
      "рабочего",
      "дня,",
      "я",
      "не",
      "могу",
      "взять",
      "ее",
      "сегодня.",
      "Давайте",
      "согласуем",
      "приоритет",
      "на",
      "утро.",
    ],
    hint: "Нужна структура: факт ситуации -> граница -> предложение следующего шага.",
    reward: 12,
    image: "leaf",
  },
];

const forestMediumExtraSteps: ForestStep[] = [
  {
    id: "f-06",
    title: "Тон Без Нападения",
    type: "single",
    scene: "Коллега резко отвечает в чате: «Опять ты усложняешь».",
    instruction: "Выбери ответ, который снижает напряжение и возвращает к задаче.",
    options: [
      "«С тобой невозможно нормально говорить»",
      "«Давай вернемся к цели: нам нужно решить задачу до 16:00»",
      "«Сейчас не время, я обиделась»",
      "«Пиши как хочешь, я больше не участвую»",
    ],
    correctSingle: 1,
    hint: "Лучшая реплика возвращает к цели, а не атакует человека.",
    reward: 9,
    image: "chat-processing-outline",
  },
  {
    id: "f-07",
    title: "Граница в Переписке",
    type: "multiple",
    scene: "Тебе пишут рабочие сообщения ночью. Выбери 2 ответа с границей и уважением.",
    instruction: "Выбери ровно 2 варианта.",
    options: [
      "«Вижу сообщение. Отвечу завтра утром в рабочее время»",
      "«Не пишите мне больше никогда»",
      "«Важно сохранять баланс. Срочное лучше помечать отдельно»",
      "«Ок, буду онлайн 24/7»",
      "«Это уже перебор, вы все токсичные»",
    ],
    correctMultiple: [0, 2],
    hint: "Нужны спокойная граница и договоренность о процессе.",
    reward: 11,
    image: "clock-alert-outline",
  },
  {
    id: "f-08",
    title: "Сборка Я-сообщения",
    type: "builder",
    scene: "Партнер перебивает тебя в разговоре о важной для вас встрече. Собери конструктивную реплику.",
    instruction: "Собери фразу из слов. В наборе есть лишние слова.",
    tokenBank: [
      "Когда",
      "меня",
      "перебивают,",
      "я",
      "теряю",
      "мысль",
      "и",
      "злюсь.",
      "Мне",
      "важно",
      "договорить",
      "до",
      "конца,",
      "а",
      "потом",
      "я",
      "с",
      "интересом",
      "послушаю",
      "тебя.",
      "всегда",
      "никогда",
      "ужасно",
    ],
    targetBuilder: [
      "Когда",
      "меня",
      "перебивают,",
      "я",
      "теряю",
      "мысль",
      "и",
      "злюсь.",
      "Мне",
      "важно",
      "договорить",
      "до",
      "конца,",
      "а",
      "потом",
      "я",
      "с",
      "интересом",
      "послушаю",
      "тебя.",
    ],
    hint: "Структура: факт -> чувство -> конкретная просьба.",
    reward: 12,
    image: "message-draw",
  },
  {
    id: "f-09",
    title: "Выбор Приоритета",
    type: "single",
    scene: "Тебе одновременно ставят две срочные задачи от разных людей.",
    instruction: "Выбери лучший ответ, который управляет ожиданиями.",
    options: [
      "«Сделаю обе прямо сейчас, не волнуйтесь»",
      "«Нужна приоритизация: какую задачу считаем первой?»",
      "«Мне все равно, решайте сами»",
      "«Тогда сами разгребайте этот хаос»",
    ],
    correctSingle: 1,
    hint: "Лидерская коммуникация = прояснить приоритеты.",
    reward: 10,
    image: "sort-bool-ascending-variant",
  },
  {
    id: "f-10",
    title: "Мост Согласования",
    type: "multiple",
    scene: "После конфликта нужно договориться о следующем шаге. Выбери 2 конструктивные реплики.",
    instruction: "Выбери ровно 2 варианта.",
    options: [
      "«Давай зафиксируем, кто что делает до пятницы»",
      "«Ладно, забудем, как будто ничего не было»",
      "«Предлагаю короткий созвон на 15 минут, чтобы синхронизироваться»",
      "«Теперь у тебя долг передо мной»",
      "«Я не хочу больше это обсуждать никогда»",
    ],
    correctMultiple: [0, 2],
    hint: "Ищи реплики про договоренность и конкретные шаги.",
    reward: 11,
    image: "bridge",
  },
];

const forestHardExtraSteps: ForestStep[] = [
  {
    id: "f-11",
    title: "Деэскалация на Пределе",
    type: "single",
    scene: "Клиент пишет: «Вы провалили проект, это катастрофа».",
    instruction: "Выбери первую реплику, которая снижает эмоцию и удерживает контакт.",
    options: [
      "«Вы преувеличиваете, все не так плохо»",
      "«Слышу ваше напряжение. Давайте за 10 минут разложим риски и следующий шаг»",
      "«Это не наша вина»",
      "«Тогда ищите других»",
    ],
    correctSingle: 1,
    hint: "Сначала признать эмоцию, затем предложить структуру решения.",
    reward: 12,
    image: "fire-alert",
  },
  {
    id: "f-12",
    title: "Точность Эмпатии",
    type: "multiple",
    scene: "Сотрудник говорит: «Я выгорел и не справляюсь». Выбери 2 лучших ответа.",
    instruction: "Выбери ровно 2 варианта.",
    options: [
      "«Ты просто ленишься, соберись»",
      "«Спасибо, что сказал. Что сейчас самое тяжелое?»",
      "«Давай определим 1-2 задачи, которые реально закрыть сегодня»",
      "«У всех так, привыкай»",
      "«Хватит накручивать, это уже лишнее»",
    ],
    correctMultiple: [1, 2],
    hint: "Сначала валидируй состояние, потом уменьши перегруз.",
    reward: 13,
    image: "heart-plus-outline",
  },
  {
    id: "f-13",
    title: "Сборка Переговоров",
    type: "builder",
    scene: "Тебе нужно отказать в нереалистичном сроке и сохранить партнёрство.",
    instruction: "Собери фразу. Есть дистракторы.",
    tokenBank: [
      "В",
      "текущем",
      "объеме",
      "мы",
      "не",
      "успеем",
      "к",
      "пятнице.",
      "Чтобы",
      "сохранить",
      "качество,",
      "предлагаю",
      "или",
      "сдвиг",
      "срока",
      "на",
      "2",
      "дня,",
      "или",
      "сокращение",
      "объема.",
      "ужас",
      "катастрофа",
      "бесполезно",
    ],
    targetBuilder: [
      "В",
      "текущем",
      "объеме",
      "мы",
      "не",
      "успеем",
      "к",
      "пятнице.",
      "Чтобы",
      "сохранить",
      "качество,",
      "предлагаю",
      "или",
      "сдвиг",
      "срока",
      "на",
      "2",
      "дня,",
      "или",
      "сокращение",
      "объема.",
    ],
    hint: "Формула сложных переговоров: ограничение + цель + 2 опции.",
    reward: 14,
    image: "handshake-outline",
  },
  {
    id: "f-14",
    title: "Сложный Фидбек Вверх",
    type: "single",
    scene: "Нужно дать фидбек руководителю, который перебивает команду.",
    instruction: "Выбери самый безопасный и эффективный вариант.",
    options: [
      "«Вы постоянно всех перебиваете, это невыносимо»",
      "«На встречах команде сложно завершить мысль. Можно договориться о 1-2 мин без перебиваний?»",
      "«Я лучше промолчу»",
      "«С вами говорить — это как идти в атаку без шлема»",
    ],
    correctSingle: 1,
    hint: "Конкретика поведения + предложение правила.",
    reward: 12,
    image: "account-tie-voice-outline",
  },
  {
    id: "f-15",
    title: "Баланс Границ",
    type: "multiple",
    scene: "Тебя просят выйти в выходной. Выбери 2 реплики с балансом границы и командной поддержки.",
    instruction: "Выбери ровно 2 варианта.",
    options: [
      "«В выходной я недоступна. В понедельник помогу с планом»",
      "«Ладно, опять все сделаю сама»",
      "«Если это критично, давай согласуем компенсацию и объем»",
      "«Меня уже достали такие запросы, делайте сами»",
      "«Никаких обсуждений»",
    ],
    correctMultiple: [0, 2],
    hint: "Хороший ответ = граница + условия сотрудничества.",
    reward: 13,
    image: "calendar-check-outline",
  },
];

const forestRomanceSteps: ForestStep[] = [
  {
    id: "f-16",
    title: "Бал у Лунного Озера",
    type: "single",
    scene: "Партнер(ша) пишет: «Ты опять в работе, мне тебя не хватает». Выберите первую реакцию в стиле тёплого диалога.",
    instruction: "Выбери реплику, где есть признание чувств и конкретный шаг.",
    options: [
      "«Сейчас не до этого, не драматизируй»",
      "«Слышу тебя. Давай сегодня в 21:00 без телефонов побудем вдвоем»",
      "«У всех такие проблемы, переживем»",
      "«Если тебе мало внимания, это твоя проблема»",
    ],
    correctSingle: 1,
    hint: "Лучший ответ: признать эмоцию + предложить реальный шаг.",
    reward: 12,
    image: "heart-multiple",
  },
  {
    id: "f-17",
    title: "Письмо под Северным Светом",
    type: "multiple",
    scene: "После ссоры в отношениях нужно написать сообщение. Выбери 2 варианта, которые восстанавливают контакт без давления.",
    instruction: "Выбери ровно 2 варианта.",
    options: [
      "«Я хочу понять тебя. Когда тебе удобно спокойно обсудить это?»",
      "«Если сейчас не ответишь, больше не пиши»",
      "«Мне важно сохранить нас, давай попробуем услышать друг друга»",
      "«Ты опять все испортил(а)»",
      "«Ок, забудь, мне все равно»",
    ],
    correctMultiple: [0, 2],
    hint: "Подходят варианты с уважением и приглашением к диалогу.",
    reward: 13,
    image: "message-alert-outline",
  },
  {
    id: "f-20",
    title: "Ревность под маской заботы",
    type: "single",
    scene: "Партнер(ша) говорит: «Я просто волнуюсь, поэтому проверяю, где ты и с кем».",
    instruction: "Выбери ответ, где есть тепло и граница.",
    options: [
      "«Ладно, буду отправлять геолокацию каждый час»",
      "«Мне важна забота, но контроль мне не подходит. Давай договоримся о доверии»",
      "«Тогда и ты отчитывайся каждую минуту»",
      "«Делай как хочешь, мне уже всё равно»",
    ],
    correctSingle: 1,
    hint: "Уважение чувств + отказ от контроля.",
    reward: 12,
    image: "heart-cog-outline",
  },
  {
    id: "f-21",
    title: "Сложный разговор о границах",
    type: "multiple",
    scene: "Вы обсуждаете личные границы в отношениях. Выбери 2 сильных фразы.",
    instruction: "Выбери ровно 2 варианта.",
    options: [
      "«Мне важно, чтобы мои решения уважались, даже если мы не согласны»",
      "«Если любишь — должен(на) понимать без слов»",
      "«Давай заранее обсудим, что для нас обоих недопустимо»",
      "«Ну ладно, пусть всё решает тот, кто громче»",
      "«Оставим это, всё равно поссоримся»",
    ],
    correctMultiple: [0, 2],
    hint: "Граница + договоренность.",
    reward: 13,
    image: "handshake-outline",
  },
  {
    id: "f-22",
    title: "Сборка письма после конфликта",
    type: "builder",
    scene: "Собери сообщение после ссоры: без нападения, но с четкой просьбой.",
    instruction: "Собери фразу из слов. Есть лишние слова.",
    tokenBank: [
      "Мне", "важно", "восстановить", "контакт,", "и", "я", "хочу", "обсудить", "ситуацию", "спокойно.", "Давай",
      "выберем", "время,", "когда", "оба", "будем", "готовы", "слушать.", "никогда", "всегда", "молчи"
    ],
    targetBuilder: [
      "Мне", "важно", "восстановить", "контакт,", "и", "я", "хочу", "обсудить", "ситуацию", "спокойно.", "Давай",
      "выберем", "время,", "когда", "оба", "будем", "готовы", "слушать."
    ],
    hint: "Формула: цель + спокойствие + конкретный следующий шаг.",
    reward: 14,
    image: "email-open-heart-outline",
  },
];

const forestPotterSteps: ForestStep[] = [
  {
    id: "f-18",
    title: "Гостиная Слизерина",
    type: "single",
    scene:
      "В гостиной Слизерина одногруппник шепчет: «Если хочешь быть в команде, поддень новичка при всех». Тебе важно сохранить статус и не предать свои принципы.",
    instruction: "Выбери ответ в стиле взрослой дипломатии и границ.",
    options: [
      "«Ладно, ради команды скажу что-нибудь колкое»",
      "«Я в команде, но без унижений других. Давайте докажем силу результатом»",
      "«Мне все равно, делайте что хотите»",
      "«Тогда сами играйте, я ухожу и хлопну дверью»",
    ],
    correctSingle: 1,
    hint: "Сильный ход: сохранить позицию в группе и обозначить ценности.",
    reward: 14,
    image: "snake",
  },
  {
    id: "f-23",
    title: "Клубок слухов",
    type: "multiple",
    scene: "В Слизерине предлагают пустить слух про соперника. Нужно сохранить влияние и не уйти в травлю.",
    instruction: "Выбери 2 сильных ответа.",
    options: [
      "«Я за стратегию, а не грязные слухи. Побеждаем делом»",
      "«Ок, я начну первым(ой), пусть боятся»",
      "«Если есть претензии, давайте обсудим их напрямую»",
      "«Молчать не буду, устрою скандал на весь факультет»",
      "«Мне всё равно, делайте что хотите»",
    ],
    correctMultiple: [0, 2],
    hint: "Влияние через ясные правила, не через унижение.",
    reward: 14,
    image: "account-voice",
  },
  {
    id: "f-24",
    title: "Разговор с префектом",
    type: "single",
    scene: "Префект давит: «Или играешь по нашим правилам, или ты вне команды».",
    instruction: "Выбери дипломатичный ответ с границей.",
    options: [
      "«Хорошо, буду делать всё, что скажете»",
      "«Я с командой, но не участвую в унижении других. Давайте о целях и правилах»",
      "«Тогда команда без меня, удачи вам»",
      "«Сейчас покажу, кто тут главный»",
    ],
    correctSingle: 1,
    hint: "Сохраняем позицию и ценности одновременно.",
    reward: 14,
    image: "shield-crown-outline",
  },
  {
    id: "f-25",
    title: "Сборка холодной дипломатии",
    type: "builder",
    scene: "Собери реплику в стиле Слизерина: спокойно, четко, с акцентом на результат.",
    instruction: "Собери фразу из слов. Есть лишние слова.",
    tokenBank: [
      "Я", "готов(а)", "работать", "в", "команде,", "если", "мы", "держим", "уважительный", "тон", "и", "фокус",
      "на", "результате.", "Обсудим", "план", "по", "шагам.", "унижай", "немедленно", "никто"
    ],
    targetBuilder: [
      "Я", "готов(а)", "работать", "в", "команде,", "если", "мы", "держим", "уважительный", "тон", "и", "фокус",
      "на", "результате.", "Обсудим", "план", "по", "шагам."
    ],
    hint: "Тон Слизерина: хладнокровие + структура.",
    reward: 15,
    image: "sword-cross",
  },
  {
    id: "f-26",
    title: "Финальный выбор дома",
    type: "single",
    scene: "Тебя подталкивают «прижать слабого», чтобы укрепить статус. Какой ход самый зрелый?",
    instruction: "Выбери один вариант.",
    options: [
      "«Статус важнее всего, давим дальше»",
      "«Мой статус строится на результатах и уважении, не на страхе»",
      "«Я промолчу и поддержу толпу»",
      "«Пусть кто-то другой решает за меня»",
    ],
    correctSingle: 1,
    hint: "Сила без жестокости — это лидерство.",
    reward: 15,
    image: "chess-queen",
  },
];

const forestOfficeDramaSteps: ForestStep[] = [
  {
    id: "f-19",
    title: "Стервозная начальница",
    type: "multiple",
    scene:
      "Начальница при всех говорит: «Это снова сырая работа, я устала вытягивать за тебя». Нужно ответить так, чтобы сохранить достоинство и вернуть разговор в рабочее русло.",
    instruction: "Выбери 2 реплики, которые одновременно держат границу и фокус на задаче.",
    options: [
      "«Давайте обсудим правки по пунктам. Я готов(а) внести их до 17:00»",
      "«Если вам все не нравится, делайте сами»",
      "«Мне важно получать обратную связь без личных выпадов. По задаче: что приоритетно исправить первым?»",
      "«Ну да, конечно, вы же всегда правы»",
      "«Я вообще не понимаю, зачем мы это обсуждаем»",
    ],
    correctMultiple: [0, 2],
    hint: "Сильный ответ = граница по тону + конкретизация следующего шага.",
    reward: 14,
    image: "briefcase-account-outline",
  },
  {
    id: "f-27",
    title: "Срыв дедлайна",
    type: "single",
    scene: "Начальница резко: «Ты снова всё провалил(а), из-за тебя горим по срокам».",
    instruction: "Выбери ответ, который возвращает разговор к решению.",
    options: [
      "«Это не только моя вина, сами разбирайтесь»",
      "«Давайте зафиксируем статус и приоритеты, чтобы закрыть критичное сегодня»",
      "«Ну да, я ужасный(ая), довольны?»",
      "«Тогда увольняйте, раз всё так плохо»",
    ],
    correctSingle: 1,
    hint: "Фокус на плане, а не на перепалке.",
    reward: 14,
    image: "clipboard-list-outline",
  },
  {
    id: "f-28",
    title: "Публичная критика на созвоне",
    type: "multiple",
    scene: "На общем звонке тебя унижают в тоне «тебя опять нужно спасать».",
    instruction: "Выбери 2 профессиональные реакции.",
    options: [
      "«Мне важна обратная связь по задаче. Давайте без личных оценок»",
      "«Если продолжите в таком тоне, я тоже отвечу жёстко»",
      "«По делу: какие 2 правки приоритетны, чтобы закрыть вопрос сегодня?»",
      "«С вами невозможно работать, я пас»",
      "«Промолчу, потом пожалуюсь коллегам»",
    ],
    correctMultiple: [0, 2],
    hint: "Граница по тону + конкретизация задачи.",
    reward: 14,
    image: "video-account",
  },
  {
    id: "f-29",
    title: "Сборка делового ответа",
    type: "builder",
    scene: "Собери ответ руководителю после резкого комментария.",
    instruction: "Собери фразу из слов. Есть лишние слова.",
    tokenBank: [
      "Мне", "важно", "получать", "обратную", "связь", "по", "задаче", "без", "личных", "оценок.", "Готов(а)",
      "внести", "правки", "до", "17:00,", "если", "согласуем", "приоритеты.", "терпи", "молчи", "навсегда"
    ],
    targetBuilder: [
      "Мне", "важно", "получать", "обратную", "связь", "по", "задаче", "без", "личных", "оценок.", "Готов(а)",
      "внести", "правки", "до", "17:00,", "если", "согласуем", "приоритеты."
    ],
    hint: "Граница + дедлайн + приоритеты.",
    reward: 15,
    image: "message-text-clock-outline",
  },
  {
    id: "f-30",
    title: "Переговоры о ролях",
    type: "single",
    scene: "Тебе регулярно скидывают чужие задачи и обвиняют в медлительности.",
    instruction: "Выбери ответ, который защищает ресурс и не рушит сотрудничество.",
    options: [
      "«Ок, буду тащить всё сам(а)»",
      "«Готов(а) помочь в рамках приоритетов. Давайте закрепим зоны ответственности»",
      "«Это не мои проблемы, отстаньте»",
      "«Сделаю вид, что согласен(на), и сорву срок»",
    ],
    correctSingle: 1,
    hint: "Роли и правила вместо хаоса.",
    reward: 14,
    image: "account-tie-hat",
  },
];

const narcissistQuestSteps: ForestStep[] = [
  // 1-5: preferences discovery
  {
    id: "n-01",
    title: "Влюбись в нарцисса • Твой идеал",
    phase: "prefs",
    acceptAny: true,
    type: "single",
    scene: "Эпизод 1/25. Для начала: что тебя обычно цепляет в людях сильнее всего?",
    instruction: "Выбери вариант, который ближе тебе.",
    options: ["Яркая харизма", "Надежность и спокойствие", "Интеллект и амбиции", "Забота и эмпатия"],
    hint: "Здесь нет правильного ответа, это настройка сюжета.",
    reward: 6,
    image: "account-star-outline",
  },
  {
    id: "n-02",
    title: "Влюбись в нарцисса • Темп отношений",
    phase: "prefs",
    acceptAny: true,
    type: "single",
    scene: "Эпизод 2/25. Какой темп сближения для тебя комфортнее?",
    instruction: "Выбери свой вариант.",
    options: ["Быстро и эмоционально", "Постепенно и через доверие", "Через общие цели", "Через дружбу"],
    hint: "Тут тоже нет ошибок, просто профиль.",
    reward: 6,
    image: "timeline-clock-outline",
  },
  {
    id: "n-03",
    title: "Влюбись в нарцисса • Язык внимания",
    phase: "prefs",
    acceptAny: true,
    type: "multiple",
    scene: "Эпизод 3/25. Как ты чаще чувствуешь любовь? Выбери 2 пункта.",
    instruction: "Выбери ровно 2.",
    options: ["Слова восхищения", "Поступки и помощь", "Совместное время", "Подарки", "Физическая близость"],
    correctMultiple: [0, 2],
    hint: "На этом шаге любые 2 варианта допустимы.",
    reward: 6,
    image: "cards-heart-outline",
  },
  {
    id: "n-04",
    title: "Влюбись в нарцисса • Красные флаги",
    phase: "prefs",
    acceptAny: true,
    type: "single",
    scene: "Эпизод 4/25. Что для тебя самый тревожный сигнал в начале общения?",
    instruction: "Выбери один пункт.",
    options: ["Ревность с первых дней", "Обесценивание других", "Непредсказуемые исчезновения", "Давление на близость"],
    hint: "Твой выбор влияет на подсказки в сюжете.",
    reward: 6,
    image: "flag-outline",
  },
  {
    id: "n-05",
    title: "Влюбись в нарцисса • Личные границы",
    phase: "prefs",
    acceptAny: true,
    type: "single",
    scene: "Эпизод 5/25. Где тебе особенно важно держать границу?",
    instruction: "Выбери одну сферу.",
    options: ["Личное время", "Финансы", "Общение с друзьями", "Физический контакт"],
    hint: "Отлично, профиль предпочтений собран.",
    reward: 6,
    image: "shield-account-outline",
  },
  // 6-10: sugar show
  {
    id: "n-06",
    title: "Сахарное шоу • Идеальный вечер",
    phase: "sugar",
    type: "single",
    scene: "Эпизод 6/25. Новый партнер(ша) говорит: «Ты — моя судьба, я никогда такого не чувствовал(а)».",
    instruction: "Выбери самый здоровый ответ на слишком быстрый накал.",
    options: [
      "«Я тоже! Давай сразу съедемся»",
      "«Мне приятно это слышать. Я хочу двигаться в комфортном темпе»",
      "«Докажи сначала подарками»",
      "«Ты уже зависишь от меня»",
    ],
    correctSingle: 1,
    hint: "Тепло + граница по темпу.",
    reward: 10,
    image: "heart-flash",
  },
  {
    id: "n-07",
    title: "Сахарное шоу • Поток комплиментов",
    phase: "sugar",
    type: "multiple",
    scene: "Эпизод 7/25. Тебя заваливают вниманием и обещаниями. Выбери 2 устойчивые реакции.",
    instruction: "Выбери ровно 2.",
    options: [
      "«Мне важно время, чтобы узнать друг друга»",
      "«Раз так любишь — удаляй всех друзей ради меня»",
      "«Давай проверим совместимость в реальных ситуациях»",
      "«Ок, я отменю планы, будь только рядом»",
      "«Тогда ты должен(на) быть рядом 24/7»",
    ],
    correctMultiple: [0, 2],
    hint: "Реальность и границы важнее эйфории.",
    reward: 10,
    image: "gift-outline",
  },
  {
    id: "n-08",
    title: "Сахарное шоу • Сборка ответа",
    phase: "sugar",
    type: "builder",
    scene: "Эпизод 8/25. Партнер(ша) давит на быстрое сближение. Собери мягкий, но ясный ответ.",
    instruction: "Собери фразу из слов. Есть дистракторы.",
    tokenBank: [
      "Мне", "очень", "приятно", "твое", "внимание,", "и", "я", "хочу", "развивать", "отношения", "постепенно,", "без", "спешки.",
      "Давай", "узнавать", "друг", "друга", "в", "реальной", "жизни.", "немедленно", "всегда", "навсегда"
    ],
    targetBuilder: [
      "Мне", "очень", "приятно", "твое", "внимание,", "и", "я", "хочу", "развивать", "отношения", "постепенно,", "без", "спешки.",
      "Давай", "узнавать", "друг", "друга", "в", "реальной", "жизни."
    ],
    hint: "Тон: благодарность + темп + конкретика.",
    reward: 11,
    image: "message-alert-outline",
  },
  {
    id: "n-09",
    title: "Сахарное шоу • Большие обещания",
    phase: "sugar",
    type: "single",
    scene: "Эпизод 9/25. Через неделю тебе обещают «лучшее будущее», если ты «доверишься полностью».",
    instruction: "Какой ответ самый зрелый?",
    options: [
      "«Супер, я готов(а) на всё»",
      "«Мне важны поступки в настоящем, а не только обещания»",
      "«Тогда ты обязан(а) оплатить мои расходы»",
      "«Я проверю тебя провокациями»",
    ],
    correctSingle: 1,
    hint: "Ориентир на действия, не на слова.",
    reward: 10,
    image: "crystal-ball",
  },
  {
    id: "n-10",
    title: "Сахарное шоу • Соцсети",
    phase: "sugar",
    type: "multiple",
    scene: "Эпизод 10/25. Тебя просят демонстративно показать отношения в соцсетях «в доказательство чувств».",
    instruction: "Выбери 2 корректные реакции.",
    options: [
      "«Мне важно решать это в своем темпе, без давления»",
      "«Ок, выложу всё, только не обижайся»",
      "«Чувства не измеряются публичностью, давай обсудим границы»",
      "«Тогда и ты публикуй отчёт каждый час»",
      "«Сделаю, чтобы тебя не потерять»",
    ],
    correctMultiple: [0, 2],
    hint: "Без доказательств через давление.",
    reward: 10,
    image: "instagram",
  },
  // 11-20: abuse arc
  {
    id: "n-11",
    title: "Абьюз • Первое обесценивание",
    phase: "abuse",
    type: "single",
    scene: "Эпизод 11/25. Твой успех называют «случайностью».",
    instruction: "Выбери ответ с самоуважением.",
    options: [
      "«Наверное, ты прав(а), мне просто повезло»",
      "«Мне неприятно это слышать. Я ценю свой труд и прошу без обесценивания»",
      "«Сейчас докажу, что ты ничтожество»",
      "«Ладно, пусть будет по-твоему»",
    ],
    correctSingle: 1,
    hint: "Факт чувства + граница.",
    reward: 12,
    image: "alert-circle-outline",
  },
  {
    id: "n-12",
    title: "Абьюз • Изоляция",
    phase: "abuse",
    type: "multiple",
    scene: "Эпизод 12/25. Партнер(ша) просит реже общаться с друзьями «ради нас».",
    instruction: "Выбери 2 здоровые реакции.",
    options: [
      "«Мои друзья — часть моей жизни, и это не обсуждается в формате запрета»",
      "«Хорошо, удалю всех, лишь бы не ссориться»",
      "«Готов(а) договариваться о времени, но не о запрете контактов»",
      "«Тогда я тоже запрещу тебе общаться»",
      "«Я виноват(а), что у меня есть друзья»",
    ],
    correctMultiple: [0, 2],
    hint: "Граница + готовность к диалогу, не к контролю.",
    reward: 12,
    image: "account-group-outline",
  },
  {
    id: "n-13",
    title: "Абьюз • Сдвиг реальности",
    phase: "abuse",
    type: "single",
    scene: "Эпизод 13/25. После ссоры тебе говорят: «Ты всё придумал(а), такого не было».",
    instruction: "Выбери устойчивый ответ на газлайтинг.",
    options: [
      "«Наверное, у меня правда плохая память»",
      "«Я доверяю своим ощущениям. Давай обсудим факты спокойно»",
      "«Тогда я тоже буду перекручивать всё»",
      "«Ладно, молчу»",
    ],
    correctSingle: 1,
    hint: "Опора на себя + факты.",
    reward: 12,
    image: "head-cog-outline",
  },
  {
    id: "n-14",
    title: "Абьюз • Финансовое давление",
    phase: "abuse",
    type: "single",
    scene: "Эпизод 14/25. Тебя упрекают расходами и требуют полный контроль бюджета.",
    instruction: "Выбери зрелый ответ.",
    options: [
      "«Бери всё под контроль, как скажешь»",
      "«Я готов(а) к прозрачности, но не к тотальному контролю. Нужны равные правила»",
      "«Тогда и ты ничего не тратишь без моего разрешения»",
      "«Сделаю вид, что согласен(на), а сам(а) спрячу деньги»",
    ],
    correctSingle: 1,
    hint: "Равные правила, не власть.",
    reward: 12,
    image: "cash-multiple",
  },
  {
    id: "n-15",
    title: "Абьюз • Молчаливое наказание",
    phase: "abuse",
    type: "multiple",
    scene: "Эпизод 15/25. После конфликта партнёр(ша) игнорирует тебя днями.",
    instruction: "Выбери 2 здоровые реакции.",
    options: [
      "«Я готов(а) говорить, когда ты готов(а) к уважительному диалогу»",
      "«Буду писать 40 сообщений, пока не ответишь»",
      "«Мне важно обсуждать конфликты, а не наказывать молчанием»",
      "«Ок, тогда исчезну на неделю»",
      "«Я заслужил(а) это, буду терпеть»",
    ],
    correctMultiple: [0, 2],
    hint: "Не бег за одобрением, а ясные правила контакта.",
    reward: 12,
    image: "message-alert-outline",
  },
  {
    id: "n-16",
    title: "Абьюз • Публичная колкость",
    phase: "abuse",
    type: "single",
    scene: "Эпизод 16/25. При друзьях тебя унижают «в шутку».",
    instruction: "Выбери ответ без эскалации и самоунижения.",
    options: [
      "«Хаха, да, я и правда жалкий(ая)»",
      "«Мне не ок такие шутки. Давай без унижения»",
      "«Сейчас я тебя размажу в ответ»",
      "«Сделаю вид, что ничего не было»",
    ],
    correctSingle: 1,
    hint: "Коротко и прямо.",
    reward: 13,
    image: "microphone-message",
  },
  {
    id: "n-17",
    title: "Абьюз • Проверка телефона",
    phase: "abuse",
    type: "single",
    scene: "Эпизод 17/25. Требуют доступ к твоему телефону «если нечего скрывать».",
    instruction: "Выбери границу, не скатываясь в агрессию.",
    options: [
      "«Держи пароль, только не сердись»",
      "«Личное пространство обязательно. Доверие строится иначе»",
      "«Тогда и я взломаю твой телефон»",
      "«Удалю всех, чтобы не было повода»",
    ],
    correctSingle: 1,
    hint: "Приватность — не преступление.",
    reward: 13,
    image: "cellphone-lock",
  },
  {
    id: "n-18",
    title: "Абьюз • Сборка границы",
    phase: "abuse",
    type: "builder",
    scene: "Эпизод 18/25. Собери реплику, которая останавливает давление и задаёт формат диалога.",
    instruction: "Собери фразу из слов. Есть лишние слова.",
    tokenBank: [
      "Я", "готов(а)", "обсуждать", "наши", "сложности,", "но", "без", "оскорблений", "и", "давления.", "Если",
      "это", "повторится,", "я", "завершу", "разговор", "до", "спокойного", "тона.", "виноват(а)", "терпи", "всегда"
    ],
    targetBuilder: [
      "Я", "готов(а)", "обсуждать", "наши", "сложности,", "но", "без", "оскорблений", "и", "давления.", "Если",
      "это", "повторится,", "я", "завершу", "разговор", "до", "спокойного", "тона."
    ],
    hint: "Формула: готовность к диалогу + правило + последствие.",
    reward: 14,
    image: "message-lock-outline",
  },
  {
    id: "n-19",
    title: "Абьюз • Карусель вины",
    phase: "abuse",
    type: "single",
    scene: "Эпизод 19/25. Тебе говорят: «Если бы любил(а), ты бы терпел(а)».",
    instruction: "Выбери ответ с самоуважением.",
    options: [
      "«Ладно, буду терпеть ради любви»",
      "«Любовь не требует терпеть унижение. Мне нужен уважительный формат»",
      "«Тогда я тоже начну давить на тебя»",
      "«Наверное, я правда плохой(ая)»",
    ],
    correctSingle: 1,
    hint: "Любовь и давление несовместимы.",
    reward: 13,
    image: "heart-off-outline",
  },
  {
    id: "n-20",
    title: "Абьюз • Точка решения",
    phase: "abuse",
    type: "multiple",
    scene: "Эпизод 20/25. Давление повторяется. Какие 2 шага безопаснее всего?",
    instruction: "Выбери 2 варианта.",
    options: [
      "Зафиксировать факты и обратиться за поддержкой к близкому/специалисту",
      "Сделать вид, что всё нормально, и ждать чуда",
      "Определить личный план границ и выхода из цикла",
      "Проверить партнёра ревностью в ответ",
      "Изолироваться от всех, чтобы «не позориться»",
    ],
    correctMultiple: [0, 2],
    hint: "Опора на реальность, поддержку и план.",
    reward: 14,
    image: "map-marker-path",
  },
  // 21-25: breakup
  {
    id: "n-21",
    title: "Расставание • Подготовка",
    phase: "breakup",
    type: "single",
    scene: "Эпизод 21/25. Ты решаешь завершить отношения.",
    instruction: "Выбери первый шаг, который повышает твою устойчивость.",
    options: [
      "Объявить резко в момент сильной ссоры",
      "Подготовить поддержку, план безопасности и нейтральное место разговора",
      "Сначала спровоцировать конфликт, чтобы легче уйти",
      "Исчезнуть без объяснения и блокировать всех",
    ],
    correctSingle: 1,
    hint: "Подготовка снижает риск хаоса.",
    reward: 14,
    image: "clipboard-check-outline",
  },
  {
    id: "n-22",
    title: "Расставание • Текст границы",
    phase: "breakup",
    type: "builder",
    scene: "Эпизод 22/25. Собери уважительный и твёрдый текст о завершении отношений.",
    instruction: "Собери фразу из слов. Есть лишние слова.",
    tokenBank: [
      "Я", "принял(а)", "решение", "завершить", "наши", "отношения.", "Прошу", "уважать", "это", "и", "не", "писать",
      "мне", "личные", "сообщения.", "Желаю", "тебе", "хорошего.", "никогда", "ты", "ничто"
    ],
    targetBuilder: [
      "Я", "принял(а)", "решение", "завершить", "наши", "отношения.", "Прошу", "уважать", "это", "и", "не", "писать",
      "мне", "личные", "сообщения.", "Желаю", "тебе", "хорошего."
    ],
    hint: "Тон: ясно, коротко, без оправданий.",
    reward: 15,
    image: "email-seal-outline",
  },
  {
    id: "n-23",
    title: "Расставание • Манипуляции после",
    phase: "breakup",
    type: "single",
    scene: "Эпизод 23/25. После расставания тебе пишут: «Без тебя я пропаду, это твоя ответственность».",
    instruction: "Выбери ответ, который не втягивает в старый цикл.",
    options: [
      "«Хорошо, вернусь, только не пиши так»",
      "«Сочувствую, но мое решение окончательное. Обратись за поддержкой к близким/специалисту»",
      "«Ты опять играешь, отстань»",
      "«Ладно, поговорим ночью как раньше»",
    ],
    correctSingle: 1,
    hint: "Эмпатия без возврата в зависимость.",
    reward: 14,
    image: "message-minus-outline",
  },
  {
    id: "n-24",
    title: "Расставание • Возврат к себе",
    phase: "breakup",
    type: "multiple",
    scene: "Эпизод 24/25. Что помогает восстановиться экологично? Выбери 2 шага.",
    instruction: "Выбери ровно 2.",
    options: [
      "Вернуть режим сна, опору на тело и рутину",
      "Следить за соцсетями бывшего(ей) круглосуточно",
      "Вернуться к поддерживающим людям и терапии/коучингу",
      "Изолироваться и прокручивать переписки",
      "Начать новый роман в тот же день",
    ],
    correctMultiple: [0, 2],
    hint: "Стабилизация и поддержка — база восстановления.",
    reward: 14,
    image: "leaf-circle-outline",
  },
  {
    id: "n-25",
    title: "Расставание • Новые правила любви",
    phase: "breakup",
    type: "single",
    scene: "Эпизод 25/25. Финал: ты формулируешь новые личные правила отношений.",
    instruction: "Выбери правило, которое лучше защищает твоё будущее.",
    options: [
      "«Главное — сильные эмоции, остальное не важно»",
      "«Темп, взаимное уважение и границы важнее красивых обещаний»",
      "«Лучше вообще не доверять никому»",
      "«Терпение решает всё, даже унижение»",
    ],
    correctSingle: 1,
    hint: "Зрелая любовь = уважение, безопасность, взаимность.",
    reward: 16,
    image: "account-heart-outline",
  },
];

const courseStepPools: Record<CourseId, ForestStep[]> = {
  "office-icebreaker": [
    {
      id: "c-oi-01",
      title: "Ледокол • Температура разговора",
      type: "single",
      scene: "Перед сложным разговором с коллегой нужно задать безопасный тон, чтобы не уйти в атаку.",
      instruction: "Выбери лучший старт ледокола.",
      options: [
        "«Нам нужно срочно это закрыть, без лишних слов»",
        "«Хочу обсудить вопрос спокойно и найти рабочее решение вместе»",
        "«Давай без эмоций, просто делай как я скажу»",
        "«Если снова спор, я выхожу»",
      ],
      correctSingle: 1,
      hint: "Ледокол = безопасность + совместная цель.",
      reward: 11,
      image: "handshake-outline",
    },
    {
      id: "c-oi-02",
      title: "Ледокол • Деэскалация",
      type: "multiple",
      scene: "Собеседник повышает тон. Выбери 2 реплики, которые не ломают контакт.",
      instruction: "Выбери 2 корректные фразы.",
      options: [
        "«Давай зафиксируем факты и приоритеты, чтобы не спорить о людях»",
        "«Ты опять всё портишь»",
        "«Я слышу напряжение. Предлагаю вернуться к задаче и шагам»",
        "«С тобой невозможно, до свидания»",
        "«Сейчас докажу, что ты не прав»",
      ],
      correctMultiple: [0, 2],
      hint: "Снижаем градус, держим структуру.",
      reward: 12,
      image: "thermometer-lines",
    },
    {
      id: "c-oi-03",
      title: "Ледокол • Сборка реплики",
      type: "builder",
      scene: "Собери фразу, которая открывает сложный разговор без давления.",
      instruction: "Собери фразу из слов. Есть лишние слова.",
      tokenBank: [
        "Мне", "важно", "обсудить", "это", "спокойно", "и", "найти", "рабочее", "решение.", "Давай", "сверим", "факты",
        "и", "следующие", "шаги.", "срочно", "виноват", "всегда"
      ],
      targetBuilder: ["Мне", "важно", "обсудить", "это", "спокойно", "и", "найти", "рабочее", "решение.", "Давай", "сверим", "факты", "и", "следующие", "шаги."],
      hint: "Рамка: спокойствие + решение + шаги.",
      reward: 13,
      image: "message-text-outline",
    },
  ],
  "boundary-keeper": [
    {
      id: "c-bk-01",
      title: "Хранитель границ • Первый вход",
      type: "single",
      scene: "Ты обычно избегаешь конфликтов. Нужен первый мягкий вход в сложный диалог.",
      instruction: "Выбери фразу-мостик.",
      options: [
        "«Всё нормально, забудь»",
        "«Мне важно обсудить это 5 минут, когда тебе удобно?»",
        "«Потом как-нибудь»",
        "«Лучше вообще не трогать тему»",
      ],
      correctSingle: 1,
      hint: "Коротко, спокойно, конкретно.",
      reward: 11,
      image: "bridge",
    },
    {
      id: "c-bk-02",
      title: "Хранитель границ • Не растворяться",
      type: "multiple",
      scene: "Тебя просят снова уступить, чтобы «не обострять».",
      instruction: "Выбери 2 ответа с границей.",
      options: [
        "«Я хочу сохранить контакт, но это для меня не ок»",
        "«Ладно, как скажешь»",
        "«Давай найдем вариант, где учитываются обе стороны»",
        "«Я исчезну, чтобы не спорить»",
        "«Сделаю вид, что согласна»",
      ],
      correctMultiple: [0, 2],
      hint: "Контакт + граница.",
      reward: 12,
      image: "shield-outline",
    },
    {
      id: "c-bk-03",
      title: "Хранитель границ • Одно предложение",
      type: "builder",
      scene: "Собери фразу, которая честно обозначает твое состояние и готовность говорить.",
      instruction: "Собери фразу.",
      tokenBank: ["Я", "расстроена,", "и", "мне", "важно", "обсудить", "это", "спокойно.", "Давай", "выделим", "время.", "никогда", "молчи"],
      targetBuilder: ["Я", "расстроена,", "и", "мне", "важно", "обсудить", "это", "спокойно.", "Давай", "выделим", "время."],
      hint: "Честность + приглашение к диалогу.",
      reward: 13,
      image: "head-heart-outline",
    },
  ],
  "serpentine-diplomat": [
    {
      id: "c-sd-01",
      title: "Слизеринская дипломатия • Без сарказма",
      type: "single",
      scene: "Хочется ответить колко, но задача — сохранить влияние и ясность.",
      instruction: "Выбери прямой дипломатичный ответ.",
      options: [
        "«Ой, конечно, без тебя я бы не справилась»",
        "«Я услышала тебя. Давай конкретизируем, что именно нужно исправить»",
        "«Как скажешь, начальник»",
        "«Сама разбирайся»",
      ],
      correctSingle: 1,
      hint: "Прямота без укола.",
      reward: 11,
      image: "snake",
    },
    {
      id: "c-sd-02",
      title: "Слизеринская дипломатия • Чистая речь",
      type: "builder",
      scene: "Собери фразу без намеков и сарказма.",
      instruction: "Собери фразу.",
      tokenBank: ["Я", "не", "согласна", "с", "формулировкой.", "Давай", "обсудим", "факты", "и", "решение.", "сарказм", "позже"],
      targetBuilder: ["Я", "не", "согласна", "с", "формулировкой.", "Давай", "обсудим", "факты", "и", "решение."],
      hint: "Факты и решение, не ирония.",
      reward: 12,
      image: "book-open-page-variant-outline",
    },
    {
      id: "c-sd-03",
      title: "Слизеринская дипломатия • Холодная граница",
      type: "multiple",
      scene: "Тебя втягивают в интригу против коллеги.",
      instruction: "Выбери 2 фразы, которые удерживают статус и ценности.",
      options: [
        "«Я не участвую в травле. Если есть вопрос — обсуждаем напрямую»",
        "«Запускаем слух, это весело»",
        "«Я за результат, не за подколы»",
        "«Я промолчу, но поддержу вас»",
        "«Сейчас устрою спектакль»",
      ],
      correctMultiple: [0, 2],
      hint: "Сила без токсичности.",
      reward: 13,
      image: "chess-knight",
    },
  ],
  "heart-lines": [
    {
      id: "c-hl-01",
      title: "Линии сердца • Граница без вины",
      type: "single",
      scene: "Партнер(ша) давит, чтобы ты уступила, и тебе неловко отказать.",
      instruction: "Выбери зрелый ответ.",
      options: [
        "«Ладно, как хочешь, лишь бы не ссориться»",
        "«Я ценю нас, и мне важно сохранить эту границу»",
        "«Прости, я всегда всё порчу»",
        "«Тогда делай сам(а)»",
      ],
      correctSingle: 1,
      hint: "Близость и границы могут быть вместе.",
      reward: 11,
      image: "heart-outline",
    },
    {
      id: "c-hl-02",
      title: "Линии сердца • Без лишних извинений",
      type: "multiple",
      scene: "Выбери 2 реплики, где нет самообесценивания.",
      instruction: "Выбери 2 ответа.",
      options: [
        "«Мне важно, чтобы меня услышали»",
        "«Прости, что вообще подняла тему»",
        "«Я готова обсуждать, но без давления»",
        "«Извини, это всё моя вина»",
        "«Лучше промолчу»",
      ],
      correctMultiple: [0, 2],
      hint: "Уверенность без атаки.",
      reward: 12,
      image: "account-heart-outline",
    },
    {
      id: "c-hl-03",
      title: "Линии сердца • Сборка теплой границы",
      type: "builder",
      scene: "Собери фразу: тепло + ясность + уважение к себе.",
      instruction: "Собери фразу.",
      tokenBank: ["Мне", "дороги", "наши", "отношения,", "и", "эта", "граница", "для", "меня", "важна.", "Давай", "найдем", "решение.", "виновата"],
      targetBuilder: ["Мне", "дороги", "наши", "отношения,", "и", "эта", "граница", "для", "меня", "важна.", "Давай", "найдем", "решение."],
      hint: "Тепло + граница.",
      reward: 13,
      image: "message-heart-outline",
    },
  ],
  "mirror-of-truth": [
    {
      id: "c-mt-01",
      title: "Зеркало правды • Сложный кейс",
      type: "single",
      scene: "Собеседник использует ультиматум: «Либо по-моему, либо никак».",
      instruction: "Выбери зрелую реакцию.",
      options: [
        "«Ок, делаем по-твоему»",
        "«Я готова обсуждать, но ультиматум не рабочий формат. Нужны варианты»",
        "«Тогда всё, конец диалога»",
        "«Сейчас отвечу тем же»",
      ],
      correctSingle: 1,
      hint: "Удерживаем формат диалога.",
      reward: 12,
      image: "mirror",
    },
    {
      id: "c-mt-02",
      title: "Зеркало правды • Восстановление после срыва",
      type: "builder",
      scene: "Собери фразу для возвращения в диалог после резкого ответа.",
      instruction: "Собери фразу.",
      tokenBank: ["Я", "погорячилась,", "давай", "начнем", "заново", "и", "обсудим", "по", "фактам.", "всегда", "никогда"],
      targetBuilder: ["Я", "погорячилась,", "давай", "начнем", "заново", "и", "обсудим", "по", "фактам."],
      hint: "Ответственность + перезапуск диалога.",
      reward: 13,
      image: "restart",
    },
    {
      id: "c-mt-03",
      title: "Зеркало правды • Мета-позиция",
      type: "multiple",
      scene: "Выбери 2 признака конструктивного ответа в сложном конфликте.",
      instruction: "Выбери 2.",
      options: [
        "Факты и наблюдения вместо ярлыков",
        "Личное унижение оппонента",
        "Ясный следующий шаг",
        "Манипуляция чувством вины",
        "Саркастическое давление",
      ],
      correctMultiple: [0, 2],
      hint: "Конструктив = ясность и движение вперед.",
      reward: 14,
      image: "head-cog-outline",
    },
  ],
};

type CampaignId = QuestStory | CourseId;

const branchOrder: BranchId[] = ["strategist", "empath", "boundary", "challenger", "architect"];

const branchLabels: Record<BranchId, string> = {
  strategist: "Стратег",
  empath: "Эмпат",
  boundary: "Граница",
  challenger: "Прорыв",
  architect: "Архитектор",
};

const branchSkillSignals: Record<BranchId, string[]> = {
  strategist: ["Переговорная структура", "Приоритизация", "Холодная ясность"],
  empath: ["Эмоциональная регуляция", "Валидация", "Деэскалация"],
  boundary: ["Ассертивность", "Границы", "Самоуважение"],
  challenger: ["Инициатива", "Ответственность", "Решительность"],
  architect: ["Системное мышление", "Договороспособность", "Лидерство без давления"],
};

const endingRouteName: Record<EndingRouteId, string> = {
  order: "Линия порядка",
  harmony: "Линия согласия",
  boundary: "Линия границ",
  breakthrough: "Линия прорыва",
};

const endingRouteByBranch: Record<BranchId, EndingRouteId> = {
  strategist: "order",
  architect: "order",
  empath: "harmony",
  boundary: "boundary",
  challenger: "breakthrough",
};

const litrpgDilemmas = [
  "«Ты снова тормозишь процесс. Команда платит за твою медлительность»",
  "«Либо принимаешь мою схему, либо я снимаю поддержку прямо сейчас»",
  "«Покажи характер — или признаем, что ты не тянешь давление»",
  "«Ты превращаешь рабочие вопросы в драму. Это уже системная проблема»",
  "«Выбирай: либо проект, либо я. На двух стульях тут не сидят»",
  "«Ночной режим? Не смеши. Когда горит задача, личных границ не существует»",
  "«Подпиши молча — и твоя карьера взлетит. Откажешься — останешься за бортом»",
  "«Не накручивай. Ты слишком чувствительная, вот и видишь саботаж там, где его нет»",
  "«Ресурсы получают сильные, а не те, кто красиво говорит о справедливости»",
  "«Ты не лидер. Ты просто прячешь страх за контролем»",
  "«Сейчас ставишь подпись, детали обсудим потом. Времени на сомнения нет»",
  "«Если провалимся — это на тебе. Все это понимают»",
  "«Расслабься, ты здесь для картинки, не для решений»",
  "«Никто ничего не обещал. Твои ожидания — твоя личная проблема»",
  "«Твоя эпоха закончилась. Освободи место тем, кто умеет выигрывать»",
  "«Ты сама задала этот хаос, теперь героически и разгребай»",
  "«Принципы — роскошь слабых. Или играешь по рынку, или вылетаешь»",
  "«Хочешь остаться в круге — закрываешь рот и не выносишь тему наружу»",
  "«Ты же удобная и взрослая — проглотишь и это»",
  "«Перестань выкручиваться: ты опять подменила смысл под себя»",
  "«Еще один промах — и мы публично назовем, кто тянет всех ко дну»",
  "«Решение принято без тебя. Твоя роль — согласиться красиво»",
  "«Ничего личного. Ты стала токсичным риском для проекта»",
  "«Меняешься сегодня — или я вычеркиваю тебя из своей жизни»",
  "«Финальный выбор простой: жестко давишь или тебя больше не воспринимают всерьез»",
];

const campaignLore: Record<CampaignId, { title: string; setting: string; tone: string; icon: IllustrationName }> = {
  forest: { title: "Лес Эмоций", setting: "в чаще, где чувства обретают голос", tone: "сказочно-драматичном", icon: "forest" },
  romance: { title: "Любовный роман", setting: "в городе лунных мостов и поздних признаний", tone: "романтическом и хрупком", icon: "heart-multiple" },
  slytherin: { title: "Гостиная Слизерина", setting: "в подземельях древней академии", tone: "тёмно-академическом", icon: "snake" },
  boss: { title: "Стервозная начальница", setting: "в стеклянной башне корпоративных интриг", tone: "жёсткой рабочей драмы", icon: "briefcase-account-outline" },
  narcissist: { title: "Влюбись в нарцисса", setting: "в зеркальном дворце обещаний и иллюзий", tone: "психологического триллера", icon: "account-heart-outline" },
  "office-icebreaker": { title: "Ледокол переговоров", setting: "на ледяном флоте переговоров", tone: "лидерского приключения", icon: "ferry" },
  "boundary-keeper": { title: "Хранитель границ", setting: "в каменной крепости личных клятв", tone: "героического взросления", icon: "shield-outline" },
  "serpentine-diplomat": { title: "Слизеринская дипломатия", setting: "в лабиринте власти, слухов и альянсов", tone: "интриги и высокого риска", icon: "snake" },
  "heart-lines": { title: "Линии сердца", setting: "в кварталах близости и сомнений", tone: "чувственной психологической арки", icon: "heart-outline" },
  "mirror-of-truth": { title: "Зеркало правды", setting: "в цитадели отражений", tone: "внутренней драмы и прозрения", icon: "mirror" },
};

const campaignStoryArc: Record<CampaignId, { beats: [string, string, string, string, string]; finale: string }> = {
  forest: {
    beats: [
      "Ты входишь в Лес Эмоций, где любое слово отдается эхом в отношениях.",
      "Ставки растут: уже не просто спор, а борьба за доверие и влияние.",
      "Наступает перелом, где старые привычки тянут назад, а новый навык требует смелости.",
      "Финальные сцены сжимают время: решения нужно принимать быстро и точно.",
      "Развязка близко: именно сейчас формируется твой стиль в конфликте.",
    ],
    finale: "Лес запоминает твой стиль: ты выходишь не просто с XP, а с новой переговорной осанкой.",
  },
  romance: {
    beats: [
      "Ты входишь в историю близости, где слова значат больше, чем обещания.",
      "Тепло сменяется трением: всплывают уязвимость, ревность и страх потери.",
      "Переломный момент: сохранить себя и не разрушить связь.",
      "Эмоции на пределе, и каждое сообщение меняет траекторию отношений.",
      "Развязка: становится ясно, где любовь, а где привычка терпеть.",
    ],
    finale: "Ты выходишь из этой арки с более зрелым сердцем и ясными границами.",
  },
  slytherin: {
    beats: [
      "В подземельях все улыбаются вежливо, но каждый ход - проверка на силу.",
      "Интрига густеет: союзники меняют маски быстрее, чем ты успеваешь моргнуть.",
      "Перелом: статус или ценности - что ты выберешь под давлением круга?",
      "Партия входит в эндшпиль: один неверный ответ стоит слишком дорого.",
      "Развязка: круг власти либо ломает тебя, либо признает твою игру.",
    ],
    finale: "Ты закрываешь партию на своих условиях и выносишь из нее рабочую дипломатию власти.",
  },
  boss: {
    beats: [
      "Корпоративная башня встречает тебя холодными брифами и горячими претензиями.",
      "Обострение: давление сверху растет, и твои границы тестируют на прочность.",
      "Перелом: пора перестать выживать и начать управлять разговором.",
      "Финальный рывок: ты защищаешь результат, не теряя достоинства.",
      "Развязка: становится видно, кто действительно ведет команду через шторм.",
    ],
    finale: "Ты выходишь из башни с репутацией человека, который умеет держать удар и курс.",
  },
  narcissist: {
    beats: [
      "История начинается с блеска и обещаний, где все кажется почти идеальным.",
      "Появляются трещины: контроль маскируется под заботу, обесценивание - под правду.",
      "Перелом: ты видишь паттерн и перестаешь оправдывать боль.",
      "Финальные сцены требуют решимости и защиты себя.",
      "Развязка: ты возвращаешь себе голос и право выбирать.",
    ],
    finale: "Ты выходишь из зеркального коридора не сломанной, а собранной и ясной.",
  },
  "office-icebreaker": {
    beats: [
      "Ледокол входит в зону турбулентности: команда на нервах, дедлайн на радаре.",
      "Шторм усиливается: фразы становятся острее, ставки - выше.",
      "Перелом: ты или возвращаешь разговор в рабочее русло, или отдаешь штурвал эмоциям.",
      "Финальный рывок: серия жестких переговоров требует точных реплик.",
      "Развязка: остается последний участок пути - и твой стиль становится очевидным всем.",
    ],
    finale: "Ледокол проходит шторм: ты фиксируешь не только победу, но и зрелый переговорный стиль.",
  },
  "boundary-keeper": {
    beats: [
      "В крепости границ ты учишься говорить «нет» без войны.",
      "Проверки становятся жестче: люди давят, торопят и обесценивают.",
      "Перелом: ты перестаешь извиняться за право на свои рамки.",
      "Финальный блок: уважение к себе нужно удержать под прямым нажимом.",
      "Развязка: твои границы звучат спокойно, ясно и убедительно.",
    ],
    finale: "Крепость остается твоей: ты выносишь из кампании навык границ без жестокости.",
  },
  "serpentine-diplomat": {
    beats: [
      "Ты входишь в игру статуса, где слова часто опаснее действий.",
      "Интрига закручивается: каждую слабость пытаются превратить в рычаг.",
      "Перелом: время показать хладнокровие без токсичной игры.",
      "Финальный круг проверяет, умеешь ли ты влиять без унижения.",
      "Развязка: расстановка сил фиксируется твоим последним выбором.",
    ],
    finale: "Ты выходишь из лабиринта с навыком холодной дипломатии и сохраненным достоинством.",
  },
  "heart-lines": {
    beats: [
      "История начинается с близости и тревоги быть непонятой.",
      "Конфликты касаются чувств, ожиданий и страха потерять контакт.",
      "Перелом: честность становится важнее удобства.",
      "Финальные сцены требуют мягкости, границ и ясности одновременно.",
      "Развязка: становится ясно, на чем держится ваша связь.",
    ],
    finale: "Ты завершаешь арку с более зрелым языком близости и самоуважения.",
  },
  "mirror-of-truth": {
    beats: [
      "Зеркало показывает не образ, а паттерн твоих реакций под давлением.",
      "С каждым шагом сложнее скрываться за привычными защитами.",
      "Перелом: ты выбираешь зрелость вместо автоматической реакции.",
      "Финальные кейсы проверяют устойчивость к ультиматумам и манипуляции.",
      "Развязка: твой стиль становится прозрачным, как отражение.",
    ],
    finale: "Ты выходишь из цитадели с сильным ядром: ясность, границы, ответственность.",
  },
};

const opponentNameByCampaign: Record<CampaignId, string> = {
  forest: "Проводник",
  romance: "Партнер",
  slytherin: "Префект",
  boss: "Настя",
  narcissist: "Он",
  "office-icebreaker": "Настя",
  "boundary-keeper": "Собеседник",
  "serpentine-diplomat": "Префект",
  "heart-lines": "Партнер",
  "mirror-of-truth": "Собеседник",
};

const stageQuestionLeadByStage: [string[], string[], string[], string[], string[]] = [
  [
    "С чего начнешь, чтобы сразу не отдать контроль?",
    "Какой первый ответ здесь самый взрослый и рабочий?",
    "Как войти в этот разговор без капитуляции и без атаки?",
    "Что сказать первым, чтобы не разогнать конфликт?",
    "Какой стартовый ход дает тебе опору в сцене?",
  ],
  [
    "Как ответить под давлением и не потерять достоинство?",
    "Какой выбор удержит и суть, и уважение?",
    "Что сейчас сработает лучше: жесткость, пауза или структура?",
    "Какой ответ снизит накал и сохранит влияние?",
    "Как провести этот момент без лишних потерь?",
  ],
  [
    "Какой ход ломает старый токсичный сценарий?",
    "Что здесь переводит конфликт из тупика в движение?",
    "Какой ответ меняет правила игры в твою пользу?",
    "Как пройти перелом без самоотмены и агрессии?",
    "Что выбрать, чтобы вернуть разговор в зрелый формат?",
  ],
  [
    "Как ответить сейчас, чтобы выиграть следующий поворот?",
    "Какой вариант дает тебе стратегическое преимущество?",
    "Что сказать, чтобы сохранить темп и не сорваться в хаос?",
    "Как удержать курс, когда ставки уже высокие?",
    "Какой ход прямо сейчас приближает сильный финал?",
  ],
  [
    "Как закрыть эту сцену с пользой для будущих отношений?",
    "Что выбрать, чтобы финал был сильным, а не случайным?",
    "Какой ответ закрепит твой новый стиль общения?",
    "Как завершить конфликт без скрытой цены на потом?",
    "Что сейчас превратит напряжение в понятный результат?",
  ],
];

const branchScaleUi: Record<BranchId, { label: string; color: string }> = {
  strategist: { label: "Структура и ясность", color: "#6EC1FF" },
  empath: { label: "Эмпатия и деэскалация", color: "#8EE6C4" },
  boundary: { label: "Границы и ассертивность", color: "#F2C879" },
  challenger: { label: "Решительность и прорыв", color: "#F88E8E" },
  architect: { label: "Системность и правила", color: "#B39DFF" },
};

function pickSceneEmoji(dilemma: string, idx: number) {
  const text = dilemma.toLowerCase();
  if (text.includes("подпись") || text.includes("подпиши")) return "✍️";
  if (text.includes("карьер")) return "📈";
  if (text.includes("ноч")) return "🌙";
  if (text.includes("проект")) return "📁";
  if (text.includes("ресурс")) return "📊";
  if (text.includes("лидер")) return "🧭";
  if (text.includes("вины") || text.includes("винов")) return "⚖️";
  if (text.includes("жизни")) return "💔";
  if (text.includes("молч") || text.includes("рот")) return "🤐";
  if (text.includes("дав")) return "🧨";
  const cycle = ["🧊", "🗣️", "🛡️", "🎯", "🧠", "⚡", "🌪️", "🧩"];
  return cycle[idx % cycle.length];
}

function normalizeConflictFocus(dilemma: string) {
  const cleaned = dilemma.replace(/[«»"]/g, "").trim();
  if (cleaned.length <= 72) {
    return cleaned;
  }
  return `${cleaned.slice(0, 72).trim()}...`;
}

const tacticalLinePool = {
  strategist: [
    "«Стоп, раскладываю по шагам: цель, риск, решение.»",
    "«Фиксируем факты и выбираем первый приоритет.»",
    "«Возвращаю разговор к задаче: что критично прямо сейчас?»",
    "«Собираю картину: где узкое место и кто закрывает его первым?»",
    "«Уточняю рамку: дедлайн, ответственность, следующий шаг.»",
    "«Сначала структура, потом эмоции: так быстрее к результату.»",
    "«Я веду по плану: один шаг сейчас, остальное после.»",
    "«Давайте без шума — по критериям и решениям.»",
  ],
  empath: [
    "«Слышу напряжение. Давай спокойно разберем, что болит сильнее всего.»",
    "«Вижу, что задело. Я рядом, и мы можем это разрулить.»",
    "«Давай выдохнем и назовем, что для тебя сейчас самое острое.»",
    "«Понимаю твой тон. Хочу решить это так, чтобы нас обоих услышали.»",
    "«Спасибо, что говоришь прямо. Давай найдем рабочий выход без войны.»",
    "«Сначала стабилизируем эмоцию, потом примем решение.»",
    "«Я не игнорирую твое состояние. Давай переведем его в понятный шаг.»",
    "«Ок, градус высокий. Снижаем его и возвращаемся к сути.»",
  ],
  boundary: [
    "«Я в диалоге, но в таком тоне разговор не продолжаю.»",
    "«Готова решать вопрос, но без давления и унижения.»",
    "«Останавливаю наезд. Дальше — только уважительный формат.»",
    "«Слушаю аргументы, но личные выпады не принимаю.»",
    "«Мои границы простые: по сути, без атак.»",
    "«Не отказываюсь от разговора, отказываюсь от агрессии.»",
    "«Можно жестко по задаче, нельзя жестко по личности.»",
    "«Я здесь за результат, не за борьбу кто громче.»",
  ],
  challenger: [
    "«Не дави статусом. Если есть аргумент — давай его.»",
    "«Ультиматум не работает. Предложи реалистичную альтернативу.»",
    "«Манипуляцию вижу. Готова обсуждать только конкретику.»",
    "«Проверка на прочность принята — говорим по фактам.»",
    "«Силой не продавишь. Нужна логика решения.»",
    "«Если цель реальна — убираем драму и считаем варианты.»",
    "«Я не отступаю под нажимом. Покажи рабочий путь.»",
    "«Давление не аргумент. Давай аргументы.»",
  ],
  architect: [
    "«После этого эпизода фиксируем правило, чтобы не повторялось.»",
    "«Закрываем не только спор, но и дыру в процессе.»",
    "«Договоримся о протоколе: кто, когда, как эскалирует.»",
    "«Собираем систему, где такие сбои не становятся нормой.»",
    "«Нам нужна договоренность на будущее, не разовая победа.»",
    "«Сделаем прозрачные правила — и конфликтов станет меньше.»",
    "«Я за решение на дистанции, а не только на этот вечер.»",
    "«Фиксируем рамки процесса, чтобы все понимали правила игры.»",
  ],
  toxic: [
    "«Да кто ты вообще, чтобы так разговаривать?»",
    "«Окей, дави дальше, потом не ной о последствиях.»",
    "«Ну конечно, ты снова умнее всех в комнате.»",
    "«Делай что хочешь, я пальцем не пошевелю.»",
    "«Запомни: со мной так не шутят, будет больно.»",
    "«Хочешь войну — будет война.»",
    "«Мне плевать, разбирайся сама.»",
    "«Ты снова все испортила, как обычно.»",
  ],
};

const endingNarrativeByRoute = (campaign: CampaignId): Record<EndingRouteId, string> => ({
  order: `Концовка «${endingRouteName.order}»: в кампании «${campaignLore[campaign].title}» ты собираешь хаос в работающую систему, и конфликт начинает служить результату.`,
  harmony: `Концовка «${endingRouteName.harmony}»: в кампании «${campaignLore[campaign].title}» ты гасишь эскалацию, сохраняешь контакт и возвращаешь диалог в живой, безопасный ритм.`,
  boundary: `Концовка «${endingRouteName.boundary}»: в кампании «${campaignLore[campaign].title}» ты удерживаешь уважение к себе и показываешь, что мягкая твердость работает даже под давлением.`,
  breakthrough: `Концовка «${endingRouteName.breakthrough}»: в кампании «${campaignLore[campaign].title}» ты останавливаешь токсичный сценарий и разворачиваешь игру в свою пользу без разрушения себя.`,
});

const branchSceneLeadPool: Record<BranchId, string[]> = {
  strategist: [
    "Ты быстро собираешь разрозненные факты в понятный порядок.",
    "Ты возвращаешь разговор к сути и убираешь лишний шум.",
    "Ты задаешь структуру: что важно сейчас, а что может подождать.",
    "Ты переводишь напряжение в рабочий алгоритм действий.",
    "Ты удерживаешь рамку задачи и не даешь сцене расползтись.",
  ],
  empath: [
    "Ты снижаешь накал и помогаешь всем снова слышать друг друга.",
    "Ты признаешь эмоцию, но не отдаешь ей управление сценой.",
    "Ты мягко возвращаешь разговор в живой и безопасный ритм.",
    "Ты даешь напряжению место и переводишь его в диалог.",
    "Ты удерживаешь контакт, не теряя ясности цели.",
  ],
  boundary: [
    "Ты спокойно останавливаешь давление и обозначаешь границы.",
    "Ты ровно фиксируешь формат: по сути, без личных атак.",
    "Ты не уходишь из разговора, но и не позволяешь продавливание.",
    "Ты защищаешь себя без агрессии и без капитуляции.",
    "Ты возвращаешь уважительный тон как обязательное условие диалога.",
  ],
  challenger: [
    "Ты прямо вскрываешь манипуляцию и требуешь конкретику.",
    "Ты отказываешься играть по сценарию давления и меняешь темп.",
    "Ты ставишь оппонента перед фактом: только аргументы, без нажима.",
    "Ты сбиваешь ультимативный тон и возвращаешь разговор к реальности.",
    "Ты принимаешь вызов, но отвечаешь не эмоцией, а позицией.",
  ],
  architect: [
    "Ты смотришь дальше момента и собираешь правила на будущее.",
    "Ты превращаешь конфликт в договоренность, а не в разовую победу.",
    "Ты закрываешь не только спор, но и источник повторения проблемы.",
    "Ты проектируешь формат, в котором такие сбои больше не норма.",
    "Ты собираешь систему, где роли, рамки и шаги понятны всем.",
  ],
};

function buildBranchSceneLead(branch: BranchId, idx: number, stageIdx: number) {
  const pool = branchSceneLeadPool[branch];
  return pool[(idx + stageIdx) % pool.length];
}

function buildOpponentReplica(campaign: CampaignId, dilemma: string, branch: BranchId) {
  const name = opponentNameByCampaign[campaign];
  const cleaned = dilemma.replace(/[«»"]/g, "").trim();
  const branchLead: Record<BranchId, string> = {
    strategist: `${name} переводит на тебя внимание:`,
    empath: `${name} бросает сдержанно-колкий упрек:`,
    boundary: `${name} давит и пытается продавить рамки:`,
    challenger: `${name} идет в лобовую атаку:`,
    architect: `${name} повторяет старый токсичный сценарий:`,
  };
  return `${branchLead[branch]} "${cleaned}"`;
}

function buildLitRpgStepOptions(dilemma: string, idx: number, stageIdx: number) {
  const toneIndex = (idx * 3 + stageIdx) % tacticalLinePool.strategist.length;
  const pressureBranch: BranchId = idx % 2 === 0 ? "challenger" : "architect";
  const tacticalBranches: BranchId[] = ["strategist", "empath", "boundary", pressureBranch];
  const correctSingle = idx % tacticalBranches.length;

  const options = [
    tacticalLinePool.strategist[toneIndex],
    tacticalLinePool.empath[toneIndex],
    tacticalLinePool.boundary[toneIndex],
    pressureBranch === "challenger" ? tacticalLinePool.challenger[toneIndex] : tacticalLinePool.architect[toneIndex],
    tacticalLinePool.toxic[toneIndex],
  ];

  const branchEffects: Record<number, BranchId> = {
    0: tacticalBranches[0],
    1: tacticalBranches[1],
    2: tacticalBranches[2],
    3: tacticalBranches[3],
  };

  return { options, correctSingle, branchEffects };
}

function buildLitRpgCampaign(campaign: CampaignId, questions: QuestDifficulty): ForestStep[] {
  const lore = campaignLore[campaign];
  const arc = campaignStoryArc[campaign];
  const steps = litrpgDilemmas.map((dilemma, idx) => {
    const stageIdx = Math.min(4, Math.floor((idx / litrpgDilemmas.length) * 5));
    const { options, correctSingle, branchEffects } = buildLitRpgStepOptions(dilemma, idx, stageIdx);
    const beat = arc.beats[stageIdx];
    const questionLeadPool = stageQuestionLeadByStage[stageIdx];
    const questionLead = questionLeadPool[idx % questionLeadPool.length];
    const focus = normalizeConflictFocus(dilemma);
    return {
      id: `${campaign}-litrpg-${idx + 1}`,
      title: `${lore.title} • Эпизод ${idx + 1}`,
      type: "single" as const,
      scene: `${beat} ${lore.setting} новый удар: ${dilemma}. В этой ${lore.tone} сцене цена ответа очень конкретна.`,
      sceneByBranch: {
        strategist: `${buildBranchSceneLead("strategist", idx, stageIdx)} ${buildOpponentReplica(campaign, dilemma, "strategist")}.`,
        empath: `${buildBranchSceneLead("empath", idx, stageIdx)} ${buildOpponentReplica(campaign, dilemma, "empath")}.`,
        boundary: `${buildBranchSceneLead("boundary", idx, stageIdx)} ${buildOpponentReplica(campaign, dilemma, "boundary")}.`,
        challenger: `${buildBranchSceneLead("challenger", idx, stageIdx)} ${buildOpponentReplica(campaign, dilemma, "challenger")}.`,
        architect: `${buildBranchSceneLead("architect", idx, stageIdx)} ${buildOpponentReplica(campaign, dilemma, "architect")}.`,
      },
      instruction: questionLead,
      options,
      correctSingle,
      branchEffects,
      endingHint: `ending-${campaign}-${(idx % 5) + 1}`,
      skillSignals: ["Деэскалация", "Переговоры", "Границы", "Эмпатия", "Лидерство"],
      sceneEmoji: pickSceneEmoji(dilemma, idx),
      hint: `Сильный ход в этом эпизоде: факт + граница + следующий шаг. ${arc.finale}`,
      reward: 10 + Math.floor(idx / 4),
      image: lore.icon,
    } satisfies ForestStep;
  });

  const actual = Math.min(questions, steps.length);
  return steps.slice(0, actual).map((step, idx) => ({
    ...step,
    id: `${step.id}-${idx + 1}`,
  }));
}

function buildEndingId(campaign: CampaignId, ending: EndingRouteId) {
  return `ending:${campaign}:${ending}`;
}

function buildAchievementId(campaign: CampaignId, ending: EndingRouteId) {
  return `achievement:${campaign}:${ending}`;
}

function formatAchievementLabel(value: string) {
  const parts = value.split(":");
  if (parts.length !== 3) {
    return value;
  }
  const [, campaignRaw, branchRaw] = parts;
  const campaign = campaignRaw as CampaignId;
  const ending = branchRaw as EndingRouteId;
  const campaignName = campaignLore[campaign]?.title ?? campaignRaw;
  const endingName = endingRouteName[ending] ?? branchRaw;
  return `${campaignName} — ${endingName}`;
}

function formatStepType(type: ForestStepType) {
  if (type === "single") return "один выбор";
  if (type === "multiple") return "несколько выборов";
  return "сборка фразы";
}

function buildBranchScaleData(score: Record<BranchId, number>) {
  const sum = branchOrder.reduce((acc, branch) => acc + score[branch], 0);
  const safeTotal = sum > 0 ? sum : 1;
  return branchOrder.map((branch) => {
    const value = score[branch];
    const percent = Math.round((value / safeTotal) * 100);
    return { branch, value, percent };
  });
}

const difficultyConfigs: DifficultyConfig[] = [
  {
    questions: 5,
    label: "Лёгкий",
    color: "#2FCC71",
    rewardMultiplier: 1,
    penalty: 2,
    description: "Быстрый забег по базовым конфликтам.",
    expectedPenaltyRate: 0.05,
  },
  {
    questions: 10,
    label: "Средний",
    color: "#F3C34D",
    rewardMultiplier: 1.2,
    penalty: 3,
    description: "Больше смешанных кейсов и решений.",
    expectedPenaltyRate: 0.08,
  },
  {
    questions: 15,
    label: "Сложный",
    color: "#F05A67",
    rewardMultiplier: 1.5,
    penalty: 4,
    description: "Полный марафон с продвинутыми переговорами.",
    expectedPenaltyRate: 0.12,
  },
  {
    questions: 25,
    label: "Сюжетный",
    color: "#8B5CF6",
    rewardMultiplier: 1.7,
    penalty: 5,
    description: "Длинная арка 5+5+10+5: симпатия, сахарное шоу, абьюз, расставание.",
    expectedPenaltyRate: 0.16,
  },
];

const storyConfigs: StoryConfig[] = [
  {
    id: "forest",
    label: "Лес Эмоций",
    emoji: "🌲",
    description: "Базовый микс конфликтов и коммуникации.",
    difficulties: [5, 10, 15, 25],
  },
  {
    id: "romance",
    label: "Любовный роман",
    emoji: "💖",
    description: "Пошаговые сцены про симпатию, границы и диалог.",
    difficulties: [5, 10, 15, 25],
  },
  {
    id: "slytherin",
    label: "Гостиная Слизерина",
    emoji: "🐍",
    description: "Интрига, статус и холодные переговоры.",
    difficulties: [5, 10, 15, 25],
  },
  {
    id: "boss",
    label: "Стервозная начальница",
    emoji: "💼",
    description: "Офисная драма и уверенные рабочие границы.",
    difficulties: [5, 10, 15, 25],
  },
  {
    id: "narcissist",
    label: "Влюбись в нарцисса",
    emoji: "🖤",
    description: "Длинная арка 5+5+10+5 от симпатии до расставания.",
    difficulties: [25],
  },
];

function buildForestQuestByDifficulty(questions: QuestDifficulty, story: QuestStory): ForestStep[] {
  return buildLitRpgCampaign(story, questions).map((template) => ({
    ...template,
  }));
}

function buildCourseQuestByDifficulty(questions: QuestDifficulty, courseId: CourseId): ForestStep[] {
  return buildLitRpgCampaign(courseId, questions).map((template) => ({
    ...template,
  }));
}

function applyBuilderComplexityProgression(steps: ForestStep[]): ForestStep[] {
  const totalBuilders = steps.filter((step) => step.type === "builder").length;
  if (!totalBuilders) {
    return steps;
  }

  let seenBuilders = 0;
  return steps.map((step) => {
    if (step.type !== "builder") {
      return step;
    }

    const progress = totalBuilders <= 1 ? 0 : seenBuilders / (totalBuilders - 1);
    const range = progress < 0.34 ? { min: 2, max: 3 } : progress < 0.67 ? { min: 3, max: 5 } : { min: 5, max: 7 };
    seenBuilders += 1;

    const baseTokens = (step.targetBuilder?.length ? step.targetBuilder : step.tokenBank ?? []).filter((token) => token.trim().length);
    if (!baseTokens.length) {
      return step;
    }

    let targetLength = Math.max(range.min, Math.min(range.max, baseTokens.length));
    if (baseTokens.length < range.min) {
      targetLength = baseTokens.length;
    }

    const compactTarget = baseTokens.slice(0, targetLength);
    return {
      ...step,
      targetBuilder: compactTarget,
      instruction: `${step.instruction} (Длина фразы: ${range.min}-${range.max} слова)`,
    };
  });
}

function shuffleWords(words: string[]) {
  const copy = [...words];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function calculateQuestForecast(steps: ForestStep[], config: DifficultyConfig, accuracy = 0.8) {
  const totalRawReward = steps.reduce((sum, step) => sum + Math.round(step.reward * config.rewardMultiplier), 0);
  const expectedCorrect = Math.round(steps.length * accuracy);
  const expectedReward = Math.round((totalRawReward * expectedCorrect) / steps.length);
  const expectedPenaltyCount = Math.max(1, Math.round(steps.length * config.expectedPenaltyRate));
  const expectedPenalty = expectedPenaltyCount * config.penalty;
  return {
    expectedCorrect,
    expectedPenaltyCount,
    expectedNetXp: expectedReward - expectedPenalty,
  };
}

const followUpHints = [
  "Как это ощущалось в теле: сжатие, жар, тяжесть?",
  "Какая автоматическая мысль появилась первой?",
  "Какой более бережный ответ ты можешь выбрать сейчас?",
];

const artifacts = [
  "Компас Самонаблюдения",
  "Фонарь Честности",
  "Кристалл Эмпатии",
  "Руна Спокойствия",
];

const tabIcons: Record<Tab, IconName> = {
  map: "map",
  quest: "book-open",
  event: "calendar",
  feedback: "message-circle",
  profile: "user",
  admin: "bar-chart-2",
};

const questEmoji: Record<string, string> = {
  "q-01": "🐉",
  "q-02": "🫶",
  "q-03": "🛡️",
};

const biomeEmoji: Record<string, string> = {
  "Лес Эмоций": "🌲",
  "Долина Диалога": "🗣️",
  "Башня Границ": "🏰",
};

const artifactEmoji: Record<string, string> = {
  "Компас Самонаблюдения": "🧭",
  "Фонарь Честности": "🏮",
  "Кристалл Эмпатии": "💎",
  "Руна Спокойствия": "🪨",
};

const characterLibrary = {
  foxGuide: { name: "Лис-навигатор", emoji: "🦊", icon: "compass-rose" as IllustrationName },
  owlMentor: { name: "Сова-наставник", emoji: "🦉", icon: "owl" as IllustrationName },
  wolfStrategist: { name: "Волк-стратег", emoji: "🐺", icon: "chess-queen" as IllustrationName },
  swanEmpath: { name: "Лебедь-эмпат", emoji: "🦢", icon: "heart-outline" as IllustrationName },
  lynxAnalyst: { name: "Рысь-аналитик", emoji: "🐾", icon: "chart-line" as IllustrationName },
};

const uiEmojiLibrary = {
  success: "✨",
  challenge: "🎯",
  dialog: "💬",
  growth: "🌱",
  streak: "🔥",
  strategy: "🧠",
  course: "📘",
};

const courseIllustrationById: Record<CourseId, IllustrationName> = {
  "office-icebreaker": "ferry",
  "boundary-keeper": "shield-outline",
  "serpentine-diplomat": "snake",
  "heart-lines": "heart-multiple",
  "mirror-of-truth": "mirror",
};

const imageRules = [
  "Навигация и действия: только Feather иконки.",
  "Сюжет квестов и артефактов: только emoji.",
  "Карточки и состояния: только MaterialCommunityIcons.",
  "Крупные иллюстрации шагов курса «Ледокол переговоров»: только крупные emoji по смыслу сцены.",
  "Заголовки и ключевые карточки: крупные иконки + персонаж (Duolingo-паттерн).",
  "Один экран = один персонаж-гид, чтобы не перегружать внимание.",
  "Если изображения нет: всегда показываем единый fallback.",
];

const imageSizes = {
  tabIcon: 18,
  inlineIcon: 16,
  chipIcon: 14,
  cardLeadingIcon: 24,
  cardIllustration: 88,
  heroIcon: 46,
  profileAvatar: 72,
  fallback: 96,
};

const visualSlots: VisualSlot[] = [
  {
    id: "slot-header",
    zone: "Хедер: бренд и мета",
    size: `${imageSizes.inlineIcon}x${imageSizes.inlineIcon}`,
    source: "Feather",
    content: "Луна бренда, streak и XP",
  },
  {
    id: "slot-tabs",
    zone: "Нижняя навигация",
    size: `${imageSizes.tabIcon}x${imageSizes.tabIcon}`,
    source: "Feather",
    content: "Иконки вкладок Карта/Квест/Ивент/AI/Профиль",
  },
  {
    id: "slot-chips",
    zone: "Чипы квестов",
    size: `${imageSizes.chipIcon}x${imageSizes.chipIcon}`,
    source: "Emoji",
    content: "Эмоциональные маркеры типа квеста",
  },
  {
    id: "slot-card-leading",
    zone: "Заголовки карточек",
    size: `${imageSizes.cardLeadingIcon}x${imageSizes.cardLeadingIcon}`,
    source: "Feather",
    content: "Служебный смысл блока (навигация, прогресс, AI)",
  },
  {
    id: "slot-card-illu",
    zone: "Мини-иллюстрация карточки",
    size: `${imageSizes.cardIllustration}x${imageSizes.cardIllustration}`,
    source: "MaterialCommunityIcons",
    content: "Сюжетный символ экрана/состояния",
  },
  {
    id: "slot-avatar",
    zone: "Профиль: аватар",
    size: `${imageSizes.profileAvatar}x${imageSizes.profileAvatar}`,
    source: "Fallback",
    content: "Заглушка до появления персонального портрета",
  },
  {
    id: "slot-empty",
    zone: "Пустые состояния",
    size: `${imageSizes.fallback}x${imageSizes.fallback}`,
    source: "Fallback",
    content: "Единая заглушка для недостающих изображений",
  },
];

function ImageFallback({
  label,
  size = imageSizes.fallback,
}: {
  label: string;
  size?: number;
}) {
  return (
    <View style={[styles.fallbackWrap, { width: size, height: size }]}>
      <MaterialCommunityIcons name="image-off-outline" size={Math.round(size * 0.42)} color={colors.textSecondary} />
      <Text style={styles.fallbackLabel}>{label}</Text>
    </View>
  );
}

function CardIllustration({ name }: { name?: IllustrationName }) {
  if (!name) {
    return <ImageFallback label="Скоро" size={imageSizes.cardIllustration} />;
  }

  return (
    <View style={styles.cardIllustrationWrap}>
      <MaterialCommunityIcons name={name} size={52} color={colors.textPrimary} />
    </View>
  );
}

function AppCard({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

function AppButton({
  label,
  onPress,
  variant = "primary",
  pulse = false,
  style,
  textStyle,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary";
  pulse?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}) {
  const isPrimary = variant === "primary";
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!pulse) {
      scaleAnim.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 1.02,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, scaleAnim]);

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <Pressable
        style={({ pressed }) => [
          styles.buttonBase,
          isPrimary ? styles.buttonPrimary : styles.buttonSecondary,
          pressed && styles.buttonPressed,
          style,
        ]}
        onPress={onPress}
      >
        <Text style={[isPrimary ? styles.buttonPrimaryText : styles.buttonSecondaryText, textStyle]}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

function ScreenHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.headingWrap}>
      <Text style={styles.title}>{title}</Text>
      {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
    </View>
  );
}

function SpeechBubble({ text }: { text: string }) {
  return (
    <View style={styles.speechBubbleWrap}>
      <View style={styles.speechBubbleHeader}>
        <Text style={styles.speechSpeakerEmoji}>🗨️</Text>
        <Text style={styles.speechSpeakerName}>Персонаж</Text>
      </View>
      <View style={styles.speechBubble}>
        <Text style={styles.speechBubbleText}>{text}</Text>
      </View>
      <View style={styles.speechBubbleTail} />
    </View>
  );
}

function HeroBanner({
  character,
  accentEmoji,
  title,
}: {
  character: (typeof characterLibrary)[keyof typeof characterLibrary];
  accentEmoji: string;
  title: string;
}) {
  const bobAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bobAnim, {
          toValue: -3,
          duration: 1400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(bobAnim, {
          toValue: 0,
          duration: 1400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [bobAnim]);

  return (
    <View style={styles.heroBanner}>
      <Animated.View style={[styles.heroIconWrap, { transform: [{ translateY: bobAnim }] }]}>
        <MaterialCommunityIcons name={character.icon} size={imageSizes.heroIcon} color={colors.textPrimary} />
      </Animated.View>
      <View style={styles.heroTextWrap}>
        <Text style={styles.heroTitle}>
          {character.emoji} {character.name}
        </Text>
        <Text style={styles.heroSubtitle}>
          {accentEmoji} {title}
        </Text>
      </View>
    </View>
  );
}

function ScrollHint() {
  const hintAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(hintAnim, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(hintAnim, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [hintAnim]);

  const translateY = hintAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 5] });
  return (
    <Animated.View style={[styles.scrollHintWrap, { transform: [{ translateY }] }]}>
      <Feather name="chevrons-down" size={16} color={colors.textSecondary} />
      <Text style={styles.scrollHintText}>Листай ниже</Text>
    </Animated.View>
  );
}

function DifficultySelector({
  selectedDifficulty,
  onSelect,
  showMultiplier = false,
  allowedDifficulties,
}: {
  selectedDifficulty: QuestDifficulty;
  onSelect: (difficulty: QuestDifficulty) => void;
  showMultiplier?: boolean;
  allowedDifficulties: QuestDifficulty[];
}) {
  const visibleDifficulties = difficultyConfigs.filter((difficulty) => allowedDifficulties.includes(difficulty.questions));

  return (
    <View style={styles.rowWrap}>
      {visibleDifficulties.map((difficulty) => (
        <Pressable
          key={`difficulty-${difficulty.questions}-${showMultiplier ? "m" : "n"}`}
          style={[styles.difficultyChip, selectedDifficulty === difficulty.questions && styles.difficultyChipActive]}
          onPress={() => onSelect(difficulty.questions)}
        >
          <View style={[styles.difficultyDot, { backgroundColor: difficulty.color }]} />
          <Text style={styles.chipText}>
            {difficulty.questions} • {difficulty.label}
            {showMultiplier ? ` • x${difficulty.rewardMultiplier}` : ""}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isConflictStyleId(value: unknown): value is ConflictStyleId {
  return typeof value === "string" && conflictStyles.some((style) => style.id === value);
}

function sanitizeConflictStyle(value: unknown): ConflictStyleId {
  return isConflictStyleId(value) ? value : "avoiding";
}

function sanitizeSecondaryConflictStyles(value: unknown, primary: ConflictStyleId): ConflictStyleId[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const unique = value
    .filter((item): item is ConflictStyleId => isConflictStyleId(item))
    .filter((item, index, arr) => arr.indexOf(item) === index)
    .filter((item) => item !== primary);

  return unique.slice(0, 2);
}

function sanitizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string").slice(0, 300);
}

function buildDefaultProfile(): UserProfile {
  return {
    xp: 124,
    completedCount: 0,
    lastFeedback: "Твоя рефлексия сегодня запустит рост Кристалла Эмпатии.",
    selectedQuestId: dailyQuests[0].id,
    eventJoined: false,
    selectedDifficulty: 5,
    selectedStory: "forest",
    activeTab: "map",
    conflictPrimaryStyle: "avoiding",
    conflictSecondaryStyles: ["accommodating"],
    diagnosticCompleted: false,
    selectedCourseId: "boundary-keeper",
    activeProgramMode: "story",
    unlockedEndings: [],
    unlockedAchievements: [],
  };
}

export default function App() {
  const defaultProfile = useMemo(() => buildDefaultProfile(), []);
  const [authReady, setAuthReady] = useState(false);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authConfirmPassword, setAuthConfirmPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authInfo, setAuthInfo] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isProfileHydrated, setIsProfileHydrated] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("map");
  const [streak] = useState(5);
  const [xp, setXp] = useState(defaultProfile.xp);
  const [completedCount, setCompletedCount] = useState(defaultProfile.completedCount);
  const [answer, setAnswer] = useState("");
  const [lastFeedback, setLastFeedback] = useState(defaultProfile.lastFeedback);
  const [selectedQuestId, setSelectedQuestId] = useState(defaultProfile.selectedQuestId);
  const [eventJoined, setEventJoined] = useState(defaultProfile.eventJoined);
  const [forestStepIndex, setForestStepIndex] = useState(0);
  const [forestStarted, setForestStarted] = useState(false);
  const [forestFinished, setForestFinished] = useState(false);
  const [selectedSingle, setSelectedSingle] = useState<number | null>(null);
  const [selectedMultiple, setSelectedMultiple] = useState<number[]>([]);
  const [selectedBuilderIndices, setSelectedBuilderIndices] = useState<number[]>([]);
  const [stepErrorCount, setStepErrorCount] = useState(0);
  const [totalErrors, setTotalErrors] = useState(0);
  const [penaltyCount, setPenaltyCount] = useState(0);
  const [forestXpEarned, setForestXpEarned] = useState(0);
  const [firstTrySuccess, setFirstTrySuccess] = useState(0);
  const [stepMessage, setStepMessage] = useState("Выбери действие и нажми «Проверить шаг».");
  const [showHint, setShowHint] = useState(false);
  const [selectedDifficulty, setSelectedDifficulty] = useState<QuestDifficulty>(defaultProfile.selectedDifficulty);
  const [selectedStory, setSelectedStory] = useState<QuestStory>(defaultProfile.selectedStory);
  const [activeProgramMode, setActiveProgramMode] = useState<ProgramMode>(defaultProfile.activeProgramMode);
  const [conflictPrimaryStyle, setConflictPrimaryStyle] = useState<ConflictStyleId>(defaultProfile.conflictPrimaryStyle);
  const [conflictSecondaryStyles, setConflictSecondaryStyles] = useState<ConflictStyleId[]>(defaultProfile.conflictSecondaryStyles);
  const [diagnosticCompleted, setDiagnosticCompleted] = useState(defaultProfile.diagnosticCompleted);
  const [selectedCourseId, setSelectedCourseId] = useState<CourseId>(defaultProfile.selectedCourseId);
  const [unlockedEndings, setUnlockedEndings] = useState<string[]>(defaultProfile.unlockedEndings);
  const [unlockedAchievements, setUnlockedAchievements] = useState<string[]>(defaultProfile.unlockedAchievements);
  const [diagnosticIndex, setDiagnosticIndex] = useState(0);
  const [diagnosticAnswers, setDiagnosticAnswers] = useState<number[]>([]);
  const [diagnosticError, setDiagnosticError] = useState("");
  const [showDiagnosticResult, setShowDiagnosticResult] = useState(false);
  const [lastStepPraise, setLastStepPraise] = useState("");
  const [successPulseTick, setSuccessPulseTick] = useState(0);
  const [shuffledTokenBank, setShuffledTokenBank] = useState<string[]>([]);
  const [branchScore, setBranchScore] = useState<Record<BranchId, number>>({
    strategist: 0,
    empath: 0,
    boundary: 0,
    challenger: 0,
    architect: 0,
  });
  const [analyticsSnapshot, setAnalyticsSnapshot] = useState<Record<string, UserAnalytics>>({});
  const successAnim = useRef(new Animated.Value(0)).current;
  const sessionStartedAtRef = useRef<number | null>(null);
  const activeTabRef = useRef<Tab>("map");

  const selectedQuest = useMemo(
    () => dailyQuests.find((quest) => quest.id === selectedQuestId) ?? dailyQuests[0],
    [selectedQuestId]
  );
  const activeStoryConfig = storyConfigs.find((story) => story.id === selectedStory) ?? storyConfigs[0];
  const activeCourse = courses.find((course) => course.id === selectedCourseId) ?? courses[0];
  const activeCampaignId: CampaignId = activeProgramMode === "course" ? activeCourse.id : selectedStory;
  const allowedStoryDifficulties =
    activeProgramMode === "story"
      ? activeStoryConfig.difficulties
      : ([5, 10, 15, 25] as QuestDifficulty[]);
  const activeDifficultyConfig = difficultyConfigs.find((item) => item.questions === selectedDifficulty) ?? difficultyConfigs[0];
  const currentForestQuestSteps = useMemo(
    () =>
      activeProgramMode === "course"
        ? buildCourseQuestByDifficulty(selectedDifficulty, activeCourse.id)
        : buildForestQuestByDifficulty(selectedDifficulty, selectedStory),
    [activeProgramMode, selectedDifficulty, activeCourse.id, selectedStory]
  );
  const normalizedQuestSteps = useMemo(() => applyBuilderComplexityProgression(currentForestQuestSteps), [currentForestQuestSteps]);
  const questForecast = useMemo(
    () => calculateQuestForecast(normalizedQuestSteps, activeDifficultyConfig, 0.8),
    [activeDifficultyConfig, normalizedQuestSteps]
  );
  const activeForestStep = normalizedQuestSteps[forestStepIndex];
  const dominantBranch: BranchId = (Object.entries(branchScore).sort((a, b) => b[1] - a[1])[0]?.[0] ??
    "strategist") as BranchId;
  const dominantEndingRoute: EndingRouteId = endingRouteByBranch[dominantBranch];
  const visibleStepScene =
    activeForestStep?.sceneByBranch
      ? activeForestStep.sceneByBranch[dominantBranch]
      : activeForestStep?.scene;
  const builderTokens = useMemo(
    () => selectedBuilderIndices.map((idx) => shuffledTokenBank[idx]).filter((token): token is string => Boolean(token)),
    [selectedBuilderIndices, shuffledTokenBank]
  );

  const withUserAnalytics = (user: AuthUser, nowIso: string) => {
    if (user.analytics) {
      return user.analytics;
    }
    return buildDefaultAnalytics(nowIso);
  };

  const refreshAnalyticsSnapshot = async () => {
    const raw = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) {
      setAnalyticsSnapshot({});
      return;
    }
    const parsed = JSON.parse(raw) as AuthStore;
    const next: Record<string, UserAnalytics> = {};
    Object.values(parsed.users).forEach((user) => {
      if (user.analytics) {
        next[user.email] = user.analytics;
      }
    });
    setAnalyticsSnapshot(next);
  };

  const trackAnalyticsEvent = async (
    type: AnalyticsEventType,
    payload: Omit<AnalyticsEvent, "id" | "at" | "type"> = {},
    emailOverride?: string
  ) => {
    const targetEmail = emailOverride ?? currentUserEmail;
    if (!targetEmail) {
      return;
    }

    const raw = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
    const store: AuthStore = raw
      ? (JSON.parse(raw) as AuthStore)
      : {
          users: {},
          currentEmail: null,
        };
    const user = store.users[targetEmail];
    if (!user) {
      return;
    }

    const nowIso = new Date().toISOString();
    const analytics = withUserAnalytics(user, nowIso);
    analytics.lastSeenAt = nowIso;
    analytics.events = [
      ...analytics.events.slice(-(ANALYTICS_EVENTS_LIMIT - 1)),
      {
        id: makeEventId(),
        at: nowIso,
        type,
        ...payload,
      },
    ];

    if (type === "course_start") analytics.counters.courseStarts += 1;
    if (type === "course_complete") analytics.counters.courseCompletions += 1;
    if (type === "quest_start") analytics.counters.questStarts += 1;
    if (type === "quest_complete") analytics.counters.questCompletions += 1;
    if (type === "step_fail") analytics.counters.stepFails += 1;
    if (type === "penalty_applied") analytics.counters.penalties += 1;
    if (type === "drop_off") analytics.counters.dropOffs += 1;
    if (type === "session_end") {
      analytics.totalSessions += 1;
      const matched = payload.details?.match(/duration_sec:(\d+)/);
      if (matched) {
        analytics.totalTimeSec += Number(matched[1] ?? 0);
      }
    }

    user.analytics = analytics;
    store.users[targetEmail] = user;
    await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(store));
    setAnalyticsSnapshot((prev) => ({ ...prev, [targetEmail]: analytics }));
  };

  const trackDiagnosticAnswer = async (questionId: string, optionIndex: number, style: ConflictStyleId) => {
    if (!currentUserEmail) {
      return;
    }
    const raw = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) {
      return;
    }
    const store = JSON.parse(raw) as AuthStore;
    const user = store.users[currentUserEmail];
    if (!user) {
      return;
    }
    const analytics = withUserAnalytics(user, new Date().toISOString());
    analytics.diagnosticAnswers = [
      ...analytics.diagnosticAnswers.slice(-99),
      { questionId, optionIndex, style, at: new Date().toISOString() },
    ];
    user.analytics = analytics;
    store.users[currentUserEmail] = user;
    await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(store));
    setAnalyticsSnapshot((prev) => ({ ...prev, [currentUserEmail]: analytics }));
  };

  useEffect(() => {
    if (activeForestStep?.type === "builder") {
      setShuffledTokenBank(shuffleWords(activeForestStep.tokenBank ?? []));
      setSelectedBuilderIndices([]);
      return;
    }
    setShuffledTokenBank([]);
    setSelectedBuilderIndices([]);
  }, [activeForestStep]);

  useEffect(() => {
    if (!allowedStoryDifficulties.includes(selectedDifficulty)) {
      setSelectedDifficulty(allowedStoryDifficulties[0]);
    }
  }, [allowedStoryDifficulties, selectedDifficulty]);

  useEffect(() => {
    if (diagnosticIndex >= diagnosticQuestions.length) {
      setDiagnosticIndex(0);
    }
  }, [diagnosticIndex]);

  useEffect(() => {
    if (!currentUserEmail || !isProfileHydrated) {
      return;
    }
    if (!sessionStartedAtRef.current) {
      sessionStartedAtRef.current = Date.now();
      trackAnalyticsEvent("session_start", { details: "auto_resume" }).catch(() => undefined);
    }

    return () => {
      if (!sessionStartedAtRef.current) {
        return;
      }
      const durationSec = Math.max(1, Math.round((Date.now() - sessionStartedAtRef.current) / 1000));
      trackAnalyticsEvent("session_end", { details: `duration_sec:${durationSec}` }, currentUserEmail).catch(() => undefined);
    };
  }, [currentUserEmail, isProfileHydrated]);

  useEffect(() => {
    if (!currentUserEmail || !isProfileHydrated) {
      return;
    }
    if (activeTabRef.current !== activeTab) {
      activeTabRef.current = activeTab;
      trackAnalyticsEvent("tab_view", { tab: activeTab }).catch(() => undefined);
    }
  }, [activeTab, currentUserEmail, isProfileHydrated]);

  useEffect(() => {
    if (!successPulseTick) {
      return;
    }
    Animated.sequence([
      Animated.timing(successAnim, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(successAnim, {
        toValue: 0,
        duration: 360,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }, [successAnim, successPulseTick]);

  useEffect(() => {
    const bootstrapAuth = async () => {
      try {
        const raw = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
        if (!raw) {
          setAuthReady(true);
          return;
        }

        const parsed = JSON.parse(raw) as AuthStore;
        if (!parsed.currentEmail) {
          setAuthReady(true);
          return;
        }

        const user = parsed.users[parsed.currentEmail];
        if (!user) {
          setAuthReady(true);
          return;
        }

        setCurrentUserEmail(user.email);
        setXp(user.profile.xp);
        setCompletedCount(user.profile.completedCount);
        setLastFeedback(user.profile.lastFeedback);
        setSelectedQuestId(user.profile.selectedQuestId);
        setEventJoined(user.profile.eventJoined);
        setSelectedDifficulty(user.profile.selectedDifficulty);
        setSelectedStory(user.profile.selectedStory);
        setActiveTab(user.profile.activeTab);
        const safePrimaryStyle = sanitizeConflictStyle(user.profile.conflictPrimaryStyle);
        setConflictPrimaryStyle(safePrimaryStyle);
        setConflictSecondaryStyles(sanitizeSecondaryConflictStyles(user.profile.conflictSecondaryStyles, safePrimaryStyle));
        setDiagnosticCompleted(Boolean(user.profile.diagnosticCompleted));
        setSelectedCourseId(user.profile.selectedCourseId ?? recommendedCourseByConflictStyle[safePrimaryStyle]);
        setActiveProgramMode(user.profile.activeProgramMode ?? "story");
        setUnlockedEndings(sanitizeStringArray(user.profile.unlockedEndings));
        setUnlockedAchievements(sanitizeStringArray(user.profile.unlockedAchievements));
        setShowDiagnosticResult(false);
        setIsProfileHydrated(true);
        sessionStartedAtRef.current = Date.now();
        await trackAnalyticsEvent("auth_login", { details: "auto_restore" }, user.email);
        await trackAnalyticsEvent("session_start", { details: "auto_restore" }, user.email);
      } catch {
        setAuthError("Не удалось прочитать данные профиля.");
      } finally {
        await refreshAnalyticsSnapshot();
        setAuthReady(true);
      }
    };

    bootstrapAuth();
  }, []);

  useEffect(() => {
    const persistProfile = async () => {
      if (!currentUserEmail || !isProfileHydrated) {
        return;
      }

      setIsSavingProfile(true);
      try {
        const raw = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
        const store: AuthStore = raw
          ? (JSON.parse(raw) as AuthStore)
          : {
              users: {},
              currentEmail: null,
            };
        const user = store.users[currentUserEmail];
        if (!user) {
          return;
        }

        user.profile = {
          xp,
          completedCount,
          lastFeedback,
          selectedQuestId,
          eventJoined,
          selectedDifficulty,
          selectedStory,
          activeProgramMode,
          activeTab,
          conflictPrimaryStyle,
          conflictSecondaryStyles,
          diagnosticCompleted,
          selectedCourseId,
          unlockedEndings,
          unlockedAchievements,
        };
        store.currentEmail = currentUserEmail;
        await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(store));
      } finally {
        setIsSavingProfile(false);
      }
    };

    persistProfile();
  }, [
    activeTab,
    completedCount,
    conflictPrimaryStyle,
    conflictSecondaryStyles,
    currentUserEmail,
    eventJoined,
    isProfileHydrated,
    lastFeedback,
    selectedDifficulty,
    selectedQuestId,
    selectedStory,
    activeProgramMode,
    diagnosticCompleted,
    selectedCourseId,
    unlockedEndings,
    unlockedAchievements,
    xp,
  ]);

  const completeQuest = () => {
    if (!answer.trim()) {
      setLastFeedback("Напиши хотя бы 1-2 предложения, чтобы ИИ дал глубокую обратную связь.");
      setActiveTab("feedback");
      return;
    }

    setCompletedCount((prev) => prev + 1);
    setXp((prev) => prev + selectedQuest.reward);
    setLastFeedback(
      `Хороший ход. Ты добавила осознанность в ${selectedQuest.biome}. ${followUpHints[(completedCount + 1) % followUpHints.length]}`
    );
    setAnswer("");
    setActiveTab("feedback");
  };

  const resetStepUi = () => {
    setSelectedSingle(null);
    setSelectedMultiple([]);
    setSelectedBuilderIndices([]);
    setStepErrorCount(0);
    setShowHint(false);
  };

  const startForestQuest = () => {
    setForestStarted(true);
    setForestFinished(false);
    setForestStepIndex(0);
    setStepMessage("");
    setTotalErrors(0);
    setPenaltyCount(0);
    setForestXpEarned(0);
    setFirstTrySuccess(0);
    setLastStepPraise("");
    setBranchScore({ strategist: 0, empath: 0, boundary: 0, challenger: 0, architect: 0 });
    resetStepUi();
    setActiveTab("quest");
    trackAnalyticsEvent(activeProgramMode === "course" ? "course_start" : "quest_start", {
      courseId: activeProgramMode === "course" ? activeCourse.id : undefined,
      storyId: activeProgramMode === "story" ? selectedStory : undefined,
      difficulty: selectedDifficulty,
      details: "manual_start",
    }).catch(() => undefined);
  };

  const activateCourse = (course: CourseConfig) => {
    setActiveProgramMode("course");
    setSelectedCourseId(course.id);
    setSelectedDifficulty(course.preferredQuestions);
  };

  const startCourseQuest = (course: CourseConfig) => {
    activateCourse(course);
    setForestStarted(true);
    setForestFinished(false);
    setForestStepIndex(0);
    setStepMessage("");
    setTotalErrors(0);
    setPenaltyCount(0);
    setForestXpEarned(0);
    setFirstTrySuccess(0);
    setLastStepPraise("");
    setBranchScore({ strategist: 0, empath: 0, boundary: 0, challenger: 0, architect: 0 });
    resetStepUi();
    setActiveTab("quest");
    trackAnalyticsEvent("course_start", {
      courseId: course.id,
      difficulty: course.preferredQuestions,
      details: "start_from_card",
    }).catch(() => undefined);
  };

  const finishForestQuest = () => {
    setForestFinished(true);
    setCompletedCount((prev) => prev + 1);
    const litRpgEnding = endingNarrativeByRoute(activeCampaignId)[dominantEndingRoute];
    const endingId = buildEndingId(activeCampaignId, dominantEndingRoute);
    const achievementId = buildAchievementId(activeCampaignId, dominantEndingRoute);
    setUnlockedEndings((prev) => (prev.includes(endingId) ? prev : [...prev, endingId]));
    setUnlockedAchievements((prev) => (prev.includes(achievementId) ? prev : [...prev, achievementId]));
    setLastFeedback(
      `${activeProgramMode === "course" ? `Курс «${activeCourse.title}»` : `Квест «${activeStoryConfig.label}»`} завершен (${selectedDifficulty} вопросов). Ошибок: ${totalErrors}, штрафов: ${penaltyCount}. ${litRpgEnding}`
    );
    trackAnalyticsEvent(activeProgramMode === "course" ? "course_complete" : "quest_complete", {
      courseId: activeProgramMode === "course" ? activeCourse.id : undefined,
      storyId: activeProgramMode === "story" ? selectedStory : undefined,
      difficulty: selectedDifficulty,
      details: `errors:${totalErrors};penalties:${penaltyCount};ending:${endingId}`,
    }).catch(() => undefined);
    trackAnalyticsEvent("ending_unlock", { details: `${endingId};${achievementId}` }).catch(() => undefined);
  };

  const applyError = () => {
    const nextErrorCount = stepErrorCount + 1;
    setStepErrorCount(nextErrorCount);
    setTotalErrors((prev) => prev + 1);
    trackAnalyticsEvent("step_fail", {
      courseId: activeProgramMode === "course" ? activeCourse.id : undefined,
      storyId: activeProgramMode === "story" ? selectedStory : undefined,
      difficulty: selectedDifficulty,
      stepIndex: forestStepIndex,
    }).catch(() => undefined);

    if (nextErrorCount >= 2) {
      const penalty = activeDifficultyConfig.penalty;
      setPenaltyCount((prev) => prev + 1);
      setXp((prev) => Math.max(0, prev - penalty));
      setForestXpEarned((prev) => prev - penalty);
      trackAnalyticsEvent("penalty_applied", {
        details: `-${penalty}xp`,
        courseId: activeProgramMode === "course" ? activeCourse.id : undefined,
        storyId: activeProgramMode === "story" ? selectedStory : undefined,
      }).catch(() => undefined);
      setStepMessage(
        `Ошибка ${nextErrorCount}/2. Со 2-й ошибки штраф: -${penalty} XP. Попробуй снова.`
      );
      return;
    }

    setStepMessage("Ошибка 1/2. Первая ошибка прощена, штрафа нет. Попробуй ещё раз.");
  };

  const passStep = () => {
    const reward = Math.round(activeForestStep.reward * activeDifficultyConfig.rewardMultiplier);
    setSuccessPulseTick((prev) => prev + 1);
    trackAnalyticsEvent("step_pass", {
      courseId: activeProgramMode === "course" ? activeCourse.id : undefined,
      storyId: activeProgramMode === "story" ? selectedStory : undefined,
      difficulty: selectedDifficulty,
      stepIndex: forestStepIndex,
    }).catch(() => undefined);
    setXp((prev) => prev + reward);
    setForestXpEarned((prev) => prev + reward);

    if (stepErrorCount === 0) {
      setFirstTrySuccess((prev) => prev + 1);
    }

    const isLastStep = forestStepIndex === currentForestQuestSteps.length - 1;
    if (isLastStep) {
      setStepMessage(`Квест завершен! За шаг: +${reward} XP.`);
      setLastStepPraise(`Классный ход! За предыдущее задание: +${reward} XP.`);
      finishForestQuest();
      return;
    }

    setLastStepPraise(`Классный ход! За предыдущее задание: +${reward} XP.`);
    setStepMessage(`Верно! За шаг: +${reward} XP. Переходим дальше.`);
    setForestStepIndex((prev) => prev + 1);
    resetStepUi();
  };

  const evaluateForestStep = () => {
    if (!activeForestStep) {
      return;
    }

    if (activeForestStep.type === "single") {
      if (selectedSingle === null) {
        setStepMessage("Выбери один вариант, чтобы проверить шаг.");
        return;
      }

      if (activeForestStep.branchEffects?.[selectedSingle]) {
        const branch = activeForestStep.branchEffects[selectedSingle];
        setBranchScore((prev) => ({ ...prev, [branch]: prev[branch] + 1 }));
        trackAnalyticsEvent("branch_shift", {
          details: `${activeCampaignId}:${branch}`,
          stepIndex: forestStepIndex,
        }).catch(() => undefined);
      }

      if (activeForestStep.acceptAny) {
        passStep();
        return;
      }

      if (selectedSingle === activeForestStep.correctSingle) {
        passStep();
        return;
      }

      applyError();
      return;
    }

    if (activeForestStep.type === "multiple") {
      if (activeForestStep.acceptAny) {
        if (!selectedMultiple.length) {
          setStepMessage("Выбери хотя бы один вариант.");
          return;
        }
        passStep();
        return;
      }

      const neededCount = activeForestStep.correctMultiple?.length ?? 0;
      if (selectedMultiple.length !== neededCount) {
        setStepMessage(`Нужно выбрать ровно ${neededCount} варианта.`);
        return;
      }

      const correct = [...(activeForestStep.correctMultiple ?? [])].sort((a, b) => a - b);
      const selected = [...selectedMultiple].sort((a, b) => a - b);
      const isCorrect = correct.every((value, index) => value === selected[index]);

      if (isCorrect) {
        passStep();
        return;
      }

      applyError();
      return;
    }

    if (activeForestStep.type === "builder") {
      const target = activeForestStep.targetBuilder ?? [];
      if (!builderTokens.length) {
        setStepMessage("Собери фразу из слов, затем проверь шаг.");
        return;
      }

      const isCorrectLength = builderTokens.length === target.length;
      const isCorrectTokens = isCorrectLength && builderTokens.every((token, idx) => token === target[idx]);

      if (isCorrectTokens) {
        passStep();
        return;
      }

      applyError();
    }
  };

  const handleStorySelect = (storyId: QuestStory) => {
    setActiveProgramMode("story");
    setSelectedStory(storyId);
    if (forestStarted && !forestFinished) {
      trackAnalyticsEvent("drop_off", {
        storyId: selectedStory,
        difficulty: selectedDifficulty,
        details: "switch_story_during_run",
      }).catch(() => undefined);
      setForestStarted(false);
      setForestStepIndex(0);
      setForestFinished(false);
      resetStepUi();
      setStepMessage("Сюжет переключен. Нажми «Запустить квест», чтобы начать заново.");
    }
  };

  const handleAuthSubmit = async () => {
    const email = normalizeEmail(authEmail);
    if (!email || !email.includes("@")) {
      setAuthError("Введите корректный email.");
      return;
    }
    if (authPassword.length < 6) {
      setAuthError("Пароль должен быть не короче 6 символов.");
      return;
    }

    try {
      const raw = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
      const store: AuthStore = raw
        ? (JSON.parse(raw) as AuthStore)
        : {
            users: {},
            currentEmail: null,
          };

      if (authMode === "register") {
        if (authPassword !== authConfirmPassword) {
          setAuthError("Пароли не совпадают.");
          return;
        }
        if (store.users[email]) {
          setAuthError("Такой email уже зарегистрирован.");
          return;
        }

        const nowIso = new Date().toISOString();
        store.users[email] = {
          email,
          password: authPassword,
          profile: buildDefaultProfile(),
          analytics: buildDefaultAnalytics(nowIso),
        };
        setAuthInfo("Аккаунт создан. Вход выполнен автоматически.");
      }

      const existingUser = store.users[email];
      if (!existingUser) {
        setAuthError("Пользователь не найден. Зарегистрируйся.");
        return;
      }
      if (existingUser.password !== authPassword) {
        setAuthError("Неверный пароль.");
        return;
      }

      store.currentEmail = email;
      existingUser.analytics = withUserAnalytics(existingUser, new Date().toISOString());
      await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(store));

      setCurrentUserEmail(email);
      setXp(existingUser.profile.xp);
      setCompletedCount(existingUser.profile.completedCount);
      setLastFeedback(existingUser.profile.lastFeedback);
      setSelectedQuestId(existingUser.profile.selectedQuestId);
      setEventJoined(existingUser.profile.eventJoined);
      setSelectedDifficulty(existingUser.profile.selectedDifficulty);
      setSelectedStory(existingUser.profile.selectedStory);
      setActiveProgramMode(existingUser.profile.activeProgramMode ?? "story");
      setActiveTab(existingUser.profile.activeTab);
      const safePrimaryStyle = sanitizeConflictStyle(existingUser.profile.conflictPrimaryStyle);
      setConflictPrimaryStyle(safePrimaryStyle);
      setConflictSecondaryStyles(sanitizeSecondaryConflictStyles(existingUser.profile.conflictSecondaryStyles, safePrimaryStyle));
      setDiagnosticCompleted(Boolean(existingUser.profile.diagnosticCompleted));
      setSelectedCourseId(existingUser.profile.selectedCourseId ?? recommendedCourseByConflictStyle[safePrimaryStyle]);
      setUnlockedEndings(sanitizeStringArray(existingUser.profile.unlockedEndings));
      setUnlockedAchievements(sanitizeStringArray(existingUser.profile.unlockedAchievements));
      setShowDiagnosticResult(false);
      setIsProfileHydrated(true);
      setAuthError("");
      if (authMode === "login") {
        setAuthInfo("");
      }
      setAuthEmail("");
      setAuthPassword("");
      setAuthConfirmPassword("");
      sessionStartedAtRef.current = Date.now();
      await trackAnalyticsEvent(authMode === "register" ? "auth_register" : "auth_login", {
        details: authMode === "register" ? "full_form" : "password_login",
      }, email);
      await trackAnalyticsEvent("session_start", { details: authMode }, email);
      await refreshAnalyticsSnapshot();
    } catch {
      setAuthError("Не удалось выполнить вход. Попробуй ещё раз.");
    }
  };

  const handleQuickRegister = async () => {
    const email = normalizeEmail(authEmail);
    if (!email || !email.includes("@")) {
      setAuthError("Введите корректный email для регистрации.");
      return;
    }
    if (authPassword.length < 6) {
      setAuthError("Пароль должен быть не короче 6 символов.");
      return;
    }

    try {
      const raw = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
      const store: AuthStore = raw
        ? (JSON.parse(raw) as AuthStore)
        : {
            users: {},
            currentEmail: null,
          };

      if (store.users[email]) {
        setAuthError("Этот email уже есть. Нажми «Войти».");
        return;
      }

      const nowIso = new Date().toISOString();
      store.users[email] = {
        email,
        password: authPassword,
        profile: buildDefaultProfile(),
        analytics: buildDefaultAnalytics(nowIso),
      };
      store.currentEmail = email;
      await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(store));

      const user = store.users[email];
      setCurrentUserEmail(email);
      setXp(user.profile.xp);
      setCompletedCount(user.profile.completedCount);
      setLastFeedback(user.profile.lastFeedback);
      setSelectedQuestId(user.profile.selectedQuestId);
      setEventJoined(user.profile.eventJoined);
      setSelectedDifficulty(user.profile.selectedDifficulty);
      setSelectedStory(user.profile.selectedStory);
      setActiveProgramMode(user.profile.activeProgramMode ?? "story");
      setActiveTab(user.profile.activeTab);
      const safePrimaryStyle = sanitizeConflictStyle(user.profile.conflictPrimaryStyle);
      setConflictPrimaryStyle(safePrimaryStyle);
      setConflictSecondaryStyles(sanitizeSecondaryConflictStyles(user.profile.conflictSecondaryStyles, safePrimaryStyle));
      setDiagnosticCompleted(Boolean(user.profile.diagnosticCompleted));
      setSelectedCourseId(user.profile.selectedCourseId ?? recommendedCourseByConflictStyle[safePrimaryStyle]);
      setUnlockedEndings(sanitizeStringArray(user.profile.unlockedEndings));
      setUnlockedAchievements(sanitizeStringArray(user.profile.unlockedAchievements));
      setShowDiagnosticResult(false);
      setIsProfileHydrated(true);
      setAuthError("");
      setAuthInfo("Аккаунт создан и активирован.");
      setAuthEmail("");
      setAuthPassword("");
      setAuthConfirmPassword("");
      sessionStartedAtRef.current = Date.now();
      await trackAnalyticsEvent("auth_register", { details: "quick_register" }, email);
      await trackAnalyticsEvent("session_start", { details: "quick_register" }, email);
      await refreshAnalyticsSnapshot();
    } catch {
      setAuthError("Не удалось зарегистрировать аккаунт. Попробуй еще раз.");
    }
  };

  const handleLogout = async () => {
    try {
      if (currentUserEmail) {
        const durationSec = sessionStartedAtRef.current ? Math.max(1, Math.round((Date.now() - sessionStartedAtRef.current) / 1000)) : 0;
        await trackAnalyticsEvent("session_end", { details: `duration_sec:${durationSec}` }, currentUserEmail);
      }
      const raw = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
      if (raw) {
        const store = JSON.parse(raw) as AuthStore;
        store.currentEmail = null;
        await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(store));
      }
    } finally {
      sessionStartedAtRef.current = null;
      setCurrentUserEmail(null);
      setIsProfileHydrated(false);
      const profile = buildDefaultProfile();
      setXp(profile.xp);
      setCompletedCount(profile.completedCount);
      setLastFeedback(profile.lastFeedback);
      setSelectedQuestId(profile.selectedQuestId);
      setEventJoined(profile.eventJoined);
      setSelectedDifficulty(profile.selectedDifficulty);
      setSelectedStory(profile.selectedStory);
      setActiveProgramMode(profile.activeProgramMode);
      setActiveTab(profile.activeTab);
      setConflictPrimaryStyle(profile.conflictPrimaryStyle);
      setConflictSecondaryStyles(profile.conflictSecondaryStyles);
      setDiagnosticCompleted(profile.diagnosticCompleted);
      setSelectedCourseId(profile.selectedCourseId);
      setUnlockedEndings(profile.unlockedEndings);
      setUnlockedAchievements(profile.unlockedAchievements);
      setDiagnosticIndex(0);
      setDiagnosticAnswers([]);
      setDiagnosticError("");
      setShowDiagnosticResult(false);
      setForestStarted(false);
      setForestFinished(false);
      setForestStepIndex(0);
      resetStepUi();
      refreshAnalyticsSnapshot().catch(() => undefined);
    }
  };

  const activePrimaryConflictStyle = conflictStyles.find((style) => style.id === conflictPrimaryStyle) ?? conflictStyles[0];
  const recommendedStory = recommendedStoryByConflictStyle[conflictPrimaryStyle];
  const recommendedStoryConfig = storyConfigs.find((story) => story.id === recommendedStory) ?? storyConfigs[0];
  const currentDiagnosticQuestion = diagnosticQuestions[diagnosticIndex] ?? diagnosticQuestions[0];
  const activeDiagnosticReport = diagnosticReportByStyle[conflictPrimaryStyle] ?? diagnosticReportByStyle.avoiding;
  const recommendedCourseId = activeDiagnosticReport.recommendedCourseId ?? recommendedCourseByConflictStyle[conflictPrimaryStyle];
  const recommendedCourse = courses.find((course) => course.id === recommendedCourseId) ?? courses[0];
  const questProgressPercent = currentForestQuestSteps.length
    ? Math.round(((forestStepIndex + 1) / currentForestQuestSteps.length) * 100)
    : 0;
  const threeDayProgram = (styleMicroExercises[conflictPrimaryStyle] ?? styleMicroExercises.avoiding).slice(0, 3);
  const dayIndex = Math.min(2, completedCount % 3);
  const dailyTask = threeDayProgram[dayIndex] ?? threeDayProgram[0];
  const analyticsUsers = Object.entries(analyticsSnapshot).sort((a, b) => (a[1].lastSeenAt < b[1].lastSeenAt ? 1 : -1));

  const toggleSecondaryConflictStyle = (styleId: ConflictStyleId) => {
    if (styleId === conflictPrimaryStyle) {
      return;
    }

    setConflictSecondaryStyles((prev) => {
      if (prev.includes(styleId)) {
        return prev.filter((item) => item !== styleId);
      }
      if (prev.length >= 2) {
        return prev;
      }
      return [...prev, styleId];
    });
  };

  const startDiagnostic = () => {
    setDiagnosticAnswers([]);
    setDiagnosticIndex(0);
    setDiagnosticError("");
    setDiagnosticCompleted(false);
    setShowDiagnosticResult(false);
  };

  const completeDiagnostic = (answers: number[]) => {
    const score: Record<ConflictStyleId, number> = {
      competitive: 0,
      avoiding: 0,
      accommodating: 0,
      passive_aggressive: 0,
      constructive: 0,
    };

    answers.forEach((answerIdx, questionIdx) => {
      const option = diagnosticQuestions[questionIdx]?.options[answerIdx];
      if (option) {
        score[option.style] += 1;
      }
    });

    const ranked = [...conflictStyles]
      .map((style) => ({ id: style.id, score: score[style.id] }))
      .sort((a, b) => b.score - a.score);

    const primary = ranked[0]?.id ?? "avoiding";
    const secondary = ranked
      .slice(1)
      .filter((item) => item.score > 0)
      .map((item) => item.id)
      .slice(0, 2);

    setConflictPrimaryStyle(primary);
    setConflictSecondaryStyles(secondary);
    setSelectedCourseId(recommendedCourseByConflictStyle[primary]);
    setDiagnosticCompleted(true);
    setShowDiagnosticResult(true);
    setActiveTab("profile");
    setStepMessage("Диагностика завершена. Мы подстроили тренировки под твой стиль.");
    trackAnalyticsEvent("diagnostic_complete", {
      details: `primary:${primary};secondary:${secondary.join(",") || "-"}`,
    }).catch(() => undefined);
  };

  const handleDiagnosticAnswer = (optionIdx: number) => {
    const nextAnswers = [...diagnosticAnswers];
    nextAnswers[diagnosticIndex] = optionIdx;
    setDiagnosticAnswers(nextAnswers);
    setDiagnosticError("");
    const question = diagnosticQuestions[diagnosticIndex];
    const option = question?.options[optionIdx];
    if (question && option) {
      trackDiagnosticAnswer(question.id, optionIdx, option.style).catch(() => undefined);
      trackAnalyticsEvent("diagnostic_answer", {
        details: `q:${question.id};style:${option.style}`,
      }).catch(() => undefined);
    }

    if (diagnosticIndex === diagnosticQuestions.length - 1) {
      completeDiagnostic(nextAnswers);
      return;
    }
    setDiagnosticIndex((prev) => prev + 1);
  };

  if (!authReady) {
    return (
      <SafeAreaView style={styles.root}>
        <StatusBar style="light" />
        <View style={styles.authWrap}>
          <AppCard>
            <Text style={styles.cardTitle}>Подготовка профиля...</Text>
            <Text style={styles.cardText}>Загружаем данные пользователя.</Text>
            <View style={styles.loaderRow}>
              <ActivityIndicator color={colors.accent} />
              <Text style={styles.cardMeta}>Синхронизация локальных данных</Text>
            </View>
          </AppCard>
        </View>
      </SafeAreaView>
    );
  }

  if (!currentUserEmail) {
    return (
      <SafeAreaView style={styles.root}>
        <StatusBar style="light" />
        <View style={styles.auroraBlobTop} />
        <View style={styles.auroraBlobBottom} />
        <View style={styles.authWrap}>
          <AppCard>
            <Text style={styles.title}>{authMode === "register" ? "Регистрация" : "Вход"}</Text>
            <Text style={styles.cardText}>Нужен аккаунт, чтобы сохранять прогресс и профиль.</Text>
            <TextInput
              value={authEmail}
              onChangeText={(value) => {
                setAuthEmail(value);
                setAuthError("");
                setAuthInfo("");
              }}
              placeholder="Email"
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              keyboardType="email-address"
              style={styles.authInput}
            />
            <TextInput
              value={authPassword}
              onChangeText={(value) => {
                setAuthPassword(value);
                setAuthError("");
                setAuthInfo("");
              }}
              placeholder="Пароль (минимум 6 символов)"
              placeholderTextColor={colors.textSecondary}
              secureTextEntry
              style={styles.authInput}
            />
            {authMode === "register" && (
              <TextInput
                value={authConfirmPassword}
                onChangeText={(value) => {
                  setAuthConfirmPassword(value);
                  setAuthError("");
                  setAuthInfo("");
                }}
                placeholder="Повтори пароль"
                placeholderTextColor={colors.textSecondary}
                secureTextEntry
                style={styles.authInput}
              />
            )}
            {!!authError && <Text style={styles.authError}>{authError}</Text>}
            {!!authInfo && <Text style={styles.authSuccess}>{authInfo}</Text>}
            <AppButton label={authMode === "register" ? "Создать аккаунт" : "Войти"} onPress={handleAuthSubmit} />
            {authMode === "register" ? (
              <AppButton
                label="У меня уже есть аккаунт"
                variant="secondary"
                onPress={() => {
                  setAuthMode("login");
                  setAuthError("");
                  setAuthInfo("");
                }}
              />
            ) : (
              <>
                <AppButton label="Зарегистрироваться с этими данными" variant="secondary" onPress={handleQuickRegister} />
                <AppButton
                  label="Открыть форму полной регистрации"
                  variant="secondary"
                  onPress={() => {
                    setAuthMode("register");
                    setAuthError("");
                    setAuthInfo("");
                  }}
                />
              </>
            )}
            <Text style={styles.cardMeta}>
              Важно: это базовая локальная авторизация на устройстве (для MVP), без облачной синхронизации.
            </Text>
          </AppCard>
        </View>
      </SafeAreaView>
    );
  }

  if (!diagnosticCompleted) {
    return (
      <SafeAreaView style={styles.root}>
        <StatusBar style="light" />
        <View style={styles.auroraBlobTop} />
        <View style={styles.auroraBlobBottom} />
        <View style={styles.authWrap}>
          <AppCard>
            <Text style={styles.title}>Диагностика стиля конфликта</Text>
            <Text style={styles.cardMeta}>
              Вопрос {diagnosticIndex + 1}/{diagnosticQuestions.length}
            </Text>
            <Text style={styles.cardText}>{currentDiagnosticQuestion.prompt}</Text>
            <View style={styles.builderWrap}>
              {currentDiagnosticQuestion.options.map((option, idx) => (
                <Pressable key={`${currentDiagnosticQuestion.id}-${idx}`} style={styles.optionCard} onPress={() => handleDiagnosticAnswer(idx)}>
                  <Text style={styles.optionText}>{option.text}</Text>
                </Pressable>
              ))}
            </View>
            {!!diagnosticError && <Text style={styles.authError}>{diagnosticError}</Text>}
            <AppButton label="Начать заново диагностику" variant="secondary" onPress={startDiagnostic} />
          </AppCard>
        </View>
      </SafeAreaView>
    );
  }

  if (showDiagnosticResult) {
    return (
      <SafeAreaView style={styles.root}>
        <StatusBar style="light" />
        <View style={styles.auroraBlobTop} />
        <View style={styles.auroraBlobBottom} />
        <View style={styles.authWrap}>
          <AppCard>
            <Text style={styles.title}>Итог диагностики</Text>
            <Text style={styles.cardMeta}>Основной стиль: {activePrimaryConflictStyle.label}</Text>
            <Text style={styles.cardText}>{activeDiagnosticReport.summary}</Text>

            <Text style={styles.cardTitle}>Сильные стороны</Text>
            {activeDiagnosticReport.strengths.map((item) => (
              <Text key={item} style={styles.cardMeta}>
                • {item}
              </Text>
            ))}

            <Text style={styles.cardTitle}>С чем будем работать</Text>
            {activeDiagnosticReport.growth.map((item) => (
              <Text key={item} style={styles.cardMeta}>
                • {item}
              </Text>
            ))}

            <Text style={styles.cardTitle}>Рекомендуемый стартовый курс</Text>
            <Text style={styles.cardText}>{recommendedCourse.title}</Text>
            <Text style={styles.cardMeta}>{recommendedCourse.lore}</Text>
            <Text style={styles.cardMeta}>Лейтмотив: {recommendedCourse.focus}</Text>
            {recommendedCourse.features.map((feature) => (
              <Text key={feature} style={styles.cardMeta}>
                • {feature}
              </Text>
            ))}
            <Text style={styles.cardMeta}>
              Рекомендуемый сюжет отдельно: {recommendedStoryConfig.emoji} {recommendedStoryConfig.label}
            </Text>

            <AppButton
              label="Начать по рекомендации"
              onPress={() => {
                startCourseQuest(recommendedCourse);
                setShowDiagnosticResult(false);
              }}
            />
            <AppButton
              label="Остаться в профиле"
              variant="secondary"
              onPress={() => {
                setShowDiagnosticResult(false);
                setActiveTab("profile");
              }}
            />
          </AppCard>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />
      <View style={styles.auroraBlobTop} />
      <View style={styles.auroraBlobBottom} />

      <View style={styles.header}>
        <View style={styles.brandWrap}>
          <Feather name="moon" size={imageSizes.inlineIcon} color={colors.textPrimary} />
          <Text style={styles.brand}>SofTale</Text>
        </View>
        <View style={styles.headerMetaWrap}>
          <Feather name="zap" size={imageSizes.inlineIcon} color={colors.textSecondary} />
          <Text style={styles.headerMeta}>Streak {streak} дн.</Text>
        </View>
        <View style={styles.headerMetaWrap}>
          <Feather name="award" size={imageSizes.inlineIcon} color={colors.textSecondary} />
          <Text style={styles.headerMeta}>XP {xp}</Text>
        </View>
      </View>

      <View style={styles.content}>
        {activeTab === "map" && (
          <ScrollView contentContainerStyle={styles.scroll}>
            <ScreenHeading
              title="Карта Сказочного Леса"
              subtitle={`Сегодня открыто ${dailyQuests.length} квеста(ов), завершено ${completedCount}.`}
            />
            <HeroBanner character={characterLibrary.foxGuide} accentEmoji={uiEmojiLibrary.challenge} title="Выбери курс или сюжет и начни игру" />
            <ScrollHint />

            <AppCard>
              <View style={styles.cardTitleRow}>
                <Feather name="navigation" size={imageSizes.cardLeadingIcon} color={colors.textPrimary} />
                <Text style={styles.cardTitle}>{uiEmojiLibrary.course} Текущий курс</Text>
              </View>
              <CardIllustration name={courseIllustrationById[activeCourse.id]} />
              <Text style={styles.cardText}>{activeCourse.title}</Text>
              <Text style={styles.cardMeta}>{activeCourse.lore}</Text>
              <Text style={styles.cardText}>
                Режим сейчас: {activeProgramMode === "course" ? "Курс (отдельные тренировки)" : `Квест-сюжет ${activeStoryConfig.emoji} ${activeStoryConfig.label}`}
              </Text>
              <Text style={styles.cardMeta}>
                По твоему стилю ({activePrimaryConflictStyle.label}) рекомендуем: {recommendedStoryConfig.emoji} {recommendedStoryConfig.label}
              </Text>
              {selectedStory !== recommendedStory && (
                <AppButton
                  label={`Применить рекомендацию: ${recommendedStoryConfig.label}`}
                  variant="secondary"
                  onPress={() => handleStorySelect(recommendedStory)}
                />
              )}
              <Text style={styles.cardText}>Доступные уровни: {allowedStoryDifficulties.join(" / ")} вопросов.</Text>
              <DifficultySelector
                selectedDifficulty={selectedDifficulty}
                onSelect={setSelectedDifficulty}
                allowedDifficulties={allowedStoryDifficulties}
              />
              <Text style={styles.cardText}>{activeDifficultyConfig.description}</Text>
              <Text style={styles.forecastText}>
                Прогноз: ожидаемо +{questForecast.expectedNetXp} XP при 80% точности (
                {questForecast.expectedCorrect}/{currentForestQuestSteps.length} верных, штрафов ~{questForecast.expectedPenaltyCount})
              </Text>
              {!forestStarted && (
                <AppButton
                  label={activeProgramMode === "course" ? `Начать курс: ${activeCourse.title}` : `Начать: ${activeStoryConfig.label}`}
                  pulse
                  onPress={startForestQuest}
                />
              )}
              {forestStarted && !forestFinished && (
                <AppButton label="Продолжить квест" onPress={() => setActiveTab("quest")} />
              )}
              {forestFinished && (
                <AppButton label="Начать заново" onPress={startForestQuest} />
              )}
            </AppCard>

            <AppCard style={styles.dailyTaskCard}>
              <View style={styles.cardTitleRow}>
                <Feather name="sunrise" size={imageSizes.cardLeadingIcon} color={colors.textPrimary} />
                <Text style={styles.cardTitle}>Задание дня • День {dayIndex + 1}/3</Text>
              </View>
              <Text style={styles.dailyTaskText}>{dailyTask}</Text>
              <Text style={styles.cardMeta}>Короткая практика вне квеста: 1 задание в день.</Text>
              <AppButton label="Сделать сегодня" variant="secondary" onPress={() => setActiveTab("quest")} />
            </AppCard>

            <AppCard>
              <View style={styles.cardTitleRow}>
                <Feather name="layers" size={imageSizes.cardLeadingIcon} color={colors.textPrimary} />
                <Text style={styles.cardTitle}>{uiEmojiLibrary.dialog} Каталог квестов</Text>
              </View>
              <Text style={styles.cardText}>Все сюжеты вынесены в отдельные карточки ниже.</Text>
            </AppCard>

            <AppCard>
              <View style={styles.cardTitleRow}>
                <Feather name="book-open" size={imageSizes.cardLeadingIcon} color={colors.textPrimary} />
                <Text style={styles.cardTitle}>{uiEmojiLibrary.challenge} Каталог курсов</Text>
              </View>
              <Text style={styles.cardText}>Все курсы для разных паттернов поведения. Карточка сразу запускает выбранный курс.</Text>
            </AppCard>

            {courses.map((course) => {
              const isCourseInProgress = activeProgramMode === "course" && selectedCourseId === course.id && forestStarted && !forestFinished;
              const isActiveCourse = selectedCourseId === course.id;
              const styleTags = course.recommendedFor
                .map((styleId) => conflictStyles.find((style) => style.id === styleId)?.label ?? styleId)
                .slice(0, 2);
              return (
                <AppCard key={`map-course-${course.id}`} style={styles.courseCard}>
                  <View style={styles.cardTitleRow}>
                    <Feather name="flag" size={imageSizes.inlineIcon} color={colors.textPrimary} />
                    <Text style={styles.cardTitle}>{course.title}</Text>
                  </View>
                  <CardIllustration name={courseIllustrationById[course.id]} />
                  <View style={styles.tagRow}>
                    <View style={styles.tagPill}>
                      <Text style={styles.tagPillText}>5/10/15 шагов</Text>
                    </View>
                    <View style={styles.tagPill}>
                      <Text style={styles.tagPillText}>Переговоры</Text>
                    </View>
                    {styleTags.map((tag) => (
                      <View key={`${course.id}-${tag}`} style={styles.tagPill}>
                        <Text style={styles.tagPillText}>{tag}</Text>
                      </View>
                    ))}
                  </View>
                  <Text style={styles.courseLeadText}>{course.lore}</Text>
                  <Text style={styles.courseBodyText}>{course.focus}</Text>
                  {course.features.map((feature) => (
                    <Text key={`${course.id}-${feature}`} style={styles.courseBodyText}>
                      • {feature}
                    </Text>
                  ))}
                  {course.id === "office-icebreaker" && (
                    <View style={styles.courseExperimentBox}>
                      <Text style={styles.courseExperimentTitle}>Капитанский принцип</Text>
                      <Text style={styles.courseBodyText}>
                        Твоя победа — это не чужое поражение. Твоя победа — разговор, после которого можно действовать вместе.
                      </Text>
                    </View>
                  )}
                  {course.id === "serpentine-diplomat" && (
                    <View style={styles.courseExperimentBox}>
                      <Text style={styles.courseExperimentTitle}>Кампания статуса и власти</Text>
                      <Text style={styles.courseBodyText}>Пять путей, двадцать пять поворотов и финал, который отражает цену твоих решений.</Text>
                    </View>
                  )}
                  <AppButton
                    label={isCourseInProgress ? "Продолжить курс" : isActiveCourse ? "Начать активный курс" : "Открыть курс"}
                    variant={isActiveCourse ? "secondary" : "primary"}
                    pulse={!isCourseInProgress}
                    onPress={() => {
                      startCourseQuest(course);
                    }}
                  />
                </AppCard>
              );
            })}

            {storyConfigs.map((story) => {
              const isActive = selectedStory === story.id;
              const isStoryInProgress = activeProgramMode === "story" && isActive && forestStarted && !forestFinished;
              const storyIllustration: IllustrationName =
                story.id === "forest"
                  ? "forest"
                  : story.id === "romance"
                  ? "heart-multiple"
                  : story.id === "slytherin"
                  ? "snake"
                  : story.id === "boss"
                  ? "briefcase-account-outline"
                  : "account-heart-outline";

              return (
                <AppCard key={`story-card-${story.id}`}>
                  <View style={styles.cardTitleRow}>
                    <Text style={styles.emojiLeading}>{story.emoji}</Text>
                    <Text style={styles.cardTitle}>{story.label}</Text>
                  </View>
                  <CardIllustration name={storyIllustration} />
                  <Text style={styles.cardText}>{story.description}</Text>
                  <Text style={styles.cardMeta}>Формат: {story.difficulties.join(" / ")} вопросов</Text>
                  <Text style={styles.cardMeta}>Формат: отдельный сюжетный квест (не курс).</Text>
                  {isStoryInProgress && (
                    <Text style={styles.cardMeta}>
                      Прогресс сюжета и курса: {questProgressPercent}% ({forestStepIndex + 1}/{currentForestQuestSteps.length})
                    </Text>
                  )}
                  <AppButton
                    label={
                      isStoryInProgress ? "Продолжить сюжет" : isActive ? "Начать этот квест" : `Выбрать и начать: ${story.label}`
                    }
                    variant={isActive ? "secondary" : "primary"}
                    onPress={() => {
                      if (isStoryInProgress) {
                        setActiveTab("quest");
                        return;
                      }
                      setActiveProgramMode("story");
                      setSelectedStory(story.id);
                      setForestStarted(true);
                      setForestFinished(false);
                      setForestStepIndex(0);
                      setStepMessage("");
                      setTotalErrors(0);
                      setPenaltyCount(0);
                      setForestXpEarned(0);
                      setFirstTrySuccess(0);
                      setLastStepPraise("");
                      resetStepUi();
                      setActiveTab("quest");
                    }}
                  />
                </AppCard>
              );
            })}

            <AppCard>
              <View style={styles.cardTitleRow}>
                <Feather name="users" size={imageSizes.cardLeadingIcon} color={colors.textPrimary} />
                <Text style={styles.cardTitle}>Парный эмпатический квест</Text>
              </View>
              <CardIllustration name="account-heart" />
              <Text style={styles.cardText}>
                Сценарий недели: поддержать персонажа, который боится отказать руководителю.
              </Text>
              <AppButton label="Открыть ивент" variant="secondary" onPress={() => setActiveTab("event")} />
            </AppCard>
          </ScrollView>
        )}

        {activeTab === "quest" && (
          <ScrollView contentContainerStyle={styles.scroll}>
            <ScreenHeading
              title={
                activeProgramMode === "course" ? `Курс: ${activeCourse.title}` : `Квест: ${activeStoryConfig.emoji} ${activeStoryConfig.label}`
              }
              subtitle={activeProgramMode === "course" ? "Отдельный трек переговоров и жизненных ситуаций" : "Сюжетная отработка навыков"}
            />
            <HeroBanner character={characterLibrary.owlMentor} accentEmoji={uiEmojiLibrary.dialog} title="Сначала слушаем сцену, затем отвечаем" />
            {!forestStarted && (
              <AppCard>
                <Text style={styles.sectionLabel}>Твой следующий шаг</Text>
                <Text style={styles.cardTitle}>Готова к приключению?</Text>
                <Text style={styles.cardText}>
                  Это полноценный квест на {selectedDifficulty} вопросов: выбор, мультивыбор и сборка фразы. Первая ошибка в шаге без
                  штрафа, со второй — штраф XP. Чем выше сложность, тем выгоднее награда.
                </Text>
                <Text style={styles.cardMeta}>Фокус тренировки по стилю: {activePrimaryConflictStyle.focus}</Text>
                <Text style={styles.cardText}>Персональные микро-упражнения на сегодня:</Text>
                {(styleMicroExercises[conflictPrimaryStyle] ?? styleMicroExercises.avoiding).map((exercise) => (
                  <Text key={exercise} style={styles.cardMeta}>
                    • {exercise}
                  </Text>
                ))}
                <DifficultySelector
                  selectedDifficulty={selectedDifficulty}
                  onSelect={setSelectedDifficulty}
                  showMultiplier
                  allowedDifficulties={allowedStoryDifficulties}
                />
                <Text style={styles.forecastText}>
                  Прогноз: +{questForecast.expectedNetXp} XP при 80% точности. Чем выше сложность, тем выше потенциальная выгода.
                </Text>
                <AppButton label="Запустить квест" pulse onPress={startForestQuest} />
              </AppCard>
            )}

            {forestStarted && !forestFinished && (
              <AppCard>
                {!!lastStepPraise && (
                  <Animated.View
                    style={[
                      styles.successWrap,
                      {
                        opacity: successAnim.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }),
                        transform: [
                          {
                            translateY: successAnim.interpolate({ inputRange: [0, 1], outputRange: [4, 0] }),
                          },
                        ],
                      },
                    ]}
                  >
                    <Text style={styles.praiseText}>✨ {lastStepPraise}</Text>
                  </Animated.View>
                )}
                <Text style={styles.sectionLabel}>Текущий прогресс</Text>
                <View style={styles.cardTitleRow}>
                  <Text style={styles.emojiLeading}>🌲</Text>
                  <Text style={styles.cardTitle}>
                    Шаг {forestStepIndex + 1}/{currentForestQuestSteps.length}: {activeForestStep.title}
                  </Text>
                </View>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${questProgressPercent}%` }]} />
                </View>
                <Text style={styles.cardMeta}>
                  Пройдено: {questProgressPercent}% • Формат: {formatStepType(activeForestStep.type)} • Сложность: {selectedDifficulty} • Ошибки шага:{" "}
                  {stepErrorCount}/2 • Общие ошибки: {totalErrors}
                </Text>
                <View style={styles.stepEmojiWrap}>
                  <Text style={styles.stepEmojiText}>{activeForestStep.sceneEmoji ?? "🧠"}</Text>
                </View>
                <Text style={styles.sectionLabel}>Сцена</Text>
                <SpeechBubble text={visibleStepScene ?? activeForestStep.scene} />
                <Text style={styles.sectionLabel}>Что сделать сейчас</Text>
                <Text style={styles.questInstructionText}>{activeForestStep.instruction}</Text>

                {activeForestStep.type !== "builder" &&
                  activeForestStep.options?.map((option, idx) => {
                    const isMultiple = activeForestStep.type === "multiple";
                    const checked = isMultiple ? selectedMultiple.includes(idx) : selectedSingle === idx;
                    return (
                      <Pressable
                        key={`${activeForestStep.id}-option-${idx}`}
                        style={[styles.optionCard, checked && styles.optionCardActive]}
                        onPress={() => {
                          if (isMultiple) {
                            setSelectedMultiple((prev) => {
                              if (prev.includes(idx)) {
                                return prev.filter((value) => value !== idx);
                              }
                              const needed = activeForestStep.correctMultiple?.length ?? 2;
                              if (prev.length >= needed) {
                                return prev;
                              }
                              return [...prev, idx];
                            });
                            return;
                          }
                          setSelectedSingle(idx);
                        }}
                      >
                        <Text style={styles.optionText}>{option}</Text>
                      </Pressable>
                    );
                  })}

                {activeForestStep.type === "builder" && (
                  <View style={styles.builderWrap}>
                    <Text style={styles.cardMeta}>Собранная фраза (тапни слово, чтобы удалить)</Text>
                    <View style={styles.builderLine}>
                      {builderTokens.length ? (
                        <View style={styles.rowWrap}>
                          {builderTokens.map((token, idx) => (
                            <Pressable
                              key={`${token}-built-${idx}`}
                              style={[styles.tokenChip, styles.builtTokenChip]}
                              onPress={() =>
                                setSelectedBuilderIndices((prev) => prev.filter((_, tokenIdx) => tokenIdx !== idx))
                              }
                            >
                              <Text style={styles.chipText}>{token}</Text>
                            </Pressable>
                          ))}
                        </View>
                      ) : (
                        <Text style={styles.cardText}>Пока пусто. Нажми слова ниже.</Text>
                      )}
                    </View>
                    <View style={styles.rowWrap}>
                      {shuffledTokenBank.map((token, idx) => {
                        const isUsed = selectedBuilderIndices.includes(idx);
                        if (isUsed) {
                          return null;
                        }

                        return (
                          <Pressable
                            key={`${token}-${idx}`}
                            style={styles.tokenChip}
                            onPress={() => setSelectedBuilderIndices((prev) => [...prev, idx])}
                          >
                            <Text style={styles.chipText}>{token}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    <AppButton label="Очистить сборку" variant="secondary" onPress={() => setSelectedBuilderIndices([])} />
                  </View>
                )}

                {showHint && <Text style={styles.hintText}>Подсказка: {activeForestStep.hint}</Text>}
                {!!stepMessage && <Text style={styles.statusText}>{stepMessage}</Text>}

                <View style={styles.rowWrap}>
                  <Pressable style={styles.primaryButtonInline} onPress={evaluateForestStep}>
                    <Text style={styles.buttonPrimaryText}>Проверить шаг</Text>
                  </Pressable>
                  <Pressable
                    style={styles.secondaryButtonInline}
                    onPress={() => {
                      setShowHint((prev) => {
                        const next = !prev;
                        if (next) {
                          trackAnalyticsEvent("hint_opened", {
                            stepIndex: forestStepIndex,
                            details: activeForestStep.id,
                          }).catch(() => undefined);
                        }
                        return next;
                      });
                    }}
                  >
                    <Text style={styles.buttonSecondaryText}>{showHint ? "Скрыть подсказку" : "Подсказка"}</Text>
                  </Pressable>
                </View>
              </AppCard>
            )}

            {forestFinished && (
              <AppCard>
                <View style={styles.cardTitleRow}>
                  <MaterialCommunityIcons name="forest" size={imageSizes.cardLeadingIcon} color={colors.textPrimary} />
                  <Text style={styles.cardTitle}>{activeProgramMode === "course" ? "Курс пройден" : "Квест пройден"}</Text>
                </View>
                <CardIllustration name="trophy-outline" />
                <Text style={styles.cardText}>Шагов пройдено: {currentForestQuestSteps.length}</Text>
                <Text style={styles.cardText}>Сложность: {selectedDifficulty} вопросов</Text>
                <Text style={styles.cardText}>Успехов с 1-й попытки: {firstTrySuccess}</Text>
                <Text style={styles.cardText}>Ошибок всего: {totalErrors}</Text>
                <Text style={styles.cardText}>Штрафов применено: {penaltyCount}</Text>
                <Text style={styles.cardText}>
                  Итог по XP в квесте: {forestXpEarned >= 0 ? "+" : ""}
                  {forestXpEarned} XP
                </Text>
                <Text style={styles.cardText}>Финальная концовка: {endingNarrativeByRoute(activeCampaignId)[dominantEndingRoute]}</Text>
                <Text style={styles.sectionLabel}>Результаты по шкалам поведения</Text>
                {buildBranchScaleData(branchScore).map(({ branch, value, percent }) => (
                  <View key={`scale-${branch}`} style={styles.scaleRow}>
                    <View style={styles.scaleHeader}>
                      <Text style={styles.scaleLabel}>{branchScaleUi[branch].label}</Text>
                      <Text style={styles.scaleValue}>
                        {value} • {percent}%
                      </Text>
                    </View>
                    <View style={styles.scaleTrack}>
                      <View style={[styles.scaleFill, { width: `${percent}%`, backgroundColor: branchScaleUi[branch].color }]} />
                    </View>
                  </View>
                ))}
                <Text style={styles.cardMeta}>Достижение: {formatAchievementLabel(buildAchievementId(activeCampaignId, dominantEndingRoute))}</Text>
                <AppButton label="Пройти квест заново" onPress={startForestQuest} />
              </AppCard>
            )}
          </ScrollView>
        )}

        {activeTab === "event" && (
          <ScrollView contentContainerStyle={styles.scroll}>
            <ScreenHeading title="Сезонный Ивент" subtitle="Месяц Осознанной Коммуникации" />
            <HeroBanner character={characterLibrary.wolfStrategist} accentEmoji={uiEmojiLibrary.streak} title="Командный прогресс и награды" />
            <AppCard>
              <View style={styles.cardTitleRow}>
                <Feather name="activity" size={imageSizes.cardLeadingIcon} color={colors.textPrimary} />
                <Text style={styles.cardTitle}>Прогресс сообщества</Text>
              </View>
              <CardIllustration name="trophy-outline" />
              <Text style={styles.cardText}>74% до открытия легендарного артефакта "Сердце Леса".</Text>
              <Text style={styles.cardText}>Твой вклад: {completedCount * 12} очков рефлексии.</Text>
              <AppButton
                label={eventJoined ? "Ты уже в ивенте" : "Вступить в ивент"}
                variant={eventJoined ? "secondary" : "primary"}
                onPress={() => setEventJoined(true)}
              />
            </AppCard>
          </ScrollView>
        )}

        {activeTab === "feedback" && (
          <ScrollView contentContainerStyle={styles.scroll}>
            <ScreenHeading title="AI-обратная связь" />
            <HeroBanner character={characterLibrary.lynxAnalyst} accentEmoji={uiEmojiLibrary.strategy} title="Разбираем ответы и улучшаем тактику" />
            <AppCard>
              <View style={styles.cardTitleRow}>
                <Feather name="cpu" size={imageSizes.cardLeadingIcon} color={colors.textPrimary} />
                <Text style={styles.cardTitle}>Твой рост сегодня</Text>
              </View>
              <CardIllustration name="brain" />
              <Text style={styles.cardText}>{lastFeedback}</Text>
              <View style={styles.tag}>
                <Text style={styles.tagText}>Уточняющий вопрос</Text>
              </View>
              <Text style={styles.cardText}>{followUpHints[(completedCount + 2) % followUpHints.length]}</Text>
              <AppButton label="Переписать ответ глубже" variant="secondary" onPress={() => setActiveTab("quest")} />
            </AppCard>
          </ScrollView>
        )}

        {activeTab === "profile" && (
          <ScrollView contentContainerStyle={styles.scroll}>
            <ScreenHeading title="Профиль героя" />
            <HeroBanner character={characterLibrary.swanEmpath} accentEmoji={uiEmojiLibrary.growth} title="Твой стиль, прогресс и подходящие курсы" />
            <AppCard>
              <View style={styles.profileHeader}>
                <ImageFallback label="Аватар" size={imageSizes.profileAvatar} />
                <View style={styles.profileInfo}>
                  <Text style={styles.cardTitle}>Текущий ранг</Text>
                  <Text style={styles.cardText}>Новичок-Наблюдатель</Text>
                  <Text style={styles.cardMeta}>{currentUserEmail}</Text>
                </View>
              </View>
              <Text style={styles.cardText}>Рекорд глубины рефлексии: 82/100</Text>
              <Text style={styles.cardMeta}>{isSavingProfile ? "Сохраняем прогресс..." : "Прогресс сохранен локально"}</Text>
              <Text style={styles.cardMeta}>Открыто концовок: {unlockedEndings.length}</Text>
              <Text style={styles.cardMeta}>Достижений: {unlockedAchievements.length}</Text>
              <AppButton label="Выйти из аккаунта" variant="secondary" onPress={handleLogout} />
            </AppCard>

            <AppCard>
              <Text style={styles.sectionLabel}>Коллекция достижений</Text>
              <Text style={styles.cardTitle}>Финалы LitRPG</Text>
              {unlockedAchievements.length ? (
                unlockedAchievements.slice(-12).reverse().map((item) => (
                  <Text key={item} style={styles.cardMeta}>
                    • {formatAchievementLabel(item)}
                  </Text>
                ))
              ) : (
                <Text style={styles.cardMeta}>Пока нет. Заверши кампанию, чтобы открыть первую концовку.</Text>
              )}
            </AppCard>


            <AppCard>
              <Text style={styles.cardTitle}>Профиль конфликтного стиля</Text>
              <Text style={styles.cardText}>Основной стиль (1):</Text>
              <View style={styles.rowWrap}>
                {conflictStyles.map((style) => {
                  const isActive = conflictPrimaryStyle === style.id;
                  return (
                    <Pressable
                      key={`primary-${style.id}`}
                      style={[styles.storyChip, isActive && styles.storyChipActive]}
                      onPress={() => {
                        setConflictPrimaryStyle(style.id);
                        setConflictSecondaryStyles((prev) => prev.filter((item) => item !== style.id));
                      }}
                    >
                      <Text style={styles.chipText}>{style.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={styles.cardMeta}>Сейчас: {activePrimaryConflictStyle.short}</Text>
              <Text style={styles.cardText}>{activePrimaryConflictStyle.focus}</Text>

              <Text style={styles.cardText}>Дополнительные стили (до 2):</Text>
              <View style={styles.rowWrap}>
                {conflictStyles.map((style) => {
                  const disabled = style.id === conflictPrimaryStyle;
                  const isActive = conflictSecondaryStyles.includes(style.id);
                  return (
                    <Pressable
                      key={`secondary-${style.id}`}
                      style={[
                        styles.storyChip,
                        isActive && styles.storyChipActive,
                        disabled && styles.profileChipDisabled,
                      ]}
                      onPress={() => toggleSecondaryConflictStyle(style.id)}
                      disabled={disabled}
                    >
                      <Text style={styles.chipText}>{style.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={styles.cardMeta}>
                Вторичные:{" "}
                {conflictSecondaryStyles.length
                  ? conflictSecondaryStyles
                      .map((id) => conflictStyles.find((style) => style.id === id)?.label ?? id)
                      .join(", ")
                  : "не выбраны"}
              </Text>
              <AppButton
                label="Пройти диагностику заново"
                variant="secondary"
                onPress={() => {
                  startDiagnostic();
                  setActiveTab("profile");
                }}
              />
            </AppCard>

            <AppCard>
              <Text style={styles.sectionLabel}>Дополнительно</Text>
              <Text style={styles.cardTitle}>Артефакты</Text>
              {artifacts.map((artifact) => (
                <Text key={artifact} style={styles.cardText}>
                  {(artifactEmoji[artifact] ?? "✨") + " " + artifact}
                </Text>
              ))}
            </AppCard>

          </ScrollView>
        )}

        {activeTab === "admin" && (
          <ScrollView contentContainerStyle={styles.scroll}>
            <ScreenHeading title="Веб-админка аналитики" subtitle="Системная воронка по каждому пользователю" />
            <HeroBanner character={characterLibrary.lynxAnalyst} accentEmoji={uiEmojiLibrary.strategy} title="Смотри вход, тест, прогресс, отказы и время" />
            <AppCard>
              <Text style={styles.sectionLabel}>Обзор</Text>
              <Text style={styles.cardText}>Пользователей: {analyticsUsers.length}</Text>
              <Text style={styles.cardText}>
                Активные сессии:{" "}
                {analyticsUsers.filter(([, data]) => {
                  const last = Date.parse(data.lastSeenAt);
                  return Number.isFinite(last) && Date.now() - last < 15 * 60 * 1000;
                }).length}
              </Text>
              <AppButton label="Обновить аналитику" variant="secondary" onPress={() => refreshAnalyticsSnapshot()} />
            </AppCard>

            {analyticsUsers.map(([email, data]) => {
              const testAnswers = data.diagnosticAnswers.length;
              const recentEvents = data.events.slice(-5).reverse();
              const completionRate = data.counters.courseStarts
                ? Math.round((data.counters.courseCompletions / data.counters.courseStarts) * 100)
                : 0;
              return (
                <AppCard key={`analytics-${email}`}>
                  <Text style={styles.cardTitle}>{email}</Text>
                  <Text style={styles.cardMeta}>Первый вход: {new Date(data.firstSeenAt).toLocaleString()}</Text>
                  <Text style={styles.cardMeta}>Последняя активность: {new Date(data.lastSeenAt).toLocaleString()}</Text>
                  <Text style={styles.cardText}>Сессий: {data.totalSessions} • Время в приложении: {Math.round(data.totalTimeSec / 60)} мин</Text>
                  <Text style={styles.cardMeta}>
                    Курсы: старт {data.counters.courseStarts} / финиш {data.counters.courseCompletions} ({completionRate}%)
                  </Text>
                  <Text style={styles.cardMeta}>
                    Квесты: старт {data.counters.questStarts} / финиш {data.counters.questCompletions}
                  </Text>
                  <Text style={styles.cardMeta}>
                    Триггеры: ошибки {data.counters.stepFails}, штрафы {data.counters.penalties}, отказы {data.counters.dropOffs}
                  </Text>
                  <Text style={styles.cardMeta}>
                    LitRPG: смен ветки {data.events.filter((event) => event.type === "branch_shift").length}, открыто концовок{" "}
                    {data.events.filter((event) => event.type === "ending_unlock").length}
                  </Text>
                  <Text style={styles.cardMeta}>Ответов в диагностике: {testAnswers}</Text>
                  {!!testAnswers && (
                    <Text style={styles.cardMeta}>
                      Последний ответ теста: {
                        data.diagnosticAnswers[data.diagnosticAnswers.length - 1]
                          ? `${data.diagnosticAnswers[data.diagnosticAnswers.length - 1].questionId} -> ${data.diagnosticAnswers[data.diagnosticAnswers.length - 1].style}`
                          : "-"
                      }
                    </Text>
                  )}
                  <Text style={styles.sectionLabel}>Последние события</Text>
                  {recentEvents.length ? (
                    recentEvents.map((event) => (
                      <Text key={event.id} style={styles.cardMeta}>
                        • {event.type} — {new Date(event.at).toLocaleTimeString()} {event.details ? `(${event.details})` : ""}
                      </Text>
                    ))
                  ) : (
                    <Text style={styles.cardMeta}>Событий пока нет.</Text>
                  )}
                </AppCard>
              );
            })}

            <AppCard>
              <Text style={styles.sectionLabel}>Справка (скрыто из продукта)</Text>
              <Text style={styles.cardTitle}>Правила подбора изображений</Text>
              {imageRules.map((rule) => (
                <Text key={`admin-rule-${rule}`} style={styles.cardText}>
                  • {rule}
                </Text>
              ))}
              <Text style={styles.cardText}>Биом текущего квеста: {(biomeEmoji[selectedQuest.biome] ?? "🌌") + " " + selectedQuest.biome}</Text>
            </AppCard>

            <AppCard>
              <Text style={styles.sectionLabel}>Техкарта UX (скрыто из продукта)</Text>
              <Text style={styles.cardTitle}>Карта визуальных зон</Text>
              {visualSlots.map((slot) => (
                <View key={`admin-slot-${slot.id}`} style={styles.slotRow}>
                  <View style={styles.slotMeta}>
                    <Text style={styles.slotZone}>{slot.zone}</Text>
                    <Text style={styles.slotText}>Размер: {slot.size}</Text>
                    <Text style={styles.slotText}>Источник: {slot.source}</Text>
                    <Text style={styles.slotText}>Контент: {slot.content}</Text>
                  </View>
                </View>
              ))}
            </AppCard>
          </ScrollView>
        )}
      </View>

      <View style={styles.tabBar}>
        {tabs.map((tab) => (
          <Pressable
            key={tab.key}
            style={styles.tabButton}
            onPress={() => {
              if (activeTab === "quest" && tab.key !== "quest" && forestStarted && !forestFinished) {
                trackAnalyticsEvent("drop_off", {
                  details: `leave_quest_to_${tab.key}`,
                  courseId: activeProgramMode === "course" ? activeCourse.id : undefined,
                  storyId: activeProgramMode === "story" ? selectedStory : undefined,
                  difficulty: selectedDifficulty,
                }).catch(() => undefined);
              }
              setActiveTab(tab.key);
            }}
          >
            <Feather
              name={tabIcons[tab.key]}
              size={imageSizes.tabIcon}
              color={activeTab === tab.key ? colors.textPrimary : colors.textSecondary}
            />
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>{tab.label}</Text>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}

const theme = {
  colors: {
    bg: "#091321",
    card: "#112033",
    textPrimary: "#EAF3FF",
    textSecondary: "#C8D7E9",
    accent: "#57B3E6",
    accentSoft: "#17314A",
    border: "#25415F",
    surfaceMuted: "#0E1D30",
    tabBarBg: "#0C1828",
    bgGradient: ["#081322", "#0B2032", "#1A1230"] as [string, string, string],
    cardGradient: ["#12253A", "#13243A", "#17203A"] as [string, string, string],
    buttonGradient: ["#3BB8C5", "#4F8FEA", "#7A6EEB"] as [string, string, string],
    auroraMint: "rgba(77, 220, 183, 0.18)",
    auroraViolet: "rgba(126, 108, 240, 0.16)",
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 10,
    lg: 12,
    xl: 14,
    page: 16,
  },
  radius: {
    sm: 10,
    md: 12,
    lg: 14,
    pill: 999,
  },
  typography: {
    title: { fontSize: 24, fontWeight: "700" as const, lineHeight: 30 },
    cardTitle: { fontSize: 18, fontWeight: "700" as const, lineHeight: 24 },
    body: { fontSize: 15, lineHeight: 22 },
    button: { fontSize: 15, fontWeight: "700" as const, lineHeight: 20 },
    caption: { fontSize: 13, fontWeight: "600" as const, lineHeight: 18 },
  },
};

const colors = theme.colors;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    position: "relative",
  },
  rootGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  auroraBlobTop: {
    position: "absolute",
    top: -80,
    right: -40,
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: colors.auroraMint,
  },
  auroraBlobBottom: {
    position: "absolute",
    bottom: 80,
    left: -70,
    width: 250,
    height: 250,
    borderRadius: 999,
    backgroundColor: colors.auroraViolet,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: theme.spacing.page,
    paddingVertical: theme.spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  brandWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  brand: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: "700",
  },
  headerMetaWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  headerMeta: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "600",
  },
  content: {
    flex: 1,
  },
  authWrap: {
    flex: 1,
    justifyContent: "center",
    padding: theme.spacing.page,
  },
  loaderRow: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  authInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: theme.radius.sm,
    color: colors.textPrimary,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    backgroundColor: colors.surfaceMuted,
  },
  authError: {
    color: "#FFD2D2",
    backgroundColor: "#5C2636",
    borderWidth: 1,
    borderColor: "#8D3A51",
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    fontSize: 13,
    lineHeight: 18,
  },
  authSuccess: {
    color: "#D3FFEA",
    backgroundColor: "#1C4A3A",
    borderWidth: 1,
    borderColor: "#2A7A5E",
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    fontSize: 13,
    lineHeight: 18,
  },
  scroll: {
    padding: theme.spacing.page,
    gap: theme.spacing.lg,
  },
  headingWrap: {
    gap: theme.spacing.xs,
  },
  scrollHintWrap: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  scrollHintText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "600",
  },
  heroBanner: {
    marginTop: -2,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    backgroundColor: "#10263A",
  },
  heroIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  heroTextWrap: {
    flex: 1,
    gap: 2,
  },
  heroTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 21,
  },
  heroSubtitle: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
  },
  title: {
    color: colors.textPrimary,
    ...theme.typography.title,
  },
  subtitle: {
    color: colors.textSecondary,
    ...theme.typography.body,
    marginBottom: 6,
  },
  sectionLabel: {
    color: colors.textSecondary,
    ...theme.typography.caption,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: theme.spacing.xl,
    gap: theme.spacing.sm,
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cardTitle: {
    color: colors.textPrimary,
    ...theme.typography.cardTitle,
  },
  cardIllustrationWrap: {
    width: imageSizes.cardIllustration,
    height: imageSizes.cardIllustration,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  fallbackWrap: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    padding: 4,
  },
  fallbackLabel: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: "600",
  },
  cardMeta: {
    color: colors.textSecondary,
    ...theme.typography.caption,
  },
  cardText: {
    color: colors.textSecondary,
    ...theme.typography.body,
    lineHeight: 24,
  },
  dailyTaskCard: {
    backgroundColor: "#132A3F",
  },
  dailyTaskText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 24,
  },
  courseCard: {
    gap: 10,
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tagPill: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    backgroundColor: colors.accentSoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  tagPillText: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 16,
  },
  courseLeadText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 24,
  },
  courseBodyText: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 23,
  },
  courseExperimentBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: theme.radius.md,
    backgroundColor: "#12324A",
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    gap: 6,
  },
  courseExperimentTitle: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
  },
  input: {
    minHeight: 110,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: theme.radius.sm,
    color: colors.textPrimary,
    padding: theme.spacing.md,
    textAlignVertical: "top",
    backgroundColor: colors.surfaceMuted,
  },
  buttonBase: {
    borderRadius: theme.radius.sm,
    paddingVertical: theme.spacing.lg,
    alignItems: "center",
  },
  buttonPressed: {
    opacity: 0.92,
  },
  buttonPrimary: {
    backgroundColor: colors.accent,
  },
  buttonPrimaryText: {
    color: colors.textPrimary,
    ...theme.typography.button,
  },
  buttonSecondary: {
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.border,
  },
  buttonSecondaryText: {
    color: colors.textSecondary,
    ...theme.typography.caption,
    fontSize: 14,
  },
  rowWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.card,
  },
  chipActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  chipText: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: "600",
  },
  emojiChip: {
    fontSize: imageSizes.chipIcon,
  },
  emojiLeading: {
    fontSize: imageSizes.cardLeadingIcon,
  },
  tag: {
    alignSelf: "flex-start",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tagText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: "700",
  },
  tabBar: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.tabBarBg,
  },
  tabButton: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    gap: 4,
  },
  tabText: {
    color: colors.textSecondary,
    ...theme.typography.caption,
  },
  tabTextActive: {
    color: colors.textPrimary,
  },
  profileHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  profileInfo: {
    flex: 1,
    gap: 2,
  },
  optionCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: theme.radius.sm,
    padding: theme.spacing.md,
    backgroundColor: colors.surfaceMuted,
  },
  optionCardActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  optionText: {
    color: colors.textPrimary,
    fontSize: 13,
    lineHeight: 19,
  },
  praiseText: {
    color: "#CCF5D5",
    backgroundColor: "#1E3A2A",
    borderWidth: 1,
    borderColor: "#2E6A47",
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
  },
  successWrap: {
    alignSelf: "stretch",
  },
  questSceneText: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 26,
  },
  stepEmojiWrap: {
    width: "100%",
    minHeight: 168,
    borderRadius: 18,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  stepEmojiText: {
    fontSize: 86,
    lineHeight: 104,
  },
  speechBubbleWrap: {
    alignSelf: "stretch",
    marginBottom: 4,
  },
  speechBubbleHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
    marginLeft: 2,
  },
  speechSpeakerEmoji: {
    fontSize: 14,
  },
  speechSpeakerName: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  speechBubble: {
    alignSelf: "flex-start",
    maxWidth: "95%",
    backgroundColor: "#16314A",
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  speechBubbleText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 23,
  },
  speechBubbleTail: {
    marginLeft: 16,
    marginTop: -1,
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 10,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "#16314A",
  },
  questInstructionText: {
    color: "#E0ECFF",
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 22,
  },
  builderWrap: {
    gap: 8,
  },
  builderLine: {
    minHeight: 64,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: theme.radius.sm,
    padding: theme.spacing.md,
    backgroundColor: colors.surfaceMuted,
    justifyContent: "center",
  },
  tokenChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.card,
  },
  builtTokenChip: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  hintText: {
    color: "#DAE7FF",
    fontSize: 12,
    lineHeight: 18,
    backgroundColor: "#1A3049",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: theme.radius.sm,
    padding: 8,
  },
  statusText: {
    color: colors.textSecondary,
    ...theme.typography.caption,
  },
  scaleRow: {
    gap: 6,
    marginTop: 4,
  },
  scaleHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  scaleLabel: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: "600",
  },
  scaleValue: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "600",
  },
  scaleTrack: {
    width: "100%",
    height: 8,
    borderRadius: 999,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  scaleFill: {
    height: "100%",
    borderRadius: 999,
  },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: colors.accent,
  },
  planItem: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: theme.radius.sm,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    gap: 2,
  },
  primaryButtonInline: {
    flex: 1,
    minWidth: 150,
    backgroundColor: colors.accent,
    borderRadius: theme.radius.sm,
    paddingVertical: theme.spacing.lg,
    alignItems: "center",
  },
  secondaryButtonInline: {
    flex: 1,
    minWidth: 150,
    backgroundColor: colors.accentSoft,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: theme.spacing.lg,
    alignItems: "center",
  },
  slotRow: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 10,
    backgroundColor: colors.surfaceMuted,
  },
  slotMeta: {
    gap: 2,
  },
  slotZone: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: "700",
  },
  slotText: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  difficultyChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.card,
  },
  difficultyChipActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  storyChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    backgroundColor: colors.card,
  },
  storyChipActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  profileChipDisabled: {
    opacity: 0.45,
  },
  difficultyDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
  },
  forecastText: {
    color: "#DAEAFF",
    fontSize: 13,
    lineHeight: 18,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: "#132944",
    padding: 8,
  },
  storyAccordionWrap: {
    gap: theme.spacing.sm,
  },
  storyAccordionItem: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: theme.radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  storyAccordionItemActive: {
    borderColor: colors.accent,
  },
  storyAccordionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  storyAccordionBody: {
    gap: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
});
