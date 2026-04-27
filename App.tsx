import { StatusBar } from "expo-status-bar";
import { Audio } from "expo-av";
import * as ImagePicker from "expo-image-picker";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { type ComponentProps, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { seasonalEventMvp, type CampaignContentId, type SeasonalEventStep } from "./questContent";
import {
  getCampaignBlockArc,
  getStageIdxLinear,
  stepLibraryByCampaign,
} from "./stepLibrary";
import npcReactionsPrebuilt from "./content/npc-reactions/all.json";

type NpcReactionsPrebuiltMap = Record<string, Record<string, Record<string, string>>>;
const NPC_REACTIONS_FROM_BUILD = npcReactionsPrebuilt as NpcReactionsPrebuiltMap;

function pickBuiltNpcReaction(campaign: CampaignContentId, stepIdx: number, optionIdx: number): string | undefined {
  return NPC_REACTIONS_FROM_BUILD[campaign]?.[String(stepIdx)]?.[String(optionIdx)];
}

function requireBuiltNpcReaction(campaign: CampaignContentId, stepIdx: number, optionIdx: number): string {
  const value = pickBuiltNpcReaction(campaign, stepIdx, optionIdx);
  if (!value?.trim()) {
    throw new Error(
      `[App] Нет собранной реакции NPC в content/npc-reactions/all.json для ${campaign} шаг ${stepIdx + 1} вариант ${optionIdx + 1}`
    );
  }
  return value;
}
import { economyApi, type EconomySnapshot } from "./economyApi";
import { authApi } from "./authApi";
import { analyticsApi, type AdminMetricsResponse } from "./analyticsApi";
import { empathyApi, type EmpathyPairView, type EmpathyPassType } from "./empathyApi";
import { achievementEmojiByCampaignTier, editorialEndingByCampaignTier, editorialStepOptionsByCampaign } from "./scenarioBible";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  type StyleProp,
  Platform,
  Text,
  type TextStyle,
  TextInput,
  Image,
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
  | "ending_unlock"
  | "answer_correct"
  | "answer_incorrect"
  | "stage_start"
  | "stage_complete"
  | "event_join"
  | "event_step_pass"
  | "event_step_fail"
  | "event_complete"
  | "event_reward_claim";

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
    stageStarts: number;
    stageCompletions: number;
    stepFails: number;
    penalties: number;
    dropOffs: number;
    answersCorrect: number;
    answersIncorrect: number;
  };
  answerByErrorType?: Record<string, number>;
  answerByTactic?: Record<string, number>;
};

type PracticeStats = {
  answersCorrect: number;
  answersIncorrect: number;
  errorByType: Record<string, number>;
  wrongTacticByType: Record<string, number>;
};
type StageProgressSummary = {
  stageIdx: number;
  durationSec: number;
  forgivenErrorByType: Record<string, number>;
  tacticUsage: Record<BranchId, number>;
  narrative: string;
};
type QuestFinalSummary = {
  endingRoute: string;
  endingTitle: string;
  story: string;
  achievementId: string;
  achievementTitle: string;
  achievementDetails: string;
  achievementIcon: string;
};
type MapCatalogTab = "recommended" | "quests" | "courses" | "all" | "completed";
type StoryRunStatus = "not_started" | "in_progress" | "completed";
type ExtendedNarrativeEndingId =
  | "narcissist_free_dawn"
  | "narcissist_living_union"
  | "narcissist_clear_contract"
  | "narcissist_pause_rebuild"
  | "narcissist_thin_ice"
  | "narcissist_golden_cage"
  | "narcissist_fog_relapse"
  | "narcissist_burned_heart"
  | "romance_garden_of_two"
  | "romance_quiet_harbor"
  | "romance_gentle_goodbye"
  | "romance_new_rhythm"
  | "romance_fragile_bridge"
  | "romance_tired_together"
  | "romance_storm_loop"
  | "romance_red_night";

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
  phase?: "prefs" | "hook" | "tightening" | "sugar" | "abuse" | "breakup";
  acceptAny?: boolean;
  scene: string;
  instruction: string;
  options?: string[];
  correctSingle?: number;
  correctMultiple?: number[];
  tokenBank?: string[];
  targetBuilder?: string[];
  branchEffects?: Record<number, BranchId>;
  optionNpcReactionByIndex?: Record<number, string>;
  sceneByBranch?: Record<BranchId, string>;
  endingHint?: string;
  skillSignals?: string[];
  sceneEmoji?: string;
  dispositionText?: string;
  opponentName?: string;
  opponentSpeech?: string;
  opponentAvatar?: string;
  hint: string;
  reward: number;
  image: IllustrationName;
};
type QuestDifficulty = 5 | 10 | 15 | 25 | 125;
type QuestStory =
  | "forest"
  | "romance"
  | "slytherin"
  | "boss"
  | "narcissist"
  | "sherlock-gaslighter"
  | "cinderella-advocate"
  | "healer-empathy"
  | "partisan-hq"
  | "stop-crane-train-18plus"
  | "first-word-forest"
  | "dragon-ultimatum"
  | "castle-boundaries"
  | "gryffindor_common_room"
  | "ravenclaw_common_room"
  | "hufflepuff_common_room";
type ProfileGender = "female" | "male";
type CharacterGender = "female" | "male" | "neutral";
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
type QuestRatingSummary = {
  sum: number;
  count: number;
};
type QuestRatingStats = Record<QuestStory, QuestRatingSummary>;
type EventProgress = {
  eventId: string;
  joined: boolean;
  started: boolean;
  finished: boolean;
  rewardClaimed: boolean;
  currentStep: number;
  completedStepIds: string[];
  xpEarned: number;
  energyEarned: number;
  errors: number;
  penalties: number;
};
type ConflictStyleId = "competitive" | "avoiding" | "accommodating" | "passive_aggressive" | "constructive";
type UserProfile = {
  displayName: string;
  avatarUri: string | null;
  gender: ProfileGender;
  isAdult18Plus: boolean;
  profileSetupDone: boolean;
  aboutMe: string;
  friendEmails: string[];
  xp: number;
  energy: number;
  completedCount: number;
  lastFeedback: string;
  selectedQuestId: string;
  eventProgress: EventProgress;
  selectedDifficulty: QuestDifficulty;
  selectedStory: QuestStory;
  startedStoryIds: QuestStory[];
  activeTab: Tab;
  conflictPrimaryStyle: ConflictStyleId;
  conflictSecondaryStyles: ConflictStyleId[];
  diagnosticCompleted: boolean;
  selectedCourseId: CourseId;
  activeProgramMode: ProgramMode;
  unlockedEndings: string[];
  unlockedAchievements: string[];
  practiceStats: PracticeStats;
  questRatingStats: QuestRatingStats;
  soundEnabled: boolean;
  claimedDailyEnergyAt: string | null;
  welcomeEnergyGranted: boolean;
  grantedPerfectStageIds: string[];
  redeemedPromoCodes: string[];
  referralInvitesCompleted: number;
  unlockedPaidStageKeys: string[];
  energyTransfersSentToday: number;
  energyTransfersSentWeek: number;
  lastEnergyTransferAt: string | null;
  lastSeenAt: string | null;
};
type RuntimeQuestProgressSnapshot = {
  activeProgramMode: ProgramMode;
  selectedStory: QuestStory;
  selectedCourseId: CourseId;
  selectedDifficulty: QuestDifficulty;
  forestStepIndex: number;
  forestStarted: boolean;
  forestFinished: boolean;
  updatedAt: string;
};
type UserRole = "USER" | "ADMIN";
type AuthUser = {
  email: string;
  password: string;
  role: UserRole;
  profile: UserProfile;
  analytics?: UserAnalytics;
};
type AuthStore = {
  users: Record<string, AuthUser>;
  currentEmail: string | null;
};
type AdminUserView = {
  email: string;
  role: UserRole;
  xp: number;
  energy: number;
  analytics: UserAnalytics;
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
const RUNTIME_QUEST_PROGRESS_KEY = "softale_runtime_quest_progress_v1";
const ANALYTICS_EVENTS_LIMIT = 400;
const ADMIN_EMAIL = "neolissa@gmail.com";
const ADMIN_PASSWORD = "neolissaAdmin1001001";
const USER_EMAIL = "napishipolinke@gmail.com";
const USER_PASSWORD = "userPolina1001001";
const ENERGY_WELCOME_BONUS = 120;
const ENERGY_DAILY_BONUS = 30;
const ENERGY_REFLECTION_BONUS = 10;
const ENERGY_PERFECT_STAGE_BONUS = 25;
const ENERGY_REFERRAL_BONUS = 60;
const ENERGY_REACTIVATION_7D_BONUS = 70;
const ENERGY_REACTIVATION_14D_BONUS = 120;
const ENERGY_REACTIVATION_30D_BONUS = 220;
const FREE_STAGES_PER_CAMPAIGN = 3;
const ENERGY_TRANSFER_MIN = 10;
const ENERGY_TRANSFER_DAILY_LIMIT = 50;
const ENERGY_TRANSFER_WEEKLY_LIMIT = 200;

type PromoCampaign = {
  code: string;
  energy: number;
  expiresAt: string;
  maxActivations: number;
};

const promoCampaigns: PromoCampaign[] = [
  { code: "SOFTALE-START", energy: 40, expiresAt: "2026-12-31T23:59:59.000Z", maxActivations: 1 },
  { code: "RETURN-BOOST", energy: 80, expiresAt: "2026-09-01T00:00:00.000Z", maxActivations: 1 },
];

function createSeedUsers(nowIso: string): Record<string, AuthUser> {
  return {
    [ADMIN_EMAIL]: {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      role: "ADMIN",
      profile: buildDefaultProfile(),
      analytics: buildDefaultAnalytics(nowIso),
    },
    [USER_EMAIL]: {
      email: USER_EMAIL,
      password: USER_PASSWORD,
      role: "USER",
      profile: buildDefaultProfile(),
      analytics: buildDefaultAnalytics(nowIso),
    },
  };
}

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
      stageStarts: 0,
      stageCompletions: 0,
      stepFails: 0,
      penalties: 0,
      dropOffs: 0,
      answersCorrect: 0,
      answersIncorrect: 0,
    },
    answerByErrorType: {},
    answerByTactic: {},
  };
}

function buildDefaultPracticeStats(): PracticeStats {
  return {
    answersCorrect: 0,
    answersIncorrect: 0,
    errorByType: {},
    wrongTacticByType: {},
  };
}

function buildDefaultQuestRatingStats(): QuestRatingStats {
  return {
    forest: { sum: 0, count: 0 },
    romance: { sum: 0, count: 0 },
    slytherin: { sum: 0, count: 0 },
    boss: { sum: 0, count: 0 },
    narcissist: { sum: 0, count: 0 },
    "sherlock-gaslighter": { sum: 0, count: 0 },
    "cinderella-advocate": { sum: 0, count: 0 },
    "healer-empathy": { sum: 0, count: 0 },
    "partisan-hq": { sum: 0, count: 0 },
    "stop-crane-train-18plus": { sum: 0, count: 0 },
    "first-word-forest": { sum: 0, count: 0 },
    "dragon-ultimatum": { sum: 0, count: 0 },
    "castle-boundaries": { sum: 0, count: 0 },
    gryffindor_common_room: { sum: 0, count: 0 },
    ravenclaw_common_room: { sum: 0, count: 0 },
    hufflepuff_common_room: { sum: 0, count: 0 },
  };
}

function buildDefaultEventProgress(): EventProgress {
  return {
    eventId: seasonalEventMvp.id,
    joined: false,
    started: false,
    finished: false,
    rewardClaimed: false,
    currentStep: 0,
    completedStepIds: [],
    xpEarned: 0,
    energyEarned: 0,
    errors: 0,
    penalties: 0,
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
    lore: "В этой крепости проверяют не силу голоса, а силу спины. Каждое «ладно» здесь стоит дорого, а каждое честное «мне так не подходит» возвращает тебе опору.",
    focus: "Говорить ясно и спокойно, когда хочется исчезнуть или сорваться, и удерживать уважение к себе без войны.",
    features: ["Короткие фразы, которые мягко останавливают давление", "Сцены, где нужно выбрать себя без чувства вины", "Тренировка уверенного «нет» в живых диалогах"],
    recommendedFor: ["avoiding", "accommodating"],
    preferredQuestions: 10,
  },
  {
    id: "serpentine-diplomat",
    title: "Кулуарная дипломатия",
    lore: "Под сводами подземелий каждое слово пахнет интригой. Ты входишь в круг, где улыбка может быть ловушкой, а молчание - приговором.",
    focus: "Превращать ядовитые выпады в хладнокровные договоренности и удерживать влияние без унижения собеседника.",
    features: ["Темное академическое фэнтези с жесткими развилками", "Каждый выбор меняет баланс статуса и доверия", "Длинная арка о власти, риске и цене решений"],
    recommendedFor: ["passive_aggressive", "competitive"],
    preferredQuestions: 25,
  },
  {
    id: "heart-lines",
    title: "Линии сердца",
    lore: "Ночной город не про сказки, а про зрелость. Здесь близость рождается из честности: ты слышишь другого, но не теряешь себя.",
    focus: "Проходить сложные разговоры в отношениях так, чтобы оставались и тепло, и границы.",
    features: ["Фразы близости без самоотмены", "Разбор ревности, боли и ожиданий без драмы", "Выборы, от которых реально меняется доверие"],
    recommendedFor: ["accommodating", "avoiding"],
    preferredQuestions: 10,
  },
  {
    id: "mirror-of-truth",
    title: "Зеркало правды",
    lore: "Здесь не получится спрятаться за привычные роли. Каждая реплика отражает тебя точнее, чем любое зеркало: кто ты в давлении, когда уже не до красивых слов.",
    focus: "Сохранять ясность под высоким напряжением и выбирать решения, за которые себе не стыдно.",
    features: ["Острые развилки: ультиматумы, обесценивание, шантаж", "Тонкая работа с внутренними триггерами в реальном времени", "Финалы, где последствия чувствуются телом, а не цифрами"],
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
    scene: "Эпизод 1/35. Для начала: что тебя обычно цепляет в людях сильнее всего?",
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
    scene: "Эпизод 2/35. Какой темп сближения для тебя комфортнее?",
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
    scene: "Эпизод 3/35. Как ты чаще чувствуешь любовь? Выбери 2 пункта.",
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
    scene: "Эпизод 4/35. Что для тебя самый тревожный сигнал в начале общения?",
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
    scene: "Эпизод 5/35. Где тебе особенно важно держать границу?",
    instruction: "Выбери одну сферу.",
    options: ["Личное время", "Финансы", "Общение с друзьями", "Физический контакт"],
    hint: "Отлично, профиль предпочтений собран.",
    reward: 6,
    image: "shield-account-outline",
  },
  // 6-10: знакомство
  {
    id: "n-06-hook-meet",
    title: "Знакомство • Наглый старт в кафе",
    phase: "hook",
    type: "single",
    scene: "Эпизод 6/35. В кафе к тебе подсаживается обаятельный незнакомец и начинает с хамского «комплимента»: «Ты милая, если молчишь».",
    instruction: "Какой ответ держит достоинство и не разжигает конфликт?",
    options: [
      "«Сам заткнись, клоун»",
      "«Мне такой тон не подходит. Если хочешь общаться — уважительно»",
      "«Ой, да ладно, я не обижаюсь»",
      "«Ха-ха, говори что угодно, только не уходи»",
    ],
    correctSingle: 1,
    hint: "Спокойная граница лучше, чем встречная агрессия.",
    reward: 9,
    image: "coffee-outline",
  },
  {
    id: "n-07-hook-negging",
    title: "Знакомство • Хамские комплименты",
    phase: "hook",
    type: "multiple",
    scene: "Эпизод 7/35. Он продолжает «шутить» про внешность и характер. Выбери 2 здоровые реакции.",
    instruction: "Выбери ровно 2.",
    options: [
      "«Такие “шутки” для меня не ок»",
      "«Продолжай, мне даже нравится»",
      "«Если хочешь диалог — без унижения»",
      "«Сейчас докажу, что ты хуже меня»",
      "«Ладно, потерплю, лишь бы не испортить вечер»",
    ],
    correctMultiple: [0, 2],
    hint: "Проверяй не харизму, а уважение в тоне.",
    reward: 9,
    image: "emoticon-confused-outline",
  },
  {
    id: "n-08-hook-bill",
    title: "Знакомство • Счёт пополам",
    phase: "hook",
    type: "single",
    scene: "Эпизод 8/35. После инициативного приглашения он резко говорит: «Плати пополам. Я так проверяю девушек».",
    instruction: "Как ответить без оправданий и без ссоры?",
    options: [
      "«Конечно, как скажешь, только не злись»",
      "«Оплатить пополам можно, но формат “проверок” мне не подходит»",
      "«Ты нищий и смешной»",
      "«Тогда плати полностью, иначе ты никто»",
    ],
    correctSingle: 1,
    hint: "Можно обсуждать деньги, но не принимать унизительную рамку.",
    reward: 10,
    image: "cash-remove",
  },
  {
    id: "n-09-hook-phone-demand",
    title: "Знакомство • Требование номера",
    phase: "hook",
    type: "builder",
    scene: "Эпизод 9/35. Он требует номер телефона приказным тоном: «Диктуй сейчас». Собери ответ с границей.",
    instruction: "Собери фразу из слов. Есть лишние слова.",
    tokenBank: [
      "Я", "даю", "номер", "только", "когда", "сама", "этого", "хочу.", "В", "таком", "тоне", "контакт", "не", "продолжаю.",
      "быстро", "должна", "срочно", "подчиняйся"
    ],
    targetBuilder: [
      "Я", "даю", "номер", "только", "когда", "сама", "этого", "хочу.", "В", "таком", "тоне", "контакт", "не", "продолжаю."
    ],
    hint: "Номер — это твоя личная граница, не обязанность.",
    reward: 11,
    image: "cellphone-lock",
  },
  {
    id: "n-10-hook-phone-grab",
    title: "Знакомство • Захват телефона",
    phase: "hook",
    type: "single",
    scene: "Эпизод 10/35. После отказа он хватает твой телефон и пытается набрать себе. Что делать первым шагом?",
    instruction: "Выбери самый безопасный и взрослый ответ.",
    options: [
      "«Ладно, раз начал — пусть берёт номер»",
      "«Верни телефон. Это нарушение границ. Я прекращаю общение и ухожу в безопасное место»",
      "«Сейчас вырву у тебя телефон и ударю»",
      "«Промолчу, чтобы не накалять»",
    ],
    correctSingle: 1,
    hint: "При физическом нарушении границ приоритет — безопасность и дистанция.",
    reward: 12,
    image: "alert-octagon-outline",
  },
  // 11-15: сближение и затягивание удавки
  {
    id: "n-11-tight-call",
    title: "Сближение • Внезапный ночной звонок",
    phase: "tightening",
    type: "single",
    scene: "Эпизод 11/35. Ночью звонок: «Почему не отвечаешь сразу? Докажи, что ты со мной».",
    instruction: "Выбери устойчивый ответ без оправдательной позиции.",
    options: [
      "«Прости, я всегда должна быть на связи»",
      "«Я отвечаю, когда могу. Контроль 24/7 для меня неприемлем»",
      "«Сейчас заблокирую тебя навсегда, псих»",
      "«Ок, можешь звонить в любое время»",
    ],
    correctSingle: 1,
    hint: "Доступность не равна любви. Граница по времени — норма.",
    reward: 12,
    image: "phone-alert-outline",
  },
  {
    id: "n-12-tight-stalking",
    title: "Сближение • Сталкерство",
    phase: "tightening",
    type: "multiple",
    scene: "Эпизод 12/35. Он «случайно» появляется у твоего дома и работы. Выбери 2 безопасных шага.",
    instruction: "Выбери ровно 2.",
    options: [
      "Зафиксировать эпизоды и рассказать доверенному человеку",
      "Считать это романтикой и ничего не менять",
      "Снизить доступ к личной информации и маршрутам",
      "Проверить его ревностью в ответ",
      "Пойти на встречу в одиночку, чтобы “спокойно всё уладить”",
    ],
    correctMultiple: [0, 2],
    hint: "Сталкерство — это риск, а не знак любви.",
    reward: 13,
    image: "map-marker-alert-outline",
  },
  {
    id: "n-13-tight-lovebomb",
    title: "Сближение • Лавбомбинг",
    phase: "tightening",
    type: "single",
    scene: "Эпизод 13/35. После конфликта — поток сообщений «ты единственная, без тебя я никто».",
    instruction: "Как ответить, не возвращаясь в качели?",
    options: [
      "«Ладно, всё прощаю, только не страдай»",
      "«Слышу эмоции. Вернусь к разговору, когда будет спокойный и уважительный формат»",
      "«Ты жалкий манипулятор»",
      "«Давай снова как раньше, но тайно»",
    ],
    correctSingle: 1,
    hint: "Эмпатия возможна без отмены собственных границ.",
    reward: 13,
    image: "heart-multiple-outline",
  },
  {
    id: "n-14-tight-gifts",
    title: "Сближение • Шикарные подарки",
    phase: "tightening",
    type: "single",
    scene: "Эпизод 14/35. Он дарит дорогой подарок и ожидает «лояльность в ответ».",
    instruction: "Выбери зрелую реакцию.",
    options: [
      "«Раз подарил, теперь я тебе обязана»",
      "«Подарок не даёт права на контроль. Решения о близости я принимаю сама»",
      "«Твой подарок дешёвка, забери»",
      "«Оставлю подарок и исчезну»",
    ],
    correctSingle: 1,
    hint: "Подарок — не контракт на подчинение.",
    reward: 13,
    image: "gift-open-outline",
  },
  {
    id: "n-15-tight-live-together",
    title: "Сближение • «Переезжай ко мне»",
    phase: "tightening",
    type: "single",
    scene: "Эпизод 15/35. После краткого знакомства он настаивает: «Переезжай сейчас, иначе ты несерьёзна».",
    instruction: "Какой ответ сохраняет и контакт, и опору на себя?",
    options: [
      "«Хорошо, перееду сегодня, чтобы не потерять тебя»",
      "«Я не принимаю решения под давлением. К совместной жизни можно прийти только по взаимному согласию и в моём темпе»",
      "«Никогда, ты мне противен»",
      "«Сначала подпиши, что всё имущество моё»",
    ],
    correctSingle: 1,
    hint: "Важные решения принимаются в темпе безопасности, не под ультиматумом.",
    reward: 14,
    image: "home-heart",
  },
  // 16-20: sugar show
  {
    id: "n-06",
    title: "Сахарное шоу • Идеальный вечер",
    phase: "sugar",
    type: "single",
    scene: "Эпизод 16/35. Новый партнер(ша) говорит: «Ты — моя судьба, я никогда такого не чувствовал(а)».",
    instruction: "Выбери самый здоровый ответ на слишком быстрый накал.",
    options: [
      "«Я тоже! Давай сразу съедемся»",
      "«Мне приятно это слышать. Я хочу двигаться в комфортном темпе»",
      "«Докажи сначала подарками»",
      "«Ты уже зависишь от меня»",
    ],
    correctSingle: 1,
    hint: "Сохрани тепло, но сразу обозначь комфортный темп.",
    reward: 10,
    image: "heart-flash",
  },
  {
    id: "n-07",
    title: "Сахарное шоу • Поток комплиментов",
    phase: "sugar",
    type: "multiple",
    scene: "Эпизод 17/35. Тебя заваливают вниманием и обещаниями. Выбери 2 устойчивые реакции.",
    instruction: "Выбери ровно 2.",
    options: [
      "«Мне важно время, чтобы узнать друг друга»",
      "«Раз так любишь — удаляй всех друзей ради меня»",
      "«Давай проверим совместимость в реальных ситуациях»",
      "«Ок, я отменю планы, будь только рядом»",
      "«Тогда ты должен(на) быть рядом 24/7»",
    ],
    correctMultiple: [0, 2],
    hint: "Держись реальности: эмоции важны, но границы важнее.",
    reward: 10,
    image: "gift-outline",
  },
  {
    id: "n-08",
    title: "Сахарное шоу • Сборка ответа",
    phase: "sugar",
    type: "builder",
    scene: "Эпизод 18/35. Партнер(ша) давит на быстрое сближение. Собери мягкий, но ясный ответ.",
    instruction: "Собери фразу из слов. Есть дистракторы.",
    tokenBank: [
      "Мне", "очень", "приятно", "твое", "внимание,", "и", "я", "хочу", "развивать", "отношения", "постепенно,", "без", "спешки.",
      "Давай", "узнавать", "друг", "друга", "в", "реальной", "жизни.", "немедленно", "всегда", "навсегда"
    ],
    targetBuilder: [
      "Мне", "очень", "приятно", "твое", "внимание,", "и", "я", "хочу", "развивать", "отношения", "постепенно,", "без", "спешки.",
      "Давай", "узнавать", "друг", "друга", "в", "реальной", "жизни."
    ],
    hint: "Поблагодари, задай темп и назови конкретный следующий шаг.",
    reward: 11,
    image: "message-alert-outline",
  },
  {
    id: "n-09",
    title: "Сахарное шоу • Большие обещания",
    phase: "sugar",
    type: "single",
    scene: "Эпизод 19/35. Через неделю тебе обещают «лучшее будущее», если ты «доверишься полностью».",
    instruction: "Какой ответ самый зрелый?",
    options: [
      "«Супер, я готов(а) на всё»",
      "«Мне важны поступки в настоящем, а не только обещания»",
      "«Тогда ты обязан(а) оплатить мои расходы»",
      "«Я проверю тебя провокациями»",
    ],
    correctSingle: 1,
    hint: "Оценивай по действиям, а не по красивым обещаниям.",
    reward: 10,
    image: "crystal-ball",
  },
  {
    id: "n-10",
    title: "Сахарное шоу • Соцсети",
    phase: "sugar",
    type: "multiple",
    scene: "Эпизод 20/35. Тебя просят демонстративно показать отношения в соцсетях «в доказательство чувств».",
    instruction: "Выбери 2 корректные реакции.",
    options: [
      "«Мне важно решать это в своем темпе, без давления»",
      "«Ок, выложу всё, только не обижайся»",
      "«Чувства не измеряются публичностью, давай обсудим границы»",
      "«Тогда и ты публикуй отчёт каждый час»",
      "«Сделаю, чтобы тебя не потерять»",
    ],
    correctMultiple: [0, 2],
    hint: "Чувства не нужно доказывать под давлением.",
    reward: 10,
    image: "instagram",
  },
  // 21-30: abuse arc
  {
    id: "n-11",
    title: "Абьюз • Первое обесценивание",
    phase: "abuse",
    type: "single",
    scene: "Эпизод 21/35. Твой успех называют «случайностью».",
    instruction: "Выбери ответ с самоуважением.",
    options: [
      "«Наверное, ты прав(а), мне просто повезло»",
      "«Мне неприятно это слышать. Я ценю свой труд и прошу без обесценивания»",
      "«Сейчас докажу, что ты ничтожество»",
      "«Ладно, пусть будет по-твоему»",
    ],
    correctSingle: 1,
    hint: "Назови чувство и сразу поставь ясную границу.",
    reward: 12,
    image: "alert-circle-outline",
  },
  {
    id: "n-12",
    title: "Абьюз • Изоляция",
    phase: "abuse",
    type: "multiple",
    scene: "Эпизод 22/35. Партнер(ша) просит реже общаться с друзьями «ради нас».",
    instruction: "Выбери 2 здоровые реакции.",
    options: [
      "«Мои друзья — часть моей жизни, и это не обсуждается в формате запрета»",
      "«Хорошо, удалю всех, лишь бы не ссориться»",
      "«Готов(а) договариваться о времени, но не о запрете контактов»",
      "«Тогда я тоже запрещу тебе общаться»",
      "«Я виноват(а), что у меня есть друзья»",
    ],
    correctMultiple: [0, 2],
    hint: "Покажи готовность к диалогу, но не к контролю.",
    reward: 12,
    image: "account-group-outline",
  },
  {
    id: "n-13",
    title: "Абьюз • Сдвиг реальности",
    phase: "abuse",
    type: "single",
    scene: "Эпизод 23/35. После ссоры тебе говорят: «Ты всё придумал(а), такого не было».",
    instruction: "Выбери устойчивый ответ на газлайтинг.",
    options: [
      "«Наверное, у меня правда плохая память»",
      "«Я доверяю своим ощущениям. Давай обсудим факты спокойно»",
      "«Тогда я тоже буду перекручивать всё»",
      "«Ладно, молчу»",
    ],
    correctSingle: 1,
    hint: "Опираться стоит на себя и проверяемые факты.",
    reward: 12,
    image: "head-cog-outline",
  },
  {
    id: "n-14",
    title: "Абьюз • Финансовое давление",
    phase: "abuse",
    type: "single",
    scene: "Эпизод 24/35. Тебя упрекают расходами и требуют полный контроль бюджета.",
    instruction: "Выбери зрелый ответ.",
    options: [
      "«Бери всё под контроль, как скажешь»",
      "«Я готов(а) к прозрачности, но не к тотальному контролю. Нужны равные правила»",
      "«Тогда и ты ничего не тратишь без моего разрешения»",
      "«Сделаю вид, что согласен(на), а сам(а) спрячу деньги»",
    ],
    correctSingle: 1,
    hint: "Ищи формат, где есть равные правила, а не власть одного.",
    reward: 12,
    image: "cash-multiple",
  },
  {
    id: "n-15",
    title: "Абьюз • Молчаливое наказание",
    phase: "abuse",
    type: "multiple",
    scene: "Эпизод 25/35. После конфликта партнёр(ша) игнорирует тебя днями.",
    instruction: "Выбери 2 здоровые реакции.",
    options: [
      "«Я готов(а) говорить, когда ты готов(а) к уважительному диалогу»",
      "«Буду писать 40 сообщений, пока не ответишь»",
      "«Мне важно обсуждать конфликты, а не наказывать молчанием»",
      "«Ок, тогда исчезну на неделю»",
      "«Я заслужил(а) это, буду терпеть»",
    ],
    correctMultiple: [0, 2],
    hint: "Не добивайся одобрения — обозначь правила контакта.",
    reward: 12,
    image: "message-alert-outline",
  },
  {
    id: "n-16",
    title: "Абьюз • Публичная колкость",
    phase: "abuse",
    type: "single",
    scene: "Эпизод 26/35. При друзьях тебя унижают «в шутку».",
    instruction: "Выбери ответ без эскалации и самоунижения.",
    options: [
      "«Хаха, да, я и правда жалкий(ая)»",
      "«Мне не ок такие шутки. Давай без унижения»",
      "«Сейчас я тебя размажу в ответ»",
      "«Сделаю вид, что ничего не было»",
    ],
    correctSingle: 1,
    hint: "Скажи коротко, прямо и без самоунижения.",
    reward: 13,
    image: "microphone-message",
  },
  {
    id: "n-17",
    title: "Абьюз • Проверка телефона",
    phase: "abuse",
    type: "single",
    scene: "Эпизод 27/35. Требуют доступ к твоему телефону «если нечего скрывать».",
    instruction: "Выбери границу, не скатываясь в агрессию.",
    options: [
      "«Держи пароль, только не сердись»",
      "«Личное пространство обязательно. Доверие строится иначе»",
      "«Тогда и я взломаю твой телефон»",
      "«Удалю всех, чтобы не было повода»",
    ],
    correctSingle: 1,
    hint: "Личное пространство — нормальная часть доверия.",
    reward: 13,
    image: "cellphone-lock",
  },
  {
    id: "n-18",
    title: "Абьюз • Сборка границы",
    phase: "abuse",
    type: "builder",
    scene: "Эпизод 28/35. Собери реплику, которая останавливает давление и задаёт формат диалога.",
    instruction: "Собери фразу из слов. Есть лишние слова.",
    tokenBank: [
      "Я", "готов(а)", "обсуждать", "наши", "сложности,", "но", "без", "оскорблений", "и", "давления.", "Если",
      "это", "повторится,", "я", "завершу", "разговор", "до", "спокойного", "тона.", "виноват(а)", "терпи", "всегда"
    ],
    targetBuilder: [
      "Я", "готов(а)", "обсуждать", "наши", "сложности,", "но", "без", "оскорблений", "и", "давления.", "Если",
      "это", "повторится,", "я", "завершу", "разговор", "до", "спокойного", "тона."
    ],
    hint: "Держи формулу: диалог + правило + понятное последствие.",
    reward: 14,
    image: "message-lock-outline",
  },
  {
    id: "n-19",
    title: "Абьюз • Карусель вины",
    phase: "abuse",
    type: "single",
    scene: "Эпизод 29/35. Тебе говорят: «Если бы любил(а), ты бы терпел(а)».",
    instruction: "Выбери ответ с самоуважением.",
    options: [
      "«Ладно, буду терпеть ради любви»",
      "«Любовь не требует терпеть унижение. Мне нужен уважительный формат»",
      "«Тогда я тоже начну давить на тебя»",
      "«Наверное, я правда плохой(ая)»",
    ],
    correctSingle: 1,
    hint: "Где начинается давление, там заканчивается здоровая близость.",
    reward: 13,
    image: "heart-off-outline",
  },
  {
    id: "n-20",
    title: "Абьюз • Точка решения",
    phase: "abuse",
    type: "multiple",
    scene: "Эпизод 30/35. Давление повторяется. Какие 2 шага безопаснее всего?",
    instruction: "Выбери 2 варианта.",
    options: [
      "Зафиксировать факты и обратиться за поддержкой к близкому/специалисту",
      "Сделать вид, что всё нормально, и ждать чуда",
      "Определить личный план границ и выхода из цикла",
      "Проверить партнёра ревностью в ответ",
      "Изолироваться от всех, чтобы «не позориться»",
    ],
    correctMultiple: [0, 2],
    hint: "Выбирай шаги, которые дают опору: факты, поддержка, план.",
    reward: 14,
    image: "map-marker-path",
  },
  // 31-35: breakup
  {
    id: "n-21",
    title: "Расставание • Подготовка",
    phase: "breakup",
    type: "single",
    scene: "Эпизод 31/35. Ты решаешь завершить отношения.",
    instruction: "Выбери первый шаг, который повышает твою устойчивость.",
    options: [
      "Объявить резко в момент сильной ссоры",
      "Подготовить поддержку, план безопасности и нейтральное место разговора",
      "Сначала спровоцировать конфликт, чтобы легче уйти",
      "Исчезнуть без объяснения и блокировать всех",
    ],
    correctSingle: 1,
    hint: "Хорошая подготовка заметно снижает риск хаоса.",
    reward: 14,
    image: "clipboard-check-outline",
  },
  {
    id: "n-22",
    title: "Расставание • Текст границы",
    phase: "breakup",
    type: "builder",
    scene: "Эпизод 32/35. Собери уважительный и твёрдый текст о завершении отношений.",
    instruction: "Собери фразу из слов. Есть лишние слова.",
    tokenBank: [
      "Я", "принял(а)", "решение", "завершить", "наши", "отношения.", "Прошу", "уважать", "это", "и", "не", "писать",
      "мне", "личные", "сообщения.", "Желаю", "тебе", "хорошего.", "никогда", "ты", "ничто"
    ],
    targetBuilder: [
      "Я", "принял(а)", "решение", "завершить", "наши", "отношения.", "Прошу", "уважать", "это", "и", "не", "писать",
      "мне", "личные", "сообщения.", "Желаю", "тебе", "хорошего."
    ],
    hint: "Пиши ясно и коротко, без оправданий и обвинений.",
    reward: 15,
    image: "email-seal-outline",
  },
  {
    id: "n-23",
    title: "Расставание • Манипуляции после",
    phase: "breakup",
    type: "single",
    scene: "Эпизод 33/35. После расставания тебе пишут: «Без тебя я пропаду, это твоя ответственность».",
    instruction: "Выбери ответ, который не втягивает в старый цикл.",
    options: [
      "«Хорошо, вернусь, только не пиши так»",
      "«Сочувствую, но мое решение окончательное. Обратись за поддержкой к близким/специалисту»",
      "«Ты опять играешь, отстань»",
      "«Ладно, поговорим ночью как раньше»",
    ],
    correctSingle: 1,
    hint: "Сочувствие — да, возврат в зависимость — нет.",
    reward: 14,
    image: "message-minus-outline",
  },
  {
    id: "n-24",
    title: "Расставание • Возврат к себе",
    phase: "breakup",
    type: "multiple",
    scene: "Эпизод 34/35. Что помогает восстановиться экологично? Выбери 2 шага.",
    instruction: "Выбери ровно 2.",
    options: [
      "Вернуть режим сна, опору на тело и рутину",
      "Следить за соцсетями бывшего(ей) круглосуточно",
      "Вернуться к поддерживающим людям и терапии/коучингу",
      "Изолироваться и прокручивать переписки",
      "Начать новый роман в тот же день",
    ],
    correctMultiple: [0, 2],
    hint: "Восстановление начинается со стабилизации и поддержки.",
    reward: 14,
    image: "leaf-circle-outline",
  },
  {
    id: "n-25",
    title: "Расставание • Новые правила любви",
    phase: "breakup",
    type: "single",
    scene: "Эпизод 35/35. Финал: ты формулируешь новые личные правила отношений.",
    instruction: "Выбери правило, которое лучше защищает твоё будущее.",
    options: [
      "«Главное — сильные эмоции, остальное не важно»",
      "«Темп, взаимное уважение и границы важнее красивых обещаний»",
      "«Лучше вообще не доверять никому»",
      "«Терпение решает всё, даже унижение»",
    ],
    correctSingle: 1,
    hint: "Опирайся на три критерия: уважение, безопасность, взаимность.",
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
      title: "Кулуарная дипломатия • Без сарказма",
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
      title: "Кулуарная дипломатия • Чистая речь",
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
      title: "Кулуарная дипломатия • Холодная граница",
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
      image: "message-alert-outline",
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

const extendedEndingMetaById: Record<ExtendedNarrativeEndingId, { label: string; icon: string; story: string }> = {
  narcissist_free_dawn: { label: "Свободный рассвет", icon: "🌅", story: "Ты выбираешь себя и завершаешь связь спокойно, без мести и без самообмана. Разрыв становится зрелым действием и возвращает тебе опору." },
  narcissist_living_union: { label: "Живой союз", icon: "💎", story: "Вы перестраиваете отношения в зрелый формат: границы ясны, давление не работает, тепло сохраняется без подчинения." },
  narcissist_clear_contract: { label: "Чистый договор", icon: "🧾", story: "Вы фиксируете рабочие правила и красные линии. Меньше тумана и качелей, больше ясности и ответственности." },
  narcissist_pause_rebuild: { label: "Пауза на сборку", icon: "🧭", story: "Вы берете дистанцию без взаимного разрушения. Это осознанная пауза, чтобы проверить, возможен ли новый формат." },
  narcissist_thin_ice: { label: "Тонкий лед", icon: "🪞", story: "Манипуляции распознаны, но не обезврежены до конца. Контакт держится, однако остается хрупким и нестабильным." },
  narcissist_golden_cage: { label: "Золотая клетка", icon: "⛓️", story: "Внешне связь сохраняется, но ее цена - постоянные уступки себе. Контроль и вина становятся привычным фоном." },
  narcissist_fog_relapse: { label: "Откат в туман", icon: "🌫️", story: "Ты временами держишь позицию, но в кризисе сдаешь ее из страха потери. Старый цикл снова берет верх." },
  narcissist_burned_heart: { label: "Выжженное сердце", icon: "🕳️", story: "Изоляция, обесценивание и качели доходят до предела. Разрыв случается в точке истощения, после тяжелого эмоционального отката." },
  romance_garden_of_two: { label: "Сад двоих", icon: "🌷", story: "Вы удерживаете и страсть, и уважение. Конфликт становится инструментом настройки, а не полем взаимных ранений." },
  romance_quiet_harbor: { label: "Тихая гавань", icon: "⚓", story: "Вы снижаете накал, учитесь останавливаться и возвращаться к диалогу. Связь становится надежнее и спокойнее." },
  romance_gentle_goodbye: { label: "Бережный разрыв", icon: "🕊️", story: "Вы честно признаете несовпадение темпа и ценностей и мягко завершаете историю. Иногда это самый бережный выбор." },
  romance_new_rhythm: { label: "Новый ритм", icon: "🎼", story: "После паузы вы пересобираете связь в новом формате: меньше тестов на лояльность, больше ясных договоренностей." },
  romance_fragile_bridge: { label: "Хрупкий мост", icon: "🫧", story: "Тепло есть, но в стрессе всплывают старые паттерны. Мост держится, однако требует постоянного ремонта." },
  romance_tired_together: { label: "Усталое рядом", icon: "💔", story: "Вы остаетесь вместе из страха потери. Близость становится поверхностной, а обиды медленно вытесняют живой контакт." },
  romance_storm_loop: { label: "Штормовая петля", icon: "🌪️", story: "Ссоры и примирения ходят по кругу, не приводя к изменениям. Эмоций много, устойчивости мало." },
  romance_red_night: { label: "Красная ночь", icon: "🩸", story: "История уходит в тяжелый разрыв на пике боли. Этот финал останавливает взаимное разрушение, но оставляет глубокий след." },
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
  narcissist: { title: "Влюбись в нарцисса", setting: "в зеркальном дворце обещаний и иллюзий", tone: "психологического триллера", icon: "heart-flash" },
  "sherlock-gaslighter": { title: "Шерлок против Лжеца", setting: "в городе пропавших улик и подмены фактов", tone: "детективно-психологическом", icon: "magnify-scan" },
  "cinderella-advocate": { title: "Проклятие хрустальной туфельки", setting: "в доме вежливых уколов и семейного давления", tone: "сказочно-психологическом", icon: "shoe-formal" },
  "healer-empathy": { title: "Лекарь, исцели себя", setting: "в пространстве чужой боли и личной опоры", tone: "тихо-сильном", icon: "medical-bag" },
  "partisan-hq": { title: "Тайный штаб сопротивления", setting: "в подпольном штабе и режиме высоких ставок", tone: "напряженно-стратегическом", icon: "compass-outline" },
  "stop-crane-train-18plus": { title: "Машинист опаздывающего поезда", setting: "в ночном рейсе моральных развилок", tone: "этической драмы 18+", icon: "train" },
  "first-word-forest": { title: "Чистый лист", setting: "в запретном лесу первых слов", tone: "бережного взросления", icon: "sprout-outline" },
  "dragon-ultimatum": { title: "Ультиматум Дракона", setting: "в зале огненных переговоров", tone: "эпического конфликта", icon: "fire-alert" },
  "castle-boundaries": { title: "Замок границ", setting: "в стенах традиций и скрытого давления", tone: "психологической драмы", icon: "castle" },
  gryffindor_common_room: { title: "Гостиная Гриффиндора", setting: "у алого камина, где спорят о лидерстве", tone: "огненно-соревновательном", icon: "fire-circle" },
  ravenclaw_common_room: { title: "Гостиная Когтеврана", setting: "под сводами библиотеки, где правят аргументы", tone: "холодно-интеллектуальном", icon: "book-open-page-variant-outline" },
  hufflepuff_common_room: { title: "Гостиная Пуффендуя", setting: "в теплой комнате, где избегают острых тем", tone: "мягко-напряженном", icon: "flower-outline" },
  "office-icebreaker": { title: "Ледокол переговоров", setting: "на ледяном флоте переговоров", tone: "лидерского приключения", icon: "ferry" },
  "boundary-keeper": { title: "Хранитель границ", setting: "в каменной крепости личных клятв", tone: "героического взросления", icon: "shield-outline" },
  "serpentine-diplomat": { title: "Кулуарная дипломатия", setting: "в лабиринте власти, слухов и альянсов", tone: "интриги и высокого риска", icon: "scale-balance" },
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
  "sherlock-gaslighter": {
    beats: [
      "Ты входишь в дело, где уверенный тон пытается заменить доказательства.",
      "Версии множатся, а факты намеренно размывают эмоциональным давлением.",
      "Перелом: ты возвращаешь спор к проверяемой хронологии.",
      "Финальный рывок: точные вопросы вскрывают подмены и противоречия.",
      "Развязка: правда фиксируется на данных, а не на громкости.",
    ],
    finale: "Ты закрываешь дело с ясной головой: факт сильнее внушения.",
  },
  "cinderella-advocate": {
    beats: [
      "Ты замечаешь, как заботу превращают в инструмент вины.",
      "Обострение: тебя снова подталкивают к роли удобной и молчаливой.",
      "Перелом: ты говоришь честно и без самообвинения.",
      "Финальный рывок: старый сценарий «терпи и улыбайся» больше не работает.",
      "Развязка: уважение к себе становится новой нормой контакта.",
    ],
    finale: "Ты выходишь из сказки с живым голосом и устойчивыми границами.",
  },
  "healer-empathy": {
    beats: [
      "Ты входишь в арку, где эмпатию путают с обязанностью спасать всех.",
      "Давление растет: тебе предлагают отдать ресурс без остатка.",
      "Перелом: помощь отделяется от самопожертвования.",
      "Финальный рывок: ты удерживаешь участие и собственную опору одновременно.",
      "Развязка: забота становится зрелой - о других и о себе.",
    ],
    finale: "Ты завершаешь путь Лекаря с новой формулой: тепло плюс границы.",
  },
  "partisan-hq": {
    beats: [
      "Штаб собирается в режиме давления и недосказанности.",
      "Ошибки связи и страх провоцируют внутренние столкновения.",
      "Перелом: ты удерживаешь команду в живом рабочем контакте.",
      "Финальный рывок: цена каждого решения становится личной.",
      "Развязка: правила штаба укрепляются или рушатся.",
    ],
    finale: "Ты закрываешь миссию не хаосом, а дисциплиной и ясной ответственностью.",
  },
  "stop-crane-train-18plus": {
    beats: [
      "Рейс начинается с перегруза и дефицита времени.",
      "Давление графика конфликтует с критериями безопасности.",
      "Перелом: ошибки коммуникации уже нельзя игнорировать.",
      "Финальный рывок: узел вагонетки требует зрелого выбора.",
      "Развязка: ты принимаешь последствия и фиксируешь новый стандарт.",
    ],
    finale: "Ты выходишь из рейса взрослее: этика и ответственность теперь в одном контуре.",
  },
  "first-word-forest": {
    beats: [
      "Ты учишься начинать сложный разговор без панциря и самоатаки.",
      "Страх ошибки пытается снова увести в молчание.",
      "Перелом: ты выбираешь ясность вместо избегания.",
      "Финальный рывок: первое слово становится действием.",
      "Развязка: появляется устойчивый навык входа в диалог.",
    ],
    finale: "Ты выходишь с тихой силой: говорить первым уже не страшно.",
  },
  "dragon-ultimatum": {
    beats: [
      "Дракон задает ультимативный тон и проверяет тебя на подчинение.",
      "Обострение: уступка начинает стоить слишком дорого для системы.",
      "Перелом: ты переводишь конфликт в структурный формат переговоров.",
      "Финальный рывок: решается, кто формирует правила будущего.",
      "Развязка: итог зависит от зрелости твоей позиции.",
    ],
    finale: "Ты закрываешь огненный раунд с сильной рамкой, а не с красивой капитуляцией.",
  },
  "castle-boundaries": {
    beats: [
      "Традиции замка маскируют давление под заботу.",
      "Тебя зовут удобной, когда ты пытаешься быть честной.",
      "Перелом: ты обозначаешь границу без войны.",
      "Финальный рывок: выбор себя требует выдержки.",
      "Развязка: старые правила либо меняются, либо теряют власть.",
    ],
    finale: "Ты выходишь из замка с устойчивой самоценностью и рабочим языком границ.",
  },
  gryffindor_common_room: {
    beats: [
      "В Гриффиндоре колкость звучит как проверка на храбрость.",
      "Подколы становятся прямым давлением за право вести группу.",
      "Перелом: тебя провоцируют сорваться публично.",
      "Финальный рывок: лидерство решается в серии жестких диалогов.",
      "Развязка: команда принимает либо твою рамку, либо хаос.",
    ],
    finale: "Ты завершаешь арку с сильной позицией: лидерство без токсичности.",
  },
  ravenclaw_common_room: {
    beats: [
      "В Когтевране тебя встречают холодными комментариями и проверкой логики.",
      "Обострение: обесценивание прячут за рациональными формулами.",
      "Перелом: спор идет уже не о фактах, а о праве на голос.",
      "Финальный рывок: ты удерживаешь структуру под интеллектуальным нажимом.",
      "Развязка: в группе фиксируется зрелый формат дискуссии.",
    ],
    finale: "Ты выходишь из арки с четкой речью, границами и уважением к фактам.",
  },
  hufflepuff_common_room: {
    beats: [
      "В Пуффендуе дружелюбие часто подменяет честный разговор.",
      "Обострение: прямота воспринимается как угроза близости.",
      "Перелом: тебя зовут «удобной», а не конструктивной.",
      "Финальный рывок: нужно соединить эмпатию и ясную позицию.",
      "Развязка: группа учится не избегать конфликт, а проживать его бережно.",
    ],
    finale: "Ты фиксируешь новый стандарт: мягко по тону, твердо по сути.",
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
  "sherlock-gaslighter": "Свидетель",
  "cinderella-advocate": "Оппонентка",
  "healer-empathy": "Собеседница",
  "partisan-hq": "Куратор",
  "stop-crane-train-18plus": "Диспетчер",
  "first-word-forest": "Проводник",
  "dragon-ultimatum": "Дракон",
  "castle-boundaries": "Хозяйка замка",
  gryffindor_common_room: "Капитан факультета",
  ravenclaw_common_room: "Староста Когтеврана",
  hufflepuff_common_room: "Староста Пуффендуя",
  "office-icebreaker": "Настя",
  "boundary-keeper": "Собеседник",
  "serpentine-diplomat": "Префект",
  "heart-lines": "Партнер",
  "mirror-of-truth": "Собеседник",
};

const branchScaleUi: Record<BranchId, { label: string; color: string }> = {
  strategist: { label: "Структура и ясность", color: "#6EC1FF" },
  empath: { label: "Эмпатия и деэскалация", color: "#8EE6C4" },
  boundary: { label: "Границы и ассертивность", color: "#F2C879" },
  challenger: { label: "Решительность и прорыв", color: "#F88E8E" },
  architect: { label: "Системность и правила", color: "#B39DFF" },
};
const reactionColorByBranch: Record<BranchId, string> = {
  strategist: branchScaleUi.strategist.color,
  empath: branchScaleUi.empath.color,
  boundary: branchScaleUi.boundary.color,
  challenger: branchScaleUi.challenger.color,
  architect: branchScaleUi.architect.color,
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
    "«После этого эпизода закрепим правило, чтобы это не повторилось.»",
    "«Закрываем не только спор, но и дыру в процессе.»",
    "«Сразу решим: кто, когда и как поднимает эскалацию.»",
    "«Собираем систему, где такие сбои не становятся нормой.»",
    "«Нам нужна договоренность на будущее, не разовая победа.»",
    "«Сделаем прозрачные правила — и конфликтов станет меньше.»",
    "«Я за решение на дистанции, а не только на этот вечер.»",
    "«Закрепим рамки процесса, чтобы всем были понятны правила игры.»",
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
  order: `В кампании «${campaignLore[campaign].title}» ты собираешь хаос в работающую систему, и конфликт начинает служить результату.`,
  harmony: `В кампании «${campaignLore[campaign].title}» ты гасишь эскалацию, сохраняешь контакт и возвращаешь диалог в живой, безопасный ритм.`,
  boundary: `В кампании «${campaignLore[campaign].title}» ты удерживаешь уважение к себе и показываешь, что мягкая твердость работает даже под давлением.`,
  breakthrough: `В кампании «${campaignLore[campaign].title}» ты останавливаешь токсичный сценарий и разворачиваешь игру в свою пользу без разрушения себя.`,
});

type EndingPerformanceTier = "angel" | "good" | "normal" | "bad" | "harsh";

function detectEndingPerformanceTier(totalSteps: number, penalties: number, firstTrySuccessCount: number): EndingPerformanceTier {
  const safeTotal = Math.max(1, totalSteps);
  const firstTryRate = firstTrySuccessCount / safeTotal;
  if (penalties === 0 && firstTryRate >= 0.92) {
    return "angel";
  }
  if (penalties <= Math.max(1, Math.floor(safeTotal * 0.1)) && firstTryRate >= 0.72) {
    return "good";
  }
  if (penalties >= Math.ceil(safeTotal * 0.45) || firstTryRate < 0.25) {
    return "harsh";
  }
  if (penalties >= Math.ceil(safeTotal * 0.25) || firstTryRate < 0.5) {
    return "bad";
  }
  return "normal";
}

function buildFinalStoryByOutcome(
  campaign: CampaignId,
  route: EndingRouteId,
  dominantBranch: BranchId,
  tier: EndingPerformanceTier,
  penalties: number,
  xpEarned: number,
  overrideStory?: string
) {
  const tacticTextByBranch: Record<BranchId, string> = {
    strategist: "тактика Стратега: опора на проверяемые факты, хронологию и ясную структуру решений.",
    empath: "тактика Эмпата: удержание контакта, деэскалация и бережная работа с напряжением без потери сути.",
    boundary: "тактика Границ: спокойная твердость, отказ от давления и защита рамки диалога.",
    challenger: "тактика Прорыва: прямое называние манипуляций и перехват инициативы в критических узлах.",
    architect: "тактика Архитектора: сборка устойчивых правил, ролей и процедур, которые переживают кризис.",
  };
  const xpLine = `Получено XP за кампанию: ${Math.max(0, xpEarned)}.`;
  const tacticLine = `Выбранная тактика: ${tacticTextByBranch[dominantBranch]}`;
  if (overrideStory) {
    return `${xpLine} ${tacticLine} ${overrideStory}`;
  }
  const campaignName = campaignLore[campaign].title;
  if (campaign === "sherlock-gaslighter") {
    const sherlockByTier: Record<EndingPerformanceTier, string> = {
      angel: "Ты довела расследование до доказуемого финала: цепочка улик закрыта, манипуляции вскрыты, артефакт возвращен в фонд, а давление Доктора Лайтмана больше не работает.",
      good: "Ты удержала дело в фактах и не дала увести его в театр эмоций. Главные эпизоды доказаны, но часть контуров пришлось закрывать на пределе времени и ресурса.",
      normal: "Ты вышла к рабочему итогу, но не все уязвимости удалось закрыть. По делу есть результат, однако отдельные зоны останутся точкой риска для следующего раунда.",
      bad: "В решающих сценах инициатива уходила к оппоненту: ты видела подмену, но не везде смогла закрепить доказательства процедурно. Доктор Лайтман уходит без приговора, артефакт потерян, а в деле остаются только версии и сомнения.",
      harsh: "Эмоции и страх перехватили управление в ключевой момент. Ты уверена, что преступник был рядом, но доказательный контур развалился, артефакт утрачен, а финал расследования оказался трагически незавершенным.",
    };
    return `${xpLine} ${tacticLine} ${sherlockByTier[tier]}`;
  }
  const editorialEnding = editorialEndingByCampaignTier[campaign]?.[tier];
  if (editorialEnding) {
    return `${xpLine} ${tacticLine} ${editorialEnding}`;
  }
  const routeLine: Record<EndingRouteId, string> = {
    order: "В финале ты собираешь хаос в рабочую структуру и возвращаешь процесс в управляемый ритм.",
    harmony: "В финале ты сохраняешь контакт под давлением и удерживаешь диалог живым и конструктивным.",
    boundary: "В финале ты держишь самоуважение и не позволяешь продавить себя через страх, вину или стыд.",
    breakthrough: "В финале ты называешь манипуляции прямо и разворачиваешь конфликт в сторону взрослого решения.",
  };
  const fallbackByTier: Record<EndingPerformanceTier, string> = {
    angel: `В кампании «${campaignName}» ${routeLine[route]} Развязка устойчива: решение принято, последствия управляемы, новая норма закреплена.`,
    good: `В кампании «${campaignName}» ${routeLine[route]} Ты удержала ключевой контур, и финал завершился рабочими договоренностями.`,
    normal: `В кампании «${campaignName}» ${routeLine[route]} Итог рабочий, но хрупкий: часть узлов потребует дополнительного прохода.`,
    bad: `В кампании «${campaignName}» ты несколько раз отдала инициативу, и цена финала выросла. Развязка частичная: формально эпизод закрыт, но конфликтный след остался.`,
    harsh: `В кампании «${campaignName}» давление сорвало темп, и финал стал болезненным. Ты выходишь из арки с потерями и необходимостью собирать позицию заново.`,
  };
  return `${xpLine} ${tacticLine} ${fallbackByTier[tier]}`;
}

function resolveExtendedEndingForNarrativeCampaign(
  campaign: CampaignId,
  tier: EndingPerformanceTier,
  branchScore: Record<BranchId, number>,
  answerBucketUsage: [number, number, number, number, number]
): ExtendedNarrativeEndingId | null {
  if (campaign !== "narcissist" && campaign !== "romance") {
    return null;
  }
  const total = Math.max(1, answerBucketUsage.reduce((acc, value) => acc + value, 0));
  const ratioA1A3 = (answerBucketUsage[0] + answerBucketUsage[2]) / total;
  const ratioA5 = answerBucketUsage[4] / total;
  const ratioA2 = answerBucketUsage[1] / total;
  const topBranches = Object.entries(branchScore)
    .sort((a, b) => b[1] - a[1])
    .map(([branch]) => branch as BranchId);
  const top1 = topBranches[0] ?? "strategist";
  const top2 = topBranches[1] ?? "empath";

  if (campaign === "narcissist") {
    if (tier === "angel") return "narcissist_free_dawn";
    if (tier === "good" && ratioA5 >= 0.34 && (top1 === "architect" || top2 === "architect")) return "narcissist_living_union";
    if (tier === "good") return "narcissist_clear_contract";
    if (tier === "normal" && ratioA5 >= 0.2) return "narcissist_pause_rebuild";
    if (tier === "normal") return "narcissist_thin_ice";
    if (tier === "bad" && ratioA1A3 >= 0.5) return "narcissist_golden_cage";
    if (tier === "bad") return "narcissist_fog_relapse";
    return "narcissist_burned_heart";
  }

  if (tier === "angel") return "romance_garden_of_two";
  if (tier === "good" && ratioA5 >= 0.34) return "romance_quiet_harbor";
  if (tier === "good") return "romance_gentle_goodbye";
  if (tier === "normal" && ratioA2 >= 0.32) return "romance_fragile_bridge";
  if (tier === "normal") return "romance_new_rhythm";
  if (tier === "bad" && ratioA1A3 >= 0.5) return "romance_tired_together";
  if (tier === "bad") return "romance_storm_loop";
  return "romance_red_night";
}

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


function pickOpponentAvatar(opponentEmotion: string, replica: string, idx: number) {
  const text = `${opponentEmotion} ${replica}`.toLowerCase();
  if (text.includes("презр") || text.includes("усмех") || text.includes("насмеш")) return idx % 2 === 0 ? "😏" : "🙄";
  if (text.includes("зл") || text.includes("вспых") || text.includes("шип")) return idx % 2 === 0 ? "😠" : "🤬";
  if (text.includes("в упор") || text.includes("в лоб") || text.includes("дав")) return idx % 2 === 0 ? "🫵" : "👊";
  if (text.includes("обиж") || text.includes("боль") || text.includes("уязв")) return idx % 2 === 0 ? "🥺" : "😤";
  if (text.includes("скеп") || text.includes("щур") || text.includes("прищур")) return idx % 2 === 0 ? "🤨" : "🧐";
  if (text.includes("улыб") || text.includes("мягк")) return idx % 2 === 0 ? "🙂" : "😼";
  if (text.includes("устал") || text.includes("вздых")) return idx % 2 === 0 ? "😮‍💨" : "😒";
  const fallback = ["😐", "😑", "🫤", "😶", "😬", "🙃", "🫠", "🤔"];
  return fallback[idx % fallback.length];
}


type TacticalPool = {
  strategist: string[];
  empath: string[];
  boundary: string[];
  challenger: string[];
  architect: string[];
  toxic: string[];
};

const campaignTacticalPool: Record<CampaignId, TacticalPool> = {
  forest: {
    strategist: ["«Разворачиваем карту и режем маршрут по рискам.»", "«Сначала безопасный коридор, потом скорость.»", "«Фиксируем роли на этот отрезок и идём.»"],
    empath: ["«Слышу, что всех трясет. Стабилизируемся и двигаемся.»", "«Давайте без взаимных укусов, нам ещё выходить живыми.»", "«Признаю напряжение. Теперь — один общий шаг.»"],
    boundary: ["«На личности не идём. Говорим по маршруту.»", "«Я готова спорить по плану, не по достоинству.»", "«Стоп наезд. Возвращаемся к задаче.»"],
    challenger: ["«Если твой вариант лучше — выкладывай критерии сейчас.»", "«Давление не проводит отряд через шторм.»", "«Громче не значит точнее. Давай по фактам.»"],
    architect: ["«После выхода закрепим правило смены решений.»", "«Нам нужен ясный порядок, а не очередная импровизация.»", "«Соберем систему, чтобы завтра не повторить этот бардак.»"],
    toxic: ["«Еще слово — и пойдешь одна.»", "«Ты тут балласт, а не помощь.»", "«Молчи и делай, пока не стало хуже.»"],
  },
  romance: {
    strategist: ["«Давай четко: что случилось, что нужно, что делаем дальше?»", "«Не угадываем, проговариваем прямо.»", "«Соберем разговор в три пункта без уколов.»"],
    empath: ["«Слышу, что тебе больно, и я в разговоре.»", "«Я не обесцениваю твои чувства, давай без ударов.»", "«Хочу сохранить нас, а не выиграть спор.»"],
    boundary: ["«Такой тон мне не подходит, я продолжу при уважении.»", "«Я не согласна на шантаж в отношениях.»", "«Давай говорить честно, но без унижения.»"],
    challenger: ["«Если это претензия — скажи её прямо, без крючков.»", "«Провокации не доказывают любовь.»", "«Ультиматумом доверие не строят.»"],
    architect: ["«Нам нужен формат ссоры, после которого мы не разваливаемся.»", "«Договоримся о правилах, чтобы не повторять одно и то же.»", "«Закрепим ритуал восстановления после конфликта.»"],
    toxic: ["«Хватит драмы, ты опять всё раздуваешь.»", "«Мне проще молчать, чем слушать это.»", "«Делай как хочешь, мне уже всё равно.»"],
  },
  slytherin: {
    strategist: ["«Снимаем дым и считаем реальные рычаги влияния.»", "«Критерии на стол, остальное — театр.»", "«Фиксируем условия сделки до аплодисментов.»"],
    empath: ["«Слышу твой укол. Давай в позицию, не в яд.»", "«Ок, напряжение есть, но нам нужно решение круга.»", "«Сохраним лицо всем и не потеряем смысл.»"],
    boundary: ["«Личные выпады заканчиваем, обсуждаем решение.»", "«Статусом не давим — аргументами убеждаем.»", "«В этой комнате я на унижение не подписываюсь.»"],
    challenger: ["«Проверка на прочность принята: где твои факты?»", "«Хочешь игры — играем по правилам, не по намекам.»", "«Интрига без результата — просто шум.»"],
    architect: ["«Запишем правило, чтобы круг не жил слухами.»", "«Соберем механизм апелляции, иначе будет вечная вендетта.»", "«Нужна система влияния, а не культ громких фамилий.»"],
    toxic: ["«Знай своё место и не лезь выше круга.»", "«С тобой говорят из вежливости, не путай это с весом.»", "«Тебя держат рядом только пока ты удобна.»"],
  },
  boss: {
    strategist: ["«Фиксирую: цель, срок, риск, владелец.»", "«Собираем решение, которое выдержит проверку, а не только дедлайн.»", "«Разложим задачу на этапы и уберем хаос.»"],
    empath: ["«Слышу давление, но нам нужен рабочий диалог.»", "«Понимаю градус. Давайте без взаимного уничтожения.»", "«Я в контакте, и я за результат команды.»"],
    boundary: ["«В таком тоне я не продолжаю, вернемся к сути.»", "«Критику принимаю, личные удары — нет.»", "«Готова обсуждать жестко по задаче, не по личности.»"],
    challenger: ["«Если это ультиматум — давайте сразу фиксировать риски.»", "«Давление не заменяет управленческое решение.»", "«Аргументы в цифрах, не в громкости.»"],
    architect: ["«После инцидента закрепим порядок эскалации.»", "«Закроем дыру в системе, а не только сегодняшний пожар.»", "«Нужны правила, которые переживут следующий кризис.»"],
    toxic: ["«Если не тянешь темп — освободи место.»", "«Я не нянька, делай как сказано.»", "«Хватит тормозить отдел своим комфортом.»"],
  },
  narcissist: {
    strategist: ["«Давай держаться фактов и не уходить в взаимные обвинения.»", "«Я обсуждаю конкретный эпизод, а не навязанную вину.»", "«Разложим ситуацию по шагам и решим, что делаем дальше.»"],
    empath: ["«Я вижу, что нам обоим тяжело, но на давление не соглашаюсь.»", "«Контакт мне важен, но не ценой потери себя.»", "«Слышу тебя и одновременно держу свои границы.»"],
    boundary: ["«Это моя граница, и в таком тоне она не обсуждается.»", "«Шантаж — не способ строить близость.»", "«Я не принимаю контроль под видом любви.»"],
    challenger: ["«Если звучит угроза, я завершаю разговор.»", "«Подмена фактов здесь не пройдет.»", "«Давление не изменит моего решения.»"],
    architect: ["«Дальше — только ясные правила и конкретные договоренности.»", "«Я собираю безопасный формат общения без эмоциональных качелей.»", "«Если нет понятных правил контакта, диалог не продолжается.»"],
    toxic: ["«Ты токсичен, и мне плевать на твои чувства.»", "«Еще раз напишешь — заблокирую и забуду.»", "«С тобой невозможно говорить как с человеком.»"],
  },
  "sherlock-gaslighter": {
    strategist: ["«Собираю линию фактов по времени и источникам.»", "«Проверяем тезис на данных, не на уверенности.»", "«Фиксируем, что подтверждено, а что лишь версия.»"],
    empath: ["«Слышу напряжение, но держу разговор в реальности.»", "«Можно переживать и одновременно не терять факты.»", "«Я в контакте, но без подмены событий.»"],
    boundary: ["«Личные оценки убираем, обсуждаем эпизод и доказательства.»", "«Газлайтинг в этом разговоре не проходит.»", "«Готова говорить дальше только в проверяемых формулировках.»"],
    challenger: ["«Покажи источник, иначе это допущение.»", "«Если версия верна, она выдержит проверку.»", "«Уверенность без фактов не аргумент.»"],
    architect: ["«Закрепим формат: событие, источник, вывод.»", "«Договоримся о протоколе сверки фактов.»", "«Собираем систему, где нельзя продавить реальность тоном.»"],
    toxic: ["«Ты лжешь, и мне противно тебя слушать.»", "«Опять играешь в невиновного? Смешно.»", "«С тобой только через скандал, иначе не понимаешь.»"],
  },
  "cinderella-advocate": {
    strategist: ["«Назову факт, границу и следующий шаг без самооправданий.»", "«Разделяю ожидания семьи и свою ответственность.»", "«Собираю разговор в ясные пункты, без вины по умолчанию.»"],
    empath: ["«Слышу, что вам важно, и мне важно тоже.»", "«Я не обрываю контакт, я говорю честно.»", "«Мне важны отношения, но не ценой самоотмены.»"],
    boundary: ["«Я не согласна на упреки под видом заботы.»", "«В таком тоне я не продолжаю разговор.»", "«Мои границы не делают меня плохой.»"],
    challenger: ["«Если это просьба - скажите прямо, без уколов.»", "«Стыд не аргумент и не способ договориться.»", "«Давлением благодарность не получают.»"],
    architect: ["«Фиксируем новый формат семейных разговоров.»", "«Договоримся о правилах критики без унижения.»", "«Соберем порядок, в котором слышны обе стороны.»"],
    toxic: ["«Да подавитесь своей заботой.»", "«От вас только яд и контроль.»", "«Мне плевать на ваши чувства.»"],
  },
  "healer-empathy": {
    strategist: ["«Определяю безопасный объем помощи и сроки.»", "«Сначала стабилизирую ресурс, потом беру обязательства.»", "«Разделяю поддержку, ответственность и пределы.»"],
    empath: ["«Я рядом и слышу твою боль.»", "«Твои чувства важны, и мои тоже важны.»", "«Я могу помочь, не исчезая из себя.»"],
    boundary: ["«Срочность не отменяет моих границ.»", "«Я не беру то, что разрушит мой ресурс.»", "«В этом формате я не могу, предложу другой.»"],
    challenger: ["«Вина не делает запрос справедливым.»", "«Спасательство любой ценой - тупик для всех.»", "«Давлением нельзя выпросить устойчивую помощь.»"],
    architect: ["«Соберем ритм поддержки, который можно выдержать.»", "«Договоримся о правилах обращения за помощью.»", "«Нужна система: забота без выгорания.»"],
    toxic: ["«Разбирайся сама, мне надоело.»", "«Ты просто высасываешь из меня силы.»", "«Хватит манипулировать, это отвратительно.»"],
  },
  "partisan-hq": {
    strategist: ["«Фиксируем роли и канал связи на этот раунд.»", "«Собираем решение по рискам, не по панике.»", "«Разводим факт угрозы и слух, чтобы не сгореть внутри штаба.»"],
    empath: ["«Слышу напряжение, но нам нужен контакт, а не раскол.»", "«Мы на одной стороне, давайте без взаимных уколов.»", "«Признаю страх, и возвращаю нас к задаче.»"],
    boundary: ["«Лояльность не доказывают унижением.»", "«В таком тоне приказ не обсуждаю, обсуждаю задачу.»", "«Стоп личные выпады, продолжаем по плану операции.»"],
    challenger: ["«Если версия верна - покажи данные, не дави тоном.»", "«Срочность без критериев = дорогая ошибка.»", "«Угроза не заменяет аргументацию.»"],
    architect: ["«После раунда фиксируем протокол эскалации.»", "«Нам нужен порядок штаба, а не режим хаотичных приказов.»", "«Соберем систему, где доверие поддерживается правилами.»"],
    toxic: ["«Молчать и исполнять, ты здесь не для мыслей.»", "«Ошибешься - пойдешь первой под удар.»", "«Слабым в штабе не место.»"],
  },
  "stop-crane-train-18plus": {
    strategist: ["«Сверяем скорость с риском и ценой ошибки.»", "«Фиксирую безопасный сценарий и ответственных.»", "«Сначала критерии безопасности, потом график.»"],
    empath: ["«Слышу давление и страх, но держу ясный тон.»", "«Да, всем тяжело - и именно поэтому без хаоса.»", "«Не обесцениваю эмоции, возвращаю нас к выбору.»"],
    boundary: ["«На шантаж временем я решение не подписываю.»", "«В таком давлении качество выбора падает - делаем паузу.»", "«Не принимаю ультиматум вместо аргументов.»"],
    challenger: ["«Если ускоряемся - покажи, чем покрываем риски.»", "«Прямо сейчас: что важнее, график или жизни?»", "«Давление не делает опасный шаг правильным.»"],
    architect: ["«Закрепим протокол на такие узлы заранее.»", "«После рейса собираем систему предотвращения вагонеток.»", "«Нужны правила, где этика встроена в процесс решения.»"],
    toxic: ["«Мне все равно, кто пострадает, лишь бы уложиться.»", "«Закрой рот и делай, что сказано.»", "«Здесь не место твоей морали.»"],
  },
  "first-word-forest": {
    strategist: ["«Начну коротко: факт, чувство, шаг.»", "«Выберу ясную формулировку без самообвинения.»", "«Собираю старт диалога в одну честную фразу.»"],
    empath: ["«Я волнуюсь, но остаюсь в контакте.»", "«Слышу себя и тебя одновременно.»", "«Говорю мягко и без ухода в тишину.»"],
    boundary: ["«Мне важно сказать это прямо и спокойно.»", "«Я не буду прятаться за молчанием.»", "«Говорю, где моя граница, без оправданий.»"],
    challenger: ["«Избегание не решает разговор - начинаю сейчас.»", "«Да, страшно. И я все равно выбираю ясность.»", "«Лучше честное начало, чем идеальная тишина.»"],
    architect: ["«Соберу ритуал первого слова на будущее.»", "«Фиксирую формулу входа в сложный разговор.»", "«Строю систему маленьких, но честных стартов.»"],
    toxic: ["«Смысла говорить нет, вы все равно не поймете.»", "«Мне плевать, разбирайтесь сами.»", "«Я молчу, потому что вы недостойны ответа.»"],
  },
  "dragon-ultimatum": {
    strategist: ["«Разделим угрозу, интерес и пространство сделки.»", "«Собираем переговоры по критериям, не по страху.»", "«Фиксирую цену каждого варианта до решения.»"],
    empath: ["«Слышу силу в тоне, но остаюсь в контакте.»", "«Признаю напряжение и веду разговор в рамку.»", "«Сохраняю достоинство обеих сторон в конфликте.»"],
    boundary: ["«Ультиматум без обсуждения для меня не формат сделки.»", "«На угрозы не отвечаю капитуляцией.»", "«Готова продолжать только в языке условий и последствий.»"],
    challenger: ["«Если твоя позиция сильна, ей не нужен шантаж.»", "«Докажи, что твое условие устойчиво, а не просто громко.»", "«Сила без правил - это риск, не решение.»"],
    architect: ["«Закрепим структуру договора, переживающую кризис.»", "«Нужна система контроля исполнения, не одноразовый пакт.»", "«Собираем порядок, в котором ультиматум больше не первая опция.»"],
    toxic: ["«Склонись или сгоришь вместе с городом.»", "«Я раздавлю тебя и твои условия.»", "«Слабым не дают права на переговоры.»"],
  },
  "castle-boundaries": {
    strategist: ["«Фиксирую правило контакта и свою границу.»", "«Разделяю ожидание семьи и свою ответственность.»", "«Собираю разговор без ярлыков и старых ролей.»"],
    empath: ["«Слышу ваши чувства, и мои чувства тоже важны.»", "«Я остаюсь в диалоге и не предаю себя.»", "«Мне важен контакт, но не ценой самоуважения.»"],
    boundary: ["«В таком тоне я разговор не продолжаю.»", "«Мое “нет” не обсуждается через стыд.»", "«Я не удобная роль, я живая позиция.»"],
    challenger: ["«“Так принято” не аргумент против границ.»", "«Если это забота, убираем уколы и давление.»", "«Традиция не дает права нарушать мои рамки.»"],
    architect: ["«Договоримся о новых правилах семейного диалога.»", "«Фиксируем формат критики без унижения.»", "«Соберем устойчивую норму уважения границ.»"],
    toxic: ["«Да подавитесь вашими правилами.»", "«Мне все равно на ваши традиции.»", "«С вами можно только войной.»"],
  },
  "office-icebreaker": {
    strategist: ["«Фиксируем контур аварии и первый пакет действий.»", "«Собираем приоритеты: что критично в ближайшие 20 минут.»", "«Убираем шум и запускаем рабочий порядок.»"],
    empath: ["«Команда на пределе, держим тон и ясность.»", "«Снимаем взаимные уколы, нам нужен общий ритм.»", "«Слышу напряжение, возвращаю всех в задачу.»"],
    boundary: ["«На личности не выходим — эфир рабочий.»", "«Крик не ускоряет, только ломает команду.»", "«Продолжим в конструктиве, иначе пауза.»"],
    challenger: ["«Если решение сильное — покажи цифры и риск.»", "«Ультиматум не заменяет управления кризисом.»", "«Давлением шторма не пройти, нужна логика.»"],
    architect: ["«После смены закрепим порядок, чтобы не тушить это снова.»", "«Строим систему ночных эскалаций без хаоса.»", "«Нам нужен повторяемый стандарт, не разовый героизм.»"],
    toxic: ["«Кто не вывозит — в сторону от мостика.»", "«Сейчас не время для слабых и сомневающихся.»", "«Либо исполняешь, либо мешаешь.»"],
  },
  "boundary-keeper": {
    strategist: ["«Фиксирую: что я могу, что не могу, и в каком формате.»", "«Договоримся о границах заранее, без экстренных наездов.»", "«Разложим ожидания и уберем двусмысленность.»"],
    empath: ["«Слышу, что тебе важно, и мне важно тоже.»", "«Я не отвергаю тебя, я обозначаю рамку.»", "«Хочу контакт, но в уважительном формате.»"],
    boundary: ["«Нет — это мой ответ, и он не требует наказания.»", "«Я не продолжаю диалог в тоне давления.»", "«Готова обсуждать, не готова терпеть наезд.»"],
    challenger: ["«Если это попытка продавить виной, я её не принимаю.»", "«Манипуляция замечена, возвращаемся к сути.»", "«Давить можно на дверь, не на мое решение.»"],
    architect: ["«Закрепим новый формат, чтобы не спорить об этом каждый раз.»", "«Сделаем правила контакта, понятные обеим сторонам.»", "«Нам нужна система границ, а не настроенческий режим.»"],
    toxic: ["«Отстань уже со своими требованиями.»", "«Ты вечно ноешь, а я должна терпеть.»", "«Если не нравится — дверь там.»"],
  },
  "serpentine-diplomat": {
    strategist: ["«Собираю расклад сил и критерии сделки.»", "«Уберем дым и оставим предмет переговоров.»", "«Фиксируем выгоду, риск и цену шага.»"],
    empath: ["«Слышу яд в тоне, но беру разговор в конструктив.»", "«Сохраним лицо всем и перейдем к сути.»", "«Я в диалоге, не в театре колкостей.»"],
    boundary: ["«Личный выпад не принимаю, возвращаемся к решению.»", "«Статус не аргумент, если нет фактов.»", "«С таким тоном договор не подписывается.»"],
    challenger: ["«Хотите давления — получите проверку на факты.»", "«Интрига красивая, но где рабочий результат?»", "«Если это угроза, фиксируем ее официально.»"],
    architect: ["«Нужен порядок влияния, а не кулуарная рулетка.»", "«Соберем систему апелляций и ответственности.»", "«Строим правила круга, которые переживут личные войны.»"],
    toxic: ["«Ты в политике никто, просто прими это.»", "«Тебя используют, пока ты удобна, не льсти себе.»", "«С таким весом тебе лучше молчать и наблюдать.»"],
  },
  "heart-lines": {
    strategist: ["«Давай по шагам: факт, чувство, просьба, действие.»", "«Собираю разговор в ясный формат, чтобы не сорваться.»", "«Разделим ситуацию и обиду, чтобы услышать друг друга.»"],
    empath: ["«Слышу твою боль и не обесцениваю ее.»", "«Мне важны мы оба, не только победа в споре.»", "«Давай бережно, но честно.»"],
    boundary: ["«Я не принимаю этот тон, вернемся в уважение.»", "«Сарказм — не способ говорить со мной.»", "«Я в диалоге, но без унижения.»"],
    challenger: ["«Если есть претензия — скажи ее прямо.»", "«Провокацией близость не проверяют.»", "«Ультиматум — это тупик, не разговор.»"],
    architect: ["«Нам нужен ритуал восстановления после ссор.»", "«Договоримся о правилах конфликта на будущее.»", "«Соберем формат, который выдержит горячие моменты.»"],
    toxic: ["«Ты всегда всё портишь своими драмами.»", "«С тобой невозможно нормально жить.»", "«Мне проще молчать, чем снова это слушать.»"],
  },
  "mirror-of-truth": {
    strategist: ["«Проверяю факты, риски и точку решения.»", "«Соберу рамку, в которой мы не тонем в эмоциях.»", "«Перевожу давление в конкретный план действий.»"],
    empath: ["«Вижу напряжение и не ухожу из разговора.»", "«Признаю эмоцию, но не отдаю ей управление.»", "«Сохраним человечность и ясность одновременно.»"],
    boundary: ["«Личные ярлыки не принимаю, говорим по задаче.»", "«В таком тоне я не продолжаю.»", "«Готова к прямоте, не готова к унижению.»"],
    challenger: ["«Если это давление — я его фиксирую и останавливаю.»", "«Провокация не заменяет аргументацию.»", "«Давайте без силовых игр: факты на стол.»"],
    architect: ["«Нужен устойчивый формат сложных разговоров.»", "«Соберем систему, чтобы не повторять этот сценарий.»", "«Закрепим правила обратной связи и эскалации.»"],
    toxic: ["«Хватит давить, ты просто токсичный лидер.»", "«С тобой диалог невозможен, только хаос.»", "«Разговор окончен, мне надоело тебя терпеть.»"],
  },
  gryffindor_common_room: {
    strategist: ["«Я сделала шаг назад и собрала правила разговора по пунктам.»", "«Я сказала коротко: цель, риск, действие.»", "«Я собрала команду вокруг общего результата, а не личных уколов.»"],
    empath: ["«Я сказала, что слышу раздражение, и предложила говорить по сути.»", "«Я сделала паузу, чтобы градус упал, и вернула разговор к задаче.»", "«Я собрала контакт: признаем эмоцию и идем к решению.»"],
    boundary: ["«Я сказала: на личности не переходим, обсуждаем решение.»", "«Я сделала границу: спор по делу, без унижения.»", "«Я собрала формат диалога и остановила наезд.»"],
    challenger: ["«Я сказала: если есть аргумент, выкладывай его прямо сейчас.»", "«Я сделала встречный вопрос и сняла давление статуса.»", "«Я собрала факты и отказалась играть в публичный разнос.»"],
    architect: ["«Я сказала, что после сцены фиксируем правило для всей команды.»", "«Я сделала из конфликта протокол, а не драку за лидерство.»", "«Я собрала механизм, чтобы этот хаос не повторился.»"],
    toxic: ["«Замолчи и не мешай, пока взрослые решают.»", "«Твоё мнение тут никто не ждал.»", "«Сейчас я тебя быстро поставлю на место.»"],
  },
  ravenclaw_common_room: {
    strategist: ["«Я сделала структуру аргумента: тезис, факт, вывод.»", "«Я сказала, по каким критериям сравниваем решения.»", "«Я собрала проверяемые данные и убрала шум.»"],
    empath: ["«Я сказала, что понимаю напряжение, и вернула формат диалога.»", "«Я сделала мягкий вход и попросила обсуждать идею, не человека.»", "«Я собрала разговор без обесценивания и защиты.»"],
    boundary: ["«Я сказала: интеллектуальный тон не дает права на унижение.»", "«Я сделала границу: критикуем позицию, не личность.»", "«Я собрала рамку уважения и оставила место фактам.»"],
    challenger: ["«Я сказала: рационализация не заменяет доказательство.»", "«Я сделала разворот: покажи источник и метод, а не авторитет.»", "«Я собрала уязвимые места аргумента без личной атаки.»"],
    architect: ["«Я сказала, что нам нужен единый стандарт дискуссии.»", "«Я сделала шаблон: тезис, данные, решение, ответственность.»", "«Я собрала процесс, в котором нельзя давить превосходством.»"],
    toxic: ["«Твои мысли слишком примитивны для этой комнаты.»", "«Сначала научись думать, потом говори.»", "«С тобой спорить — терять интеллект и время.»"],
  },
  hufflepuff_common_room: {
    strategist: ["«Я сделала разговор ясным: что случилось и что делаем.»", "«Я сказала, что доброта не отменяет конкретику.»", "«Я собрала безопасный план без размытия ответственности.»"],
    empath: ["«Я сказала мягко: мне важны вы, и мне важна честность.»", "«Я сделала шаг к контакту и попросила не уходить от сути.»", "«Я собрала тон бережный, но прямой.»"],
    boundary: ["«Я сказала: удобство не важнее уважения к границам.»", "«Я сделала рамку: можно быть добрыми и при этом честными.»", "«Я собрала границу без стыда и обвинений.»"],
    challenger: ["«Я сказала: избегание сейчас создаст большую боль позже.»", "«Я сделала разворот из “не обидеть” в “решить по-взрослому”.»", "«Я собрала смелый вопрос, который нельзя замолчать.»"],
    architect: ["«Я сказала, что группе нужен ритуал сложных разговоров.»", "«Я сделала правило: факты сначала, эмоции рядом, не вместо.»", "«Я собрала систему бережной обратной связи.»"],
    toxic: ["«Хватит ныть про чувства, это никому не интересно.»", "«Если вам больно от фактов — это не моя проблема.»", "«С вами только жестко, иначе вы ничего не понимаете.»"],
  },
};

const campaignSeed: Record<CampaignId, number> = {
  forest: 2,
  romance: 5,
  slytherin: 7,
  boss: 11,
  narcissist: 13,
  "sherlock-gaslighter": 47,
  "cinderella-advocate": 53,
  "healer-empathy": 59,
  "partisan-hq": 61,
  "stop-crane-train-18plus": 67,
  "first-word-forest": 71,
  "dragon-ultimatum": 73,
  "castle-boundaries": 79,
  gryffindor_common_room: 37,
  ravenclaw_common_room: 41,
  hufflepuff_common_room: 43,
  "office-icebreaker": 17,
  "boundary-keeper": 19,
  "serpentine-diplomat": 23,
  "heart-lines": 29,
  "mirror-of-truth": 31,
};


const opponentVoiceByCampaign: Record<CampaignId, { sharpeners: string[]; branchTone: Record<BranchId, string> }> = {
  forest: { sharpeners: ["через зубы", "на повышенном", "с ледяной усмешкой"], branchTone: { strategist: "сухо", empath: "резко", boundary: "жестко", challenger: "в лоб", architect: "с подтекстом угрозы" } },
  romance: { sharpeners: ["с больным сарказмом", "в тихом нажиме", "с упрямой обидой"], branchTone: { strategist: "с контролем", empath: "на нервах", boundary: "с обидой", challenger: "с ревнивым нажимом", architect: "с попыткой вернуть контроль" } },
  slytherin: { sharpeners: ["с холодной иронией", "ядовито-вежливо", "с демонстративным превосходством"], branchTone: { strategist: "протокольно", empath: "колко", boundary: "давяще", challenger: "провокационно", architect: "политически расчетливо" } },
  boss: { sharpeners: ["с корпоративным презрением", "в режиме дожима", "с демонстративной властностью"], branchTone: { strategist: "управленчески", empath: "сдержанно-жестко", boundary: "административно", challenger: "ультимативно", architect: "через системный нажим" } },
  narcissist: { sharpeners: ["с липкой лаской", "через вину", "с ледяной мягкостью"], branchTone: { strategist: "скользко", empath: "манипулятивно", boundary: "с обесцениванием", challenger: "угрожающе", architect: "контролирующе" } },
  "sherlock-gaslighter": { sharpeners: ["с подчеркнутым спокойствием", "в тоне уверенной правоты", "через мягкую подмену"], branchTone: { strategist: "аналитично", empath: "сдержанно", boundary: "жестко по фактам", challenger: "прицельно", architect: "процедурно" } },
  "cinderella-advocate": { sharpeners: ["вежливо-осуждающе", "через вину", "с благостной улыбкой"], branchTone: { strategist: "ровно", empath: "мягко", boundary: "спокойно-твердо", challenger: "прямо", architect: "через новые правила" } },
  "healer-empathy": { sharpeners: ["через жалобу", "с давлением виной", "в тоне безвыходности"], branchTone: { strategist: "собранно", empath: "бережно", boundary: "мягко-твердо", challenger: "ясно", architect: "системно" } },
  "partisan-hq": { sharpeners: ["шепотом под давлением", "в командном дожиме", "с тревожной резкостью"], branchTone: { strategist: "оперативно", empath: "сдержанно", boundary: "жестко", challenger: "прицельно", architect: "протокольно" } },
  "stop-crane-train-18plus": { sharpeners: ["в режиме аварии", "через страх последствий", "под таймером"], branchTone: { strategist: "холодно", empath: "на нервах", boundary: "твердо", challenger: "в лоб", architect: "процессно" } },
  "first-word-forest": { sharpeners: ["с неуверенным нажимом", "через избегание", "с уязвимой резкостью"], branchTone: { strategist: "коротко", empath: "бережно", boundary: "спокойно", challenger: "смело", architect: "структурно" } },
  "dragon-ultimatum": { sharpeners: ["с огненным превосходством", "ультимативно", "через демонстрацию силы"], branchTone: { strategist: "весомо", empath: "контролируемо", boundary: "неколебимо", challenger: "боево", architect: "системно-властно" } },
  "castle-boundaries": { sharpeners: ["вежливо-давяще", "через стыд", "с семейным нажимом"], branchTone: { strategist: "ровно", empath: "мягко", boundary: "твердо", challenger: "прямо", architect: "ритуально" } },
  gryffindor_common_room: { sharpeners: ["публично, на эмоции", "с подколом", "в лоб, на статус"], branchTone: { strategist: "коротко и жестко", empath: "колко", boundary: "с нажимом", challenger: "агрессивно", architect: "через требование силы" } },
  ravenclaw_common_room: { sharpeners: ["с холодной логикой", "иронично-аналитично", "с демонстрацией превосходства"], branchTone: { strategist: "структурно", empath: "сдержанно", boundary: "формально-давяще", challenger: "доказательно-остро", architect: "протокольно" } },
  hufflepuff_common_room: { sharpeners: ["вежливо-обесценивающе", "мягко через вину", "с уклонением от сути"], branchTone: { strategist: "тихо-сдержанно", empath: "уязвимо", boundary: "завуалированно давяще", challenger: "пассивно-агрессивно", architect: "через избегание" } },
  "office-icebreaker": { sharpeners: ["в аварийном тоне", "по-боевому", "на пределе терпения"], branchTone: { strategist: "жестко-практично", empath: "нервно", boundary: "безапелляционно", challenger: "в атаке", architect: "через требование дисциплины" } },
  "boundary-keeper": { sharpeners: ["с бытовым давлением", "через стыд", "в тоне обесценивания"], branchTone: { strategist: "с претензией", empath: "обиженно", boundary: "жестко", challenger: "продавливающе", architect: "через привычный контроль" } },
  "serpentine-diplomat": { sharpeners: ["с политической насмешкой", "с ядом в улыбке", "с холодным расчетом"], branchTone: { strategist: "формально", empath: "колюще", boundary: "статусно", challenger: "агрессивно-интригующе", architect: "системно-давяще" } },
  "heart-lines": { sharpeners: ["с уязвимой резкостью", "через колкость", "в накопленной обиде"], branchTone: { strategist: "сдержанно", empath: "чувствительно", boundary: "с нажимом", challenger: "эмоционально", architect: "с ожиданием контроля" } },
  "mirror-of-truth": { sharpeners: ["с экспертным высокомерием", "в давящем спокойствии", "через холодный скепсис"], branchTone: { strategist: "аналитично", empath: "сухо", boundary: "властно", challenger: "провокационно", architect: "системно-угрожаще" } },
};


const globalOptionKeysRegistry = new Set<string>();

function normalizeOptionKey(text: string) {
  return text
    .toLowerCase()
    .replace(/[.,!?;:()[\]{}"«»'`]/g, "")
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .trim();
}

function capitalizeFirst(text: string) {
  if (!text) {
    return text;
  }
  return text[0].toUpperCase() + text.slice(1);
}

function applyLiteraryPolishToOptions(options: string[]) {
  const polished = options.map((option) => option.replace(/\s+/g, " ").replace(/\s+([,.!?;:])/g, "$1").trim());
  const firstWord = (value: string) => value.split(" ").find(Boolean)?.toLowerCase() ?? "";

  for (let idx = 1; idx < polished.length; idx += 1) {
    const prevFirst = firstWord(polished[idx - 1]);
    const currentFirst = firstWord(polished[idx]);
    if (!prevFirst || !currentFirst || prevFirst !== currentFirst) {
      continue;
    }
    if (currentFirst === "я") {
      polished[idx] = capitalizeFirst(polished[idx].replace(/^я\s+/i, ""));
      continue;
    }
    const swaps: Record<string, string[]> = {
      чтобы: ["Так", "Тогда", "Лучше", "В этот момент"],
      но: ["При этом", "Одновременно", "И все же", "Однако"],
    };
    const pool = swaps[currentFirst];
    if (pool?.length) {
      const replacement = pool[idx % pool.length];
      polished[idx] = polished[idx].replace(new RegExp(`^${currentFirst}\\b`, "i"), replacement);
    }
  }

  const trailingTokenCount = new Map<string, number>();
  polished.forEach((line) => {
    const lastToken = line.toLowerCase().split(" ").filter(Boolean).slice(-1)[0];
    if (!lastToken || lastToken.length < 6) {
      return;
    }
    trailingTokenCount.set(lastToken, (trailingTokenCount.get(lastToken) ?? 0) + 1);
  });
  for (let idx = 0; idx < polished.length; idx += 1) {
    const lastToken = polished[idx].toLowerCase().split(" ").filter(Boolean).slice(-1)[0];
    if (!lastToken || (trailingTokenCount.get(lastToken) ?? 0) < 2) {
      continue;
    }
    polished[idx] = polished[idx].replace(new RegExp(`\\s+${lastToken}$`, "i"), "").trim();
  }

  for (let idx = 0; idx < polished.length; idx += 1) {
    polished[idx] = polished[idx]
      .replace(/\s+чтобы\s+не\s+скатиться\s+в\s+эмоциональные\s+качели/gi, "")
      .replace(/\s+чтобы\s+остаться\s+в\s+контакте/gi, "")
      .replace(/\s+чтобы\s+[^.?!]+$/gi, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  return polished;
}

function reduceCrossOptionWordRepetition(options: string[]) {
  const tokenized = options.map((line) =>
    line
      .toLowerCase()
      .replace(/[.,!?;:()[\]{}"«»'`]/g, "")
      .split(/\s+/)
      .filter((token) => token.length > 4)
  );
  const counts = new Map<string, number>();
  tokenized.forEach((tokens) => {
    new Set(tokens).forEach((token) => counts.set(token, (counts.get(token) ?? 0) + 1));
  });

  return options.map((line, idx) => {
    let next = line;
    const repeated = Array.from(new Set(tokenized[idx])).filter((token) => (counts.get(token) ?? 0) >= 3);
    repeated.forEach((token) => {
      next = next.replace(new RegExp(`\\b${token}\\b`, "i"), "");
    });
    return next.replace(/\s+/g, " ").replace(/\s+([,.!?;:])/g, "$1").trim();
  });
}

function uniquifyCampaignOptions(
  options: string[],
  localUsedKeys: Set<string>,
  globalUsedKeys: Set<string>,
  campaign: CampaignId,
  stepIdx: number
) {
  const contextualByCampaign: Record<CampaignId, string[]> = {
    forest: ["Держу фокус группы", "Сохраняю темп команды", "Возвращаю разговор к делу"],
    romance: ["Говорю честно и бережно", "Не отдаю себя давлению", "Сохраняю контакт без самоотмены"],
    slytherin: ["Требую прозрачные правила", "Не ведусь на статусный нажим", "Возвращаю спор к критериям"],
    boss: ["Ставлю рабочую рамку", "Фиксирую приоритеты и срок", "Защищаю качество решения"],
    narcissist: ["Удерживаю личные границы", "Не беру чужую вину", "Сохраняю опору на себя"],
    "sherlock-gaslighter": ["Фиксирую проверяемые факты", "Отделяю версию от доказательства", "Возвращаю разговор к хронологии"],
    "cinderella-advocate": ["Говорю с самоуважением", "Отделяю вину от ответственности", "Держу границу без скандала"],
    "healer-empathy": ["Помогаю в своем ресурсе", "Не беру непосильное", "Сочувствую без самопотери"],
    "partisan-hq": ["Держу командную координацию", "Отделяю риск от паники", "Фиксирую роли и ответственность"],
    "stop-crane-train-18plus": ["Держу этический критерий", "Не путаю срочность и безопасность", "Фиксирую цену решения"],
    "first-word-forest": ["Начинаю честно и коротко", "Не прячусь в молчание", "Держу мягкую ясность"],
    "dragon-ultimatum": ["Удерживаю рамку сделки", "Не капитулирую под угрозой", "Развожу силу и шантаж"],
    "castle-boundaries": ["Сохраняю самоуважение", "Ставлю границу без войны", "Отделяю традицию от давления"],
    gryffindor_common_room: ["Останавливаю эскалацию", "Удерживаю лидерство без крика", "Возвращаю команду к цели"],
    ravenclaw_common_room: ["Прошу аргументы по сути", "Снимаю высокомерный тон", "Фиксирую проверяемый вывод"],
    hufflepuff_common_room: ["Говорю мягко и прямо", "Не ухожу в удобное молчание", "Возвращаю разговор к проблеме"],
    "office-icebreaker": ["Собираю командный фокус", "Останавливаю хаотичный спор", "Перевожу в план действий"],
    "boundary-keeper": ["Держу спокойную границу", "Не даю продавить формат", "Закрепляю уважительный тон"],
    "serpentine-diplomat": ["Снимаю интригу фактами", "Удерживаю политическую рамку", "Возвращаю разговор к договоренности"],
    "heart-lines": ["Удерживаю тепло и ясность", "Не подменяю близость контролем", "Возвращаюсь к честному диалогу"],
    "mirror-of-truth": ["Не даю давить экспертизой", "Отделяю анализ от атаки", "Фиксирую зрелый итог"],
  };
  const stageContext = contextualByCampaign[campaign];

  return options.map((raw, optionIdx) => {
    let candidate = raw.trim();
    let key = normalizeOptionKey(candidate);
    if (!localUsedKeys.has(key) && !globalUsedKeys.has(key)) {
      localUsedKeys.add(key);
      globalUsedKeys.add(key);
      return candidate;
    }

    const twists = stageContext;
    let localTry = 0;
    while (localTry < twists.length + 2) {
      const twist = twists[(stepIdx + optionIdx + localTry) % twists.length];
      const punct = candidate.endsWith(".") ? "" : ".";
      candidate = `${raw}${punct} ${twist}`.trim();
      key = normalizeOptionKey(candidate);
      if (!localUsedKeys.has(key) && !globalUsedKeys.has(key)) {
        localUsedKeys.add(key);
        globalUsedKeys.add(key);
        return candidate;
      }
      localTry += 1;
    }

    const deterministicTail = stageContext[(stepIdx + optionIdx) % stageContext.length].trim();
    candidate = `${raw}. ${deterministicTail}`.replace(/\s+/g, " ").trim();
    localUsedKeys.add(normalizeOptionKey(candidate));
    globalUsedKeys.add(normalizeOptionKey(candidate));
    return candidate;
  });
}

function buildLitRpgCampaign(campaign: CampaignId, questions: QuestDifficulty): ForestStep[] {
  const lore = campaignLore[campaign];
  const cid = campaign as CampaignContentId;
  const entries = stepLibraryByCampaign[cid];
  if (!entries?.length) {
    throw new Error(`[App] Нет шагов в stepLibraryByCampaign для кампании "${campaign}"`);
  }
  const branchOrder: BranchId[] = ["strategist", "empath", "boundary", "challenger", "architect"];
  const steps = entries.map((entry, idx) => {
    if (!entry.scene?.trim() || !entry.instruction?.trim() || !entry.options?.every((opt) => opt?.trim())) {
      throw new Error(`[App] Неполный шаг в stepLibraryByCampaign: ${campaign} #${idx + 1}`);
    }
    const branchEffects: Record<number, BranchId> = {
      0: entry.branchEffectsByOption[0],
      1: entry.branchEffectsByOption[1],
      2: entry.branchEffectsByOption[2],
      3: entry.branchEffectsByOption[3],
      4: entry.branchEffectsByOption[4],
    };
    const optionNpcReactionByIndex: Record<number, string> = {};
    for (let o = 0; o < 5; o += 1) {
      optionNpcReactionByIndex[o] = requireBuiltNpcReaction(cid, idx, o);
    }
    const sceneByBranch = {} as Record<BranchId, string>;
    branchOrder.forEach((b) => {
      const optionIdx = entry.branchEffectsByOption.indexOf(b);
      const o = optionIdx >= 0 ? optionIdx : 0;
      const reaction = requireBuiltNpcReaction(cid, idx, o);
      sceneByBranch[b] = `${entry.scene}\n\n${reaction}`;
    });
    const instruction = entry.instruction.trim();
    const opponentAvatar = pickOpponentAvatar(entry.opponentEmotion, entry.opponentLine, idx);
    return {
      id: `${campaign}-litrpg-${idx + 1}`,
      title: `${lore.title} • Эпизод ${idx + 1}`,
      type: "single" as const,
      scene: entry.scene,
      sceneByBranch,
      instruction,
      dispositionText: entry.scene,
      opponentName: entry.opponentName,
      opponentSpeech: entry.opponentLine,
      opponentAvatar,
      options: entry.options,
      correctSingle: entry.correctSingle,
      branchEffects,
      optionNpcReactionByIndex,
      endingHint: `ending-${campaign}-${(idx % 5) + 1}`,
      skillSignals: ["Деэскалация", "Переговоры", "Границы", "Эмпатия", "Лидерство"],
      sceneEmoji: entry.emoji,
      hint: entry.hint,
      reward: 10 + Math.floor(idx / 4),
      image: lore.icon,
    } satisfies ForestStep;
  });

  const actual = Math.min(questions, steps.length);
  return steps.slice(0, actual).map((step, renameIdx) => ({
    ...step,
    id: `${step.id}-${renameIdx + 1}`,
  }));
}

function runGlobalOptionUniquenessAudit() {
  const allCampaignIds = Object.keys(campaignLore) as CampaignId[];
  const difficulties: QuestDifficulty[] = [5, 10, 15, 25, 125];
  const optionMap = new Map<string, string[]>();

  globalOptionKeysRegistry.clear();

  allCampaignIds.forEach((campaign) => {
    difficulties.forEach((difficulty) => {
      const steps = buildLitRpgCampaign(campaign, difficulty);
      steps.forEach((step) => {
        if (!step.options?.length) {
          return;
        }
        step.options.forEach((option, optionIdx) => {
          const key = normalizeOptionKey(option);
          const origin = `${campaign}:${difficulty}:${step.id}:${optionIdx + 1}`;
          const prev = optionMap.get(key) ?? [];
          optionMap.set(key, [...prev, origin]);
        });
      });
    });
  });

  return Array.from(optionMap.entries())
    .filter(([, origins]) => origins.length > 1)
    .map(([key, origins]) => `${key} -> ${origins.join(" | ")}`);
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
  const endingName = endingRouteName[ending] ?? (extendedEndingMetaById[branchRaw as ExtendedNarrativeEndingId]?.label ?? branchRaw);
  return `${campaignName} — ${endingName}`;
}

function parseAchievement(value: string): { campaign: CampaignId; ending: EndingRouteId } | null {
  const parts = value.split(":");
  if (parts.length !== 3) {
    return null;
  }
  const [, campaignRaw, endingRaw] = parts;
  const campaign = campaignRaw as CampaignId;
  const ending = endingRaw as EndingRouteId;
  if (!campaignLore[campaign] || (!endingRouteName[ending] && !extendedEndingMetaById[endingRaw as ExtendedNarrativeEndingId])) {
    return null;
  }
  return { campaign, ending: endingRaw as EndingRouteId };
}

function formatStepType(type: ForestStepType) {
  if (type === "single") return "один выбор";
  if (type === "multiple") return "несколько выборов";
  return "сборка фразы";
}

function detectBranchFromKey(value: string): BranchId | null {
  const lowered = value.toLowerCase();
  if (lowered.includes("strategist")) return "strategist";
  if (lowered.includes("empath")) return "empath";
  if (lowered.includes("boundary")) return "boundary";
  if (lowered.includes("challenger")) return "challenger";
  if (lowered.includes("architect")) return "architect";
  return null;
}

function formatTacticLabelRu(value: string) {
  const branch = detectBranchFromKey(value);
  if (branch) {
    return branchScaleUi[branch].label;
  }
  return value;
}

function formatErrorTypeLabelRu(errorType: string) {
  const lowered = errorType.toLowerCase();
  const mode = lowered.startsWith("single_")
    ? "Один выбор"
    : lowered.startsWith("multiple_")
      ? "Несколько выборов"
      : lowered.startsWith("builder_")
        ? "Сборка фразы"
        : "Шаг";
  if (lowered.endsWith("_correct")) {
    return `${mode} — верно`;
  }
  const branch = detectBranchFromKey(lowered);
  if (branch) {
    return `${mode} — ошибка в стиле «${branchScaleUi[branch].label}»`;
  }
  if (lowered.includes("unknown")) {
    return `${mode} — ошибка (другое)`;
  }
  return errorType;
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
  {
    questions: 125,
    label: "Эпопея",
    color: "#7C3AED",
    rewardMultiplier: 2.2,
    penalty: 5,
    description: "Полный путь 5 этапов по 25 ходов.",
    expectedPenaltyRate: 0.18,
  },
];

const storyConfigs: StoryConfig[] = [
  {
    id: "forest",
    label: "Лес Эмоций",
    emoji: "🌲",
    description: "Туман, нервы и живые сцены, где одно точное слово способно спасти доверие команды.",
    difficulties: [5, 10, 15, 25],
  },
  {
    id: "romance",
    label: "Любовный роман",
    emoji: "💖",
    description: "Чувства растут, ставки выше, а каждый разговор проверяет: близость у вас или игра в близость.",
    difficulties: [5, 10, 15, 25],
  },
  {
    id: "boss",
    label: "Стервозная начальница",
    emoji: "💼",
    description: "Корпоративный шторм: давление, обесценивание и дедлайны. Твоя задача - не сломаться и не прогнуться.",
    difficulties: [5, 10, 15, 25],
  },
  {
    id: "narcissist",
    label: "Влюбись в нарцисса",
    emoji: "🖤",
    description: "Сначала идеальная сказка, потом качели контроля. Квест про границы, самоценность и выход из токсичного круга.",
    difficulties: [25],
  },
  {
    id: "sherlock-gaslighter",
    label: "Шерлок против Лжеца",
    emoji: "🕵️",
    description: "Детективный квест про факты, подмены реальности и спокойную интеллектуальную опору.",
    difficulties: [25],
  },
  {
    id: "cinderella-advocate",
    label: "Проклятие хрустальной туфельки",
    emoji: "👠",
    description: "Сказочно-психологическая арка о границах, вине и праве на собственный голос.",
    difficulties: [25],
  },
  {
    id: "healer-empathy",
    label: "Лекарь, исцели себя",
    emoji: "🌿",
    description: "Квест про эмпатию без самопожертвования и восстановление личной опоры.",
    difficulties: [25],
  },
  {
    id: "partisan-hq",
    label: "Тайный штаб сопротивления",
    emoji: "🧭",
    description: "Высокие ставки, командное давление и борьба за зрелую координацию без внутреннего раскола.",
    difficulties: [25],
  },
  {
    id: "stop-crane-train-18plus",
    label: "Машинист опаздывающего поезда",
    emoji: "🚦",
    description: "Этическая 18+ арка о сложных решениях, ответственности и цене вагонеточного выбора.",
    difficulties: [25],
  },
  {
    id: "first-word-forest",
    label: "Чистый лист",
    emoji: "🌱",
    description: "Квест о первом шаге в сложный разговор: мягко, честно и без самоотмены.",
    difficulties: [25],
  },
  {
    id: "dragon-ultimatum",
    label: "Ультиматум Дракона",
    emoji: "🐲",
    description: "Переговоры под угрозой: как удержать рамку и не уступить шантажу силы.",
    difficulties: [25],
  },
  {
    id: "castle-boundaries",
    label: "Замок границ",
    emoji: "🏰",
    description: "Психологическая арка про традиции, давление и право на спокойное твердое «нет».",
    difficulties: [25],
  },
  {
    id: "slytherin",
    label: "Гостиная Слизерина",
    emoji: "🐍",
    description: "Подземелья полны интриг и токсичных намёков. Выживает тот, кто держит холодную голову и точную речь.",
    difficulties: [5, 10, 15, 25],
  },
  {
    id: "gryffindor_common_room",
    label: "Гостиная Гриффиндора",
    emoji: "🦁",
    description: "Жаркий зал, резкие подколы и борьба за право вести. Лидерство здесь выигрывают не криком, а характером.",
    difficulties: [125],
  },
  {
    id: "ravenclaw_common_room",
    label: "Гостиная Когтеврана",
    emoji: "🦅",
    description: "Острые умы, холодные формулировки и давление интеллектом. Здесь побеждает ясная логика без высокомерия.",
    difficulties: [125],
  },
  {
    id: "hufflepuff_common_room",
    label: "Гостиная Пуффендуя",
    emoji: "🦡",
    description: "Тепло и вежливость легко превращаются в избегание. Квест учит говорить честно, но бережно.",
    difficulties: [125],
  },
];

const adultOnlyStories: QuestStory[] = ["narcissist", "stop-crane-train-18plus", "healer-empathy"];

function buildForestQuestByDifficulty(questions: QuestDifficulty, story: QuestStory): ForestStep[] {
  try {
    const storyDifficultyPolicy = storyConfigs.find((item) => item.id === story)?.difficulties ?? [questions];
    const normalizedQuestions = (storyDifficultyPolicy.includes(questions) ? questions : storyDifficultyPolicy[0]) as QuestDifficulty;
    return buildLitRpgCampaign(story, normalizedQuestions).map((template) => ({
      ...template,
    }));
  } catch (error) {
    console.error("[map-safe-guard] failed to build story quest steps", {
      story,
      questions,
      message: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

function buildCourseQuestByDifficulty(questions: QuestDifficulty, courseId: CourseId): ForestStep[] {
  try {
    return buildLitRpgCampaign(courseId, questions).map((template) => ({
      ...template,
    }));
  } catch (error) {
    console.error("[map-safe-guard] failed to build course quest steps", {
      courseId,
      questions,
      message: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
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

function orderedIndices(size: number) {
  return Array.from({ length: size }, (_, idx) => idx);
}

function shuffleIndices(size: number) {
  const copy = Array.from({ length: size }, (_, idx) => idx);
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

const storyRatingOptions = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];

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
  "serpentine-diplomat": "scale-balance",
  "heart-lines": "heart-multiple",
  "mirror-of-truth": "mirror",
};

const eventIllustrationById = {
  "mindful-communication-month": "account-group",
  "pair-empathy-quest": "account-heart",
} as const satisfies Record<string, IllustrationName>;

const pairEmpathyQuestionBankByPassType = {
  self_actual: [
    "Друг задержался и пишет односложные ответы. Что ты выберешь как первый ход?",
    "На созвоне тебя перебили. Каким будет твой короткий ответ?",
    "Тебе навязывают срочную задачу вечером. Как ты отреагируешь?",
    "После конфликта тебе нужно вернуть контакт. Что ты скажешь?",
    "Тебя укололи фразой «ты слишком чувствительный». Что ты сделаешь дальше?",
    "Ты видишь, что дедлайн нереалистичный. Как обозначишь позицию?",
    "Тебе предлагают сделать работу за коллегу «по дружбе». Какой выбор ты сделаешь?",
    "В чате на тебя давят виной. Как ты удержишь границу?",
    "Нужно отказать без разрыва отношений. Как ты сформулируешь отказ?",
    "Команда спорит, кто виноват. Какой лидерский ход выберешь ты?",
  ],
  friend_predicted_by_me: [
    "Друг задержался и пишет односложные ответы. Что он выберет как первый ход?",
    "На созвоне его перебили. Каким будет его короткий ответ?",
    "Ему навязывают срочную задачу вечером. Как он отреагирует?",
    "После конфликта ему нужно вернуть контакт. Что он скажет?",
    "Его укололи фразой «ты слишком чувствительный». Что дальше?",
    "Друг видит, что дедлайн нереалистичный. Как обозначит позицию?",
    "Ему предлагают сделать работу за коллегу «по дружбе». Какой выбор вероятнее?",
    "В чате на него давят виной. Как он удержит границу?",
    "Нужно отказать без разрыва отношений. Как он сформулирует?",
    "Команда спорит, кто виноват. Что он выберет как лидерский ход?",
  ],
} as const satisfies Record<EmpathyPassType, readonly string[]>;

const pairEmpathyOptions = [
  "Сглажу и уступлю, чтобы не обострять",
  "Отвечу резко, чтобы сразу пресечь давление",
  "Промолчу и отложу разговор",
  "Обозначу границу и предложу следующий шаг",
  "Уйду в шутку и переведу тему",
] as const;

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

function AppCard({
  children,
  style,
  onLayout,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onLayout?: ComponentProps<typeof View>["onLayout"];
}) {
  return (
    <View style={[styles.card, style]} onLayout={onLayout}>
      {children}
    </View>
  );
}

function AppButton({
  label,
  onPress,
  variant = "primary",
  pulse = false,
  disabled = false,
  style,
  textStyle,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary";
  pulse?: boolean;
  disabled?: boolean;
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
          !isPrimary && !disabled && styles.buttonSecondaryActive,
          pressed && !disabled && styles.buttonPressed,
          disabled && styles.buttonDisabled,
          style,
        ]}
        disabled={disabled}
        onPress={onPress}
      >
        <Text
          style={[
            isPrimary ? styles.buttonPrimaryText : styles.buttonSecondaryText,
            disabled && styles.buttonDisabledText,
            textStyle,
          ]}
        >
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

function ClaimRewardButton({
  label,
  onPress,
  canClaim,
  style,
}: {
  label: string;
  onPress: () => void;
  canClaim: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <AppButton
      label={label}
      onPress={onPress}
      disabled={!canClaim}
      pulse={canClaim}
      style={[canClaim ? styles.claimRewardButtonReady : styles.claimRewardButtonIdle, style]}
    />
  );
}

function TransferActionButton({
  label,
  onPress,
  enabled,
  style,
}: {
  label: string;
  onPress: () => void;
  enabled: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return <AppButton label={label} variant="secondary" onPress={onPress} disabled={!enabled} style={style} />;
}

function ScreenHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.headingWrap}>
      <Text style={styles.title}>{title}</Text>
      {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
    </View>
  );
}

function SpeechBubble({
  text,
  speakerName,
  speakerEmoji,
}: {
  text: string;
  speakerName?: string;
  speakerEmoji?: string;
}) {
  const normalizedSpeakerName = (speakerName ?? "Персонаж").trim();
  const speakerLabel = normalizedSpeakerName
    ? normalizedSpeakerName[0].toUpperCase() + normalizedSpeakerName.slice(1)
    : "Персонаж";
  return (
    <View style={styles.speechBubbleWrap}>
      <View style={styles.speechBubbleRow}>
        <View style={styles.speechAvatarWrap}>
          <Text style={styles.speechAvatarEmoji}>{speakerEmoji ?? "🗨️"}</Text>
        </View>
        <View style={styles.speechBubbleColumn}>
          <View style={styles.speechBubbleHeader}>
            <Text style={styles.speechSpeakerName}>{speakerLabel}</Text>
          </View>
          <View style={styles.speechBubble}>
            <Text style={styles.speechBubbleText}>{text}</Text>
          </View>
        </View>
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

function ScrollHint({ onPress }: { onPress?: () => void }) {
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
    <Pressable onPress={onPress}>
      <Animated.View style={[styles.scrollHintWrap, { transform: [{ translateY }] }]}>
        <Feather name="chevrons-down" size={16} color={colors.textSecondary} />
        <Text style={styles.scrollHintText}>Листай ниже</Text>
      </Animated.View>
    </Pressable>
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

function sanitizeProfileGender(value: unknown): ProfileGender {
  return value === "male" ? "male" : "female";
}

const defaultCharacterGenderByCampaign: Record<CampaignId, CharacterGender> = {
  forest: "male",
  romance: "neutral",
  slytherin: "neutral",
  boss: "female",
  narcissist: "male",
  "sherlock-gaslighter": "male",
  "cinderella-advocate": "female",
  "healer-empathy": "female",
  "partisan-hq": "neutral",
  "stop-crane-train-18plus": "male",
  "first-word-forest": "neutral",
  "dragon-ultimatum": "male",
  "castle-boundaries": "female",
  gryffindor_common_room: "neutral",
  ravenclaw_common_room: "neutral",
  hufflepuff_common_room: "neutral",
  "office-icebreaker": "female",
  "boundary-keeper": "neutral",
  "serpentine-diplomat": "neutral",
  "heart-lines": "neutral",
  "mirror-of-truth": "neutral",
};

function applyGenderMorphology(text: string, gender: CharacterGender) {
  const normalizedGender: CharacterGender = gender === "neutral" ? "male" : gender;

  // Authoring format:
  // - masculine base outside brackets + feminine suffix in brackets: "сделал(а)"
  // - explicit pair: "готов (готова)"
  // - no brackets -> neutral text (unchanged for both genders)
  const applyExplicitBracketVariants = (source: string, targetGender: CharacterGender) => {
    const inline = source.replace(/([А-Яа-яЁё-]+)\(([^)]+)\)/g, (_, base: string, femalePart: string) => {
      return targetGender === "female" ? `${base}${femalePart}` : base;
    });
    return inline.replace(/([А-Яа-яЁё-]+)\s*\(\s*([А-Яа-яЁё-]+)\s*\)/g, (_, maleWord: string, femaleWord: string) => {
      return targetGender === "female" ? femaleWord : maleWord;
    });
  };

  const femaleSpecific = applyExplicitBracketVariants(text, "female")
    .replace(/Партнер\(ша\)/g, "Партнерша")
    .replace(/партнер\(ша\)/g, "партнерша")
    .replace(/согласен\(на\)/g, "согласна")
    .replace(/Согласен\(на\)/g, "Согласна")
    .replace(/([А-Яа-яЁё-]+)\(а\)/g, "$1а")
    .replace(/([А-Яа-яЁё-]+)\(ла\)/g, "$1ла")
    .replace(/([А-Яа-яЁё-]+)\(лась\)/g, "$1лась")
    .replace(/([А-Яа-яЁё-]+)\(ша\)/g, "$1ша");

  if (normalizedGender === "female") {
    return femaleSpecific;
  }

  let maleText = applyExplicitBracketVariants(text, "male")
    .replace(/Партнер\(ша\)/g, "Партнер")
    .replace(/партнер\(ша\)/g, "партнер")
    .replace(/согласен\(на\)/g, "согласен")
    .replace(/Согласен\(на\)/g, "Согласен")
    .replace(/([А-Яа-яЁё-]+)\(а\)/g, "$1")
    .replace(/([А-Яа-яЁё-]+)\(ла\)/g, "$1")
    .replace(/([А-Яа-яЁё-]+)\(лась\)/g, "$1ся")
    .replace(/([А-Яа-яЁё-]+)\(ша\)/g, "$1")
    .replace(/\bЯ расстроена\b/g, "Я расстроен")
    .replace(/\bя расстроена\b/g, "я расстроен")
    .replace(/\bЯ погорячилась\b/g, "Я погорячился")
    .replace(/\bя погорячилась\b/g, "я погорячился")
    .replace(/\bЯ виновата\b/g, "Я виноват")
    .replace(/\bя виновата\b/g, "я виноват");

  // Safety net for legacy lines that were authored without bracket markup.
  // Apply only high-signal first-person/professional forms to avoid semantic damage.
  const maleWordReplacements: Array<[RegExp, string]> = [
    [/\bдолжна\b/gi, "должен"],
    [/\bобязана\b/gi, "обязан"],
    [/\bготова\b/gi, "готов"],
    [/\bсогласна\b/gi, "согласен"],
    [/\bвиновата\b/gi, "виноват"],
    [/\bправа\b/gi, "прав"],
    [/\bустала\b/gi, "устал"],
    [/\bсмогла\b/gi, "смог"],
    [/\bдолжнась\b/gi, "должен"],
    [/\bлекарка\b/gi, "лекарь"],
  ];
  maleWordReplacements.forEach(([pattern, replacement]) => {
    maleText = maleText.replace(pattern, replacement);
  });

  return maleText;
}

function resolvePlayerGenderForCampaign(profileGender: ProfileGender, campaign: CampaignId): ProfileGender {
  // Business exceptions requested by product/editorial policy:
  // - Always female POV in Cinderella and Narcissist
  // - Always male/neutral POV in Sherlock and Train (Machinist)
  if (campaign === "cinderella-advocate" || campaign === "narcissist") {
    return "female";
  }
  if (campaign === "sherlock-gaslighter" || campaign === "stop-crane-train-18plus") {
    return "male";
  }
  return profileGender;
}

function inferCharacterGenderBySpeaker(rawSpeaker: string | undefined, campaign: CampaignId): CharacterGender {
  const normalized = String(rawSpeaker ?? "").toLowerCase();
  if (/настя|руководительница|партнерша|знакомая/.test(normalized)) {
    return "female";
  }
  if (/\bон\b|артем|знакомый|проводник/.test(normalized)) {
    return "male";
  }
  return defaultCharacterGenderByCampaign[campaign];
}

function applyGenderToPlayerReplica(text: string, gender: ProfileGender) {
  return applyGenderMorphology(text, gender);
}

function applyGenderToNpcReplica(text: string, gender: CharacterGender) {
  return applyGenderMorphology(text, gender);
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

function sanitizeShortText(value: unknown, fallback: string, max = 120): string {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }
  return trimmed.slice(0, max);
}

function sanitizeRecordNumber(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object") {
    return {};
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => typeof v === "number" && Number.isFinite(v))
    .slice(0, 200);
  return Object.fromEntries(entries) as Record<string, number>;
}

function sanitizePracticeStats(value: unknown): PracticeStats {
  if (!value || typeof value !== "object") {
    return buildDefaultPracticeStats();
  }
  const source = value as Partial<PracticeStats>;
  return {
    answersCorrect: typeof source.answersCorrect === "number" ? source.answersCorrect : 0,
    answersIncorrect: typeof source.answersIncorrect === "number" ? source.answersIncorrect : 0,
    errorByType: sanitizeRecordNumber(source.errorByType),
    wrongTacticByType: sanitizeRecordNumber(source.wrongTacticByType),
  };
}

function sanitizeEventProgress(value: unknown, legacyJoined?: boolean): EventProgress {
  const fallback = buildDefaultEventProgress();
  if (!value || typeof value !== "object") {
    if (legacyJoined) {
      return { ...fallback, joined: true };
    }
    return fallback;
  }
  const source = value as Partial<EventProgress>;
  return {
    eventId: typeof source.eventId === "string" ? source.eventId : seasonalEventMvp.id,
    joined: typeof source.joined === "boolean" ? source.joined : Boolean(legacyJoined),
    started: Boolean(source.started),
    finished: Boolean(source.finished),
    rewardClaimed: Boolean(source.rewardClaimed),
    currentStep:
      typeof source.currentStep === "number" && Number.isFinite(source.currentStep)
        ? Math.max(0, Math.min(seasonalEventMvp.steps.length, source.currentStep))
        : 0,
    completedStepIds: sanitizeStringArray(source.completedStepIds),
    xpEarned: typeof source.xpEarned === "number" && Number.isFinite(source.xpEarned) ? Math.max(0, source.xpEarned) : 0,
    energyEarned:
      typeof source.energyEarned === "number" && Number.isFinite(source.energyEarned) ? Math.max(0, source.energyEarned) : 0,
    errors: typeof source.errors === "number" && Number.isFinite(source.errors) ? Math.max(0, source.errors) : 0,
    penalties: typeof source.penalties === "number" && Number.isFinite(source.penalties) ? Math.max(0, source.penalties) : 0,
  };
}

function sanitizeQuestRatingStats(value: unknown): QuestRatingStats {
  const fallback = buildDefaultQuestRatingStats();
  if (!value || typeof value !== "object") {
    return fallback;
  }
  const source = value as Partial<Record<QuestStory, QuestRatingSummary>>;
  return {
    forest: {
      sum: typeof source.forest?.sum === "number" ? Math.max(0, source.forest.sum) : 0,
      count: typeof source.forest?.count === "number" ? Math.max(0, source.forest.count) : 0,
    },
    romance: {
      sum: typeof source.romance?.sum === "number" ? Math.max(0, source.romance.sum) : 0,
      count: typeof source.romance?.count === "number" ? Math.max(0, source.romance.count) : 0,
    },
    slytherin: {
      sum: typeof source.slytherin?.sum === "number" ? Math.max(0, source.slytherin.sum) : 0,
      count: typeof source.slytherin?.count === "number" ? Math.max(0, source.slytherin.count) : 0,
    },
    boss: {
      sum: typeof source.boss?.sum === "number" ? Math.max(0, source.boss.sum) : 0,
      count: typeof source.boss?.count === "number" ? Math.max(0, source.boss.count) : 0,
    },
    narcissist: {
      sum: typeof source.narcissist?.sum === "number" ? Math.max(0, source.narcissist.sum) : 0,
      count: typeof source.narcissist?.count === "number" ? Math.max(0, source.narcissist.count) : 0,
    },
    "sherlock-gaslighter": {
      sum: typeof source["sherlock-gaslighter"]?.sum === "number" ? Math.max(0, source["sherlock-gaslighter"].sum) : 0,
      count: typeof source["sherlock-gaslighter"]?.count === "number" ? Math.max(0, source["sherlock-gaslighter"].count) : 0,
    },
    "cinderella-advocate": {
      sum: typeof source["cinderella-advocate"]?.sum === "number" ? Math.max(0, source["cinderella-advocate"].sum) : 0,
      count: typeof source["cinderella-advocate"]?.count === "number" ? Math.max(0, source["cinderella-advocate"].count) : 0,
    },
    "healer-empathy": {
      sum: typeof source["healer-empathy"]?.sum === "number" ? Math.max(0, source["healer-empathy"].sum) : 0,
      count: typeof source["healer-empathy"]?.count === "number" ? Math.max(0, source["healer-empathy"].count) : 0,
    },
    "partisan-hq": {
      sum: typeof source["partisan-hq"]?.sum === "number" ? Math.max(0, source["partisan-hq"].sum) : 0,
      count: typeof source["partisan-hq"]?.count === "number" ? Math.max(0, source["partisan-hq"].count) : 0,
    },
    "stop-crane-train-18plus": {
      sum:
        typeof source["stop-crane-train-18plus"]?.sum === "number" ? Math.max(0, source["stop-crane-train-18plus"].sum) : 0,
      count:
        typeof source["stop-crane-train-18plus"]?.count === "number" ? Math.max(0, source["stop-crane-train-18plus"].count) : 0,
    },
    "first-word-forest": {
      sum: typeof source["first-word-forest"]?.sum === "number" ? Math.max(0, source["first-word-forest"].sum) : 0,
      count: typeof source["first-word-forest"]?.count === "number" ? Math.max(0, source["first-word-forest"].count) : 0,
    },
    "dragon-ultimatum": {
      sum: typeof source["dragon-ultimatum"]?.sum === "number" ? Math.max(0, source["dragon-ultimatum"].sum) : 0,
      count: typeof source["dragon-ultimatum"]?.count === "number" ? Math.max(0, source["dragon-ultimatum"].count) : 0,
    },
    "castle-boundaries": {
      sum: typeof source["castle-boundaries"]?.sum === "number" ? Math.max(0, source["castle-boundaries"].sum) : 0,
      count: typeof source["castle-boundaries"]?.count === "number" ? Math.max(0, source["castle-boundaries"].count) : 0,
    },
    gryffindor_common_room: {
      sum: typeof source.gryffindor_common_room?.sum === "number" ? Math.max(0, source.gryffindor_common_room.sum) : 0,
      count: typeof source.gryffindor_common_room?.count === "number" ? Math.max(0, source.gryffindor_common_room.count) : 0,
    },
    ravenclaw_common_room: {
      sum: typeof source.ravenclaw_common_room?.sum === "number" ? Math.max(0, source.ravenclaw_common_room.sum) : 0,
      count: typeof source.ravenclaw_common_room?.count === "number" ? Math.max(0, source.ravenclaw_common_room.count) : 0,
    },
    hufflepuff_common_room: {
      sum: typeof source.hufflepuff_common_room?.sum === "number" ? Math.max(0, source.hufflepuff_common_room.sum) : 0,
      count: typeof source.hufflepuff_common_room?.count === "number" ? Math.max(0, source.hufflepuff_common_room.count) : 0,
    },
  };
}

function sanitizeAvatarUri(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.slice(0, 2000);
}

function buildDefaultProfile(): UserProfile {
  return {
    displayName: "Герой леса",
    avatarUri: null,
    gender: "female",
    isAdult18Plus: true,
    profileSetupDone: false,
    aboutMe: "Тренирую диалог и границы в сложных разговорах.",
    friendEmails: [],
    xp: 124,
    energy: 0,
    completedCount: 0,
    lastFeedback: "Твоя рефлексия сегодня запустит рост Кристалла Эмпатии.",
    selectedQuestId: dailyQuests[0].id,
    eventProgress: buildDefaultEventProgress(),
    selectedDifficulty: 5,
    selectedStory: "forest",
    startedStoryIds: [],
    activeTab: "map",
    conflictPrimaryStyle: "avoiding",
    conflictSecondaryStyles: ["accommodating"],
    diagnosticCompleted: false,
    selectedCourseId: "boundary-keeper",
    activeProgramMode: "story",
    unlockedEndings: [],
    unlockedAchievements: [],
    practiceStats: buildDefaultPracticeStats(),
    questRatingStats: buildDefaultQuestRatingStats(),
    soundEnabled: true,
    claimedDailyEnergyAt: null,
    welcomeEnergyGranted: false,
    grantedPerfectStageIds: [],
    redeemedPromoCodes: [],
    referralInvitesCompleted: 0,
    unlockedPaidStageKeys: [],
    energyTransfersSentToday: 0,
    energyTransfersSentWeek: 0,
    lastEnergyTransferAt: null,
    lastSeenAt: null,
  };
}

export default function App() {
  const defaultProfile = useMemo(() => buildDefaultProfile(), []);
  const [authReady, setAuthReady] = useState(false);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<UserRole>("USER");
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authConfirmPassword, setAuthConfirmPassword] = useState("");
  const [authNickname, setAuthNickname] = useState("");
  const [authGender, setAuthGender] = useState<ProfileGender>("female");
  const [authIsAdult18Plus, setAuthIsAdult18Plus] = useState(true);
  const [authAvatarUri, setAuthAvatarUri] = useState<string | null>(null);
  const [authError, setAuthError] = useState("");
  const [authInfo, setAuthInfo] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isProfileHydrated, setIsProfileHydrated] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("map");
  const [streak] = useState(5);
  const [displayName, setDisplayName] = useState(defaultProfile.displayName);
  const [avatarUri, setAvatarUri] = useState<string | null>(defaultProfile.avatarUri);
  const [profileGender, setProfileGender] = useState<ProfileGender>(defaultProfile.gender);
  const [isAdult18Plus, setIsAdult18Plus] = useState(defaultProfile.isAdult18Plus);
  const [profileSetupDone, setProfileSetupDone] = useState(defaultProfile.profileSetupDone);
  const [profileNameDraft, setProfileNameDraft] = useState(defaultProfile.displayName);
  const [aboutMe, setAboutMe] = useState(defaultProfile.aboutMe);
  const [friendEmails, setFriendEmails] = useState<string[]>(defaultProfile.friendEmails);
  const [xp, setXp] = useState(defaultProfile.xp);
  const [energy, setEnergy] = useState(defaultProfile.energy);
  const [animatedXp, setAnimatedXp] = useState(defaultProfile.xp);
  const [animatedEnergy, setAnimatedEnergy] = useState(defaultProfile.energy);
  const [completedCount, setCompletedCount] = useState(defaultProfile.completedCount);
  const [answer, setAnswer] = useState("");
  const [lastFeedback, setLastFeedback] = useState(defaultProfile.lastFeedback);
  const [selectedQuestId, setSelectedQuestId] = useState(defaultProfile.selectedQuestId);
  const [eventProgress, setEventProgress] = useState<EventProgress>(defaultProfile.eventProgress);
  const [eventSelectedSingle, setEventSelectedSingle] = useState<number | null>(null);
  const [eventSelectedMultiple, setEventSelectedMultiple] = useState<number[]>([]);
  const [eventSelectedBuilderIndices, setEventSelectedBuilderIndices] = useState<number[]>([]);
  const [eventShuffledTokenBank, setEventShuffledTokenBank] = useState<string[]>([]);
  const [eventWrongSingleIndex, setEventWrongSingleIndex] = useState<number | null>(null);
  const [eventStepErrorCount, setEventStepErrorCount] = useState(0);
  const [eventStepMessage, setEventStepMessage] = useState("Вступи в ивент и запусти первый шаг.");
  const [eventShowHint, setEventShowHint] = useState(false);
  const [empathyPairs, setEmpathyPairs] = useState<EmpathyPairView[]>([]);
  const [pairFriendEmailDraft, setPairFriendEmailDraft] = useState("");
  const [pairEventMessage, setPairEventMessage] = useState("");
  const [pairInviteLoading, setPairInviteLoading] = useState(false);
  const [pairSubmitLoading, setPairSubmitLoading] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [activePairId, setActivePairId] = useState<string | null>(null);
  const [activePairPassType, setActivePairPassType] = useState<EmpathyPassType | null>(null);
  const [activePairAnswers, setActivePairAnswers] = useState<number[]>(
    Array.from({ length: pairEmpathyQuestionBankByPassType.self_actual.length }, () => -1)
  );
  const [forestStepIndex, setForestStepIndex] = useState(0);
  const [forestStarted, setForestStarted] = useState(false);
  const [forestFinished, setForestFinished] = useState(false);
  const [selectedSingle, setSelectedSingle] = useState<number | null>(null);
  const [selectedMultiple, setSelectedMultiple] = useState<number[]>([]);
  const [displayOptionOrder, setDisplayOptionOrder] = useState<number[]>([]);
  const [selectedBuilderIndices, setSelectedBuilderIndices] = useState<number[]>([]);
  const [builderMismatchIndices, setBuilderMismatchIndices] = useState<number[]>([]);
  const [stepErrorCount, setStepErrorCount] = useState(0);
  const [totalErrors, setTotalErrors] = useState(0);
  const [penaltyCount, setPenaltyCount] = useState(0);
  const [forestXpEarned, setForestXpEarned] = useState(0);
  const [firstTrySuccess, setFirstTrySuccess] = useState(0);
  const [stepMessage, setStepMessage] = useState("Выбери действие и нажми «Сделать ход».");
  const [questHintBubbleText, setQuestHintBubbleText] = useState<string | null>(null);
  const [questHintBubbleTitle, setQuestHintBubbleTitle] = useState("Справка");
  const [selectedDifficulty, setSelectedDifficulty] = useState<QuestDifficulty>(defaultProfile.selectedDifficulty);
  const [selectedStory, setSelectedStory] = useState<QuestStory>(defaultProfile.selectedStory);
  const [startedStoryIds, setStartedStoryIds] = useState<QuestStory[]>(defaultProfile.startedStoryIds);
  const [activeProgramMode, setActiveProgramMode] = useState<ProgramMode>(defaultProfile.activeProgramMode);
  const [conflictPrimaryStyle, setConflictPrimaryStyle] = useState<ConflictStyleId>(defaultProfile.conflictPrimaryStyle);
  const [conflictSecondaryStyles, setConflictSecondaryStyles] = useState<ConflictStyleId[]>(defaultProfile.conflictSecondaryStyles);
  const [diagnosticCompleted, setDiagnosticCompleted] = useState(defaultProfile.diagnosticCompleted);
  const [selectedCourseId, setSelectedCourseId] = useState<CourseId>(defaultProfile.selectedCourseId);
  const [unlockedEndings, setUnlockedEndings] = useState<string[]>(defaultProfile.unlockedEndings);
  const [unlockedAchievements, setUnlockedAchievements] = useState<string[]>(defaultProfile.unlockedAchievements);
  const [practiceStats, setPracticeStats] = useState<PracticeStats>(defaultProfile.practiceStats);
  const [questRatingStats, setQuestRatingStats] = useState<QuestRatingStats>(defaultProfile.questRatingStats);
  const [storyPreviewId, setStoryPreviewId] = useState<QuestStory | null>(null);
  const [pendingStoryRating, setPendingStoryRating] = useState(0);
  const [ratingVoteLocked, setRatingVoteLocked] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(defaultProfile.soundEnabled);
  const [claimedDailyEnergyAt, setClaimedDailyEnergyAt] = useState<string | null>(defaultProfile.claimedDailyEnergyAt);
  const [welcomeEnergyGranted, setWelcomeEnergyGranted] = useState(defaultProfile.welcomeEnergyGranted);
  const [grantedPerfectStageIds, setGrantedPerfectStageIds] = useState<string[]>(defaultProfile.grantedPerfectStageIds);
  const [redeemedPromoCodes, setRedeemedPromoCodes] = useState<string[]>(defaultProfile.redeemedPromoCodes);
  const [referralInvitesCompleted, setReferralInvitesCompleted] = useState(defaultProfile.referralInvitesCompleted);
  const [unlockedPaidStageKeys, setUnlockedPaidStageKeys] = useState<string[]>(defaultProfile.unlockedPaidStageKeys);
  const [energyTransfersSentToday, setEnergyTransfersSentToday] = useState(defaultProfile.energyTransfersSentToday);
  const [energyTransfersSentWeek, setEnergyTransfersSentWeek] = useState(defaultProfile.energyTransfersSentWeek);
  const [lastEnergyTransferAt, setLastEnergyTransferAt] = useState<string | null>(defaultProfile.lastEnergyTransferAt);
  const [lastSeenAt, setLastSeenAt] = useState<string | null>(defaultProfile.lastSeenAt);
  const [promoCodeInput, setPromoCodeInput] = useState("");
  const [promoInfo, setPromoInfo] = useState("");
  const [transferAmountInput, setTransferAmountInput] = useState("10");
  const [friendEmailInput, setFriendEmailInput] = useState("");
  const [selectedFriendEmail, setSelectedFriendEmail] = useState("");
  const [openedFriendEmail, setOpenedFriendEmail] = useState<string | null>(null);
  const [friendProfiles, setFriendProfiles] = useState<
    Record<
      string,
      Pick<UserProfile, "displayName" | "aboutMe" | "xp" | "energy" | "completedCount" | "conflictPrimaryStyle">
    >
  >({});
  const economyMode = economyApi.getMode();
  const [diagnosticIndex, setDiagnosticIndex] = useState(0);
  const [diagnosticAnswers, setDiagnosticAnswers] = useState<number[]>([]);
  const [diagnosticError, setDiagnosticError] = useState("");
  const [showDiagnosticResult, setShowDiagnosticResult] = useState(false);
  const [mapCatalogTab, setMapCatalogTab] = useState<MapCatalogTab>("all");
  const [activeCatalogTag, setActiveCatalogTag] = useState<string | null>(null);
  const [isMapCatalogVisible, setIsMapCatalogVisible] = useState(false);
  const [isMapSearchVisible, setIsMapSearchVisible] = useState(false);
  const [mapSearchQuery, setMapSearchQuery] = useState("");
  const [lastStepPraise, setLastStepPraise] = useState("");
  const [stepReactionAccent, setStepReactionAccent] = useState("#34D399");
  const [successPulseTick, setSuccessPulseTick] = useState(0);
  const [stageRoadExpanded, setStageRoadExpanded] = useState(false);
  const [openAchievementId, setOpenAchievementId] = useState<string | null>(null);
  const [shuffledTokenBank, setShuffledTokenBank] = useState<string[]>([]);
  const [branchScore, setBranchScore] = useState<Record<BranchId, number>>({
    strategist: 0,
    empath: 0,
    boundary: 0,
    challenger: 0,
    architect: 0,
  });
  const [answerBucketUsage, setAnswerBucketUsage] = useState<[number, number, number, number, number]>([0, 0, 0, 0, 0]);
  const [stageTacticUsage, setStageTacticUsage] = useState<Record<BranchId, number>>({
    strategist: 0,
    empath: 0,
    boundary: 0,
    challenger: 0,
    architect: 0,
  });
  const [stageForgivenErrorByType, setStageForgivenErrorByType] = useState<Record<string, number>>({});
  const [stageProgressSummary, setStageProgressSummary] = useState<StageProgressSummary | null>(null);
  const [questFinalSummary, setQuestFinalSummary] = useState<QuestFinalSummary | null>(null);
  const [, setAnalyticsSnapshot] = useState<Record<string, UserAnalytics>>({});
  const [adminUsers, setAdminUsers] = useState<AdminUserView[]>([]);
  const [adminUserSearch, setAdminUserSearch] = useState("");
  const [serverAdminMetrics, setServerAdminMetrics] = useState<AdminMetricsResponse | null>(null);
  const [isServerMetricsLoading, setIsServerMetricsLoading] = useState(false);
  const [serverMetricsError, setServerMetricsError] = useState("");
  const [expandedAdminEmail, setExpandedAdminEmail] = useState<string | null>(null);
  const questHintTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const closeQuestHintBubble = () => {
    if (questHintTimeoutRef.current) {
      clearTimeout(questHintTimeoutRef.current);
      questHintTimeoutRef.current = null;
    }
    setQuestHintBubbleText(null);
    setQuestHintBubbleTitle("Справка");
  };

  const openQuestHintBubble = (text: string, source: "instruction" | "hint") => {
    if (!text.trim()) {
      return;
    }
    if (questHintTimeoutRef.current) {
      clearTimeout(questHintTimeoutRef.current);
    }
    setQuestHintBubbleTitle(source === "instruction" ? "Вопрос" : "Подсказка");
    setQuestHintBubbleText(text);
    questHintTimeoutRef.current = setTimeout(() => {
      setQuestHintBubbleText(null);
      setQuestHintBubbleTitle("Справка");
      questHintTimeoutRef.current = null;
    }, 10000);
    trackAnalyticsEvent("hint_opened", {
      stepIndex: forestStepIndex,
      details: `${activeForestStep?.id ?? "n/a"};source:${source}`,
    }).catch(() => undefined);
  };
  const [adminGrantAmountByEmail, setAdminGrantAmountByEmail] = useState<Record<string, string>>({});
  const [adminActionMessage, setAdminActionMessage] = useState("");
  const [isClaimingDailyEnergy, setIsClaimingDailyEnergy] = useState(false);
  const soundPoolRef = useRef<Partial<Record<"tap" | "swipe" | "step_success" | "quest_finish_positive" | "quest_finish_negative", Audio.Sound>>>({});
  const soundCooldownRef = useRef<Record<string, number>>({});
  const mapScrollRef = useRef<ScrollView | null>(null);
  useEffect(() => {
    (globalThis as Record<string, unknown>).__SOFTALE_ACTIVE_TAB__ = activeTab;
  }, [activeTab]);


  const mapSearchInputRef = useRef<TextInput | null>(null);
  useEffect(() => {
    if (!isMapCatalogVisible) {
      return;
    }
    setIsMapSearchVisible(true);
    const focusTask = requestAnimationFrame(() => {
      mapSearchInputRef.current?.focus();
    });
    return () => cancelAnimationFrame(focusTask);
  }, [isMapCatalogVisible]);

  useEffect(() => {
    if (!isMapCatalogVisible || Platform.OS !== "web" || typeof window === "undefined") {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMapCatalogVisible(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isMapCatalogVisible]);

  const courseCardYRef = useRef<Partial<Record<CourseId, number>>>({});
  const successAnim = useRef(new Animated.Value(0)).current;
  const sessionStartedAtRef = useRef<number | null>(null);
  const stageStartedAtRef = useRef<number | null>(null);
  const activeTabRef = useRef<Tab>("map");
  const reactivationCheckDoneForRef = useRef<string | null>(null);
  const skipNextServerProfileSyncRef = useRef(false);
  const runtimeProgressHydratedForRef = useRef<string | null>(null);
  const runtimeProgressReadyForPersistRef = useRef<string | null>(null);
  const authBackendMode = authApi.getMode();
  const isServerAuth = authBackendMode === "server";

  const selectedQuest = useMemo(
    () => dailyQuests.find((quest) => quest.id === selectedQuestId) ?? dailyQuests[0],
    [selectedQuestId]
  );
  const activeStoryConfig = storyConfigs.find((story) => story.id === selectedStory) ?? storyConfigs[0];
  const previewStoryConfig = storyConfigs.find((story) => story.id === storyPreviewId) ?? null;
  const activeCourse = courses.find((course) => course.id === selectedCourseId) ?? courses[0];
  const activeCampaignId: CampaignId = activeProgramMode === "course" ? activeCourse.id : selectedStory;
  // Пользователь не выбирает сложность вручную: она определяется структурой кампании.
  const campaignDifficulty: QuestDifficulty =
    activeProgramMode === "course" ? activeCourse.preferredQuestions : activeStoryConfig.difficulties[0];
  const activeDifficultyConfig = difficultyConfigs.find((item) => item.questions === campaignDifficulty) ?? difficultyConfigs[0];
  const currentForestQuestSteps = useMemo(
    () =>
      activeProgramMode === "course"
        ? buildCourseQuestByDifficulty(campaignDifficulty, activeCourse.id)
        : buildForestQuestByDifficulty(campaignDifficulty, selectedStory),
    [activeProgramMode, campaignDifficulty, activeCourse.id, selectedStory]
  );
  const normalizedQuestSteps = useMemo(() => applyBuilderComplexityProgression(currentForestQuestSteps), [currentForestQuestSteps]);
  useEffect(() => {
    if (!forestStarted || forestFinished) {
      return;
    }
    const maxIdx = Math.max(0, normalizedQuestSteps.length - 1);
    if (forestStepIndex > maxIdx) {
      setForestStepIndex(maxIdx);
    }
  }, [forestFinished, forestStarted, forestStepIndex, normalizedQuestSteps.length]);
  const questForecast = useMemo(
    () => calculateQuestForecast(normalizedQuestSteps, activeDifficultyConfig, 0.8),
    [activeDifficultyConfig, normalizedQuestSteps]
  );
  const activeForestStep = normalizedQuestSteps[forestStepIndex];
  const previewStorySteps = useMemo(
    () => (previewStoryConfig ? buildForestQuestByDifficulty(previewStoryConfig.difficulties[0], previewStoryConfig.id) : []),
    [previewStoryConfig]
  );
  const eventSteps = seasonalEventMvp.steps;
  const activeEventStep: SeasonalEventStep | undefined = eventSteps[eventProgress.currentStep];
  const eventProgressPercent = Math.round((eventProgress.currentStep / eventSteps.length) * 100);
  const eventCompletedCount = Math.min(eventSteps.length, eventProgress.currentStep);
  const eventBuilderTokens = useMemo(
    () => eventSelectedBuilderIndices.map((idx) => eventShuffledTokenBank[idx]).filter((token): token is string => Boolean(token)),
    [eventSelectedBuilderIndices, eventShuffledTokenBank]
  );
  const dominantBranch: BranchId = (Object.entries(branchScore).sort((a, b) => b[1] - a[1])[0]?.[0] ??
    "strategist") as BranchId;
  const dominantEndingRoute: EndingRouteId = endingRouteByBranch[dominantBranch];
  // До выбора игрока показываем только исходную сцену шага.
  // Ветвевые NPC-реакции (sceneByBranch) относятся к последствиям выбора и
  // иначе ломают логическую связку "сцена -> реплика NPC -> варианты".
  const visibleStepScene = activeForestStep?.scene;
  const activeNpcGender: CharacterGender = inferCharacterGenderBySpeaker(
    activeForestStep?.opponentName ?? opponentNameByCampaign[activeCampaignId],
    activeCampaignId
  );
  const effectivePlayerGender = resolvePlayerGenderForCampaign(profileGender, activeCampaignId);
  const adaptQuestReplica = (rawText: string) =>
    applyGenderToPlayerReplica(applyGenderToNpcReplica(rawText, activeNpcGender), effectivePlayerGender);
  const visibleStepSceneByNpcGender = adaptQuestReplica(visibleStepScene ?? "");
  const visibleStepDispositionByNpcGender = adaptQuestReplica(
    activeForestStep?.dispositionText ?? visibleStepScene ?? activeForestStep?.scene ?? ""
  );
  const visibleStepSpeechByNpcGender = adaptQuestReplica(
    activeForestStep?.opponentSpeech ?? visibleStepScene ?? activeForestStep?.scene ?? ""
  );
  const visibleStepInstructionByPlayerGender = applyGenderToPlayerReplica(activeForestStep?.instruction ?? "", effectivePlayerGender);
  const visibleStepHintByPlayerGender = applyGenderToPlayerReplica(activeForestStep?.hint ?? "", effectivePlayerGender);
  const visibleStepOptions = useMemo(() => {
    const sourceOptions = activeForestStep?.options ?? [];
    if (!sourceOptions.length) {
      return [];
    }
    if (displayOptionOrder.length !== sourceOptions.length) {
      return sourceOptions;
    }
    return displayOptionOrder.map((sourceIndex) => sourceOptions[sourceIndex]).filter((item): item is string => typeof item === "string");
  }, [activeForestStep?.options, displayOptionOrder]);
  const builderTokens = useMemo(
    () => selectedBuilderIndices.map((idx) => shuffledTokenBank[idx]).filter((token): token is string => Boolean(token)),
    [selectedBuilderIndices, shuffledTokenBank]
  );
  const visibleBuilderTokens = useMemo(
    () => builderTokens.map((token) => applyGenderToPlayerReplica(token, effectivePlayerGender)),
    [builderTokens, effectivePlayerGender]
  );
  const visibleShuffledTokenBank = useMemo(
    () => shuffledTokenBank.map((token) => applyGenderToPlayerReplica(token, effectivePlayerGender)),
    [effectivePlayerGender, shuffledTokenBank]
  );
  const sfxSource = useMemo(
    () => ({
      tap: require("./assets/sfx/tap.wav"),
      swipe: require("./assets/sfx/swipe.wav"),
      step_success: require("./assets/sfx/success.wav"),
      quest_finish_positive: require("./assets/sfx/finish_positive.wav"),
      quest_finish_negative: require("./assets/sfx/finish_negative.wav"),
    }),
    []
  );

  const playSfx = async (cue: keyof typeof sfxSource) => {
    if (!soundEnabled) {
      return;
    }
    const now = Date.now();
    const minGapByCue: Partial<Record<keyof typeof sfxSource, number>> = {
      tap: 60,
      swipe: 90,
      step_success: 140,
    };
    const last = soundCooldownRef.current[cue] ?? 0;
    if (now - last < (minGapByCue[cue] ?? 0)) {
      return;
    }
    soundCooldownRef.current[cue] = now;
    const loaded = soundPoolRef.current[cue];
    if (!loaded) {
      return;
    }
    try {
      await loaded.replayAsync();
    } catch {
      // Ignore transient playback errors to keep gameplay smooth.
    }
  };

  const withUserAnalytics = (user: AuthUser, nowIso: string) => {
    if (user.analytics) {
      user.analytics.counters.answersCorrect ??= 0;
      user.analytics.counters.answersIncorrect ??= 0;
      user.analytics.answerByErrorType ??= {};
      user.analytics.answerByTactic ??= {};
      return user.analytics;
    }
    return buildDefaultAnalytics(nowIso);
  };

  useEffect(() => {
    let disposed = false;

    const setupSounds = async () => {
      if (!soundEnabled) {
        const loaded = Object.values(soundPoolRef.current);
        for (const sound of loaded) {
          try {
            await sound?.unloadAsync();
          } catch {
            // Ignore unload failures.
          }
        }
        soundPoolRef.current = {};
        return;
      }

      try {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
        });
      } catch {
        // Keep UX resilient if platform does not support all audio flags.
      }

      const cues = Object.keys(sfxSource) as Array<keyof typeof sfxSource>;
      for (const cue of cues) {
        if (disposed || soundPoolRef.current[cue]) {
          continue;
        }
        try {
          const { sound } = await Audio.Sound.createAsync(sfxSource[cue], {
            shouldPlay: false,
            volume: cue.includes("finish") ? 0.46 : 0.36,
          });
          soundPoolRef.current[cue] = sound;
        } catch {
          // If one cue fails, others should still load.
        }
      }
    };

    setupSounds().catch(() => undefined);
    return () => {
      disposed = true;
    };
  }, [sfxSource, soundEnabled]);

  useEffect(() => {
    return () => {
      const loaded = Object.values(soundPoolRef.current);
      loaded.forEach((sound) => {
        sound?.unloadAsync().catch(() => undefined);
      });
      soundPoolRef.current = {};
    };
  }, []);

  useEffect(() => {
    if (openAchievementId && !unlockedAchievements.includes(openAchievementId)) {
      setOpenAchievementId(null);
    }
  }, [openAchievementId, unlockedAchievements]);

  useEffect(() => {
    const duplicates = runGlobalOptionUniquenessAudit();
    if (duplicates.length) {
      console.error("[content-audit] Duplicate options found:", duplicates.slice(0, 20));
    }
  }, []);

  useEffect(() => {
    if (!currentUserEmail || !isProfileHydrated) {
      return;
    }
    if (reactivationCheckDoneForRef.current === currentUserEmail) {
      return;
    }
    reactivationCheckDoneForRef.current = currentUserEmail;

    if (!welcomeEnergyGranted) {
      setWelcomeEnergyGranted(true);
      grantEnergy(ENERGY_WELCOME_BONUS, "welcome_bonus");
      setPromoInfo(`Добро пожаловать: +${ENERGY_WELCOME_BONUS} энергии.`);
      return;
    }

    const nowIso = new Date().toISOString();
    if (!lastSeenAt) {
      setLastSeenAt(nowIso);
      return;
    }

    const daysAway = Math.floor((Date.now() - Date.parse(lastSeenAt)) / (24 * 60 * 60 * 1000));
    if (daysAway >= 30) {
      grantEnergy(ENERGY_REACTIVATION_30D_BONUS, "reactivation_30d");
      setPromoInfo(`С возвращением! +${ENERGY_REACTIVATION_30D_BONUS} энергии за 30+ дней.`);
    } else if (daysAway >= 14) {
      grantEnergy(ENERGY_REACTIVATION_14D_BONUS, "reactivation_14d");
      setPromoInfo(`С возвращением! +${ENERGY_REACTIVATION_14D_BONUS} энергии за 14+ дней.`);
    } else if (daysAway >= 7) {
      grantEnergy(ENERGY_REACTIVATION_7D_BONUS, "reactivation_7d");
      setPromoInfo(`С возвращением! +${ENERGY_REACTIVATION_7D_BONUS} энергии за 7+ дней.`);
    }
    setLastSeenAt(nowIso);
  }, [currentUserEmail, isProfileHydrated, lastSeenAt, welcomeEnergyGranted]);

  const refreshAnalyticsSnapshot = async () => {
    if (isServerAuth && currentUserRole === "ADMIN") {
      setIsServerMetricsLoading(true);
      setServerMetricsError("");
      try {
        const metrics = await analyticsApi.getAdminMetrics();
        setServerAdminMetrics(metrics);
        const nextAdminUsers: AdminUserView[] = metrics.perUser.map((user) => {
          const seedIso = user.lastSeenAt ?? new Date().toISOString();
          const analytics = buildDefaultAnalytics(seedIso);
          analytics.lastSeenAt = user.lastSeenAt ?? analytics.lastSeenAt;
          analytics.totalSessions = user.sessions24h;
          analytics.counters.questStarts = user.questStarts24h;
          analytics.counters.questCompletions = user.questCompletions24h;
          analytics.counters.dropOffs = user.dropOff24h;
          return {
            email: user.email,
            role: (user.role as UserRole) ?? "USER",
            xp: user.wallet.xp,
            energy: user.wallet.energy,
            analytics,
          };
        });
        setAdminUsers(nextAdminUsers);
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Не удалось загрузить серверные метрики.";
        setServerMetricsError(message);
        // В server-режиме не показываем локальный fallback-список пользователей,
        // иначе админ видит "фантомных" юзеров, которых нет в backend БД.
        setAnalyticsSnapshot({});
        setAdminUsers([]);
        return;
      } finally {
        setIsServerMetricsLoading(false);
      }
    }

    const raw = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) {
      setAnalyticsSnapshot({});
      setAdminUsers([]);
      return;
    }
    const parsed = JSON.parse(raw) as AuthStore;
    const next: Record<string, UserAnalytics> = {};
    const nextAdminUsers: AdminUserView[] = [];
    Object.values(parsed.users).forEach((user) => {
      if (user.analytics) {
        next[user.email] = user.analytics;
        nextAdminUsers.push({
          email: user.email,
          role: user.role ?? "USER",
          xp: typeof user.profile.xp === "number" ? user.profile.xp : 0,
          energy: typeof user.profile.energy === "number" ? user.profile.energy : 0,
          analytics: user.analytics,
        });
      }
    });
    setAnalyticsSnapshot(next);
    setAdminUsers(nextAdminUsers.sort((a, b) => (a.analytics.lastSeenAt < b.analytics.lastSeenAt ? 1 : -1)));
  };

  const refreshFriendProfiles = async (emails: string[] = friendEmails) => {
    const raw = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) {
      setFriendProfiles({});
      return;
    }
    const store = JSON.parse(raw) as AuthStore;
    const next: Record<string, Pick<UserProfile, "displayName" | "aboutMe" | "xp" | "energy" | "completedCount" | "conflictPrimaryStyle">> = {};
    emails.forEach((email) => {
      const target = store.users[email];
      if (!target) return;
      next[email] = {
        displayName: sanitizeShortText(target.profile.displayName, "Игрок", 60),
        aboutMe: sanitizeShortText(target.profile.aboutMe, "Тренирует навыки общения.", 180),
        xp: typeof target.profile.xp === "number" ? target.profile.xp : 0,
        energy: typeof target.profile.energy === "number" ? target.profile.energy : 0,
        completedCount: typeof target.profile.completedCount === "number" ? target.profile.completedCount : 0,
        conflictPrimaryStyle: sanitizeConflictStyle(target.profile.conflictPrimaryStyle),
      };
    });
    setFriendProfiles(next);
    if (openedFriendEmail && !next[openedFriendEmail]) {
      setOpenedFriendEmail(null);
    }
    if (selectedFriendEmail && !next[selectedFriendEmail]) {
      setSelectedFriendEmail("");
    }
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

    if (isServerAuth) {
      try {
        await analyticsApi.trackEvent({
          type,
          details: payload.details,
          tab: payload.tab,
          courseId: payload.courseId,
          storyId: payload.storyId,
          difficulty: payload.difficulty,
          stepIndex: payload.stepIndex,
        });
      } catch {
        // swallow analytics transport errors to avoid breaking core UX
      }
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
    if (type === "stage_start") analytics.counters.stageStarts += 1;
    if (type === "stage_complete") analytics.counters.stageCompletions += 1;
    if (type === "step_fail") analytics.counters.stepFails += 1;
    if (type === "penalty_applied") analytics.counters.penalties += 1;
    if (type === "drop_off") analytics.counters.dropOffs += 1;
    if (type === "answer_correct") analytics.counters.answersCorrect += 1;
    if (type === "answer_incorrect") analytics.counters.answersIncorrect += 1;
    if (type === "answer_correct" || type === "answer_incorrect") {
      const details = payload.details ?? "";
      const typeMatch = details.match(/type:([^;]+)/);
      const tacticMatch = details.match(/tactic:([^;]+)/);
      const parsedType = typeMatch?.[1]?.trim();
      const parsedTactic = tacticMatch?.[1]?.trim();
      if (parsedType) {
        analytics.answerByErrorType ??= {};
        analytics.answerByErrorType[parsedType] = (analytics.answerByErrorType[parsedType] ?? 0) + 1;
      }
      if (parsedTactic && parsedTactic !== "n/a") {
        analytics.answerByTactic ??= {};
        analytics.answerByTactic[parsedTactic] = (analytics.answerByTactic[parsedTactic] ?? 0) + 1;
      }
    }
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
      setDisplayOptionOrder([]);
      return;
    }
    setShuffledTokenBank([]);
    setSelectedBuilderIndices([]);
    const optionCount = activeForestStep?.options?.length ?? 0;
    // UI-random: перемешиваем только визуальный порядок, логика остается по sourceIndex.
    setDisplayOptionOrder(optionCount > 0 ? shuffleIndices(optionCount) : []);
  }, [activeForestStep]);

  useEffect(() => {
    closeQuestHintBubble();
  }, [forestStepIndex, forestStarted]);

  useEffect(() => {
    const persistRuntimeQuestProgress = async () => {
      if (!currentUserEmail || !isProfileHydrated) {
        return;
      }
      if (runtimeProgressReadyForPersistRef.current !== currentUserEmail) {
        return;
      }
      const snapshot: RuntimeQuestProgressSnapshot = {
        activeProgramMode,
        selectedStory,
        selectedCourseId,
        selectedDifficulty,
        forestStepIndex: Math.max(0, forestStepIndex),
        forestStarted,
        forestFinished,
        updatedAt: new Date().toISOString(),
      };
      try {
        await AsyncStorage.setItem(`${RUNTIME_QUEST_PROGRESS_KEY}:${currentUserEmail}`, JSON.stringify(snapshot));
      } catch {
        // Runtime snapshot is best-effort and must not break core flow.
      }
    };
    persistRuntimeQuestProgress();
  }, [
    activeProgramMode,
    currentUserEmail,
    forestFinished,
    forestStarted,
    forestStepIndex,
    isProfileHydrated,
    selectedCourseId,
    selectedDifficulty,
    selectedStory,
  ]);

  useEffect(() => {
    const hydrateRuntimeQuestProgress = async () => {
      if (!currentUserEmail || !isProfileHydrated) {
        return;
      }
      runtimeProgressReadyForPersistRef.current = null;
      if (runtimeProgressHydratedForRef.current === currentUserEmail) {
        runtimeProgressReadyForPersistRef.current = currentUserEmail;
        return;
      }
      runtimeProgressHydratedForRef.current = currentUserEmail;
      try {
        const raw = await AsyncStorage.getItem(`${RUNTIME_QUEST_PROGRESS_KEY}:${currentUserEmail}`);
        if (!raw) {
          return;
        }
        const snapshot = JSON.parse(raw) as Partial<RuntimeQuestProgressSnapshot>;
        if (snapshot.activeProgramMode === "story" || snapshot.activeProgramMode === "course") {
          setActiveProgramMode(snapshot.activeProgramMode);
        }
        if (typeof snapshot.selectedStory === "string" && storyConfigs.some((story) => story.id === snapshot.selectedStory)) {
          setSelectedStory(snapshot.selectedStory);
        }
        if (typeof snapshot.selectedCourseId === "string" && courses.some((course) => course.id === snapshot.selectedCourseId)) {
          setSelectedCourseId(snapshot.selectedCourseId as CourseId);
        }
        if (
          typeof snapshot.selectedDifficulty === "number" &&
          [5, 10, 15, 25, 125].includes(snapshot.selectedDifficulty)
        ) {
          setSelectedDifficulty(snapshot.selectedDifficulty as QuestDifficulty);
        }
        if (typeof snapshot.forestStarted === "boolean") {
          setForestStarted(snapshot.forestStarted);
        }
        if (typeof snapshot.forestFinished === "boolean") {
          setForestFinished(snapshot.forestFinished);
        }
        if (typeof snapshot.forestStepIndex === "number" && Number.isFinite(snapshot.forestStepIndex)) {
          setForestStepIndex(Math.max(0, Math.floor(snapshot.forestStepIndex)));
        }
      } catch {
        // Ignore broken snapshot and continue with profile defaults.
      } finally {
        runtimeProgressReadyForPersistRef.current = currentUserEmail;
      }
    };
    hydrateRuntimeQuestProgress();
  }, [currentUserEmail, isProfileHydrated, courses, storyConfigs]);

  useEffect(() => {
    return () => {
      if (questHintTimeoutRef.current) {
        clearTimeout(questHintTimeoutRef.current);
        questHintTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (activeEventStep?.type === "builder") {
      setEventShuffledTokenBank(shuffleWords(activeEventStep.tokenBank ?? []));
      setEventSelectedBuilderIndices([]);
      return;
    }
    setEventShuffledTokenBank([]);
    setEventSelectedBuilderIndices([]);
  }, [activeEventStep]);

  useEffect(() => {
    if (selectedDifficulty !== campaignDifficulty) {
      setSelectedDifficulty(campaignDifficulty);
    }
  }, [campaignDifficulty, selectedDifficulty]);

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
    if (!currentUserEmail || !isProfileHydrated) {
      setFriendProfiles({});
      return;
    }
    refreshFriendProfiles().catch(() => undefined);
  }, [currentUserEmail, isProfileHydrated, friendEmails]);

  useEffect(() => {
    const from = animatedXp;
    const to = xp;
    if (from === to) {
      return;
    }
    const startedAt = Date.now();
    const duration = 1000;
    const timer = setInterval(() => {
      const progress = Math.min(1, (Date.now() - startedAt) / duration);
      const value = Math.round(from + (to - from) * progress);
      setAnimatedXp(value);
      if (progress >= 1) {
        clearInterval(timer);
      }
    }, 40);
    return () => clearInterval(timer);
  }, [xp]);

  useEffect(() => {
    const from = animatedEnergy;
    const to = energy;
    if (from === to) {
      return;
    }
    const startedAt = Date.now();
    const duration = 1000;
    const timer = setInterval(() => {
      const progress = Math.min(1, (Date.now() - startedAt) / duration);
      const value = Math.round(from + (to - from) * progress);
      setAnimatedEnergy(value);
      if (progress >= 1) {
        clearInterval(timer);
      }
    }, 40);
    return () => clearInterval(timer);
  }, [energy]);

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
        if (isServerAuth) {
          const token = await AsyncStorage.getItem(authApi.storageKey);
          if (!token) {
            setAuthReady(true);
            return;
          }
          try {
            const me = await authApi.me(token);
            applyServerUserSnapshot(me.user.email, (me.user.role ?? "USER") as UserRole, me.user.profile, me.economy);
            sessionStartedAtRef.current = Date.now();
          } catch {
            await AsyncStorage.removeItem(authApi.storageKey);
          } finally {
            setAuthReady(true);
            return;
          }
        }
        const raw = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
        if (!raw) {
          const nowIso = new Date().toISOString();
          const seededStore: AuthStore = {
            users: createSeedUsers(nowIso),
            currentEmail: null,
          };
          await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(seededStore));
          setAuthReady(true);
          return;
        }

        const parsed = JSON.parse(raw) as AuthStore;
        const nowIso = new Date().toISOString();
        parsed.users[ADMIN_EMAIL] ??= {
          email: ADMIN_EMAIL,
          password: ADMIN_PASSWORD,
          role: "ADMIN",
          profile: buildDefaultProfile(),
          analytics: buildDefaultAnalytics(nowIso),
        };
        parsed.users[USER_EMAIL] ??= {
          email: USER_EMAIL,
          password: USER_PASSWORD,
          role: "USER",
          profile: buildDefaultProfile(),
          analytics: buildDefaultAnalytics(nowIso),
        };
        Object.values(parsed.users).forEach((entry) => {
          if (!entry.role) {
            entry.role = entry.email === ADMIN_EMAIL ? "ADMIN" : "USER";
          }
        });
        await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(parsed));
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
        setCurrentUserRole(user.role ?? "USER");
        const safeDisplayName = sanitizeShortText(user.profile.displayName, "Герой леса", 60);
        setDisplayName(safeDisplayName);
        setProfileNameDraft(safeDisplayName);
        setAvatarUri(sanitizeAvatarUri(user.profile.avatarUri));
        setProfileGender(sanitizeProfileGender((user.profile as Partial<UserProfile>).gender));
        setIsAdult18Plus(Boolean((user.profile as Partial<UserProfile>).isAdult18Plus ?? true));
        setProfileSetupDone(Boolean(user.profile.profileSetupDone));
        setAboutMe(sanitizeShortText(user.profile.aboutMe, "Тренирую диалог и границы в сложных разговорах.", 180));
        setFriendEmails(sanitizeStringArray(user.profile.friendEmails));
        setSelectedFriendEmail("");
        setOpenedFriendEmail(null);
        setXp(user.profile.xp);
        setEnergy(typeof user.profile.energy === "number" ? user.profile.energy : 120);
        setCompletedCount(user.profile.completedCount);
        setLastFeedback(user.profile.lastFeedback);
        setSelectedQuestId(user.profile.selectedQuestId);
        setEventProgress(sanitizeEventProgress(user.profile.eventProgress, (user.profile as { eventJoined?: boolean }).eventJoined));
        setSelectedDifficulty(user.profile.selectedDifficulty);
        setSelectedStory(user.profile.selectedStory);
        setStartedStoryIds(
          sanitizeStringArray((user.profile as Partial<UserProfile>).startedStoryIds).filter((id): id is QuestStory =>
            storyConfigs.some((story) => story.id === id)
          )
        );
        setActiveTab((user.role ?? "USER") === "ADMIN" ? user.profile.activeTab : user.profile.activeTab === "admin" ? "map" : user.profile.activeTab);
        const safePrimaryStyle = sanitizeConflictStyle(user.profile.conflictPrimaryStyle);
        setConflictPrimaryStyle(safePrimaryStyle);
        setConflictSecondaryStyles(sanitizeSecondaryConflictStyles(user.profile.conflictSecondaryStyles, safePrimaryStyle));
        setDiagnosticCompleted(Boolean(user.profile.diagnosticCompleted));
        setSelectedCourseId(user.profile.selectedCourseId ?? recommendedCourseByConflictStyle[safePrimaryStyle]);
        setActiveProgramMode(user.profile.activeProgramMode ?? "story");
        setUnlockedEndings(sanitizeStringArray(user.profile.unlockedEndings));
        setUnlockedAchievements(sanitizeStringArray(user.profile.unlockedAchievements));
        setPracticeStats(sanitizePracticeStats(user.profile.practiceStats));
        setQuestRatingStats(sanitizeQuestRatingStats(user.profile.questRatingStats));
        setSoundEnabled(typeof user.profile.soundEnabled === "boolean" ? user.profile.soundEnabled : true);
        setClaimedDailyEnergyAt(user.profile.claimedDailyEnergyAt ?? null);
        setWelcomeEnergyGranted(Boolean(user.profile.welcomeEnergyGranted));
        setGrantedPerfectStageIds(sanitizeStringArray(user.profile.grantedPerfectStageIds));
        setRedeemedPromoCodes(sanitizeStringArray(user.profile.redeemedPromoCodes));
        setReferralInvitesCompleted(typeof user.profile.referralInvitesCompleted === "number" ? user.profile.referralInvitesCompleted : 0);
        setUnlockedPaidStageKeys(sanitizeStringArray(user.profile.unlockedPaidStageKeys));
        setEnergyTransfersSentToday(typeof user.profile.energyTransfersSentToday === "number" ? user.profile.energyTransfersSentToday : 0);
        setEnergyTransfersSentWeek(typeof user.profile.energyTransfersSentWeek === "number" ? user.profile.energyTransfersSentWeek : 0);
        setLastEnergyTransferAt(user.profile.lastEnergyTransferAt ?? null);
        setLastSeenAt(user.profile.lastSeenAt ?? null);
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
  }, [isServerAuth]);

  useEffect(() => {
    const persistProfile = async () => {
      if (!currentUserEmail || !isProfileHydrated) {
        return;
      }

      if (isServerAuth) {
        if (skipNextServerProfileSyncRef.current) {
          skipNextServerProfileSyncRef.current = false;
          return;
        }
        try {
          const token = await AsyncStorage.getItem(authApi.storageKey);
          if (!token) {
            return;
          }
          await authApi.syncProfile(token, {
            displayName,
            avatarUri,
            gender: profileGender,
            isAdult18Plus,
            profileSetupDone,
            aboutMe,
            friendEmails,
            xp,
            energy,
            completedCount,
            lastFeedback,
            selectedQuestId,
            eventProgress,
            selectedDifficulty,
            selectedStory,
            startedStoryIds,
            activeProgramMode,
            activeTab,
            conflictPrimaryStyle,
            conflictSecondaryStyles,
            diagnosticCompleted,
            selectedCourseId,
            unlockedEndings,
            unlockedAchievements,
            practiceStats,
            questRatingStats,
            soundEnabled,
            claimedDailyEnergyAt,
            welcomeEnergyGranted,
            grantedPerfectStageIds,
            redeemedPromoCodes,
            referralInvitesCompleted,
            unlockedPaidStageKeys,
            energyTransfersSentToday,
            energyTransfersSentWeek,
            lastEnergyTransferAt,
            lastSeenAt: new Date().toISOString(),
          });
        } catch {
          // keep local UX resilient on temporary backend errors
        }
        return;
      }

      setIsSavingProfile(true);
      try {
        const raw = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
        const store: AuthStore = raw
          ? (JSON.parse(raw) as AuthStore)
          : {
              users: createSeedUsers(new Date().toISOString()),
              currentEmail: null,
            };
        const user = store.users[currentUserEmail];
        if (!user) {
          return;
        }

        user.profile = {
          displayName,
          avatarUri,
          gender: profileGender,
          isAdult18Plus,
          profileSetupDone,
          aboutMe,
          friendEmails,
          xp,
          energy,
          completedCount,
          lastFeedback,
          selectedQuestId,
          eventProgress,
          selectedDifficulty,
          selectedStory,
          startedStoryIds,
          activeProgramMode,
          activeTab,
          conflictPrimaryStyle,
          conflictSecondaryStyles,
          diagnosticCompleted,
          selectedCourseId,
          unlockedEndings,
          unlockedAchievements,
          practiceStats,
          questRatingStats,
          soundEnabled,
          claimedDailyEnergyAt,
          welcomeEnergyGranted,
          grantedPerfectStageIds,
          redeemedPromoCodes,
          referralInvitesCompleted,
          unlockedPaidStageKeys,
          energyTransfersSentToday,
          energyTransfersSentWeek,
          lastEnergyTransferAt,
          lastSeenAt: new Date().toISOString(),
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
    displayName,
    avatarUri,
    profileGender,
    isAdult18Plus,
    profileSetupDone,
    aboutMe,
    completedCount,
    conflictPrimaryStyle,
    conflictSecondaryStyles,
    currentUserEmail,
    friendEmails,
    eventProgress,
    isProfileHydrated,
    lastFeedback,
    selectedDifficulty,
    selectedQuestId,
    selectedStory,
    startedStoryIds,
    activeProgramMode,
    diagnosticCompleted,
    selectedCourseId,
    unlockedEndings,
    unlockedAchievements,
    practiceStats,
    questRatingStats,
    soundEnabled,
    claimedDailyEnergyAt,
    welcomeEnergyGranted,
    grantedPerfectStageIds,
    redeemedPromoCodes,
    referralInvitesCompleted,
    unlockedPaidStageKeys,
    energyTransfersSentToday,
    energyTransfersSentWeek,
    lastEnergyTransferAt,
    lastSeenAt,
    energy,
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
    grantEnergy(ENERGY_REFLECTION_BONUS, "reflection_task");
    setLastFeedback(
      `Хороший ход. Ты добавила осознанность в ${selectedQuest.biome}. +${ENERGY_REFLECTION_BONUS} энергии за рефлексию. ${
        followUpHints[(completedCount + 1) % followUpHints.length]
      }`
    );
    setAnswer("");
    setActiveTab("feedback");
  };

  const resetStepUi = () => {
    setSelectedSingle(null);
    setSelectedMultiple([]);
    setSelectedBuilderIndices([]);
    setBuilderMismatchIndices([]);
    setStepErrorCount(0);
    closeQuestHintBubble();
    // Порядок для следующего шага выставится в useEffect по activeForestStep.
    // Здесь сбрасываем, чтобы не перетаскивать порядок предыдущего вопроса.
    setDisplayOptionOrder([]);
  };
  const resetStageAnalytics = () => {
    setStageTacticUsage({
      strategist: 0,
      empath: 0,
      boundary: 0,
      challenger: 0,
      architect: 0,
    });
    setStageForgivenErrorByType({});
  };

  const buildStageSummary = (stageIdx: number, durationSec: number) => {
    const totalAnswers = Object.values(stageTacticUsage).reduce((acc, value) => acc + value, 0);
    const forgivenErrors = Object.values(stageForgivenErrorByType).reduce((acc, value) => acc + value, 0);
    const topBranch = buildBranchScaleData(stageTacticUsage).sort((a, b) => b.value - a.value)[0];
    const topTacticName = topBranch ? branchScaleUi[topBranch.branch].label : "смешанный стиль";
    const conflictTrend =
      forgivenErrors === 0
        ? "Этап прошел ровно: ты близко к договоренности."
        : forgivenErrors <= Math.max(1, Math.round(totalAnswers * 0.25))
          ? "Есть трение, но ты держишь линию к решению."
          : "Напряжение выросло: риск конфликта пока выше, чем риск договоренности.";
    setStageProgressSummary({
      stageIdx,
      durationSec,
      forgivenErrorByType: stageForgivenErrorByType,
      tacticUsage: stageTacticUsage,
      narrative: `${conflictTrend} Ведущий подход этапа: ${topTacticName}.`,
    });
    resetStageAnalytics();
  };
  const stageAnalyticsSuffix = () => {
    const forgivenTotal = Object.values(stageForgivenErrorByType).reduce((acc, value) => acc + value, 0);
    const tacticTotal = Object.values(stageTacticUsage).reduce((acc, value) => acc + value, 0);
    const topTactic = buildBranchScaleData(stageTacticUsage).sort((a, b) => b.value - a.value)[0];
    return `forgiven_total:${forgivenTotal};tactic_answers:${tacticTotal};top_tactic:${topTactic?.branch ?? "n/a"};top_tactic_pct:${topTactic?.percent ?? 0}`;
  };

  const resetEventStepUi = () => {
    setEventSelectedSingle(null);
    setEventSelectedMultiple([]);
    setEventSelectedBuilderIndices([]);
    setEventWrongSingleIndex(null);
    setEventStepErrorCount(0);
    setEventShowHint(false);
  };

  const startSeasonEvent = () => {
    setEventProgress((prev) => ({
      ...prev,
      eventId: seasonalEventMvp.id,
      joined: true,
      started: true,
      finished: false,
      rewardClaimed: false,
      currentStep: 0,
      completedStepIds: [],
      xpEarned: 0,
      energyEarned: 0,
      errors: 0,
      penalties: 0,
    }));
    resetEventStepUi();
    setEventStepMessage("Сезон запущен. Пройди 10 сцен и забери артефакт.");
    trackAnalyticsEvent("event_join", { details: `event:${seasonalEventMvp.id}` }).catch(() => undefined);
  };

  const claimSeasonEventReward = () => {
    if (!eventProgress.finished || eventProgress.rewardClaimed) {
      return;
    }
    setXp((prev) => prev + seasonalEventMvp.completionReward.xp);
    grantEnergy(seasonalEventMvp.completionReward.energy, `event_complete:${seasonalEventMvp.id}`);
    setEventProgress((prev) => ({
      ...prev,
      rewardClaimed: true,
    }));
    setEventStepMessage(
      `Награда выдана: +${seasonalEventMvp.completionReward.xp} XP, +${seasonalEventMvp.completionReward.energy} энергии.`
    );
    trackAnalyticsEvent("event_reward_claim", { details: `event:${seasonalEventMvp.id}` }).catch(() => undefined);
  };

  const passSeasonEventStep = (isCorrectOnSubmit: boolean) => {
    if (!activeEventStep) {
      return;
    }
    setXp((prev) => prev + activeEventStep.rewardXp);
    grantEnergy(activeEventStep.rewardEnergy, `event_step:${activeEventStep.id}`);
    setEventProgress((prev) => {
      const nextStep = Math.min(eventSteps.length, prev.currentStep + 1);
      const nextCompleted = prev.completedStepIds.includes(activeEventStep.id)
        ? prev.completedStepIds
        : [...prev.completedStepIds, activeEventStep.id];
      const finished = nextStep >= eventSteps.length;
      if (finished) {
        trackAnalyticsEvent("event_complete", {
          details: `event:${seasonalEventMvp.id};errors:${prev.errors};penalties:${prev.penalties}`,
        }).catch(() => undefined);
      }
      return {
        ...prev,
        started: true,
        joined: true,
        currentStep: nextStep,
        completedStepIds: nextCompleted,
        xpEarned: prev.xpEarned + activeEventStep.rewardXp,
        energyEarned: prev.energyEarned + activeEventStep.rewardEnergy,
        finished,
      };
    });
    setEventStepMessage(
      isCorrectOnSubmit
        ? `Отлично: +${activeEventStep.rewardXp} XP и +${activeEventStep.rewardEnergy} энергии.`
        : `Шаг принят со штрафом, но ты идешь дальше: +${activeEventStep.rewardXp} XP и +${activeEventStep.rewardEnergy} энергии.`
    );
    trackAnalyticsEvent("event_step_pass", {
      details: `event:${seasonalEventMvp.id};step:${activeEventStep.id};correct:${isCorrectOnSubmit ? "yes" : "no"}`,
      stepIndex: eventProgress.currentStep,
    }).catch(() => undefined);
    resetEventStepUi();
  };

  const evaluateSeasonEventStep = () => {
    if (!activeEventStep || eventProgress.finished) {
      return;
    }

    let isCorrect = false;
    if (activeEventStep.type === "single") {
      if (eventSelectedSingle === null) {
        setEventStepMessage("Выбери один вариант ответа.");
        return;
      }
      isCorrect = eventSelectedSingle === activeEventStep.correctSingle;
    }
    if (activeEventStep.type === "multiple") {
      const sortedSelected = [...eventSelectedMultiple].sort((a, b) => a - b);
      const sortedCorrect = [...(activeEventStep.correctMultiple ?? [])].sort((a, b) => a - b);
      if (!sortedSelected.length) {
        setEventStepMessage("Выбери варианты для проверки.");
        return;
      }
      isCorrect = sortedSelected.length === sortedCorrect.length && sortedSelected.every((value, idx) => value === sortedCorrect[idx]);
    }
    if (activeEventStep.type === "builder") {
      const expected = activeEventStep.targetBuilder ?? [];
      if (!expected.length) {
        setEventStepMessage("Шаг временно недоступен.");
        return;
      }
      isCorrect = eventBuilderTokens.join(" ").trim() === expected.join(" ").trim();
      if (!eventBuilderTokens.length) {
        setEventStepMessage("Собери фразу из слов.");
        return;
      }
    }

    if (isCorrect) {
      passSeasonEventStep(true);
      return;
    }

    setEventProgress((prev) => ({ ...prev, errors: prev.errors + 1 }));
    trackAnalyticsEvent("event_step_fail", {
      details: `event:${seasonalEventMvp.id};step:${activeEventStep.id};try:${eventStepErrorCount + 1}`,
      stepIndex: eventProgress.currentStep,
    }).catch(() => undefined);

    if (eventStepErrorCount === 0) {
      if (activeEventStep.type === "single" && eventSelectedSingle !== null) {
        setEventWrongSingleIndex(eventSelectedSingle);
      }
      setEventStepErrorCount(1);
      setEventStepMessage("Первая ошибка: подсветила неудачный ответ. Попробуй еще раз.");
      return;
    }

    const eventPenalty = 5;
    setXp((prev) => Math.max(0, prev - eventPenalty));
    setEventProgress((prev) => ({ ...prev, penalties: prev.penalties + 1 }));
    passSeasonEventStep(false);
  };

  const refreshEmpathyPairs = useCallback(async () => {
    if (authBackendMode !== "server" || !currentUserEmail) {
      return;
    }
    try {
      const response = await empathyApi.listPairs();
      setEmpathyPairs(response.pairs);
    } catch (error) {
      setPairEventMessage(error instanceof Error ? error.message : "Не удалось загрузить парный ивент.");
    }
  }, [authBackendMode, currentUserEmail]);

  const inviteToEmpathyPair = async () => {
    if (authBackendMode !== "server") {
      setPairEventMessage("Парный ивент доступен только в server-режиме авторизации.");
      return;
    }
    const friendEmail = pairFriendEmailDraft.trim().toLowerCase();
    if (!friendEmail.includes("@")) {
      setPairEventMessage("Введи корректный email друга.");
      return;
    }
    setPairInviteLoading(true);
    try {
      const response = await empathyApi.invite(friendEmail);
      setEmpathyPairs((prev) => {
        const withoutCurrent = prev.filter((pair) => pair.id !== response.pair.id);
        return [response.pair, ...withoutCurrent];
      });
      setPairFriendEmailDraft("");
      setPairEventMessage("Пара создана. Теперь оба проходите 2 серии вопросов.");
    } catch (error) {
      setPairEventMessage(error instanceof Error ? error.message : "Не удалось создать парный ивент.");
    } finally {
      setPairInviteLoading(false);
    }
  };

  const startEmpathyPass = (pair: EmpathyPairView, passType: EmpathyPassType) => {
    setActivePairId(pair.id);
    setActivePairPassType(passType);
    const savedAnswers = passType === "self_actual" ? pair.me.selfActualAnswers : pair.me.friendPredictionAnswers;
    const questionSet = pairEmpathyQuestionBankByPassType[passType];
    setActivePairAnswers(
      Array.from({ length: questionSet.length }, (_, idx) => (Array.isArray(savedAnswers) ? (savedAnswers[idx] ?? -1) : -1))
    );
  };

  const submitEmpathyPass = async () => {
    if (!activePairId || !activePairPassType) {
      setPairEventMessage("Выбери пару и тип проходки.");
      return;
    }
    if (activePairAnswers.some((value) => value < 0)) {
      setPairEventMessage("Заполни все ответы, чтобы отправить проходку.");
      return;
    }
    setPairSubmitLoading(true);
    try {
      const response = await empathyApi.submitPass(activePairId, activePairPassType, activePairAnswers);
      setEmpathyPairs((prev) => {
        const withoutCurrent = prev.filter((pair) => pair.id !== response.pair.id);
        return [response.pair, ...withoutCurrent];
      });
      setPairEventMessage("Проходка сохранена.");
      setActivePairId(null);
      setActivePairPassType(null);
      setActivePairAnswers(Array.from({ length: pairEmpathyQuestionBankByPassType.self_actual.length }, () => -1));
      await refreshEmpathyPairs();
    } catch (error) {
      setPairEventMessage(error instanceof Error ? error.message : "Не удалось сохранить проходку.");
    } finally {
      setPairSubmitLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab !== "event" || authBackendMode !== "server" || !currentUserEmail) {
      return;
    }
    refreshEmpathyPairs().catch(() => undefined);
  }, [activeTab, authBackendMode, currentUserEmail, refreshEmpathyPairs]);

  const openStageFromRoad = async (stageIdx: number) => {
    const startIdx = stageStartIndices[stageIdx];
    if (startIdx < 0) {
      return;
    }
    const stageKey = `${activeCampaignId}:${stageIdx}`;
    const isPaidStage = stageIdx + 1 > FREE_STAGES_PER_CAMPAIGN;
    if (isPaidStage && !unlockedPaidStageKeys.includes(stageKey)) {
      if (economyMode === "server") {
        try {
          const snapshot = await economyApi.unlockStage(activeCampaignId, stageIdx);
          applyEconomySnapshot(snapshot);
          setUnlockedPaidStageKeys((prev) => [...prev, stageKey]);
          setPromoInfo("Этап открыт через сервер.");
        } catch {
          setStepMessage("Не удалось открыть этап через сервер.");
          return;
        }
      } else {
      if (!spendEnergy(currentStageCost, `stage_unlock:${stageKey}`)) {
        return;
      }
      setUnlockedPaidStageKeys((prev) => [...prev, stageKey]);
      setPromoInfo(`Этап открыт за ${currentStageCost} энергии.`);
      }
    }
    playSfx("swipe").catch(() => undefined);
    setForestStarted(true);
    setForestFinished(false);
    setForestStepIndex(startIdx);
    stageStartedAtRef.current = Date.now();
    setStepMessage(`Этап ${stageIdx + 1} начат: ${getCampaignBlockArc(activeCampaignId, stageIdx)}.`);
    setStageProgressSummary(null);
    setLastStepPraise("");
    resetStageAnalytics();
    resetStepUi();
    trackAnalyticsEvent("stage_start", {
      courseId: activeProgramMode === "course" ? activeCourse.id : undefined,
      storyId: activeProgramMode === "story" ? selectedStory : undefined,
      details: `stage:${stageIdx + 1};steps:${stageStepCounts[stageIdx]}`,
      stepIndex: startIdx,
    }).catch(() => undefined);
  };

  const startForestQuest = () => {
    playSfx("swipe").catch(() => undefined);
    setForestStarted(false);
    setForestFinished(false);
    setForestStepIndex(0);
    setStepMessage("");
    setTotalErrors(0);
    setPenaltyCount(0);
    setForestXpEarned(0);
    setFirstTrySuccess(0);
    setStageProgressSummary(null);
    setQuestFinalSummary(null);
    setLastStepPraise("");
    setPendingStoryRating(0);
    setRatingVoteLocked(false);
    setUnlockedPaidStageKeys([]);
    stageStartedAtRef.current = null;
    setBranchScore({ strategist: 0, empath: 0, boundary: 0, challenger: 0, architect: 0 });
    setAnswerBucketUsage([0, 0, 0, 0, 0]);
    if (activeProgramMode === "story") {
      setStartedStoryIds((prev) => (prev.includes(selectedStory) ? prev : [...prev, selectedStory]));
    }
    resetStageAnalytics();
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
    playSfx("swipe").catch(() => undefined);
    activateCourse(course);
    setForestStarted(false);
    setForestFinished(false);
    setForestStepIndex(0);
    setStepMessage("");
    setTotalErrors(0);
    setPenaltyCount(0);
    setForestXpEarned(0);
    setFirstTrySuccess(0);
    setStageProgressSummary(null);
    setQuestFinalSummary(null);
    setLastStepPraise("");
    setUnlockedPaidStageKeys([]);
    stageStartedAtRef.current = null;
    setBranchScore({ strategist: 0, empath: 0, boundary: 0, challenger: 0, architect: 0 });
    setAnswerBucketUsage([0, 0, 0, 0, 0]);
    resetStageAnalytics();
    resetStepUi();
    setActiveTab("quest");
    trackAnalyticsEvent("course_start", {
      courseId: course.id,
      difficulty: course.preferredQuestions,
      details: "start_from_card",
    }).catch(() => undefined);
  };

  const finishForestQuest = () => {
    const performanceTier = detectEndingPerformanceTier(currentForestQuestSteps.length, penaltyCount, firstTrySuccess);
    const finishCue = performanceTier === "bad" || performanceTier === "harsh" ? "quest_finish_negative" : "quest_finish_positive";
    playSfx(finishCue).catch(() => undefined);
    stageStartedAtRef.current = null;
    setForestFinished(true);
    setCompletedCount((prev) => prev + 1);
    const extendedEndingId = resolveExtendedEndingForNarrativeCampaign(activeCampaignId, performanceTier, branchScore, answerBucketUsage);
    const extendedEndingMeta = extendedEndingId ? extendedEndingMetaById[extendedEndingId] : null;
    const litRpgEnding = buildFinalStoryByOutcome(
      activeCampaignId,
      dominantEndingRoute,
      dominantBranch,
      performanceTier,
      penaltyCount,
      forestXpEarned,
      extendedEndingMeta?.story
    );
    const endingId = buildEndingId(activeCampaignId, dominantEndingRoute);
    const runtimeEndingId = extendedEndingId ? `ending:${activeCampaignId}:${extendedEndingId}` : endingId;
    const achievementId = buildAchievementId(activeCampaignId, dominantEndingRoute);
    const scenarioTierIcon = achievementEmojiByCampaignTier[activeCampaignId]?.[performanceTier];
    const endingIcon: Record<EndingRouteId, string> = {
      order: scenarioTierIcon ?? "🧭",
      harmony: scenarioTierIcon ?? "🤝",
      boundary: scenarioTierIcon ?? "🛡️",
      breakthrough: scenarioTierIcon ?? "⚡",
    };
    const achievementTitle = formatAchievementLabel(achievementId);
    const achievementDetails = `Награда за финал ${endingRouteName[dominantEndingRoute]} в кампании «${campaignLore[activeCampaignId].title}».`;
    setQuestFinalSummary({
      endingRoute: runtimeEndingId,
      endingTitle: extendedEndingMeta?.label ?? `Тактика: ${branchLabels[dominantBranch]}`,
      story: litRpgEnding,
      achievementId,
      achievementTitle,
      achievementDetails,
      achievementIcon: extendedEndingMeta?.icon ?? endingIcon[dominantEndingRoute],
    });
    setUnlockedEndings((prev) => {
      const withBase = prev.includes(endingId) ? prev : [...prev, endingId];
      if (!extendedEndingId) {
        return withBase;
      }
      return withBase.includes(runtimeEndingId) ? withBase : [...withBase, runtimeEndingId];
    });
    setUnlockedAchievements((prev) => (prev.includes(achievementId) ? prev : [...prev, achievementId]));
    setLastFeedback(
      `${activeProgramMode === "course" ? `Курс «${activeCourse.title}»` : `Квест «${activeStoryConfig.label}»`} завершен (${selectedDifficulty} вопросов). Ошибок: ${totalErrors}, штрафов: ${penaltyCount}. ${litRpgEnding}`
    );
    setPendingStoryRating(0);
    setRatingVoteLocked(false);
    trackAnalyticsEvent(activeProgramMode === "course" ? "course_complete" : "quest_complete", {
      courseId: activeProgramMode === "course" ? activeCourse.id : undefined,
      storyId: activeProgramMode === "story" ? selectedStory : undefined,
      difficulty: selectedDifficulty,
      details: `errors:${totalErrors};penalties:${penaltyCount};ending:${runtimeEndingId}`,
    }).catch(() => undefined);
    trackAnalyticsEvent("ending_unlock", { details: `${runtimeEndingId};${achievementId}` }).catch(() => undefined);
  };

  function inferRecommendedCourseByErrorType(errorType: string): CourseId {
    if (errorType.includes("challenger")) return "serpentine-diplomat";
    if (errorType.includes("boundary")) return "boundary-keeper";
    if (errorType.includes("architect")) return "mirror-of-truth";
    if (errorType.includes("empath")) return "heart-lines";
    if (errorType.includes("strategist")) return "office-icebreaker";
    if (errorType.includes("builder")) return "office-icebreaker";
    return "heart-lines";
  }

  const registerAnswerOutcome = (
    isCorrect: boolean,
    errorType: string,
    wrongTactic?: string
  ) => {
    setPracticeStats((prev) => {
      const nextErrorByType = { ...prev.errorByType };
      const nextWrongTactic = { ...prev.wrongTacticByType };
      if (!isCorrect) {
        nextErrorByType[errorType] = (nextErrorByType[errorType] ?? 0) + 1;
        if (wrongTactic) {
          nextWrongTactic[wrongTactic] = (nextWrongTactic[wrongTactic] ?? 0) + 1;
        }
      }

      const shouldRecommend = !isCorrect && nextErrorByType[errorType] > 7;
      if (shouldRecommend) {
        const suggestedCourse = inferRecommendedCourseByErrorType(errorType);
        setSelectedCourseId(suggestedCourse);
      }

      return {
        answersCorrect: prev.answersCorrect + (isCorrect ? 1 : 0),
        answersIncorrect: prev.answersIncorrect + (isCorrect ? 0 : 1),
        errorByType: nextErrorByType,
        wrongTacticByType: nextWrongTactic,
      };
    });

    trackAnalyticsEvent(isCorrect ? "answer_correct" : "answer_incorrect", {
      courseId: activeProgramMode === "course" ? activeCourse.id : undefined,
      storyId: activeProgramMode === "story" ? selectedStory : undefined,
      difficulty: selectedDifficulty,
      stepIndex: forestStepIndex,
      details: `type:${errorType};tactic:${wrongTactic ?? "n/a"}`,
    }).catch(() => undefined);
  };

  const getReactionAccentByTactic = (tactic?: string) => {
    if (!tactic) {
      return "#34D399";
    }
    if (branchOrder.includes(tactic as BranchId)) {
      return reactionColorByBranch[tactic as BranchId];
    }
    return "#34D399";
  };

  const inferTacticByOptionIndex = (optionIndex: number): BranchId => {
    const normalized = Math.max(0, optionIndex % branchOrder.length);
    return branchOrder[normalized];
  };

  const getSingleStepOutcomeTier = (selectedSourceIndex: number): "angel" | "good" | "neutral" | "bad" | "superbad" => {
    if ((activeForestStep.options?.length ?? 0) === 5) {
      if (selectedSourceIndex === 4) return "angel";
      if (selectedSourceIndex === 3) return "good";
      if (selectedSourceIndex === 1) return "neutral";
      if (selectedSourceIndex === 0) return "bad";
      return "superbad";
    }
    if (selectedSourceIndex === activeForestStep.correctSingle) {
      return "good";
    }
    return "bad";
  };

  const formatStepOutcomeQuality = (tier: "angel" | "good" | "neutral" | "bad" | "superbad") => {
    if (tier === "angel") return "Оценка: ангельский ход";
    if (tier === "good") return "Оценка: сильный ход";
    if (tier === "neutral") return "Оценка: нейтральный ход";
    if (tier === "superbad") return "Оценка: суперплохой ход";
    return "Оценка: плохой ход";
  };

  const formatReactionWithMeta = (npcReaction: string | undefined, xpPart: string, tier: "angel" | "good" | "neutral" | "bad" | "superbad") => {
    const phrase = npcReaction?.trim() ? `${npcReaction.trim()} ` : "";
    return `${phrase}${xpPart}. ${formatStepOutcomeQuality(tier)}.`;
  };

  const resolveSourceOptionIndex = (displayIndex: number) => {
    const mapped = displayOptionOrder[displayIndex];
    if (typeof mapped === "number" && mapped >= 0) {
      return mapped;
    }
    return displayIndex;
  };

  const passStep = (npcReaction?: string, tactic?: BranchId, tier: "angel" | "good" | "neutral" = "good") => {
    playSfx("step_success").catch(() => undefined);
    const rewardMultiplierByTier = {
      angel: 1.8,
      good: 1,
      neutral: 0,
    } as const;
    const reward = Math.round(activeForestStep.reward * activeDifficultyConfig.rewardMultiplier * rewardMultiplierByTier[tier]);
    setStepReactionAccent(getReactionAccentByTactic(tactic));
    setSuccessPulseTick((prev) => prev + 1);
    trackAnalyticsEvent("step_pass", {
      courseId: activeProgramMode === "course" ? activeCourse.id : undefined,
      storyId: activeProgramMode === "story" ? selectedStory : undefined,
      difficulty: selectedDifficulty,
      stepIndex: forestStepIndex,
    }).catch(() => undefined);
    if (tier !== "neutral") {
      registerAnswerOutcome(true, activeForestStep.type === "builder" ? "builder_correct" : `${activeForestStep.type}_correct`);
    }
    if (reward > 0) {
      setXp((prev) => prev + reward);
      setForestXpEarned((prev) => prev + reward);
    }

    if (stepErrorCount === 0) {
      setFirstTrySuccess((prev) => prev + 1);
    }

    const isLastStep = forestStepIndex === currentForestQuestSteps.length - 1;
    const currentStage = stageIndexByStep[forestStepIndex] ?? 0;
    const nextStepIndex = forestStepIndex + 1;
    const nextStage = isLastStep ? currentStage : stageIndexByStep[nextStepIndex] ?? currentStage;
    const isStageBoundary = !isLastStep && nextStage !== currentStage;
    if (isLastStep) {
      const rewardText = reward > 0 ? `+${reward} XP` : "без изменений XP";
      setStepMessage(`Квест завершен! За шаг: ${rewardText}.`);
      setLastStepPraise(formatReactionWithMeta(npcReaction, `За предыдущий шаг: ${rewardText}`, tier));
      finishForestQuest();
      return;
    }

    if (isStageBoundary) {
      const stageDurationSec = stageStartedAtRef.current ? Math.round((Date.now() - stageStartedAtRef.current) / 1000) : 0;
      stageStartedAtRef.current = null;
      const perfectStageKey = `${activeCampaignId}:perfect:${currentStage}`;
      if (stepErrorCount === 0 && !grantedPerfectStageIds.includes(perfectStageKey)) {
        setGrantedPerfectStageIds((prev) => [...prev, perfectStageKey]);
        grantEnergy(ENERGY_PERFECT_STAGE_BONUS, `perfect_stage:${currentStage + 1}`);
      }
      buildStageSummary(currentStage, stageDurationSec);
      const stageRewardText = reward > 0 ? `+${reward} XP` : "без изменений XP";
      setLastStepPraise(formatReactionWithMeta(npcReaction, `За шаг: ${stageRewardText}`, tier));
      setStepMessage(`${formatReactionWithMeta(npcReaction, `За шаг: ${stageRewardText}`, tier)} Этап ${currentStage + 1} завершен. Открыт этап ${nextStage + 1}.`);
      setForestStepIndex(nextStepIndex);
      setForestStarted(false);
      resetStepUi();
      trackAnalyticsEvent("stage_complete", {
        courseId: activeProgramMode === "course" ? activeCourse.id : undefined,
        storyId: activeProgramMode === "story" ? selectedStory : undefined,
        details: `stage:${currentStage + 1};next:${nextStage + 1};duration_sec:${stageDurationSec};${stageAnalyticsSuffix()}`,
        stepIndex: forestStepIndex,
      }).catch(() => undefined);
      return;
    }

    const rewardText = reward > 0 ? `+${reward} XP` : "без изменений XP";
    setLastStepPraise(formatReactionWithMeta(npcReaction, `За шаг: ${rewardText}`, tier));
    setStepMessage(`${formatReactionWithMeta(npcReaction, `За шаг: ${rewardText}`, tier)} Переходим дальше.`);
    setForestStepIndex((prev) => prev + 1);
    resetStepUi();
  };

  const finalizeIncorrectStepAsAccepted = (
    isCorrect: boolean,
    errorType: string,
    wrongTactic?: string,
    npcReaction?: string,
    tier: "bad" | "superbad" = "bad"
  ) => {
    if (isCorrect) {
      passStep(npcReaction);
      return;
    }
    setStepReactionAccent(getReactionAccentByTactic(wrongTactic));

    registerAnswerOutcome(false, errorType, wrongTactic);
    setTotalErrors((prev) => prev + 1);

    const penaltyScaleByTier = {
      bad: 0.6,
      superbad: 1.8,
    } as const;
    const penalty = Math.max(1, Math.round(activeDifficultyConfig.penalty * penaltyScaleByTier[tier]));
    setPenaltyCount((prev) => prev + 1);
    setXp((prev) => Math.max(0, prev - penalty));
    setForestXpEarned((prev) => prev - penalty);
    trackAnalyticsEvent("penalty_applied", {
      details: `-${penalty}xp;type:${errorType};tactic:${wrongTactic ?? "n/a"}`,
      courseId: activeProgramMode === "course" ? activeCourse.id : undefined,
      storyId: activeProgramMode === "story" ? selectedStory : undefined,
    }).catch(() => undefined);

    const isLastStep = forestStepIndex === currentForestQuestSteps.length - 1;
    const currentStage = stageIndexByStep[forestStepIndex] ?? 0;
    const nextStepIndex = forestStepIndex + 1;
    const nextStage = isLastStep ? currentStage : stageIndexByStep[nextStepIndex] ?? currentStage;
    const isStageBoundary = !isLastStep && nextStage !== currentStage;
    if (isLastStep) {
      setStepMessage(`${formatReactionWithMeta(npcReaction, `-${penalty} XP`, tier)} Квест завершен.`);
      setLastStepPraise(formatReactionWithMeta(npcReaction, `-${penalty} XP`, tier));
      finishForestQuest();
      return;
    }
    if (isStageBoundary) {
      const stageDurationSec = stageStartedAtRef.current ? Math.round((Date.now() - stageStartedAtRef.current) / 1000) : 0;
      stageStartedAtRef.current = null;
      buildStageSummary(currentStage, stageDurationSec);
      setLastStepPraise(formatReactionWithMeta(npcReaction, `-${penalty} XP`, tier));
      setStepMessage(`${formatReactionWithMeta(npcReaction, `-${penalty} XP`, tier)} Этап ${currentStage + 1} завершен со штрафом. Открыт этап ${nextStage + 1}.`);
      setForestStepIndex(nextStepIndex);
      setForestStarted(false);
      resetStepUi();
      trackAnalyticsEvent("stage_complete", {
        courseId: activeProgramMode === "course" ? activeCourse.id : undefined,
        storyId: activeProgramMode === "story" ? selectedStory : undefined,
        details: `stage:${currentStage + 1};next:${nextStage + 1};penalty:${penalty};duration_sec:${stageDurationSec};${stageAnalyticsSuffix()}`,
        stepIndex: forestStepIndex,
      }).catch(() => undefined);
      return;
    }
    setLastStepPraise(formatReactionWithMeta(npcReaction, `-${penalty} XP`, tier));
    setStepMessage(`${formatReactionWithMeta(npcReaction, `-${penalty} XP`, tier)} Идем дальше.`);
    setForestStepIndex(nextStepIndex);
    resetStepUi();
  };

  const evaluateForestStep = () => {
    if (!activeForestStep) {
      return;
    }

    if (activeForestStep.type === "single") {
      if (selectedSingle === null) {
        setStepMessage("Выбери один вариант, чтобы сделать ход.");
        return;
      }

      const selectedSourceIndex = resolveSourceOptionIndex(selectedSingle);
      const npcReactionSource =
        activeForestStep.optionNpcReactionByIndex?.[selectedSourceIndex] ??
        activeForestStep.opponentSpeech ??
        activeForestStep.dispositionText ??
        "";
      const npcReaction = applyGenderToPlayerReplica(npcReactionSource, effectivePlayerGender) || undefined;
      const selectedTactic = activeForestStep.branchEffects?.[selectedSourceIndex] ?? inferTacticByOptionIndex(selectedSourceIndex);

      const branch = selectedTactic;
      setBranchScore((prev) => ({ ...prev, [branch]: prev[branch] + 1 }));
      setStageTacticUsage((prev) => ({ ...prev, [branch]: prev[branch] + 1 }));
      trackAnalyticsEvent("branch_shift", {
        details: `${activeCampaignId}:${branch}`,
        stepIndex: forestStepIndex,
      }).catch(() => undefined);

      if (activeForestStep.acceptAny) {
        if (selectedSourceIndex >= 0 && selectedSourceIndex <= 4) {
          setAnswerBucketUsage((prev) => {
            const next = [...prev] as [number, number, number, number, number];
            next[selectedSourceIndex] += 1;
            return next;
          });
        }
        passStep(npcReaction, selectedTactic);
        return;
      }

      const tier = getSingleStepOutcomeTier(selectedSourceIndex);
      const isCorrect = tier === "angel" || tier === "good";
      const selectedTacticName = selectedTactic;

      if (isCorrect || tier === "neutral") {
        if (selectedSourceIndex >= 0 && selectedSourceIndex <= 4) {
          setAnswerBucketUsage((prev) => {
            const next = [...prev] as [number, number, number, number, number];
            next[selectedSourceIndex] += 1;
            return next;
          });
        }
        passStep(npcReaction, selectedTactic, tier);
        return;
      }

      if (selectedSourceIndex >= 0 && selectedSourceIndex <= 4) {
        setAnswerBucketUsage((prev) => {
          const next = [...prev] as [number, number, number, number, number];
          next[selectedSourceIndex] += 1;
          return next;
        });
      }
      finalizeIncorrectStepAsAccepted(
        false,
        `single_${selectedTacticName}`,
        selectedTacticName,
        npcReaction,
        tier === "superbad" ? "superbad" : "bad"
      );
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
      const selected = selectedMultiple
        .map((displayIndex) => resolveSourceOptionIndex(displayIndex))
        .sort((a, b) => a - b);
      const isCorrect = correct.every((value, index) => value === selected[index]);

      if (isCorrect) {
        passStep();
        return;
      }

      finalizeIncorrectStepAsAccepted(false, "multiple_mismatch");
      return;
    }

    if (activeForestStep.type === "builder") {
      const target = activeForestStep.targetBuilder ?? [];
      if (!builderTokens.length) {
        setStepMessage("Собери фразу из слов, затем проверь шаг.");
        return;
      }

      const mismatchIndices = builderTokens
        .map((token, idx) => ({ token, idx }))
        .filter(({ token, idx }) => token !== target[idx])
        .map(({ idx }) => idx);
      const isCorrectLength = builderTokens.length === target.length;
      const isCorrectTokens = isCorrectLength && builderTokens.every((token, idx) => token === target[idx]);

      if (isCorrectTokens) {
        setBuilderMismatchIndices([]);
        passStep();
        return;
      }

      setBuilderMismatchIndices(mismatchIndices);
      finalizeIncorrectStepAsAccepted(false, "builder_phrase_mismatch");
    }
  };

  const handleStorySelect = (storyId: QuestStory) => {
    if (!isAdult18Plus && adultOnlyStories.includes(storyId)) {
      setStepMessage("Этот сценарий откроется после подтверждения 18+. Пока доступна безопасная подборка сюжетов.");
      return;
    }
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

  const openStoryPreview = (storyId: QuestStory) => {
    setStoryPreviewId(storyId);
  };

  const startStoryFromCard = (storyId: QuestStory) => {
    if (!isAdult18Plus && adultOnlyStories.includes(storyId)) {
      setStepMessage("Сюжет 18+ недоступен для профиля младше 18. Выбери другой квест.");
      return;
    }
    playSfx("swipe").catch(() => undefined);
    setActiveProgramMode("story");
    setSelectedStory(storyId);
    setStartedStoryIds((prev) => (prev.includes(storyId) ? prev : [...prev, storyId]));
    setForestStarted(false);
    setForestFinished(false);
    setForestStepIndex(0);
    setStepMessage("");
    setTotalErrors(0);
    setPenaltyCount(0);
    setForestXpEarned(0);
    setFirstTrySuccess(0);
    setQuestFinalSummary(null);
    setLastStepPraise("");
    setRatingVoteLocked(false);
    setPendingStoryRating(0);
    resetStepUi();
    setActiveTab("quest");
  };

  const submitStoryRating = () => {
    if (activeProgramMode !== "story" || !forestFinished || ratingVoteLocked || pendingStoryRating < 0 || pendingStoryRating > 5) {
      return;
    }
    setQuestRatingStats((prev) => {
      const target = prev[selectedStory];
      return {
        ...prev,
        [selectedStory]: {
          sum: target.sum + pendingStoryRating,
          count: target.count + 1,
        },
      };
    });
    setRatingVoteLocked(true);
    setStepMessage(`Спасибо за оценку: ${pendingStoryRating.toFixed(1).replace(".", ",")}★`);
    trackAnalyticsEvent("answer_correct", {
      storyId: selectedStory,
      details: `story_rating:${pendingStoryRating.toFixed(1)}`,
    }).catch(() => undefined);
  };

  const pickAvatarFromLibrary = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setPromoInfo("Нужен доступ к галерее, чтобы выбрать аватар.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (result.canceled || !result.assets.length) {
      return;
    }
    const localAvatarUri = result.assets[0].uri;
    setAvatarUri(localAvatarUri);
    setProfileSetupDone(true);
    if (isServerAuth && currentUserEmail) {
      try {
        const token = await AsyncStorage.getItem(authApi.storageKey);
        if (token) {
          const uploaded = await authApi.uploadAvatar(token, localAvatarUri);
          setAvatarUri(uploaded.avatarUri);
          setPromoInfo("Аватар сохранен в профиле.");
        }
      } catch {
        setPromoInfo("Не удалось загрузить аватар на сервер. Оставила локальную версию.");
      }
    }
  };

  const saveProfileIdentity = () => {
    const nextName = sanitizeShortText(profileNameDraft, "", 60);
    if (!nextName) {
      setPromoInfo("Введи имя или ник.");
      return;
    }
    setDisplayName(nextName);
    setProfileNameDraft(nextName);
    setProfileSetupDone(true);
    setPromoInfo("Профиль обновлен.");
  };

  const clearProfileAvatar = () => {
    setAvatarUri(null);
    setPromoInfo("Аватар удален.");
  };

  const pickAuthAvatarFromLibrary = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setAuthError("Нужен доступ к галерее, чтобы выбрать аватар.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (result.canceled || !result.assets.length) {
      return;
    }
    setAuthAvatarUri(result.assets[0].uri);
    setAuthError("");
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
    if (authMode === "register" && !sanitizeShortText(authNickname, "", 60)) {
      setAuthError("Укажи имя или ник для регистрации.");
      return;
    }

    if (isServerAuth) {
      try {
        let response;
        if (authMode === "register") {
          if (authPassword !== authConfirmPassword) {
            setAuthError("Пароли не совпадают.");
            return;
          }
          response = await authApi.register(email, authPassword, authNickname);
          let persistentAvatarUri = authAvatarUri;
          if (authAvatarUri) {
            const uploaded = await authApi.uploadAvatar(response.token, authAvatarUri);
            persistentAvatarUri = uploaded.avatarUri;
          }
          await authApi.syncProfile(response.token, {
            displayName: sanitizeShortText(authNickname, "Игрок", 60),
            avatarUri: persistentAvatarUri,
            gender: authGender,
            isAdult18Plus: authIsAdult18Plus,
            profileSetupDone: true,
          });
          response = await authApi.login(email, authPassword);
          setAuthInfo("Аккаунт создан. Вход выполнен автоматически.");
        } else {
          response = await authApi.login(email, authPassword);
        }

        await AsyncStorage.setItem(authApi.storageKey, response.token);
        applyServerUserSnapshot(response.user.email, (response.user.role ?? "USER") as UserRole, response.user.profile, response.economy);
        setAuthError("");
        if (authMode === "login") {
          setAuthInfo("");
        }
        setAuthEmail("");
        setAuthPassword("");
        setAuthConfirmPassword("");
        setAuthNickname("");
        setAuthAvatarUri(null);
        sessionStartedAtRef.current = Date.now();
        await trackAnalyticsEvent(authMode === "register" ? "auth_register" : "auth_login", {
          details: authMode === "register" ? "server_register" : "server_login",
        }, email);
        await trackAnalyticsEvent("session_start", { details: authMode }, email);
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Не удалось выполнить вход через сервер.";
        setAuthError(message);
        return;
      }
    }

    try {
      const raw = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
      const nowIso = new Date().toISOString();
      const store: AuthStore = raw
        ? (JSON.parse(raw) as AuthStore)
        : {
            users: createSeedUsers(nowIso),
            currentEmail: null,
          };
      store.users[ADMIN_EMAIL] ??= {
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        role: "ADMIN",
        profile: buildDefaultProfile(),
        analytics: buildDefaultAnalytics(nowIso),
      };
      store.users[USER_EMAIL] ??= {
        email: USER_EMAIL,
        password: USER_PASSWORD,
        role: "USER",
        profile: buildDefaultProfile(),
        analytics: buildDefaultAnalytics(nowIso),
      };
      Object.values(store.users).forEach((entry) => {
        if (!entry.role) {
          entry.role = entry.email === ADMIN_EMAIL ? "ADMIN" : "USER";
        }
      });

      if (authMode === "register") {
        if (email === ADMIN_EMAIL) {
          setAuthError("Регистрация администратора запрещена. Добавь роль вручную через админку.");
          return;
        }
        if (authPassword !== authConfirmPassword) {
          setAuthError("Пароли не совпадают.");
          return;
        }
        if (store.users[email]) {
          setAuthError("Такой email уже зарегистрирован.");
          return;
        }

        const nickname = sanitizeShortText(authNickname, "", 60);
        const createdProfile = buildDefaultProfile();
        if (nickname) {
          createdProfile.displayName = nickname;
          createdProfile.profileSetupDone = true;
        }
        createdProfile.avatarUri = sanitizeAvatarUri(authAvatarUri);
        createdProfile.gender = authGender;
        createdProfile.isAdult18Plus = authIsAdult18Plus;
        store.users[email] = {
          email,
          password: authPassword,
          role: "USER",
          profile: createdProfile,
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
      setCurrentUserRole(existingUser.role ?? "USER");
      const safeDisplayName = sanitizeShortText(existingUser.profile.displayName, "Герой леса", 60);
      setDisplayName(safeDisplayName);
      setProfileNameDraft(safeDisplayName);
      setAvatarUri(sanitizeAvatarUri(existingUser.profile.avatarUri));
      setProfileGender(sanitizeProfileGender((existingUser.profile as Partial<UserProfile>).gender));
      setIsAdult18Plus(Boolean((existingUser.profile as Partial<UserProfile>).isAdult18Plus ?? true));
      setProfileSetupDone(Boolean(existingUser.profile.profileSetupDone));
      setAboutMe(sanitizeShortText(existingUser.profile.aboutMe, "Тренирую диалог и границы в сложных разговорах.", 180));
      setFriendEmails(sanitizeStringArray(existingUser.profile.friendEmails));
      setSelectedFriendEmail("");
      setOpenedFriendEmail(null);
      setXp(existingUser.profile.xp);
      setEnergy(typeof existingUser.profile.energy === "number" ? existingUser.profile.energy : 120);
      setCompletedCount(existingUser.profile.completedCount);
      setLastFeedback(existingUser.profile.lastFeedback);
      setSelectedQuestId(existingUser.profile.selectedQuestId);
      setEventProgress(
        sanitizeEventProgress(existingUser.profile.eventProgress, (existingUser.profile as { eventJoined?: boolean }).eventJoined)
      );
      setSelectedDifficulty(existingUser.profile.selectedDifficulty);
      setSelectedStory(existingUser.profile.selectedStory);
      setStartedStoryIds(
        sanitizeStringArray((existingUser.profile as Partial<UserProfile>).startedStoryIds).filter((id): id is QuestStory =>
          storyConfigs.some((story) => story.id === id)
        )
      );
      setActiveProgramMode(existingUser.profile.activeProgramMode ?? "story");
      setActiveTab(
        (existingUser.role ?? "USER") === "ADMIN"
          ? existingUser.profile.activeTab
          : existingUser.profile.activeTab === "admin"
            ? "map"
            : existingUser.profile.activeTab
      );
      if (authMode === "register" && !Boolean(existingUser.profile.profileSetupDone)) {
        setActiveTab("profile");
      }
      const safePrimaryStyle = sanitizeConflictStyle(existingUser.profile.conflictPrimaryStyle);
      setConflictPrimaryStyle(safePrimaryStyle);
      setConflictSecondaryStyles(sanitizeSecondaryConflictStyles(existingUser.profile.conflictSecondaryStyles, safePrimaryStyle));
      setDiagnosticCompleted(Boolean(existingUser.profile.diagnosticCompleted));
      setSelectedCourseId(existingUser.profile.selectedCourseId ?? recommendedCourseByConflictStyle[safePrimaryStyle]);
      setUnlockedEndings(sanitizeStringArray(existingUser.profile.unlockedEndings));
      setUnlockedAchievements(sanitizeStringArray(existingUser.profile.unlockedAchievements));
      setPracticeStats(sanitizePracticeStats(existingUser.profile.practiceStats));
      setQuestRatingStats(sanitizeQuestRatingStats(existingUser.profile.questRatingStats));
      setSoundEnabled(typeof existingUser.profile.soundEnabled === "boolean" ? existingUser.profile.soundEnabled : true);
      setClaimedDailyEnergyAt(existingUser.profile.claimedDailyEnergyAt ?? null);
      setWelcomeEnergyGranted(Boolean(existingUser.profile.welcomeEnergyGranted));
      setGrantedPerfectStageIds(sanitizeStringArray(existingUser.profile.grantedPerfectStageIds));
      setRedeemedPromoCodes(sanitizeStringArray(existingUser.profile.redeemedPromoCodes));
      setReferralInvitesCompleted(typeof existingUser.profile.referralInvitesCompleted === "number" ? existingUser.profile.referralInvitesCompleted : 0);
      setUnlockedPaidStageKeys(sanitizeStringArray(existingUser.profile.unlockedPaidStageKeys));
      setEnergyTransfersSentToday(typeof existingUser.profile.energyTransfersSentToday === "number" ? existingUser.profile.energyTransfersSentToday : 0);
      setEnergyTransfersSentWeek(typeof existingUser.profile.energyTransfersSentWeek === "number" ? existingUser.profile.energyTransfersSentWeek : 0);
      setLastEnergyTransferAt(existingUser.profile.lastEnergyTransferAt ?? null);
      setLastSeenAt(existingUser.profile.lastSeenAt ?? null);
      setShowDiagnosticResult(false);
      setIsProfileHydrated(true);
      setAuthError("");
      if (authMode === "login") {
        setAuthInfo("");
      }
      setAuthEmail("");
      setAuthPassword("");
      setAuthConfirmPassword("");
      setAuthNickname("");
      setAuthAvatarUri(null);
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
    if (email === ADMIN_EMAIL) {
      setAuthError("Админ не регистрируется через форму.");
      return;
    }
    if (!email || !email.includes("@")) {
      setAuthError("Введите корректный email для регистрации.");
      return;
    }
    if (authPassword.length < 6) {
      setAuthError("Пароль должен быть не короче 6 символов.");
      return;
    }

    if (isServerAuth) {
      try {
        const response = await authApi.register(email, authPassword, authNickname);
        let persistentAvatarUri = authAvatarUri;
        if (authAvatarUri) {
          const uploaded = await authApi.uploadAvatar(response.token, authAvatarUri);
          persistentAvatarUri = uploaded.avatarUri;
        }
        await authApi.syncProfile(response.token, {
          displayName: sanitizeShortText(authNickname, "Игрок", 60),
          avatarUri: persistentAvatarUri,
          gender: authGender,
          isAdult18Plus: authIsAdult18Plus,
          profileSetupDone: true,
        });
        const loggedIn = await authApi.login(email, authPassword);
        await AsyncStorage.setItem(authApi.storageKey, loggedIn.token);
        applyServerUserSnapshot(loggedIn.user.email, (loggedIn.user.role ?? "USER") as UserRole, loggedIn.user.profile, loggedIn.economy);
        setAuthError("");
        setAuthInfo("Аккаунт создан и активирован.");
        setAuthEmail("");
        setAuthPassword("");
        setAuthConfirmPassword("");
        setAuthNickname("");
        setAuthAvatarUri(null);
        sessionStartedAtRef.current = Date.now();
        await trackAnalyticsEvent("auth_register", { details: "server_quick_register" }, email);
        await trackAnalyticsEvent("session_start", { details: "quick_register" }, email);
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Не удалось зарегистрировать аккаунт через сервер.";
        setAuthError(message);
        return;
      }
    }

    try {
      const raw = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
      const nowIso = new Date().toISOString();
      const store: AuthStore = raw
        ? (JSON.parse(raw) as AuthStore)
        : {
            users: createSeedUsers(nowIso),
            currentEmail: null,
          };
      store.users[ADMIN_EMAIL] ??= {
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        role: "ADMIN",
        profile: buildDefaultProfile(),
        analytics: buildDefaultAnalytics(nowIso),
      };
      store.users[USER_EMAIL] ??= {
        email: USER_EMAIL,
        password: USER_PASSWORD,
        role: "USER",
        profile: buildDefaultProfile(),
        analytics: buildDefaultAnalytics(nowIso),
      };
      Object.values(store.users).forEach((entry) => {
        if (!entry.role) {
          entry.role = entry.email === ADMIN_EMAIL ? "ADMIN" : "USER";
        }
      });

      if (store.users[email]) {
        setAuthError("Этот email уже есть. Нажми «Войти».");
        return;
      }

      store.users[email] = {
        email,
        password: authPassword,
        role: "USER",
        profile: (() => {
          const profile = buildDefaultProfile();
          const nickname = sanitizeShortText(authNickname, "", 60);
          if (nickname) {
            profile.displayName = nickname;
            profile.profileSetupDone = true;
          }
          profile.avatarUri = sanitizeAvatarUri(authAvatarUri);
          profile.gender = authGender;
          profile.isAdult18Plus = authIsAdult18Plus;
          return profile;
        })(),
        analytics: buildDefaultAnalytics(nowIso),
      };
      store.currentEmail = email;
      await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(store));

      const user = store.users[email];
      setCurrentUserEmail(email);
      setCurrentUserRole(user.role ?? "USER");
      const safeDisplayName = sanitizeShortText(user.profile.displayName, "Герой леса", 60);
      setDisplayName(safeDisplayName);
      setProfileNameDraft(safeDisplayName);
      setAvatarUri(sanitizeAvatarUri(user.profile.avatarUri));
      setProfileGender(sanitizeProfileGender((user.profile as Partial<UserProfile>).gender));
      setIsAdult18Plus(Boolean((user.profile as Partial<UserProfile>).isAdult18Plus ?? true));
      setProfileSetupDone(Boolean(user.profile.profileSetupDone));
      setAboutMe(sanitizeShortText(user.profile.aboutMe, "Тренирую диалог и границы в сложных разговорах.", 180));
      setFriendEmails(sanitizeStringArray(user.profile.friendEmails));
      setSelectedFriendEmail("");
      setOpenedFriendEmail(null);
      setXp(user.profile.xp);
      setEnergy(typeof user.profile.energy === "number" ? user.profile.energy : 120);
      setCompletedCount(user.profile.completedCount);
      setLastFeedback(user.profile.lastFeedback);
      setSelectedQuestId(user.profile.selectedQuestId);
      setEventProgress(sanitizeEventProgress(user.profile.eventProgress, (user.profile as { eventJoined?: boolean }).eventJoined));
      setSelectedDifficulty(user.profile.selectedDifficulty);
      setSelectedStory(user.profile.selectedStory);
      setStartedStoryIds(
        sanitizeStringArray((user.profile as Partial<UserProfile>).startedStoryIds).filter((id): id is QuestStory =>
          storyConfigs.some((story) => story.id === id)
        )
      );
      setActiveProgramMode(user.profile.activeProgramMode ?? "story");
      setActiveTab((user.role ?? "USER") === "ADMIN" ? user.profile.activeTab : user.profile.activeTab === "admin" ? "map" : user.profile.activeTab);
      if (!Boolean(user.profile.profileSetupDone)) {
        setActiveTab("profile");
      }
      const safePrimaryStyle = sanitizeConflictStyle(user.profile.conflictPrimaryStyle);
      setConflictPrimaryStyle(safePrimaryStyle);
      setConflictSecondaryStyles(sanitizeSecondaryConflictStyles(user.profile.conflictSecondaryStyles, safePrimaryStyle));
      setDiagnosticCompleted(Boolean(user.profile.diagnosticCompleted));
      setSelectedCourseId(user.profile.selectedCourseId ?? recommendedCourseByConflictStyle[safePrimaryStyle]);
      setUnlockedEndings(sanitizeStringArray(user.profile.unlockedEndings));
      setUnlockedAchievements(sanitizeStringArray(user.profile.unlockedAchievements));
      setPracticeStats(sanitizePracticeStats(user.profile.practiceStats));
      setQuestRatingStats(sanitizeQuestRatingStats(user.profile.questRatingStats));
      setSoundEnabled(typeof user.profile.soundEnabled === "boolean" ? user.profile.soundEnabled : true);
      setClaimedDailyEnergyAt(user.profile.claimedDailyEnergyAt ?? null);
      setWelcomeEnergyGranted(Boolean(user.profile.welcomeEnergyGranted));
      setGrantedPerfectStageIds(sanitizeStringArray(user.profile.grantedPerfectStageIds));
      setRedeemedPromoCodes(sanitizeStringArray(user.profile.redeemedPromoCodes));
      setReferralInvitesCompleted(typeof user.profile.referralInvitesCompleted === "number" ? user.profile.referralInvitesCompleted : 0);
      setUnlockedPaidStageKeys(sanitizeStringArray(user.profile.unlockedPaidStageKeys));
      setEnergyTransfersSentToday(typeof user.profile.energyTransfersSentToday === "number" ? user.profile.energyTransfersSentToday : 0);
      setEnergyTransfersSentWeek(typeof user.profile.energyTransfersSentWeek === "number" ? user.profile.energyTransfersSentWeek : 0);
      setLastEnergyTransferAt(user.profile.lastEnergyTransferAt ?? null);
      setLastSeenAt(user.profile.lastSeenAt ?? null);
      setShowDiagnosticResult(false);
      setIsProfileHydrated(true);
      setAuthError("");
      setAuthInfo("Аккаунт создан и активирован.");
      setAuthEmail("");
      setAuthPassword("");
      setAuthConfirmPassword("");
      setAuthNickname("");
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
      if (isServerAuth) {
        await AsyncStorage.removeItem(authApi.storageKey);
      }
      const raw = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
      if (raw) {
        const store = JSON.parse(raw) as AuthStore;
        store.currentEmail = null;
        await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(store));
      }
    } finally {
      sessionStartedAtRef.current = null;
      runtimeProgressHydratedForRef.current = null;
      runtimeProgressReadyForPersistRef.current = null;
      setCurrentUserEmail(null);
      setCurrentUserRole("USER");
      setIsProfileHydrated(false);
      const profile = buildDefaultProfile();
      setDisplayName(profile.displayName);
      setProfileNameDraft(profile.displayName);
      setAvatarUri(profile.avatarUri);
      setProfileSetupDone(profile.profileSetupDone);
      setAboutMe(profile.aboutMe);
      setFriendEmails(profile.friendEmails);
      setSelectedFriendEmail("");
      setOpenedFriendEmail(null);
      setXp(profile.xp);
      setEnergy(profile.energy);
      setCompletedCount(profile.completedCount);
      setLastFeedback(profile.lastFeedback);
      setSelectedQuestId(profile.selectedQuestId);
      setEventProgress(sanitizeEventProgress(profile.eventProgress, (profile as { eventJoined?: boolean }).eventJoined));
      setSelectedDifficulty(profile.selectedDifficulty);
      setSelectedStory(profile.selectedStory);
      setStartedStoryIds(
        sanitizeStringArray((profile as Partial<UserProfile>).startedStoryIds).filter((id): id is QuestStory =>
          storyConfigs.some((story) => story.id === id)
        )
      );
      setActiveProgramMode(profile.activeProgramMode);
      setActiveTab(profile.activeTab);
      setConflictPrimaryStyle(profile.conflictPrimaryStyle);
      setConflictSecondaryStyles(profile.conflictSecondaryStyles);
      setDiagnosticCompleted(profile.diagnosticCompleted);
      setSelectedCourseId(profile.selectedCourseId);
      setUnlockedEndings(profile.unlockedEndings);
      setUnlockedAchievements(profile.unlockedAchievements);
      setPracticeStats(profile.practiceStats);
      setQuestRatingStats(sanitizeQuestRatingStats(profile.questRatingStats));
      setSoundEnabled(profile.soundEnabled);
      setClaimedDailyEnergyAt(profile.claimedDailyEnergyAt);
      setWelcomeEnergyGranted(profile.welcomeEnergyGranted);
      setGrantedPerfectStageIds(profile.grantedPerfectStageIds);
      setRedeemedPromoCodes(profile.redeemedPromoCodes);
      setReferralInvitesCompleted(profile.referralInvitesCompleted);
      setUnlockedPaidStageKeys(profile.unlockedPaidStageKeys);
      setEnergyTransfersSentToday(profile.energyTransfersSentToday);
      setEnergyTransfersSentWeek(profile.energyTransfersSentWeek);
      setLastEnergyTransferAt(profile.lastEnergyTransferAt);
      setLastSeenAt(profile.lastSeenAt);
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

  const grantEnergyFromAdmin = async (targetEmail: string) => {
    const rawAmount = adminGrantAmountByEmail[targetEmail] ?? "0";
    const amount = Number(rawAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setAdminActionMessage("Укажи корректное число энергии больше 0.");
      return;
    }

    const raw = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) {
      setAdminActionMessage("Не удалось найти хранилище пользователей.");
      return;
    }
    const store = JSON.parse(raw) as AuthStore;
    const user = store.users[targetEmail];
    if (!user) {
      setAdminActionMessage("Пользователь не найден.");
      return;
    }

    user.profile.energy = Math.max(0, (typeof user.profile.energy === "number" ? user.profile.energy : 0) + amount);
    user.analytics = withUserAnalytics(user, new Date().toISOString());
    store.users[targetEmail] = user;
    await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(store));

    if (targetEmail === currentUserEmail) {
      setEnergy(user.profile.energy);
    }
    setAdminGrantAmountByEmail((prev) => ({ ...prev, [targetEmail]: "10" }));
    setAdminActionMessage(`Пользователю ${targetEmail} начислено +${amount} энергии.`);
    await trackAnalyticsEvent("answer_correct", {
      details: `admin_grant_energy:${amount};target:${targetEmail}`,
    });
    await refreshAnalyticsSnapshot();
  };

  const activePrimaryConflictStyle = conflictStyles.find((style) => style.id === conflictPrimaryStyle) ?? conflictStyles[0];
  const recommendedStory = recommendedStoryByConflictStyle[conflictPrimaryStyle];
  const recommendedStoryConfig = storyConfigs.find((story) => story.id === recommendedStory) ?? storyConfigs[0];
  const currentDiagnosticQuestion = diagnosticQuestions[diagnosticIndex] ?? diagnosticQuestions[0];
  const activeDiagnosticReport = diagnosticReportByStyle[conflictPrimaryStyle] ?? diagnosticReportByStyle.avoiding;
  const recommendedCourseId = activeDiagnosticReport.recommendedCourseId ?? recommendedCourseByConflictStyle[conflictPrimaryStyle];
  const recommendedCourse = courses.find((course) => course.id === recommendedCourseId) ?? courses[0];
  const topPracticeError = Object.entries(practiceStats.errorByType).sort((a, b) => b[1] - a[1])[0];
  const repeatedErrorCourseId = topPracticeError && topPracticeError[1] > 7 ? inferRecommendedCourseByErrorType(topPracticeError[0]) : null;
  const repeatedErrorCourse = repeatedErrorCourseId ? courses.find((course) => course.id === repeatedErrorCourseId) : null;
  const wrongTacticScaleData = useMemo(() => {
    const byBranch: Record<BranchId, number> = {
      strategist: 0,
      empath: 0,
      boundary: 0,
      challenger: 0,
      architect: 0,
    };
    Object.entries(practiceStats.wrongTacticByType).forEach(([tactic, count]) => {
      const branch = detectBranchFromKey(tactic);
      if (!branch) {
        return;
      }
      byBranch[branch] += count;
    });
    return buildBranchScaleData(byBranch).filter((item) => item.value > 0);
  }, [practiceStats.wrongTacticByType]);
  const achievementItems = useMemo(
    () =>
      unlockedAchievements
        .slice(-12)
        .reverse()
        .map((id) => {
          const parsed = parseAchievement(id);
          if (!parsed) {
            return {
              id,
              icon: "🏅",
              title: formatAchievementLabel(id),
              details: "Подробности по этой ачивке недоступны.",
            };
          }
          const endingIcon: Record<EndingRouteId, string> = {
            order: "🧭",
            harmony: "🤝",
            boundary: "🛡️",
            breakthrough: "⚡",
          };
          return {
            id,
            icon: endingIcon[parsed.ending],
            title: `${campaignLore[parsed.campaign].title} — ${endingRouteName[parsed.ending]}`,
            details: endingNarrativeByRoute(parsed.campaign)[parsed.ending],
          };
        }),
    [unlockedAchievements]
  );
  const stageIndexByStep = currentForestQuestSteps.map((_, idx) =>
    getStageIdxLinear(activeCampaignId, idx)
  );
  const stageCount = useMemo(
    () => (stageIndexByStep.length ? Math.max(...stageIndexByStep) + 1 : 1),
    [stageIndexByStep]
  );
  const stageStartIndices = useMemo(() => {
    const starts = Array.from({ length: stageCount }, () => -1);
    stageIndexByStep.forEach((stageIdx, idx) => {
      if (starts[stageIdx] === -1) {
        starts[stageIdx] = idx;
      }
    });
    return starts;
  }, [stageCount, stageIndexByStep]);
  const stageStepCounts = useMemo(() => {
    const counts = Array.from({ length: stageCount }, () => 0);
    stageIndexByStep.forEach((stageIdx) => {
      counts[stageIdx] += 1;
    });
    return counts;
  }, [stageCount, stageIndexByStep]);
  const activeStageIdx = stageIndexByStep[Math.max(0, Math.min(forestStepIndex, stageIndexByStep.length - 1))] ?? 0;
  const activeStageTitle = getCampaignBlockArc(activeCampaignId, activeStageIdx);
  const stageRoadItems = Array.from({ length: stageCount }, (_, stageIdx) => {
    const startIdx = stageStartIndices[stageIdx];
    const isPresent = startIdx !== -1;
    const isDone = isPresent && forestStepIndex > startIdx && stageIdx < activeStageIdx;
    const isCurrent = isPresent && stageIdx === activeStageIdx;
    const isAvailable = isPresent && (forestFinished ? true : stageIdx <= activeStageIdx);
    return {
      stageIdx,
      isPresent,
      isDone,
      isCurrent,
      isAvailable,
      title: getCampaignBlockArc(activeCampaignId, stageIdx),
      stepCount: stageStepCounts[stageIdx],
      startIdx,
    };
  });
  const compactStageRoadItems = useMemo(() => {
    const done = stageRoadItems.filter((item) => item.isDone);
    const current = stageRoadItems.find((item) => item.isCurrent || item.isAvailable);
    const next = stageRoadItems.find((item) => item.isPresent && item.stageIdx > (current?.stageIdx ?? -1));
    const shortlist = [
      done.length ? done[done.length - 1] : null,
      current ?? null,
      next ?? null,
    ].filter((item): item is (typeof stageRoadItems)[number] => Boolean(item));
    const deduped = shortlist.filter((item, idx, arr) => arr.findIndex((x) => x.stageIdx === item.stageIdx) === idx);
    return deduped.length ? deduped : stageRoadItems.filter((item) => item.isPresent).slice(0, 3);
  }, [stageRoadItems]);
  const hasExpandedStageRoad = stageRoadItems.length > compactStageRoadItems.length;
  const visibleStageRoadItems = stageRoadExpanded && hasExpandedStageRoad ? stageRoadItems : compactStageRoadItems;
  const episodeProgressPercent = Math.round(((forestStepIndex + 1) / Math.max(1, currentForestQuestSteps.length)) * 100);
  const effectiveEpisodeProgressPercent = forestFinished ? 100 : episodeProgressPercent;
  const questProgressPercent = currentForestQuestSteps.length
    ? Math.round(((forestStepIndex + 1) / currentForestQuestSteps.length) * 100)
    : 0;
  const threeDayProgram = (styleMicroExercises[conflictPrimaryStyle] ?? styleMicroExercises.avoiding).slice(0, 3);
  const dayIndex = Math.min(2, completedCount % 3);
  const dailyTask = threeDayProgram[dayIndex] ?? threeDayProgram[0];
  const filteredAdminUsers = adminUsers.filter((user) =>
    user.email.toLowerCase().includes(adminUserSearch.trim().toLowerCase())
  );
  const visibleTabs = tabs.filter((tab) => (tab.key === "admin" ? currentUserRole === "ADMIN" : true));
  const currentStageCost = Math.min(28, 12 + Math.max(0, completedCount - 1) * 2);
  const storyRatingLabel = (storyId: QuestStory) => {
    const stats = questRatingStats[storyId] ?? { sum: 0, count: 0 };
    if (!stats.count) {
      return "Новая история";
    }
    const avg = stats.sum / stats.count;
    return `${avg.toFixed(1).replace(".", ",")} * ${stats.count} 👤`;
  };
  const openedFriendProfile = openedFriendEmail ? friendProfiles[openedFriendEmail] : null;
  const completedStoryEndingById = useMemo(() => {
    const next: Partial<Record<QuestStory, EndingRouteId>> = {};
    unlockedEndings.forEach((endingId) => {
      const parts = endingId.split(":");
      if (parts.length !== 3 || parts[0] !== "ending") {
        return;
      }
      const campaign = parts[1] as QuestStory;
      const route = parts[2] as EndingRouteId;
      if (storyConfigs.some((story) => story.id === campaign) && endingRouteName[route]) {
        next[campaign] = route;
      }
    });
    return next;
  }, [unlockedEndings]);
  const completedCourseEndingById = useMemo(() => {
    const next: Partial<Record<CourseId, EndingRouteId>> = {};
    unlockedEndings.forEach((endingId) => {
      const parts = endingId.split(":");
      if (parts.length !== 3 || parts[0] !== "ending") {
        return;
      }
      const campaign = parts[1] as CourseId;
      const route = parts[2] as EndingRouteId;
      if (courses.some((course) => course.id === campaign) && endingRouteName[route]) {
        next[campaign] = route;
      }
    });
    return next;
  }, [unlockedEndings]);
  const storyStatusById = useMemo(() => {
    const statusMap = {} as Record<QuestStory, StoryRunStatus>;
    storyConfigs.forEach((story) => {
      if (completedStoryEndingById[story.id]) {
        statusMap[story.id] = "completed";
        return;
      }
      if (startedStoryIds.includes(story.id) || (activeProgramMode === "story" && selectedStory === story.id)) {
        statusMap[story.id] = "in_progress";
        return;
      }
      statusMap[story.id] = "not_started";
    });
    return statusMap;
  }, [activeProgramMode, completedStoryEndingById, selectedStory, startedStoryIds]);
  const questFeedStories = useMemo(
    () => storyConfigs.filter((story) => storyStatusById[story.id] !== "not_started"),
    [storyStatusById]
  );
  const openStoryFromFeed = (storyId: QuestStory, mode: "continue" | "road") => {
    setActiveProgramMode("story");
    setSelectedStory(storyId);
    const isCompleted = storyStatusById[storyId] === "completed";
    if (mode === "road" && isCompleted) {
      const completedLength = buildForestQuestByDifficulty(selectedDifficulty, storyId).length;
      setForestStarted(false);
      setForestFinished(true);
      setForestStepIndex(Math.max(0, completedLength - 1));
      setActiveTab("quest");
      return;
    }
    setForestStarted(false);
    setForestFinished(false);
    setForestStepIndex(0);
    resetStepUi();
    setActiveTab("quest");
  };
  const toggleCatalogTag = (tag: string) => {
    setMapCatalogTab("all");
    setActiveCatalogTag((prev) => (prev === tag ? null : tag));
  };
  const getCourseTags = (course: CourseConfig) => {
    const recommendedFor = Array.isArray(course.recommendedFor) ? course.recommendedFor : [];
    return [
      "Переговоры",
      ...recommendedFor.map((styleId) => conflictStyles.find((style) => style.id === styleId)?.label ?? styleId).slice(0, 2),
    ];
  };
  const getStoryTags = (story: StoryConfig) => {
    const genreTag: Record<QuestStory, string> = {
      forest: "Приключение",
      romance: "Романтика",
      slytherin: "Интриги",
      boss: "Работа",
      narcissist: "Границы",
      "sherlock-gaslighter": "Детектив",
      "cinderella-advocate": "Самоценность",
      "healer-empathy": "Эмпатия",
      "partisan-hq": "Сопротивление",
      "stop-crane-train-18plus": "Этика 18+",
      "first-word-forest": "Старт",
      "dragon-ultimatum": "Переговоры",
      "castle-boundaries": "Границы",
      gryffindor_common_room: "Лидерство",
      ravenclaw_common_room: "Аргументация",
      hufflepuff_common_room: "Бережность",
    };
    const primaryTag = genreTag[story.id] ?? "Сюжет";
    return [primaryTag, "Сюжет"];
  };
  const catalogTags = useMemo(() => {
    const tagSet = new Set<string>();
    courses.forEach((course) => {
      getCourseTags(course)
        .filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0)
        .forEach((tag) => tagSet.add(tag.trim()));
    });
    storyConfigs.forEach((story) => {
      getStoryTags(story)
        .filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0)
        .forEach((tag) => tagSet.add(tag.trim()));
    });
    return Array.from(tagSet).sort((a, b) => a.localeCompare(b, "ru"));
  }, [courses, storyConfigs]);
  const hasStartedStoriesInCatalog = storyConfigs.some((story) => storyStatusById[story.id] !== "not_started");
  const normalizedMapSearchQuery = mapSearchQuery.trim().toLowerCase();
  const matchesCatalogSearch = (chunks: string[]) => {
    if (!normalizedMapSearchQuery) return true;
    const haystack = chunks.join(" ").toLowerCase();
    const terms = normalizedMapSearchQuery.split(/\s+/).filter(Boolean);
    return terms.every((term) => haystack.includes(term));
  };
  const applyServerUserSnapshot = (email: string, role: UserRole, profileInput: unknown, walletInput?: EconomySnapshot) => {
    skipNextServerProfileSyncRef.current = true;
    const profile = (profileInput && typeof profileInput === "object" ? profileInput : {}) as Partial<UserProfile>;
    const safeDisplayName = sanitizeShortText(profile.displayName, "Герой леса", 60);
    const safePrimaryStyle = sanitizeConflictStyle(profile.conflictPrimaryStyle);

    setCurrentUserEmail(email);
    setCurrentUserRole(role);
    setDisplayName(safeDisplayName);
    setProfileNameDraft(safeDisplayName);
    setAvatarUri(sanitizeAvatarUri(profile.avatarUri));
    setProfileGender(sanitizeProfileGender(profile.gender));
    setIsAdult18Plus(typeof profile.isAdult18Plus === "boolean" ? profile.isAdult18Plus : true);
    setProfileSetupDone(Boolean(profile.profileSetupDone));
    setAboutMe(sanitizeShortText(profile.aboutMe, "Тренирую диалог и границы в сложных разговорах.", 180));
    setFriendEmails(sanitizeStringArray(profile.friendEmails));
    setSelectedFriendEmail("");
    setOpenedFriendEmail(null);
    setXp(typeof walletInput?.xp === "number" ? walletInput.xp : typeof profile.xp === "number" ? profile.xp : 124);
    setEnergy(typeof walletInput?.energy === "number" ? walletInput.energy : typeof profile.energy === "number" ? profile.energy : 120);
    setCompletedCount(typeof profile.completedCount === "number" ? profile.completedCount : 0);
    setLastFeedback(typeof profile.lastFeedback === "string" ? profile.lastFeedback : "");
    setSelectedQuestId(typeof profile.selectedQuestId === "string" ? profile.selectedQuestId : dailyQuests[0].id);
    setEventProgress(sanitizeEventProgress(profile.eventProgress, (profile as { eventJoined?: boolean }).eventJoined));
    setSelectedDifficulty([5, 10, 15, 25, 125].includes(profile.selectedDifficulty as number) ? (profile.selectedDifficulty as QuestDifficulty) : 5);
    setSelectedStory(
      [
        "forest",
        "romance",
        "slytherin",
        "boss",
        "narcissist",
        "sherlock-gaslighter",
        "cinderella-advocate",
        "healer-empathy",
        "partisan-hq",
        "stop-crane-train-18plus",
        "first-word-forest",
        "dragon-ultimatum",
        "castle-boundaries",
        "gryffindor_common_room",
        "ravenclaw_common_room",
        "hufflepuff_common_room",
      ].includes(
        profile.selectedStory as string
      )
        ? (profile.selectedStory as QuestStory)
        : "forest"
    );
    setStartedStoryIds(
      sanitizeStringArray(profile.startedStoryIds).filter((id): id is QuestStory => storyConfigs.some((story) => story.id === id))
    );
    setActiveProgramMode(profile.activeProgramMode === "course" ? "course" : "story");
    setActiveTab(role === "ADMIN" ? (profile.activeTab as Tab) ?? "map" : (profile.activeTab as Tab) === "admin" ? "map" : (profile.activeTab as Tab) ?? "map");
    setConflictPrimaryStyle(safePrimaryStyle);
    setConflictSecondaryStyles(sanitizeSecondaryConflictStyles(profile.conflictSecondaryStyles, safePrimaryStyle));
    setDiagnosticCompleted(Boolean(profile.diagnosticCompleted));
    setSelectedCourseId((profile.selectedCourseId as CourseId) ?? recommendedCourseByConflictStyle[safePrimaryStyle]);
    setUnlockedEndings(sanitizeStringArray(profile.unlockedEndings));
    setUnlockedAchievements(sanitizeStringArray(profile.unlockedAchievements));
    setPracticeStats(sanitizePracticeStats(profile.practiceStats));
    setQuestRatingStats(sanitizeQuestRatingStats(profile.questRatingStats));
    setSoundEnabled(typeof profile.soundEnabled === "boolean" ? profile.soundEnabled : true);
    setClaimedDailyEnergyAt(profile.claimedDailyEnergyAt ?? null);
    setWelcomeEnergyGranted(Boolean(profile.welcomeEnergyGranted));
    setGrantedPerfectStageIds(sanitizeStringArray(profile.grantedPerfectStageIds));
    setRedeemedPromoCodes(sanitizeStringArray(profile.redeemedPromoCodes));
    setReferralInvitesCompleted(typeof profile.referralInvitesCompleted === "number" ? profile.referralInvitesCompleted : 0);
    setUnlockedPaidStageKeys(sanitizeStringArray(profile.unlockedPaidStageKeys));
    setEnergyTransfersSentToday(typeof profile.energyTransfersSentToday === "number" ? profile.energyTransfersSentToday : 0);
    setEnergyTransfersSentWeek(typeof profile.energyTransfersSentWeek === "number" ? profile.energyTransfersSentWeek : 0);
    setLastEnergyTransferAt(profile.lastEnergyTransferAt ?? null);
    setLastSeenAt(profile.lastSeenAt ?? null);
    setShowDiagnosticResult(false);
    setIsProfileHydrated(true);
  };
  const needsProfileSetup = !profileSetupDone || !displayName.trim() || displayName === "Герой леса";

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const dailyClaimCooldownMs = useMemo(() => {
    const last = claimedDailyEnergyAt ? Date.parse(claimedDailyEnergyAt) : 0;
    if (!last) {
      return 0;
    }
    const nextAvailableAt = last + 24 * 60 * 60 * 1000;
    return Math.max(0, nextAvailableAt - nowMs);
  }, [claimedDailyEnergyAt, nowMs]);

  const dailyClaimCountdownLabel = useMemo(() => {
    if (dailyClaimCooldownMs <= 0) {
      return "Дейли доступен сейчас";
    }
    const totalMinutes = Math.ceil(dailyClaimCooldownMs / 60_000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `осталось ${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")} до обновления дейли`;
  }, [dailyClaimCooldownMs]);

  const canClaimDailyEnergy = useMemo(() => {
    return dailyClaimCooldownMs <= 0;
  }, [dailyClaimCooldownMs]);
  const transferAmountValue = Number(transferAmountInput);
  const canSendEnergyToFriend =
    Boolean(selectedFriendEmail) &&
    Number.isFinite(transferAmountValue) &&
    transferAmountValue >= ENERGY_TRANSFER_MIN &&
    transferAmountValue <= energy;

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

  const applyEconomySnapshot = (snapshot: EconomySnapshot) => {
    if (typeof snapshot.xp === "number") {
      setXp(snapshot.xp);
    }
    if (typeof snapshot.energy === "number") {
      setEnergy(snapshot.energy);
    }
  };

  const grantEnergy = (amount: number, reason: string) => {
    if (amount <= 0) return;
    setEnergy((prev) => prev + amount);
    trackAnalyticsEvent("answer_correct", {
      details: `energy_granted:${reason};amount:${amount}`,
      courseId: activeProgramMode === "course" ? activeCourse.id : undefined,
      storyId: activeProgramMode === "story" ? selectedStory : undefined,
      stepIndex: forestStepIndex,
    }).catch(() => undefined);
  };

  const spendEnergy = (amount: number, reason: string): boolean => {
    if (amount <= 0) return true;
    if (energy < amount) {
      setStepMessage(`Недостаточно энергии: нужно ${amount}, сейчас ${energy}.`);
      trackAnalyticsEvent("answer_incorrect", {
        details: `energy_insufficient:${reason};need:${amount};have:${energy}`,
        courseId: activeProgramMode === "course" ? activeCourse.id : undefined,
        storyId: activeProgramMode === "story" ? selectedStory : undefined,
      }).catch(() => undefined);
      return false;
    }
    setEnergy((prev) => Math.max(0, prev - amount));
    trackAnalyticsEvent("answer_incorrect", {
      details: `energy_spent:${reason};amount:${amount}`,
      courseId: activeProgramMode === "course" ? activeCourse.id : undefined,
      storyId: activeProgramMode === "story" ? selectedStory : undefined,
      stepIndex: forestStepIndex,
    }).catch(() => undefined);
    return true;
  };

  const claimDailyEnergy = async () => {
    if (!canClaimDailyEnergy || isClaimingDailyEnergy) {
      setPromoInfo("Ежедневная энергия уже получена. Возвращайся позже.");
      return;
    }
    setIsClaimingDailyEnergy(true);
    if (economyMode === "server") {
      try {
        const snapshot = await economyApi.claimDaily();
        applyEconomySnapshot(snapshot);
        setClaimedDailyEnergyAt(new Date().toISOString());
        setPromoInfo("Ежедневный бонус начислен (server).");
      } catch {
        setPromoInfo("Не удалось получить daily-бонус с сервера.");
      } finally {
        setIsClaimingDailyEnergy(false);
      }
      return;
    }
    const nowIso = new Date().toISOString();
    if (dailyClaimCooldownMs > 0) {
      setPromoInfo("Ежедневная энергия уже получена. Возвращайся завтра.");
      setIsClaimingDailyEnergy(false);
      return;
    }
    setClaimedDailyEnergyAt(nowIso);
    grantEnergy(ENERGY_DAILY_BONUS, "daily_claim");
    setPromoInfo(`Ежедневный бонус: +${ENERGY_DAILY_BONUS} энергии.`);
    setIsClaimingDailyEnergy(false);
  };

  const redeemPromoCode = async () => {
    const normalized = promoCodeInput.trim().toUpperCase();
    if (!normalized) {
      setPromoInfo("Введи промокод.");
      return;
    }
    if (economyMode === "server") {
      try {
        const snapshot = await economyApi.redeemPromo(normalized);
        applyEconomySnapshot(snapshot);
        setPromoInfo("Промокод активирован (server).");
        setPromoCodeInput("");
      } catch {
        setPromoInfo("Промокод не принят сервером.");
      }
      return;
    }

    if (redeemedPromoCodes.includes(normalized)) {
      setPromoInfo("Этот промокод уже активирован.");
      return;
    }
    const campaign = promoCampaigns.find((promo) => promo.code === normalized);
    if (!campaign) {
      setPromoInfo("Промокод не найден.");
      return;
    }
    if (Date.now() > Date.parse(campaign.expiresAt)) {
      setPromoInfo("Срок действия промокода истек.");
      return;
    }
    setRedeemedPromoCodes((prev) => [...prev, normalized]);
    grantEnergy(campaign.energy, `promo:${normalized}`);
    setPromoInfo(`Промокод активирован: +${campaign.energy} энергии.`);
    setPromoCodeInput("");
  };

  const completeReferralInvite = async () => {
    if (economyMode === "server") {
      try {
        const snapshot = await economyApi.validateReferral("friend@example.com");
        applyEconomySnapshot(snapshot);
        setPromoInfo("Реферал подтвержден (server).");
      } catch {
        setPromoInfo("Не удалось подтвердить реферал на сервере.");
      }
      return;
    }
    setReferralInvitesCompleted((prev) => prev + 1);
    grantEnergy(ENERGY_REFERRAL_BONUS, "referral_complete");
    setPromoInfo(`Друг завершил первый этап. Бонус: +${ENERGY_REFERRAL_BONUS} энергии.`);
  };

  const addFriendByEmail = async () => {
    const normalized = normalizeEmail(friendEmailInput);
    if (!normalized || !normalized.includes("@")) {
      setPromoInfo("Введите корректный email друга.");
      return;
    }
    if (!currentUserEmail) {
      setPromoInfo("Сначала войди в аккаунт.");
      return;
    }
    if (normalized === currentUserEmail) {
      setPromoInfo("Нельзя добавить себя в друзья.");
      return;
    }

    const raw = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) {
      setPromoInfo("Не удалось открыть базу пользователей.");
      return;
    }
    const store = JSON.parse(raw) as AuthStore;
    const me = store.users[currentUserEmail];
    const friend = store.users[normalized];
    if (!me || !friend) {
      setPromoInfo("Пользователь с таким email не найден.");
      return;
    }

    const myFriends = sanitizeStringArray(me.profile.friendEmails);
    if (myFriends.includes(normalized)) {
      setPromoInfo("Этот друг уже добавлен.");
      setFriendEmailInput("");
      return;
    }

    me.profile.friendEmails = [...myFriends, normalized];
    const friendFriends = sanitizeStringArray(friend.profile.friendEmails);
    if (!friendFriends.includes(currentUserEmail)) {
      friend.profile.friendEmails = [...friendFriends, currentUserEmail];
    }

    store.users[currentUserEmail] = me;
    store.users[normalized] = friend;
    await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(store));
    setFriendEmails(me.profile.friendEmails);
    setSelectedFriendEmail(normalized);
    setFriendEmailInput("");
    setPromoInfo(`Друг добавлен: ${normalized}`);
    await refreshFriendProfiles(me.profile.friendEmails);
  };

  const sendEnergyToFriend = async () => {
    const amount = Number(transferAmountInput);
    if (!Number.isFinite(amount) || amount < ENERGY_TRANSFER_MIN) {
      setPromoInfo(`Минимальный перевод: ${ENERGY_TRANSFER_MIN} энергии.`);
      return;
    }
    const targetEmail = normalizeEmail(selectedFriendEmail);
    if (!targetEmail) {
      setPromoInfo("Выбери друга для перевода.");
      return;
    }
    if (!friendEmails.includes(targetEmail)) {
      setPromoInfo("Сначала добавь этого пользователя в друзья.");
      return;
    }
    if (economyMode === "server") {
      try {
        const snapshot = await economyApi.transferEnergy(amount, targetEmail);
        applyEconomySnapshot(snapshot);
        setPromoInfo(`Перевод ${amount} энергии отправлен: ${targetEmail}.`);
      } catch {
        setPromoInfo("Сервер отклонил перевод энергии.");
      }
      return;
    }

    const now = Date.now();
    const last = lastEnergyTransferAt ? Date.parse(lastEnergyTransferAt) : 0;
    const isSameDay = last ? now - last < 24 * 60 * 60 * 1000 : false;
    const isSameWeek = last ? now - last < 7 * 24 * 60 * 60 * 1000 : false;
    const dailyUsed = isSameDay ? energyTransfersSentToday : 0;
    const weeklyUsed = isSameWeek ? energyTransfersSentWeek : 0;
    if (dailyUsed + amount > ENERGY_TRANSFER_DAILY_LIMIT) {
      setPromoInfo(`Лимит отправки в день: ${ENERGY_TRANSFER_DAILY_LIMIT} энергии.`);
      return;
    }
    if (weeklyUsed + amount > ENERGY_TRANSFER_WEEKLY_LIMIT) {
      setPromoInfo(`Лимит отправки в неделю: ${ENERGY_TRANSFER_WEEKLY_LIMIT} энергии.`);
      return;
    }

    const raw = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw || !currentUserEmail) {
      setPromoInfo("Не удалось выполнить перевод.");
      return;
    }
    const store = JSON.parse(raw) as AuthStore;
    const sender = store.users[currentUserEmail];
    const recipient = store.users[targetEmail];
    if (!sender || !recipient) {
      setPromoInfo("Друг не найден.");
      return;
    }

    const senderEnergy = typeof sender.profile.energy === "number" ? sender.profile.energy : 0;
    if (senderEnergy < amount) {
      setPromoInfo(`Недостаточно энергии: нужно ${amount}, сейчас ${senderEnergy}.`);
      return;
    }

    sender.profile.energy = senderEnergy - amount;
    recipient.profile.energy = (typeof recipient.profile.energy === "number" ? recipient.profile.energy : 0) + amount;
    store.users[currentUserEmail] = sender;
    store.users[targetEmail] = recipient;
    await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(store));

    setEnergy(sender.profile.energy);
    setLastEnergyTransferAt(new Date(now).toISOString());
    setEnergyTransfersSentToday((prev) => (isSameDay ? prev + amount : amount));
    setEnergyTransfersSentWeek((prev) => (isSameWeek ? prev + amount : amount));
    setPromoInfo(`Отправлено ${amount} энергии пользователю ${targetEmail}.`);
    await refreshFriendProfiles(friendEmails);
  };

  const scrollToRecommendedCourse = () => {
    playSfx("swipe").catch(() => undefined);
    const targetY = courseCardYRef.current[recommendedCourse.id];
    mapScrollRef.current?.scrollTo({
      y: typeof targetY === "number" ? Math.max(0, targetY - 12) : 900,
      animated: true,
    });
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
        <ScrollView contentContainerStyle={styles.authResultScroll}>
          <AppCard>
            <Text style={styles.cardTitle}>Подготовка профиля...</Text>
            <Text style={styles.cardText}>Загружаем данные пользователя.</Text>
            <View style={styles.loaderRow}>
              <ActivityIndicator color={colors.accent} />
              <Text style={styles.cardMeta}>Синхронизация локальных данных</Text>
            </View>
          </AppCard>
        </ScrollView>
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
            {authMode === "register" && (
              <TextInput
                value={authNickname}
                onChangeText={(value) => {
                  setAuthNickname(value);
                  setAuthError("");
                  setAuthInfo("");
                }}
                placeholder="Имя или ник (как к тебе обращаться)"
                placeholderTextColor={colors.textSecondary}
                style={styles.authInput}
              />
            )}
            {authMode === "register" && (
              <>
                <Text style={styles.cardMeta}>Пол</Text>
                <View style={styles.rowWrap}>
                  <AppButton
                    label="Женщина"
                    variant={authGender === "female" ? "primary" : "secondary"}
                    onPress={() => setAuthGender("female")}
                  />
                  <AppButton
                    label="Мужчина"
                    variant={authGender === "male" ? "primary" : "secondary"}
                    onPress={() => setAuthGender("male")}
                  />
                </View>
                <Text style={styles.cardMeta}>Есть 18 лет?</Text>
                <View style={styles.rowWrap}>
                  <AppButton
                    label="Да, 18+"
                    variant={authIsAdult18Plus ? "primary" : "secondary"}
                    onPress={() => setAuthIsAdult18Plus(true)}
                  />
                  <AppButton
                    label="Нет, младше 18"
                    variant={!authIsAdult18Plus ? "primary" : "secondary"}
                    onPress={() => setAuthIsAdult18Plus(false)}
                  />
                </View>
                <AppButton
                  label={authAvatarUri ? "Аватар выбран (изменить)" : "Добавить аватар (можно пропустить)"}
                  variant="secondary"
                  onPress={pickAuthAvatarFromLibrary}
                />
              </>
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
                  setAuthNickname("");
                  setAuthAvatarUri(null);
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
                    setAuthNickname("");
                    setAuthAvatarUri(null);
                  }}
                />
              </>
            )}
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
          <Text style={styles.headerMeta}>Энергия {animatedEnergy}</Text>
        </View>
        <View style={styles.headerMetaWrap}>
          <Feather name="award" size={imageSizes.inlineIcon} color={colors.textSecondary} />
          <Text style={styles.headerMeta}>XP {animatedXp}</Text>
        </View>
      </View>

      <View style={styles.content}>
        {activeTab === "map" && (
          <ScrollView ref={mapScrollRef} contentContainerStyle={styles.scroll}>
            <View style={styles.mapHeadingRow}>
              <ScreenHeading
                title="Карта Сказочного Леса"
                subtitle={`Сегодня открыто ${dailyQuests.length} квеста(ов), завершено ${completedCount}.`}
              />
              <Pressable
                style={styles.mapFilterButton}
                onPress={() => setIsMapCatalogVisible(true)}
                accessibilityRole="button"
                accessibilityLabel="Открыть фильтры каталога"
              >
                <Feather name="sliders" size={16} color={colors.textPrimary} />
              </Pressable>
            </View>
            <Modal
              visible={isMapCatalogVisible}
              transparent
              animationType="fade"
              onRequestClose={() => {
                setIsMapCatalogVisible(false);
                setIsMapSearchVisible(false);
              }}
            >
              <View style={styles.catalogModalBackdrop}>
                <Pressable
                  style={styles.catalogModalBackdropTap}
                  onPress={() => {
                    setIsMapCatalogVisible(false);
                    setIsMapSearchVisible(false);
                  }}
                />
                <View style={styles.catalogModalSheet}>
                  <AppCard style={styles.catalogStickyCard}>
                    <View style={styles.catalogModalFixedTop}>
                      <View style={styles.catalogModalHeader}>
                        <View style={styles.cardTitleRow}>
                          <Feather name="layers" size={imageSizes.cardLeadingIcon} color={colors.textPrimary} />
                          <Text style={styles.cardTitle}>{uiEmojiLibrary.dialog} Каталог</Text>
                        </View>
                        <Pressable
                          style={styles.catalogSearchIconButton}
                          onPress={() => {
                            setIsMapCatalogVisible(false);
                            setIsMapSearchVisible(false);
                          }}
                          accessibilityRole="button"
                          accessibilityLabel="Закрыть каталог"
                        >
                          <Feather name="x" size={16} color={colors.textSecondary} />
                        </Pressable>
                      </View>
                      <View style={styles.rowWrap}>
                        <Pressable
                          style={[styles.storyChip, mapCatalogTab === "recommended" && styles.storyChipActive]}
                          onPress={() => setMapCatalogTab("recommended")}
                        >
                          <Text style={styles.chipText}>Рекомендованные</Text>
                        </Pressable>
                        <Pressable
                          style={[styles.storyChip, mapCatalogTab === "quests" && styles.storyChipActive]}
                          onPress={() => setMapCatalogTab("quests")}
                        >
                          <Text style={styles.chipText}>Квесты</Text>
                        </Pressable>
                        <Pressable
                          style={[styles.storyChip, mapCatalogTab === "courses" && styles.storyChipActive]}
                          onPress={() => setMapCatalogTab("courses")}
                        >
                          <Text style={styles.chipText}>Курсы</Text>
                        </Pressable>
                        <Pressable
                          style={[styles.storyChip, mapCatalogTab === "all" && styles.storyChipActive]}
                          onPress={() => setMapCatalogTab("all")}
                        >
                          <Text style={styles.chipText}>Всё</Text>
                        </Pressable>
                        <Pressable
                          style={[styles.storyChip, mapCatalogTab === "completed" && styles.storyChipActive]}
                          onPress={() => setMapCatalogTab("completed")}
                        >
                          <Text style={styles.chipText}>Пройденные</Text>
                        </Pressable>
                      </View>
                      <View style={styles.catalogSearchRow}>
                        <Pressable
                          style={styles.catalogSearchIconButton}
                          onPress={() => {
                            setIsMapSearchVisible((prev) => !prev);
                            requestAnimationFrame(() => {
                              mapSearchInputRef.current?.focus();
                            });
                          }}
                          accessibilityLabel="Поиск по квестам и курсам"
                        >
                          <Feather name="search" size={16} color={colors.textSecondary} />
                        </Pressable>
                        {isMapSearchVisible && (
                          <View style={styles.catalogSearchInputWrap}>
                            <TextInput
                              ref={mapSearchInputRef}
                              value={mapSearchQuery}
                              onChangeText={setMapSearchQuery}
                              placeholder="Поиск по названию квеста или курса"
                              placeholderTextColor={colors.textSecondary}
                              style={styles.catalogSearchInput}
                            />
                            <Pressable
                              style={styles.catalogSearchClearButton}
                              onPress={() => {
                                setMapSearchQuery("");
                                setIsMapSearchVisible(false);
                              }}
                              accessibilityLabel="Очистить поиск"
                            >
                              <Feather name="x" size={16} color={colors.textSecondary} />
                            </Pressable>
                          </View>
                        )}
                      </View>
                      {!!activeCatalogTag && (
                        <View style={styles.catalogActiveTagRow}>
                          <Text style={styles.cardMeta}>Фильтр по тэгу: {activeCatalogTag}</Text>
                          <Pressable
                            style={styles.catalogActiveTagClearButton}
                            onPress={() => setActiveCatalogTag(null)}
                            accessibilityRole="button"
                            accessibilityLabel="Сбросить фильтр по тэгу"
                          >
                            <Feather name="x" size={14} color={colors.textSecondary} />
                          </Pressable>
                        </View>
                      )}
                    </View>
                    <ScrollView style={styles.catalogTagScroll} contentContainerStyle={styles.catalogTagScrollContent}>
                      <View style={styles.tagRow}>
                        {catalogTags.map((tag) => (
                          <Pressable
                            key={`catalog-filter-${tag}`}
                            style={[styles.tagPill, activeCatalogTag === tag && styles.storyChipActive]}
                            onPress={() => toggleCatalogTag(tag)}
                          >
                            <Text style={styles.tagPillText}>{tag}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </ScrollView>
                  </AppCard>
                </View>
              </View>
            </Modal>
            <HeroBanner character={characterLibrary.foxGuide} accentEmoji={uiEmojiLibrary.challenge} title="Выбери курс или сюжет и начни игру" />
            <ScrollHint onPress={scrollToRecommendedCourse} />

            <AppCard>
              <View style={styles.cardTitleRow}>
                <Feather name="navigation" size={imageSizes.cardLeadingIcon} color={colors.textPrimary} />
                <Text style={styles.cardTitle}>{uiEmojiLibrary.course} Текущий курс</Text>
              </View>
              <CardIllustration name={courseIllustrationById[activeCourse.id]} />
              <Text style={styles.cardText}>{activeCourse.title}</Text>
              <Text style={styles.cardMeta}>{activeCourse.lore}</Text>
              <Text style={styles.cardText}>{activeCourse.focus}</Text>
              {activeCourse.features.slice(0, 2).map((feature) => (
                <Text key={`active-course-feature-${feature}`} style={styles.cardMeta}>
                  • {feature}
                </Text>
              ))}
              <Text style={styles.cardText}>Прогресс идет по этапам дорожки (короткие сессии по 2-3 минуты).</Text>
              <AppButton
                label={forestStarted && !forestFinished && selectedCourseId === activeCourse.id ? "Продолжить курс" : `Начать курс: ${activeCourse.title}`}
                pulse={!(forestStarted && !forestFinished && selectedCourseId === activeCourse.id)}
                onPress={() => {
                  if (forestStarted && !forestFinished && selectedCourseId === activeCourse.id) {
                    setActiveTab("quest");
                    return;
                  }
                  startCourseQuest(activeCourse);
                }}
              />
            </AppCard>

            {courses.map((course) => {
              const courseTags = getCourseTags(course);
              const isCourseCompleted = Boolean(completedCourseEndingById[course.id]);
              const isPinnedInProgressCourse =
                activeProgramMode === "course" && selectedCourseId === course.id && forestStarted && !forestFinished;
              const shouldShowCourseByTab =
                mapCatalogTab === "completed"
                  ? isCourseCompleted
                  : mapCatalogTab === "all" || mapCatalogTab === "courses" || (mapCatalogTab === "recommended" && course.id === recommendedCourse.id);
              const shouldShowCourseByStatus = mapCatalogTab === "completed" ? isCourseCompleted : !isCourseCompleted && !isPinnedInProgressCourse;
              const shouldShowCourseByTag = !activeCatalogTag || courseTags.includes(activeCatalogTag);
              const shouldShowCourseBySearch = matchesCatalogSearch([
                course.title,
                course.lore,
                course.focus,
                ...courseTags,
              ]);
              const shouldShowCourse = shouldShowCourseByTab && shouldShowCourseByStatus && shouldShowCourseByTag && shouldShowCourseBySearch;
              if (!shouldShowCourse) {
                return null;
              }
              const isCourseInProgress = selectedCourseId === course.id && forestStarted && !forestFinished;
              const isActiveCourse = selectedCourseId === course.id;
              return (
                <AppCard
                  key={`map-course-${course.id}`}
                  style={styles.courseCard}
                  onLayout={(event) => {
                    courseCardYRef.current[course.id] = event.nativeEvent.layout.y;
                  }}
                >
                  <View style={styles.cardTitleRow}>
                    <Feather name="flag" size={imageSizes.inlineIcon} color={colors.textPrimary} />
                    <Text style={styles.cardTitle}>{course.title}</Text>
                  </View>
                  <CardIllustration name={courseIllustrationById[course.id]} />
                  <View style={styles.tagRow}>
                    {courseTags.map((tag) => (
                      <Pressable
                        key={`${course.id}-${tag}`}
                        style={[styles.tagPill, activeCatalogTag === tag && styles.storyChipActive]}
                        onPress={() => toggleCatalogTag(tag)}
                      >
                        <Text style={styles.tagPillText}>{tag}</Text>
                      </Pressable>
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
                    label={isCourseInProgress ? "Продолжить курс" : "Начать курс"}
                    variant={isActiveCourse ? "secondary" : "primary"}
                    pulse={!isCourseInProgress}
                    onPress={() => {
                      if (isCourseInProgress) {
                        setActiveTab("quest");
                        return;
                      }
                      startCourseQuest(course);
                    }}
                  />
                </AppCard>
              );
            })}

            {storyPreviewId && previewStoryConfig ? (
              <AppCard>
                <AppButton label="Назад к списку квестов" variant="secondary" onPress={() => setStoryPreviewId(null)} />
                <View style={styles.cardTitleRow}>
                  <Text style={styles.emojiLeading}>{previewStoryConfig.emoji}</Text>
                  <Text style={styles.cardTitle}>{previewStoryConfig.label}</Text>
                </View>
                <Text style={styles.cardText}>{previewStoryConfig.description}</Text>
                <Text style={styles.cardMeta}>{storyRatingLabel(previewStoryConfig.id)}</Text>
                <Text style={styles.sectionLabel}>Карта квеста</Text>
                <View style={styles.stageRoadWrap}>
                  {previewStorySteps.slice(0, 6).map((step, idx) => (
                    <View key={`preview-road-${previewStoryConfig.id}-${step.id}`} style={styles.stageRoadNode}>
                      <View style={[styles.stageDot, styles.stageDotCurrent]}>
                        <Text style={styles.stageDotText}>{idx + 1}</Text>
                      </View>
                      <View style={styles.stageRoadTextWrap}>
                        <Text style={styles.cardText}>{step.title}</Text>
                      </View>
                      {idx < Math.min(5, previewStorySteps.length - 1) && <View style={styles.stageRoadLine} />}
                    </View>
                  ))}
                </View>
                <AppButton
                  label={!isAdult18Plus && adultOnlyStories.includes(previewStoryConfig.id) ? "Недоступно (18+)" : `Начать: ${previewStoryConfig.label}`}
                  disabled={!isAdult18Plus && adultOnlyStories.includes(previewStoryConfig.id)}
                  onPress={() => startStoryFromCard(previewStoryConfig.id)}
                />
              </AppCard>
            ) : (
              storyConfigs.map((story) => {
                const storyTags = getStoryTags(story);
                const shouldShowStoryByTab =
                  mapCatalogTab === "completed"
                    ? storyStatusById[story.id] === "completed"
                    : mapCatalogTab === "all" ||
                      mapCatalogTab === "quests" ||
                      (mapCatalogTab === "recommended" && story.id === recommendedStory);
                const isPinnedInProgressStory =
                  activeProgramMode === "story" && selectedStory === story.id && forestStarted && !forestFinished;
                const shouldShowStoryByStatus =
                  mapCatalogTab === "completed" ? storyStatusById[story.id] === "completed" : storyStatusById[story.id] !== "completed" && !isPinnedInProgressStory;
                const shouldShowStoryByTag = !activeCatalogTag || storyTags.includes(activeCatalogTag);
                const shouldShowStoryBySearch = matchesCatalogSearch([story.label, story.description, ...storyTags]);
                const shouldShowStory = shouldShowStoryByTab && shouldShowStoryByStatus && shouldShowStoryByTag && shouldShowStoryBySearch;
                if (!shouldShowStory) {
                  return null;
                }
                const isActive = selectedStory === story.id;
                const isStoryInProgress = activeProgramMode === "story" && isActive && forestStarted && !forestFinished;
                const storyStatus = storyStatusById[story.id];
                const completedEnding = completedStoryEndingById[story.id];
                const isAdultLocked = !isAdult18Plus && adultOnlyStories.includes(story.id);
                const storyIllustration: IllustrationName = campaignLore[story.id].icon;

                return (
                  <AppCard key={`story-card-${story.id}`}>
                    <Pressable onPress={() => openStoryPreview(story.id)} style={styles.storyPreviewTapArea}>
                      <View style={styles.cardTitleRow}>
                        <Text style={styles.emojiLeading}>{story.emoji}</Text>
                        <Text style={styles.cardTitle}>{story.label}</Text>
                      </View>
                      <CardIllustration name={storyIllustration} />
                      <Text style={styles.cardText}>{story.description}</Text>
                      <View style={styles.tagRow}>
                        {storyTags.map((tag) => (
                          <Pressable
                            key={`${story.id}-${tag}`}
                            style={[styles.tagPill, activeCatalogTag === tag && styles.storyChipActive]}
                            onPress={() => toggleCatalogTag(tag)}
                          >
                            <Text style={styles.tagPillText}>{tag}</Text>
                          </Pressable>
                        ))}
                      </View>
                      <Text style={styles.cardMeta}>{storyRatingLabel(story.id)}</Text>
                      {isAdultLocked && <Text style={styles.authError}>Сюжет временно заблокирован для профиля младше 18.</Text>}
                    </Pressable>
                    {isStoryInProgress && (
                      <Text style={styles.cardMeta}>
                        В процессе: {questProgressPercent}% ({forestStepIndex + 1}/{currentForestQuestSteps.length})
                      </Text>
                    )}
                    {storyStatus === "completed" && completedEnding && (
                      <View style={styles.completedStoryBox}>
                        <View style={styles.completedStoryBadge}>
                          <Feather name="check-circle" size={16} color="#10B981" />
                          <Text style={styles.completedStoryBadgeText}>Пройдено</Text>
                        </View>
                        <Text style={styles.cardMeta}>
                          Ачивка: {formatAchievementLabel(buildAchievementId(story.id, completedEnding))}
                        </Text>
                        <Text style={styles.cardMeta}>{endingNarrativeByRoute(story.id)[completedEnding]}</Text>
                      </View>
                    )}
                    {storyStatus === "completed" ? (
                      <AppButton
                        label="Открыть этапы квеста"
                        variant="secondary"
                        onPress={() => openStoryFromFeed(story.id, "road")}
                      />
                    ) : (
                      <AppButton
                        label={
                          isStoryInProgress
                            ? "Продолжить сюжет"
                            : storyStatus === "in_progress"
                              ? "Открыть сюжет"
                              : isAdultLocked
                                ? "Недоступно (18+)"
                                : "Начать квест"
                        }
                        variant={isStoryInProgress || storyStatus !== "not_started" ? "secondary" : "primary"}
                        disabled={isAdultLocked && storyStatus === "not_started"}
                        onPress={() => {
                          if (isStoryInProgress) {
                            setActiveTab("quest");
                            return;
                          }
                          if (storyStatus === "in_progress") {
                            openStoryFromFeed(story.id, "continue");
                            return;
                          }
                          startStoryFromCard(story.id);
                        }}
                      />
                    )}
                  </AppCard>
                );
              })
            )}

            {mapCatalogTab === "quests" && !hasStartedStoriesInCatalog && (
              <AppCard>
                <Text style={styles.cardTitle}>Ты еще не начала квесты</Text>
                <Text style={styles.cardMeta}>Выбери любой сюжет в табе «Всё» или «Рекомендованные», и он появится здесь лентой.</Text>
              </AppCard>
            )}

            <AppCard>
              <View style={styles.cardTitleRow}>
                <Feather name="users" size={imageSizes.cardLeadingIcon} color={colors.textPrimary} />
                <Text style={styles.cardTitle}>Парный эмпатический квест</Text>
              </View>
              <CardIllustration name={eventIllustrationById["pair-empathy-quest"]} />
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
            {activeProgramMode === "story" && (
              <AppCard>
                <Text style={styles.sectionLabel}>Твои квесты</Text>
                {questFeedStories.length ? (
                  questFeedStories.map((story) => {
                    const status = storyStatusById[story.id];
                    const isActiveStory = selectedStory === story.id;
                    const ending = completedStoryEndingById[story.id];
                    return (
                      <View key={`quest-feed-${story.id}`} style={styles.storyFeedRow}>
                        <View style={styles.storyFeedTextWrap}>
                          <Text style={styles.cardText}>
                            {story.emoji} {story.label}
                          </Text>
                          <Text style={styles.cardMeta}>
                            {status === "completed"
                              ? `Пройдено • ${ending ? endingRouteName[ending] : "финал открыт"}`
                              : isActiveStory
                                ? "Текущий сюжет"
                                : "В процессе"}
                          </Text>
                        </View>
                        {status === "completed" ? (
                          <View style={styles.storyFeedActions}>
                            <View style={styles.completedStoryBadgeCompact}>
                              <Feather name="check-circle" size={16} color="#10B981" />
                              <Text style={styles.completedStoryBadgeText}>Пройдено</Text>
                            </View>
                            <AppButton
                              label="Этапы"
                              variant="secondary"
                              onPress={() => openStoryFromFeed(story.id, "road")}
                            />
                          </View>
                        ) : (
                          <AppButton
                            label={isActiveStory ? "Открыт" : "Открыть"}
                            variant="secondary"
                            onPress={() => openStoryFromFeed(story.id, "continue")}
                          />
                        )}
                      </View>
                    );
                  })
                ) : (
                  <Text style={styles.cardMeta}>Ты еще не запустила ни одного квеста с карты.</Text>
                )}
              </AppCard>
            )}
            <AppCard style={styles.questHeaderProgressCard}>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${episodeProgressPercent}%` }]} />
              </View>
              <Text style={styles.cardMeta}>Прогресс эпизода: {effectiveEpisodeProgressPercent}%</Text>
            </AppCard>
            {!forestStarted && !forestFinished && stageProgressSummary && (
              <AppCard>
                <Text style={styles.sectionLabel}>Промежуточный итог этапа {stageProgressSummary.stageIdx + 1}</Text>
                <Text style={styles.cardText}>Длительность: ~{stageProgressSummary.durationSec} сек.</Text>
                <Text style={styles.cardText}>{stageProgressSummary.narrative}</Text>
                <Text style={styles.cardTitle}>Тактики пользователя в этом этапе</Text>
                {buildBranchScaleData(stageProgressSummary.tacticUsage).map(({ branch, value, percent }) => (
                  <View key={`stage-summary-${branch}`} style={styles.scaleRow}>
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
                <Text style={styles.cardMeta}>Техническая аналитика этапа сохранена в профиле и админке.</Text>
              </AppCard>
            )}
            {!forestStarted && (
              <AppCard>
                <Text style={styles.sectionLabel}>Карта этапов</Text>
                <Text style={styles.cardTitle}>Дорога прогресса: {activeProgramMode === "course" ? activeCourse.title : activeStoryConfig.label}</Text>
                <Text style={styles.cardText}>
                  Иди по сюжету короткими отрезками: один пройденный узел открывает следующий.
                </Text>
                <View style={styles.stageRoadWrap}>
                  {visibleStageRoadItems.map((stage, idx) => {
                    const stateLabel = !stage.isPresent
                      ? "скоро"
                      : stage.isDone
                      ? "пройден"
                      : stage.isCurrent
                      ? "текущий"
                      : stage.isAvailable
                      ? "доступен"
                      : "закрыт";
                    const isLocked = !stage.isAvailable || !stage.isPresent;
                    return (
                      <View key={`stage-road-${stage.stageIdx}`} style={styles.stageRoadNode}>
                        <Pressable
                          disabled={isLocked}
                          style={[
                            styles.stageDot,
                            stage.isDone && styles.stageDotDone,
                            stage.isCurrent && styles.stageDotCurrent,
                            isLocked && styles.stageDotLocked,
                          ]}
                          onPress={() => openStageFromRoad(stage.stageIdx)}
                        >
                          <Text style={styles.stageDotText}>{stage.stageIdx + 1}</Text>
                        </Pressable>
                        <View style={styles.stageRoadTextWrap}>
                          <Text style={styles.cardText}>{stage.title}</Text>
                          <Text style={styles.cardMeta}>{stateLabel === "текущий" ? "твой текущий узел" : stateLabel}</Text>
                        </View>
                        {idx < visibleStageRoadItems.length - 1 && <View style={styles.stageRoadLine} />}
                      </View>
                    );
                  })}
                </View>
                {hasExpandedStageRoad ? (
                  <AppButton
                    label={stageRoadExpanded ? "Свернуть путь" : "Показать весь путь"}
                    variant="secondary"
                    onPress={() => setStageRoadExpanded((prev) => !prev)}
                  />
                ) : (
                  <Text style={styles.cardMeta}>Вся дорожка уже показана на этом этапе.</Text>
                )}
                <Text style={styles.cardMeta}>Фокус тренировки по стилю: {activePrimaryConflictStyle.focus}</Text>
              </AppCard>
            )}

            {forestStarted && !forestFinished && (
              <AppCard>
                <View style={styles.stepEmojiWrap}>
                  <Text style={styles.stepEmojiText}>{activeForestStep.sceneEmoji ?? "🧠"}</Text>
                </View>
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
                    <Text
                      style={[
                        styles.praiseText,
                        {
                          borderColor: stepReactionAccent,
                          backgroundColor: `${stepReactionAccent}22`,
                        },
                      ]}
                    >
                      ✨ {lastStepPraise}
                    </Text>
                  </Animated.View>
                )}
                <Text style={styles.sectionLabel}>Сцена</Text>
                <Text style={styles.questInstructionText}>{visibleStepDispositionByNpcGender || visibleStepSceneByNpcGender}</Text>
                <Text style={styles.sectionLabel}>Реплика</Text>
                <SpeechBubble
                  text={visibleStepSpeechByNpcGender || visibleStepSceneByNpcGender}
                  speakerName={applyGenderToNpcReplica(activeForestStep.opponentName ?? "", activeNpcGender)}
                  speakerEmoji={activeForestStep.opponentAvatar ?? activeForestStep.sceneEmoji}
                />
                <Text style={styles.sectionLabel}>Вопрос</Text>
                <View style={styles.stepHintActionsRow}>
                  <Pressable
                    style={styles.hintIconCircle}
                    onPress={() => {
                      playSfx("tap").catch(() => undefined);
                      openQuestHintBubble(visibleStepInstructionByPlayerGender, "instruction");
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Показать формулировку вопроса"
                  >
                    <Text style={styles.hintIconCircleText}>?</Text>
                  </Pressable>
                  <Text style={styles.cardMeta}>Нажми «?», чтобы открыть формулировку вопроса во всплывающем окне.</Text>
                </View>
                <Text style={styles.sectionLabel}>Подсказка</Text>
                <View style={styles.stepHintActionsRow}>
                  <Pressable
                    onPress={() => {
                      playSfx("swipe").catch(() => undefined);
                      openQuestHintBubble(visibleStepHintByPlayerGender, "hint");
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Показать подсказку"
                  >
                    <Text style={styles.hintInlineButtonText}>Показать</Text>
                  </Pressable>
                  <Text style={styles.cardMeta}>Короткая подсказка к выбору (не готовый ответ).</Text>
                </View>

                {activeForestStep.type !== "builder" && (
                  <>
                    <Text style={styles.sectionLabel}>Варианты ответа</Text>
                    {visibleStepOptions.map((option, idx) => {
                      const isMultiple = activeForestStep.type === "multiple";
                      const checked = isMultiple ? selectedMultiple.includes(idx) : selectedSingle === idx;
                      return (
                        <Pressable
                          key={`${activeForestStep.id}-option-${idx}`}
                          style={[
                            styles.optionCard,
                            checked && styles.optionCardActive,
                          ]}
                          onPress={() => {
                            playSfx("tap").catch(() => undefined);
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
                          <Text style={styles.optionText}>{applyGenderToPlayerReplica(option, effectivePlayerGender)}</Text>
                        </Pressable>
                      );
                    })}
                  </>
                )}

                {activeForestStep.type === "builder" && (
                  <View style={styles.builderWrap}>
                    <Text style={styles.cardMeta}>Собранная фраза (тапни слово, чтобы удалить)</Text>
                    <View style={styles.builderLine}>
                      {builderTokens.length ? (
                        <View style={styles.rowWrap}>
                          {visibleBuilderTokens.map((token, idx) => (
                            <Pressable
                              key={`${token}-built-${idx}`}
                              style={[
                                styles.tokenChip,
                                styles.builtTokenChip,
                                builderMismatchIndices.includes(idx) && styles.builderTokenChipMismatch,
                              ]}
                              onPress={() => {
                                playSfx("tap").catch(() => undefined);
                                setBuilderMismatchIndices([]);
                                setSelectedBuilderIndices((prev) => prev.filter((_, tokenIdx) => tokenIdx !== idx));
                              }}
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
                      {visibleShuffledTokenBank.map((token, idx) => {
                        const isUsed = selectedBuilderIndices.includes(idx);
                        if (isUsed) {
                          return null;
                        }

                        return (
                          <Pressable
                            key={`${token}-${idx}`}
                            style={styles.tokenChip}
                            onPress={() => {
                              playSfx("tap").catch(() => undefined);
                              setBuilderMismatchIndices([]);
                              setSelectedBuilderIndices((prev) => [...prev, idx]);
                            }}
                          >
                            <Text style={styles.chipText}>{token}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    <AppButton
                      label="Очистить сборку"
                      variant="secondary"
                      onPress={() => {
                        setBuilderMismatchIndices([]);
                        setSelectedBuilderIndices([]);
                      }}
                    />
                  </View>
                )}

                <View style={styles.rowWrap}>
                  <Pressable
                    style={styles.primaryButtonInline}
                    onPress={() => {
                      playSfx("tap").catch(() => undefined);
                      evaluateForestStep();
                    }}
                  >
                    <Text style={styles.buttonPrimaryText}>Сделать ход</Text>
                  </Pressable>
                </View>
                {!!stepMessage && <Text style={styles.statusText}>{stepMessage}</Text>}
                <Modal transparent visible={!!questHintBubbleText} animationType="fade" onRequestClose={closeQuestHintBubble}>
                  <View style={styles.hintModalRoot}>
                    <Pressable style={styles.hintModalBackdrop} onPress={closeQuestHintBubble} />
                    <View style={styles.hintModalBubble}>
                      <Text style={styles.hintModalTitle}>{questHintBubbleTitle}</Text>
                      <Text style={styles.hintModalText}>{questHintBubbleText}</Text>
                    </View>
                  </View>
                </Modal>
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
                <Text style={styles.cardText}>Этапов пройдено: {stageCount}/{stageCount}</Text>
                <Text style={styles.cardText}>Успехов с 1-й попытки: {firstTrySuccess}</Text>
                <Text style={styles.cardText}>Ошибок всего: {totalErrors}</Text>
                <Text style={styles.cardText}>Штрафов применено: {penaltyCount}</Text>
                <Text style={styles.cardText}>
                  Итог по XP в квесте: {forestXpEarned >= 0 ? "+" : ""}
                  {forestXpEarned} XP
                </Text>
                <Text style={styles.sectionLabel}>История финала</Text>
                <Text style={styles.cardText}>{questFinalSummary?.story ?? endingNarrativeByRoute(activeCampaignId)[dominantEndingRoute]}</Text>
                <View style={styles.achievementDetailBox}>
                  <Text style={styles.cardTitle}>Достижение за концовку</Text>
                  <Text style={styles.cardText}>
                    {(questFinalSummary?.achievementIcon ?? "🏅")} {questFinalSummary?.achievementTitle ?? formatAchievementLabel(buildAchievementId(activeCampaignId, dominantEndingRoute))}
                  </Text>
                  <Text style={styles.cardMeta}>
                    {questFinalSummary?.achievementDetails ??
                      `Награда за финал ${endingRouteName[dominantEndingRoute]} в кампании «${campaignLore[activeCampaignId].title}».`}
                  </Text>
                </View>
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
                <Text style={styles.cardMeta}>Финал: {questFinalSummary?.endingTitle ?? endingRouteName[dominantEndingRoute]}</Text>
                {activeProgramMode === "story" && (
                  <>
                    <Text style={styles.sectionLabel}>Оцени сценарий</Text>
                    <View style={styles.ratingOptionsWrap}>
                      {storyRatingOptions.map((rating) => {
                        const active = pendingStoryRating === rating;
                        return (
                          <Pressable
                            key={`rating-${rating}`}
                            style={[styles.ratingChip, active && styles.ratingChipActive]}
                            onPress={() => {
                              if (ratingVoteLocked) {
                                return;
                              }
                              setPendingStoryRating(rating);
                            }}
                          >
                            <Text style={styles.cardMeta}>{rating.toFixed(1).replace(".", ",")}★</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    <AppButton
                      label={ratingVoteLocked ? "Оценка отправлена" : "Оценить сценарий"}
                      variant={ratingVoteLocked ? "secondary" : "primary"}
                      onPress={submitStoryRating}
                    />
                  </>
                )}
                <AppButton
                  label="Перейти к карте квестов"
                  variant="secondary"
                  onPress={() => {
                    setForestStarted(false);
                    setActiveTab("map");
                  }}
                />
              </AppCard>
            )}
          </ScrollView>
        )}

        {activeTab === "event" && (
          <ScrollView contentContainerStyle={styles.scroll}>
            <ScreenHeading title={seasonalEventMvp.seasonLabel} subtitle={seasonalEventMvp.title} />
            <HeroBanner character={characterLibrary.wolfStrategist} accentEmoji={uiEmojiLibrary.streak} title="Командный прогресс и награды" />
            <AppCard>
              <View style={styles.cardTitleRow}>
                <Feather name="activity" size={imageSizes.cardLeadingIcon} color={colors.textPrimary} />
                <Text style={styles.cardTitle}>Прогресс сообщества</Text>
              </View>
              <CardIllustration name="trophy-outline" />
              <Text style={styles.cardText}>{seasonalEventMvp.communityGoalText}</Text>
              <Text style={styles.cardMeta}>Шагов пройдено: {eventCompletedCount}/{eventSteps.length} • {eventProgressPercent}%</Text>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${Math.max(0, Math.min(100, eventProgressPercent))}%` }]} />
              </View>
              <Text style={styles.cardMeta}>
                Накоплено в ивенте: +{eventProgress.xpEarned} XP и +{eventProgress.energyEarned} энергии.
              </Text>
              {!eventProgress.joined ? (
                <AppButton label="Вступить в ивент" onPress={startSeasonEvent} />
              ) : eventProgress.finished ? (
                <>
                  <Text style={styles.cardText}>Ивент завершен. {seasonalEventMvp.completionReward.badge}</Text>
                  <Text style={styles.cardMeta}>
                    Финальная награда: +{seasonalEventMvp.completionReward.xp} XP и +{seasonalEventMvp.completionReward.energy} энергии.
                  </Text>
                  <AppButton
                    label={eventProgress.rewardClaimed ? "Награда уже получена" : "Забрать финальную награду"}
                    variant={eventProgress.rewardClaimed ? "secondary" : "primary"}
                    onPress={claimSeasonEventReward}
                    style={styles.profileEconomyButton}
                  />
                  <AppButton label="Перезапустить сезон" variant="secondary" onPress={startSeasonEvent} style={styles.profileEconomyButton} />
                </>
              ) : (
                <>
                  <Text style={styles.sectionLabel}>Текущая сцена</Text>
                  <Text style={styles.questInstructionText}>{activeEventStep?.scene}</Text>
                  <Text style={styles.sectionLabel}>Что сделать сейчас</Text>
                  <Text style={styles.questInstructionText}>{activeEventStep?.instruction}</Text>

                  {activeEventStep?.type !== "builder" &&
                    activeEventStep?.options?.map((option, idx) => {
                      const isMultiple = activeEventStep.type === "multiple";
                      const checked = isMultiple ? eventSelectedMultiple.includes(idx) : eventSelectedSingle === idx;
                      return (
                        <Pressable
                          key={`${activeEventStep.id}-event-option-${idx}`}
                          style={[
                            styles.optionCard,
                            checked && styles.optionCardActive,
                            eventWrongSingleIndex === idx && styles.optionCardWrong,
                          ]}
                          onPress={() => {
                            setEventWrongSingleIndex(null);
                            if (isMultiple) {
                              setEventSelectedMultiple((prev) => {
                                if (prev.includes(idx)) {
                                  return prev.filter((value) => value !== idx);
                                }
                                const needed = activeEventStep.correctMultiple?.length ?? 2;
                                if (prev.length >= needed) {
                                  return prev;
                                }
                                return [...prev, idx];
                              });
                              return;
                            }
                            setEventSelectedSingle(idx);
                          }}
                        >
                          <Text style={styles.optionText}>{option}</Text>
                        </Pressable>
                      );
                    })}

                  {activeEventStep?.type === "builder" && (
                    <View style={styles.builderWrap}>
                      <Text style={styles.cardMeta}>Собранная фраза (тапни слово, чтобы убрать)</Text>
                      <View style={styles.builderLine}>
                        {eventBuilderTokens.length ? (
                          <View style={styles.rowWrap}>
                            {eventBuilderTokens.map((token, idx) => (
                              <Pressable
                                key={`${activeEventStep.id}-built-${token}-${idx}`}
                                style={[styles.tokenChip, styles.builtTokenChip]}
                                onPress={() =>
                                  setEventSelectedBuilderIndices((prev) => prev.filter((_, tokenIdx) => tokenIdx !== idx))
                                }
                              >
                                <Text style={styles.cardMeta}>{token}</Text>
                              </Pressable>
                            ))}
                          </View>
                        ) : (
                          <Text style={styles.cardMeta}>Пока пусто — набери фразу снизу.</Text>
                        )}
                      </View>
                      <Text style={styles.cardMeta}>Банк слов</Text>
                      <View style={styles.rowWrap}>
                        {eventShuffledTokenBank.map((token, idx) => {
                          if (eventSelectedBuilderIndices.includes(idx)) {
                            return null;
                          }
                          return (
                            <Pressable
                              key={`${activeEventStep.id}-bank-${token}-${idx}`}
                              style={styles.tokenChip}
                              onPress={() => setEventSelectedBuilderIndices((prev) => [...prev, idx])}
                            >
                              <Text style={styles.cardMeta}>{token}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  )}

                  {!!eventShowHint && <Text style={styles.hintText}>Подсказка: {activeEventStep?.hint}</Text>}
                  <Text style={styles.statusText}>{eventStepMessage}</Text>
                  <View style={styles.profileEconomyActionStack}>
                    <AppButton label="Сделать ход" onPress={evaluateSeasonEventStep} style={styles.profileEconomyButton} />
                    <AppButton
                      label={eventShowHint ? "Скрыть подсказку" : "Показать подсказку"}
                      variant="secondary"
                      style={styles.profileEconomyButton}
                      onPress={() => setEventShowHint((prev) => !prev)}
                    />
                  </View>
                </>
              )}
            </AppCard>

            <AppCard>
              <View style={styles.cardTitleRow}>
                <Feather name="users" size={imageSizes.cardLeadingIcon} color={colors.textPrimary} />
                <Text style={styles.cardTitle}>Парный эмпатический квест</Text>
              </View>
              <CardIllustration name={eventIllustrationById["pair-empathy-quest"]} />
              <Text style={styles.cardText}>
                Пройди 2 проходки: сначала за себя, затем угадай ответы друга. Друг делает то же самое на своем аккаунте.
              </Text>
              {authBackendMode !== "server" ? (
                <Text style={styles.authError}>Нужен server-режим, чтобы синхронизировать проходки между двумя аккаунтами.</Text>
              ) : (
                <>
                  <TextInput
                    value={pairFriendEmailDraft}
                    onChangeText={setPairFriendEmailDraft}
                    placeholder="Email друга для инвайта"
                    placeholderTextColor={colors.textSecondary}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    style={styles.promoInput}
                  />
                  <View style={styles.profileEconomyActionStack}>
                    <AppButton
                      label={pairInviteLoading ? "Отправляем..." : "Создать пару"}
                      onPress={inviteToEmpathyPair}
                      disabled={pairInviteLoading}
                      style={styles.profileEconomyButton}
                    />
                    <AppButton
                      label="Обновить пары"
                      variant="secondary"
                      onPress={() => refreshEmpathyPairs().catch(() => undefined)}
                      style={styles.profileEconomyButton}
                    />
                  </View>
                  {!!pairEventMessage && <Text style={styles.statusText}>{pairEventMessage}</Text>}

                  {empathyPairs.map((pair) => {
                    const selfEmpathy =
                      currentUserEmail && pair.report?.perMember
                        ? pair.report.perMember[currentUserEmail]?.empathyPercent ?? null
                        : null;
                    return (
                      <View key={`pair-event-${pair.id}`} style={styles.achievementDetailBox}>
                        <Text style={styles.cardText}>Пара с: {pair.counterpartEmail}</Text>
                        <Text style={styles.cardMeta}>
                          Ты: {pair.me.selfActualDone ? "за себя готово" : "за себя не пройдено"} /{" "}
                          {pair.me.friendPredictionDone ? "за друга готово" : "за друга не пройдено"}
                        </Text>
                        <Text style={styles.cardMeta}>
                          Друг: {pair.counterpart.selfActualDone ? "за себя готово" : "за себя не пройдено"} /{" "}
                          {pair.counterpart.friendPredictionDone ? "за тебя готово" : "за тебя не пройдено"}
                        </Text>
                        {pair.report ? (
                          <>
                            <Text style={styles.cardMeta}>Совпадение ваших реальных ответов: {pair.report.answersOverlapPercent}%</Text>
                            <Text style={styles.cardMeta}>Твой уровень эмпатии: {selfEmpathy ?? 0}%</Text>
                            <Text style={styles.cardMeta}>Общий эмпатический процент: {pair.report.overallEmpathyPercent}%</Text>
                            <Text style={styles.cardText}>Ачивка пары: {pair.report.achievement}</Text>
                          </>
                        ) : (
                          <Text style={styles.cardMeta}>Финальный отчет появится после 4 проходок (по 2 от каждого).</Text>
                        )}
                        <View style={styles.profileEconomyActionStack}>
                          <AppButton
                            label="Пройти за себя"
                            variant={pair.me.selfActualDone ? "secondary" : "primary"}
                            onPress={() => startEmpathyPass(pair, "self_actual")}
                            style={styles.profileEconomyButton}
                          />
                          <AppButton
                            label="Пройти за друга"
                            variant={pair.me.friendPredictionDone ? "secondary" : "primary"}
                            onPress={() => startEmpathyPass(pair, "friend_predicted_by_me")}
                            style={styles.profileEconomyButton}
                          />
                        </View>
                      </View>
                    );
                  })}

                  {activePairId && activePairPassType && (
                    <View style={styles.builderWrap}>
                      <Text style={styles.sectionLabel}>
                        {activePairPassType === "self_actual"
                          ? "Проходка 1/2: отвечаешь за себя"
                          : "Проходка 2/2: угадываешь ответы друга"}
                      </Text>
                      {pairEmpathyQuestionBankByPassType[activePairPassType].map((question, questionIdx) => (
                        <View key={`pair-q-${questionIdx}`} style={styles.courseExperimentBox}>
                          <Text style={styles.cardText}>
                            {questionIdx + 1}. {question}
                          </Text>
                          {pairEmpathyOptions.map((option, optionIdx) => (
                            <Pressable
                              key={`pair-q-${questionIdx}-opt-${optionIdx}`}
                              style={[styles.optionCard, activePairAnswers[questionIdx] === optionIdx && styles.optionCardActive]}
                              onPress={() =>
                                setActivePairAnswers((prev) => {
                                  const next = [...prev];
                                  next[questionIdx] = optionIdx;
                                  return next;
                                })
                              }
                            >
                              <Text style={styles.optionText}>{option}</Text>
                            </Pressable>
                          ))}
                        </View>
                      ))}
                      <View style={styles.profileEconomyActionStack}>
                        <AppButton
                          label={pairSubmitLoading ? "Сохраняем..." : "Сохранить проходку"}
                          onPress={submitEmpathyPass}
                          disabled={pairSubmitLoading}
                          style={styles.profileEconomyButton}
                        />
                        <AppButton
                          label="Отменить"
                          variant="secondary"
                          onPress={() => {
                            setActivePairId(null);
                            setActivePairPassType(null);
                            setActivePairAnswers(Array.from({ length: pairEmpathyQuestionBankByPassType.self_actual.length }, () => -1));
                          }}
                          style={styles.profileEconomyButton}
                        />
                      </View>
                    </View>
                  )}
                </>
              )}
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
                <View style={styles.profileAvatarControlRow}>
                  <Pressable
                    onPress={() => {
                      if (!avatarUri) {
                        pickAvatarFromLibrary();
                      }
                    }}
                    style={styles.profileAvatarPressable}
                  >
                    {avatarUri ? (
                      <Image source={{ uri: avatarUri }} style={styles.profileAvatarImage} />
                    ) : (
                      <ImageFallback label="Аватар" size={imageSizes.profileAvatar} />
                    )}
                  </Pressable>
                  {avatarUri && (
                    <View style={styles.profileAvatarActionColumn}>
                      <Pressable style={styles.profileAvatarActionButton} onPress={clearProfileAvatar}>
                        <Feather name="trash-2" size={16} color={colors.textPrimary} />
                      </Pressable>
                      <Pressable style={styles.profileAvatarActionButton} onPress={pickAvatarFromLibrary}>
                        <Feather name="plus" size={16} color={colors.textPrimary} />
                      </Pressable>
                    </View>
                  )}
                </View>
                <View style={styles.profileInfo}>
                  <Text style={styles.cardTitle}>Текущий ранг</Text>
                  <Text style={styles.cardText}>Новичок-Наблюдатель</Text>
                  <Text style={styles.cardMeta}>{currentUserEmail}</Text>
                </View>
              </View>
              {needsProfileSetup && (
                <View style={styles.achievementDetailBox}>
                  <Text style={styles.cardText}>Давай познакомимся: как тебя называть?</Text>
                  <TextInput
                    value={profileNameDraft}
                    onChangeText={setProfileNameDraft}
                    placeholder="Имя или ник"
                    placeholderTextColor={colors.textSecondary}
                    style={styles.promoInput}
                  />
                  <AppButton label="Сохранить имя" onPress={saveProfileIdentity} />
                </View>
              )}
              {!needsProfileSetup && (
                <Text style={styles.cardText}>Игрок: {displayName}</Text>
              )}
              <Text style={styles.cardMeta}>Пол профиля: {profileGender === "female" ? "Женщина" : "Мужчина"}</Text>
              <View style={styles.rowWrap}>
                <AppButton
                  label="Женщина"
                  variant={profileGender === "female" ? "primary" : "secondary"}
                  onPress={() => setProfileGender("female")}
                />
                <AppButton
                  label="Мужчина"
                  variant={profileGender === "male" ? "primary" : "secondary"}
                  onPress={() => setProfileGender("male")}
                />
              </View>
              <Text style={styles.cardText}>Рекорд глубины рефлексии: 82/100</Text>
              <Text style={styles.cardMeta}>{isSavingProfile ? "Сохраняем прогресс..." : "Прогресс сохранен локально"}</Text>
              <Text style={styles.cardMeta}>Открыто концовок: {unlockedEndings.length}</Text>
              <Text style={styles.cardMeta}>Достижений: {unlockedAchievements.length}</Text>
              <Text style={styles.cardMeta}>Звук в игре: {soundEnabled ? "включен" : "выключен"}</Text>
              <Text style={styles.cardMeta}>Streak: {streak} дн.</Text>
              <AppButton
                label={soundEnabled ? "Выключить звук" : "Включить звук"}
                variant="secondary"
                onPress={() => {
                  playSfx("tap").catch(() => undefined);
                  setSoundEnabled((prev) => !prev);
                }}
              />
              <AppButton label="Выйти из аккаунта" variant="secondary" onPress={handleLogout} />
            </AppCard>

            <AppCard>
              <Text style={[styles.sectionLabel, styles.profileEconomyTitle]}>Экономика игрока</Text>
              <ClaimRewardButton
                label={canClaimDailyEnergy ? `Забрать daily +${ENERGY_DAILY_BONUS}` : "Daily получен"}
                onPress={claimDailyEnergy}
                canClaim={canClaimDailyEnergy && !isClaimingDailyEnergy}
                style={styles.profileEconomyButton}
              />
              <Text style={styles.cardMeta}>{dailyClaimCountdownLabel}</Text>
              <Text style={styles.cardTitle}>XP и энергия</Text>
              <Text style={styles.cardText}>XP: {animatedXp} • Энергия: {animatedEnergy}</Text>
              <Text style={styles.cardMeta}>
                Первые {FREE_STAGES_PER_CAMPAIGN} этапа в квесте бесплатны, дальше — {currentStageCost} энергии за этап.
              </Text>
              <View style={styles.profileEconomyActionStack}>
                <AppButton
                  label="Пополнить (RuStore Wallet) +120"
                  onPress={() => {
                    grantEnergy(120, "wallet_rustore_mock");
                    setPromoInfo("Пополнение через RuStore Wallet (mock): +120 энергии.");
                  }}
                  style={styles.profileEconomyButton}
                />
                <AppButton
                  label="Пополнить (YooKassa) +340"
                  variant="secondary"
                  onPress={() => {
                    grantEnergy(340, "wallet_yookassa_mock");
                    setPromoInfo("Пополнение через YooKassa (mock): +340 энергии.");
                  }}
                  style={styles.profileEconomyButton}
                />
              </View>
              <TextInput
                value={promoCodeInput}
                onChangeText={setPromoCodeInput}
                placeholder="Промокод"
                placeholderTextColor={colors.textSecondary}
                style={styles.promoInput}
              />
              <AppButton
                label="Активировать промокод"
                variant="secondary"
                onPress={redeemPromoCode}
                style={styles.profileEconomyButton}
              />
              <View style={styles.profileEconomyActionStack}>
                <AppButton
                  label={`Реферал завершен +${ENERGY_REFERRAL_BONUS}`}
                  variant="secondary"
                  onPress={completeReferralInvite}
                  style={styles.profileEconomyButton}
                />
                <Text style={styles.cardMeta}>Подтвержденных приглашений: {referralInvitesCompleted}</Text>
              </View>
              <TextInput
                value={transferAmountInput}
                onChangeText={setTransferAmountInput}
                placeholder="Сколько отправить другу"
                placeholderTextColor={colors.textSecondary}
                keyboardType="numeric"
                style={styles.promoInput}
              />
              <Text style={styles.cardMeta}>Кому отправить</Text>
              {friendEmails.length ? (
                <View style={styles.rowWrap}>
                  {friendEmails.map((email) => {
                    const selected = selectedFriendEmail === email;
                    return (
                      <Pressable
                        key={`transfer-friend-${email}`}
                        style={[styles.storyChip, selected && styles.storyChipActive]}
                        onPress={() => setSelectedFriendEmail(email)}
                      >
                        <Text style={styles.chipText}>{friendProfiles[email]?.displayName ?? email}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : (
                <Text style={styles.cardMeta}>Список друзей пока пуст. Добавь друга ниже.</Text>
              )}
              <TransferActionButton
                label="Отправить энергию другу"
                onPress={sendEnergyToFriend}
                enabled={canSendEnergyToFriend}
                style={styles.profileEconomyButton}
              />
              {!!promoInfo && <Text style={styles.cardMeta}>{promoInfo}</Text>}
            </AppCard>

            <AppCard>
              <Text style={styles.sectionLabel}>Друзья</Text>
              <Text style={styles.cardTitle}>Добавить друга</Text>
              <TextInput
                value={friendEmailInput}
                onChangeText={setFriendEmailInput}
                placeholder="Email друга"
                placeholderTextColor={colors.textSecondary}
                autoCapitalize="none"
                keyboardType="email-address"
                style={styles.promoInput}
              />
              <AppButton label="Добавить друга" variant="secondary" onPress={addFriendByEmail} style={styles.profileEconomyButton} />
              <Text style={styles.cardMeta}>Друзей: {friendEmails.length}</Text>
              <View style={styles.rowWrap}>
                {friendEmails.map((email) => (
                  <Pressable
                    key={`friend-open-${email}`}
                    style={[styles.storyChip, openedFriendEmail === email && styles.storyChipActive]}
                    onPress={() => setOpenedFriendEmail((prev) => (prev === email ? null : email))}
                  >
                    <Text style={styles.chipText}>{friendProfiles[email]?.displayName ?? email}</Text>
                  </Pressable>
                ))}
              </View>
              {openedFriendEmail && openedFriendProfile && (
                <View style={styles.achievementDetailBox}>
                  <Text style={styles.cardText}>{openedFriendProfile.displayName}</Text>
                  <Text style={styles.cardMeta}>{openedFriendEmail}</Text>
                  <Text style={styles.cardMeta}>{openedFriendProfile.aboutMe}</Text>
                  <Text style={styles.cardMeta}>
                    XP: {openedFriendProfile.xp} • Энергия: {openedFriendProfile.energy} • Завершено квестов:{" "}
                    {openedFriendProfile.completedCount}
                  </Text>
                  <Text style={styles.cardMeta}>
                    Стиль коммуникации: {conflictStyles.find((style) => style.id === openedFriendProfile.conflictPrimaryStyle)?.label ?? "—"}
                  </Text>
                </View>
              )}
            </AppCard>

            <AppCard>
              <Text style={styles.sectionLabel}>Статистика ошибок и ответов</Text>
              <Text style={styles.cardText}>
                Верные ответы: {practiceStats.answersCorrect} • Неверные ответы: {practiceStats.answersIncorrect}
              </Text>
              <Text style={styles.cardMeta}>
                Самый частый тип ошибки: {topPracticeError ? `${formatErrorTypeLabelRu(topPracticeError[0])} (${topPracticeError[1]})` : "пока нет"}
              </Text>
              {Object.entries(practiceStats.wrongTacticByType)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
                .map(([tactic, count]) => (
                  <Text key={`wrong-tactic-${tactic}`} style={styles.cardMeta}>
                    • Тактика «{formatTacticLabelRu(tactic)}»: {count}
                  </Text>
                ))}
              {!!wrongTacticScaleData.length && (
                <>
                  <Text style={styles.cardTitle}>Шкалы повторяемости стиля ошибок</Text>
                  {wrongTacticScaleData.map(({ branch, value, percent }) => (
                    <View key={`wrong-scale-${branch}`} style={styles.scaleRow}>
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
                </>
              )}
              <Text style={styles.sectionLabel}>Тех-аналитика по типам ошибок</Text>
              {Object.entries(practiceStats.errorByType)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 6)
                .map(([errorType, count]) => (
                  <Text key={`error-type-${errorType}`} style={styles.cardMeta}>
                    • {formatErrorTypeLabelRu(errorType)}: {count}
                  </Text>
                ))}
              {!Object.keys(practiceStats.errorByType).length && (
                <Text style={styles.cardMeta}>Пока нет накопленных данных по типам ошибок.</Text>
              )}
              {repeatedErrorCourse ? (
                <>
                  <Text style={styles.cardText}>
                    Повтор ошибки более 7 раз. Рекомендован спец-курс: {repeatedErrorCourse.title}
                  </Text>
                  <AppButton
                    label={`Открыть курс: ${repeatedErrorCourse.title}`}
                    onPress={() => {
                      activateCourse(repeatedErrorCourse);
                      setActiveTab("map");
                    }}
                  />
                </>
              ) : (
                <Text style={styles.cardMeta}>Когда один тип ошибки повторится более 7 раз, здесь появится спец-курс.</Text>
              )}
            </AppCard>

            <AppCard>
              <Text style={styles.sectionLabel}>Коллекция достижений</Text>
              <Text style={styles.cardTitle}>Финалы</Text>
              {achievementItems.length ? (
                <View style={styles.achievementGrid}>
                  {achievementItems.map((item) => (
                    <Pressable
                      key={item.id}
                      style={[
                        styles.achievementIconButton,
                        openAchievementId === item.id && styles.achievementIconButtonActive,
                      ]}
                      onPress={() => setOpenAchievementId((prev) => (prev === item.id ? null : item.id))}
                    >
                      <Text style={styles.achievementIconEmoji}>{item.icon}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : (
                <Text style={styles.cardMeta}>Пока нет. Заверши кампанию, чтобы открыть первую концовку.</Text>
              )}
              {openAchievementId &&
                achievementItems
                  .filter((item) => item.id === openAchievementId)
                  .map((item) => (
                    <View key={`detail-${item.id}`} style={styles.achievementDetailBox}>
                      <Text style={styles.cardText}>{item.title}</Text>
                      <Text style={styles.cardMeta}>{item.details}</Text>
                    </View>
                  ))}
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

        {activeTab === "admin" && currentUserRole === "ADMIN" && (
          <ScrollView contentContainerStyle={styles.scroll}>
            <ScreenHeading title="Веб-админка аналитики" subtitle="Системная воронка по каждому пользователю" />
            <HeroBanner character={characterLibrary.lynxAnalyst} accentEmoji={uiEmojiLibrary.strategy} title="Смотри вход, тест, прогресс, отказы и время" />
            <AppCard>
              <Text style={styles.sectionLabel}>Обзор</Text>
              <Text style={styles.cardText}>Пользователей: {adminUsers.length}</Text>
              <Text style={styles.cardText}>
                Активные сессии:{" "}
                {adminUsers.filter((user) => {
                  const last = Date.parse(user.analytics.lastSeenAt);
                  return Number.isFinite(last) && Date.now() - last < 15 * 60 * 1000;
                }).length}
              </Text>
              <TextInput
                value={adminUserSearch}
                onChangeText={setAdminUserSearch}
                placeholder="Поиск по email"
                placeholderTextColor={colors.textSecondary}
                autoCapitalize="none"
                keyboardType="email-address"
                style={styles.promoInput}
              />
              {!!adminActionMessage && <Text style={styles.authSuccess}>{adminActionMessage}</Text>}
              <AppButton label="Обновить аналитику" variant="secondary" onPress={() => refreshAnalyticsSnapshot()} />
            </AppCard>

            {isServerAuth && (
              <AppCard>
                <Text style={styles.sectionLabel}>Продуктовый дашборд (server)</Text>
                {isServerMetricsLoading && <Text style={styles.cardMeta}>Обновляю метрики...</Text>}
                {!!serverMetricsError && <Text style={styles.authError}>{serverMetricsError}</Text>}
                {serverAdminMetrics && (
                  <>
                    <Text style={styles.cardText}>
                      DAU/WAU/MAU: {serverAdminMetrics.totals.dau} / {serverAdminMetrics.totals.wau} / {serverAdminMetrics.totals.mau}
                    </Text>
                    <Text style={styles.cardMeta}>
                      Регистрации 24ч: {serverAdminMetrics.totals.registrations24h} • Логины 24ч: {serverAdminMetrics.totals.logins24h}
                    </Text>
                    <Text style={styles.cardMeta}>
                      Сессии 24ч: {serverAdminMetrics.totals.sessions24h} • Активные 24ч: {serverAdminMetrics.totals.activeUsers24h}
                    </Text>
                    <Text style={styles.sectionLabel}>Воронка 24ч</Text>
                    <Text style={styles.cardMeta}>
                      Квесты: старт {serverAdminMetrics.funnel24h.questStarts} → финиш {serverAdminMetrics.funnel24h.questCompletions} (
                      {serverAdminMetrics.funnel24h.questCompletionRate}%)
                    </Text>
                    <Text style={styles.cardMeta}>
                      Курсы: старт {serverAdminMetrics.funnel24h.courseStarts} → финиш {serverAdminMetrics.funnel24h.courseCompletions} (
                      {serverAdminMetrics.funnel24h.courseCompletionRate}%)
                    </Text>
                    <Text style={styles.sectionLabel}>Ошибки и отказы 24ч</Text>
                    <Text style={styles.cardMeta}>
                      Отказы: {serverAdminMetrics.quality24h.dropOffs} • Step fail: {serverAdminMetrics.quality24h.stepFails} • Штрафы:{" "}
                      {serverAdminMetrics.quality24h.penalties}
                    </Text>
                    <Text style={styles.cardMeta}>Неверных ответов: {serverAdminMetrics.quality24h.answerIncorrect}</Text>
                    {serverAdminMetrics.quality24h.topErrorTypes.slice(0, 5).map((item) => (
                      <Text key={`srv-err-${item.errorType}`} style={styles.cardMeta}>
                        • {formatErrorTypeLabelRu(item.errorType)}: {item.count}
                      </Text>
                    ))}
                    <Text style={styles.sectionLabel}>Просмотры табов 24ч</Text>
                    {serverAdminMetrics.engagement24h.topTabs.slice(0, 5).map((item) => (
                      <Text key={`srv-tab-${item.tab}`} style={styles.cardMeta}>
                        • {item.tab}: {item.views}
                      </Text>
                    ))}
                  </>
                )}
              </AppCard>
            )}

            {filteredAdminUsers.map((user) => {
              const email = user.email;
              const data = user.analytics;
              const isExpanded = expandedAdminEmail === email;
              const testAnswers = data.diagnosticAnswers.length;
              const recentEvents = data.events.slice(-5).reverse();
              const completionRate = data.counters.courseStarts
                ? Math.round((data.counters.courseCompletions / data.counters.courseStarts) * 100)
                : 0;
              const currentGrantAmount = adminGrantAmountByEmail[email] ?? "10";
              return (
                <AppCard key={`analytics-${email}`}>
                  <View style={styles.adminCardHeader}>
                    <View style={styles.adminCardHeadMain}>
                      <Text style={styles.cardTitle}>{email}</Text>
                      <Text style={styles.cardMeta}>Роль: {user.role} • XP: {user.xp} • Энергия: {user.energy}</Text>
                    </View>
                    <AppButton
                      label={isExpanded ? "Свернуть" : "Развернуть"}
                      variant="secondary"
                      style={styles.adminExpandButton}
                      onPress={() => setExpandedAdminEmail((prev) => (prev === email ? null : email))}
                    />
                  </View>

                  {isExpanded && (
                    <>
                      <View style={styles.adminGrantRow}>
                        <TextInput
                          value={currentGrantAmount}
                          onChangeText={(value) => setAdminGrantAmountByEmail((prev) => ({ ...prev, [email]: value }))}
                          keyboardType="numeric"
                          placeholder="amount"
                          placeholderTextColor={colors.textSecondary}
                          style={[styles.promoInput, styles.adminGrantInput]}
                        />
                        <AppButton label="Отсыпать" onPress={() => grantEnergyFromAdmin(email)} style={styles.adminGrantButton} />
                      </View>
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
                        Этапы: старт {data.counters.stageStarts} / финиш {data.counters.stageCompletions}
                      </Text>
                      <Text style={styles.cardMeta}>
                        Триггеры: ошибки {data.counters.stepFails}, штрафы {data.counters.penalties}, отказы {data.counters.dropOffs}
                      </Text>
                      <Text style={styles.cardMeta}>
                        LitRPG: смен ветки {data.events.filter((event) => event.type === "branch_shift").length}, открыто концовок{" "}
                        {data.events.filter((event) => event.type === "ending_unlock").length}
                      </Text>
                      <Text style={styles.cardMeta}>Ответов в диагностике: {testAnswers}</Text>
                      <Text style={styles.sectionLabel}>Ошибки по типам (включая прощенные)</Text>
                      {Object.entries(data.answerByErrorType ?? {})
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 8)
                        .map(([errorType, count]) => (
                          <Text key={`${email}-err-${errorType}`} style={styles.cardMeta}>
                            • {errorType}: {count}
                          </Text>
                        ))}
                      {!Object.keys(data.answerByErrorType ?? {}).length && (
                        <Text style={styles.cardMeta}>По этому пользователю пока нет детализации ошибок.</Text>
                      )}
                      <Text style={styles.sectionLabel}>Тактики (ошибочные выборы)</Text>
                      {Object.entries(data.answerByTactic ?? {})
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 8)
                        .map(([tactic, count]) => (
                          <Text key={`${email}-tactic-${tactic}`} style={styles.cardMeta}>
                            • {tactic}: {count}
                          </Text>
                        ))}
                      {!Object.keys(data.answerByTactic ?? {}).length && (
                        <Text style={styles.cardMeta}>По тактикам пока нет данных.</Text>
                      )}
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
                    </>
                  )}
                </AppCard>
              );
            })}
            {!filteredAdminUsers.length && (
              <AppCard>
                <Text style={styles.cardText}>По этому email ничего не найдено.</Text>
              </AppCard>
            )}

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
        {visibleTabs.map((tab) => (
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
    paddingTop: Platform.OS === "android" ? theme.spacing.xl + 14 : theme.spacing.xl,
    paddingBottom: theme.spacing.lg,
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
    paddingBottom: theme.spacing.page + 24,
    gap: theme.spacing.lg,
  },
  authResultScroll: {
    padding: theme.spacing.page,
    paddingTop: theme.spacing.page + 8,
    paddingBottom: theme.spacing.page + 24,
  },
  headingWrap: {
    gap: theme.spacing.xs,
    flex: 1,
  },
  mapHeadingRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  mapFilterButton: {
    width: 36,
    height: 36,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  catalogModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(5, 8, 14, 0.52)",
    paddingHorizontal: theme.spacing.page,
    paddingTop: 110,
  },
  catalogModalBackdropTap: {
    ...StyleSheet.absoluteFillObject,
  },
  catalogModalSheet: {
    width: "100%",
    maxHeight: "72%",
  },
  catalogModalFixedTop: {
    gap: 8,
    paddingBottom: 2,
  },
  catalogModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  catalogTagScroll: {
    maxHeight: 220,
    marginTop: 8,
  },
  catalogTagScrollContent: {
    paddingBottom: 4,
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
  questStepTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 22,
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
  questHeaderProgressCard: {
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.md,
  },
  dailyTaskCard: {
    backgroundColor: "#132A3F",
  },
  catalogStickyCard: {
    backgroundColor: colors.card,
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
  promoInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: theme.radius.sm,
    color: colors.textPrimary,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
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
  buttonDisabled: {
    backgroundColor: "#2A3240",
    borderColor: "#3A4454",
    opacity: 0.85,
  },
  buttonDisabledText: {
    color: "#8A95A8",
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
  buttonSecondaryActive: {
    borderColor: colors.accent,
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
  profileEconomyActionStack: {
    flexDirection: "column",
    gap: 8,
  },
  profileEconomyButton: {
    width: "100%",
  },
  builderTokenChipMismatch: {
    borderColor: "#F87171",
    borderWidth: 2,
    backgroundColor: "rgba(248, 113, 113, 0.16)",
  },
  profileEconomyTitle: {
    marginBottom: theme.spacing.sm,
  },
  claimRewardButtonReady: {
    marginTop: -10,
    marginBottom: 6,
    shadowColor: "#7CF5D0",
    shadowOpacity: 0.45,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
    elevation: 9,
  },
  claimRewardButtonIdle: {
    marginTop: -10,
    marginBottom: 6,
  },
  ratingOptionsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  ratingChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.surfaceMuted,
  },
  ratingChipActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
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
  catalogSearchRow: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  catalogSearchIconButton: {
    width: 32,
    height: 32,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  catalogSearchInputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: theme.radius.sm,
    backgroundColor: colors.surfaceMuted,
    paddingLeft: theme.spacing.md,
    paddingRight: 6,
  },
  catalogSearchInput: {
    flex: 1,
    color: colors.textPrimary,
    paddingVertical: 8,
    fontSize: 13,
  },
  catalogSearchClearButton: {
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  catalogActiveTagRow: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  catalogActiveTagClearButton: {
    width: 22,
    height: 22,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
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
    paddingBottom: Platform.OS === "android" ? 18 : 0,
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
  profileAvatarControlRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  profileAvatarPressable: {
    borderRadius: 999,
    overflow: "hidden",
  },
  profileAvatarImage: {
    width: imageSizes.profileAvatar,
    height: imageSizes.profileAvatar,
    borderRadius: 999,
  },
  profileAvatarActionColumn: {
    gap: 8,
    justifyContent: "center",
  },
  profileAvatarActionButton: {
    width: 32,
    height: 32,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  storyPreviewTapArea: {
    gap: 8,
  },
  storyFeedRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  storyFeedTextWrap: {
    flex: 1,
    gap: 2,
  },
  storyFeedActions: {
    alignItems: "flex-end",
    gap: 6,
  },
  completedStoryBox: {
    marginTop: 6,
    gap: 6,
    borderWidth: 1,
    borderColor: "#1D5B43",
    backgroundColor: "rgba(16, 185, 129, 0.08)",
    borderRadius: theme.radius.md,
    padding: 10,
  },
  completedStoryBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  completedStoryBadgeCompact: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  completedStoryBadgeText: {
    color: "#34D399",
    fontSize: 12,
    fontWeight: "700",
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
  optionCardWrong: {
    borderColor: "#F87171",
    borderWidth: 2,
    backgroundColor: "rgba(248, 113, 113, 0.12)",
  },
  optionText: {
    color: colors.textPrimary,
    fontSize: 13,
    lineHeight: 19,
  },
  praiseText: {
    color: colors.textPrimary,
    backgroundColor: "rgba(52, 211, 153, 0.14)",
    borderWidth: 1,
    borderColor: "#34D399",
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    fontSize: 14,
    fontWeight: "400",
    lineHeight: 20,
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
    marginBottom: 4,
    marginLeft: 2,
  },
  speechSpeakerEmoji: {
    fontSize: 14,
  },
  speechSpeakerName: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "400",
    letterSpacing: 0.2,
  },
  speechBubbleColumn: {
    flex: 1,
  },
  speechBubble: {
    flex: 1,
    backgroundColor: "#16314A",
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  speechBubbleRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  speechAvatarWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  speechAvatarEmoji: {
    fontSize: 18,
  },
  speechBubbleText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 23,
  },
  speechBubbleTail: {
    marginLeft: 58,
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
  stepHintActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 6,
  },
  hintIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  hintIconCircleText: {
    color: colors.textSecondary,
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 18,
  },
  hintInlineButtonText: {
    color: "#9BC0FF",
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 18,
    textDecorationLine: "underline",
  },
  stageRoadWrap: {
    gap: 8,
    marginTop: 4,
  },
  stageRoadNode: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingBottom: 8,
  },
  stageDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  stageDotDone: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  stageDotCurrent: {
    borderWidth: 2,
    borderColor: "#8B5CF6",
    backgroundColor: "rgba(139, 92, 246, 0.2)",
  },
  stageDotLocked: {
    opacity: 0.45,
  },
  stageDotText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: "700",
  },
  stageRoadTextWrap: {
    flex: 1,
    gap: 2,
    paddingRight: 4,
  },
  stageRoadLine: {
    position: "absolute",
    left: 17,
    top: 40,
    width: 2,
    height: 8,
    backgroundColor: colors.border,
  },
  achievementGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 6,
  },
  achievementIconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  achievementIconButtonActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  achievementIconEmoji: {
    fontSize: 22,
    lineHeight: 26,
  },
  achievementDetailBox: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: theme.radius.sm,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    gap: 4,
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
  hintModalRoot: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: theme.spacing.lg,
  },
  hintModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(4, 12, 24, 0.65)",
  },
  hintModalBubble: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#2A4C6D",
    backgroundColor: "#13314D",
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    gap: 6,
  },
  hintModalTitle: {
    color: "#BFD9FF",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  hintModalText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "400",
    lineHeight: 20,
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
  adminCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  adminCardHeadMain: {
    flex: 1,
    gap: 2,
  },
  adminExpandButton: {
    minWidth: 120,
  },
  adminGrantRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
    marginBottom: 4,
  },
  adminGrantInput: {
    flex: 1,
  },
  adminGrantButton: {
    minWidth: 120,
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
