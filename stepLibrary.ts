/**
 * Единый источник истины для шага LitRPG-квеста:
 * сцена, оппонент, реплика, вопрос (instruction), подсказка и пять вариантов
 * всегда согласованы по одному индексу шага.
 */
import { editorialStepOptionsByCampaign, manualInstructionByCampaign } from "./scenarioBible";
import type { ScenarioCampaignId } from "./scenarioBible";
import { reactionOverridesByCampaignStep, reactionPoolsByCampaign } from "./reactionPoolsByCampaign";
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
  const pressureBranch: BranchId = idx % 2 === 0 ? "challenger" : "architect";
  const bestBranch = inferBestBranchByHint(hint, stageIdx, idx);
  const tuple: BranchId[] = [
    pressureBranch,
    bestBranch,
    pressureBranch === "challenger" ? "architect" : "challenger",
    bestBranch,
    "architect",
  ];
  const safeCorrect = Math.max(0, Math.min(4, correctSingle));
  const safeTrap = Math.max(0, Math.min(4, trapIndex));
  // Корректный ответ должен вести в "сильную" ветку, иначе оценка и тон NPC расходятся.
  tuple[safeCorrect] = bestBranch;
  tuple[safeTrap] = bestBranch;
  return tuple as [BranchId, BranchId, BranchId, BranchId, BranchId];
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
  const pool = reactionPoolsByCampaign[campaign as CampaignContentId]?.[branch];
  if (!pool?.length) {
    throw new Error(`[stepLibrary] Нет пула реакций для кампании "${campaign}" и ветки "${branch}"`);
  }
  const pick = pool[(globalStepIdx * 7 + optionIdx * 3 + campaign.length) % pool.length];
  return `${opponentName.trim()}: ${pick}`;
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
      // Сохраняем исторический порядок long-рантайма: внутри этапа сдвиг по stageIdx.
      out.push(row[(t + s) % row.length] ?? row[0]);
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
      // Сохраняем исторический порядок long-рантайма: шаблон вопроса с шагом *2 + stageIdx.
      const base = row[(t * 2 + s) % row.length] ?? row[0];
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
  const opponentLines = flattenOpponentLines(seed, scenes, stages, tps);
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
