import { StatusBar } from "expo-status-bar";
import { useMemo, useState } from "react";
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

type Tab = "map" | "quest" | "event" | "feedback" | "profile";

type Quest = {
  id: string;
  biome: string;
  title: string;
  prompt: string;
  reward: number;
};

const tabs: { key: Tab; label: string }[] = [
  { key: "map", label: "Карта" },
  { key: "quest", label: "Квест" },
  { key: "event", label: "Ивент" },
  { key: "feedback", label: "AI" },
  { key: "profile", label: "Профиль" },
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

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("map");
  const [streak] = useState(5);
  const [xp, setXp] = useState(124);
  const [completedCount, setCompletedCount] = useState(0);
  const [answer, setAnswer] = useState("");
  const [lastFeedback, setLastFeedback] = useState("Твоя рефлексия сегодня запустит рост Кристалла Эмпатии.");
  const [selectedQuestId, setSelectedQuestId] = useState(dailyQuests[0].id);
  const [eventJoined, setEventJoined] = useState(false);

  const selectedQuest = useMemo(
    () => dailyQuests.find((quest) => quest.id === selectedQuestId) ?? dailyQuests[0],
    [selectedQuestId]
  );

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

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />

      <View style={styles.header}>
        <Text style={styles.brand}>SofTale</Text>
        <Text style={styles.headerMeta}>Streak {streak} дн.</Text>
        <Text style={styles.headerMeta}>XP {xp}</Text>
      </View>

      <View style={styles.content}>
        {activeTab === "map" && (
          <ScrollView contentContainerStyle={styles.scroll}>
            <Text style={styles.title}>Карта Сказочного Леса</Text>
            <Text style={styles.subtitle}>Сегодня открыто {dailyQuests.length} квеста(ов), завершено {completedCount}.</Text>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Текущая тропа</Text>
              <Text style={styles.cardText}>Лес Эмоций -> Долина Диалога -> Башня Границ</Text>
              <Pressable style={styles.primaryButton} onPress={() => setActiveTab("quest")}>
                <Text style={styles.primaryButtonText}>Начать квест дня</Text>
              </Pressable>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Парный эмпатический квест</Text>
              <Text style={styles.cardText}>
                Сценарий недели: поддержать персонажа, который боится отказать руководителю.
              </Text>
              <Pressable style={styles.secondaryButton} onPress={() => setActiveTab("event")}>
                <Text style={styles.secondaryButtonText}>Открыть ивент</Text>
              </Pressable>
            </View>
          </ScrollView>
        )}

        {activeTab === "quest" && (
          <ScrollView contentContainerStyle={styles.scroll}>
            <Text style={styles.title}>Квест дня</Text>

            <View style={styles.rowWrap}>
              {dailyQuests.map((quest) => (
                <Pressable
                  key={quest.id}
                  style={[styles.chip, quest.id === selectedQuest.id && styles.chipActive]}
                  onPress={() => setSelectedQuestId(quest.id)}
                >
                  <Text style={styles.chipText}>{quest.title}</Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>{selectedQuest.title}</Text>
              <Text style={styles.cardMeta}>{selectedQuest.biome}</Text>
              <Text style={styles.cardText}>{selectedQuest.prompt}</Text>
              <TextInput
                value={answer}
                onChangeText={setAnswer}
                multiline
                placeholder="Напиши свой ответ..."
                placeholderTextColor="#7B7A92"
                style={styles.input}
              />
              <Pressable style={styles.primaryButton} onPress={completeQuest}>
                <Text style={styles.primaryButtonText}>Отправить ответ (+{selectedQuest.reward} XP)</Text>
              </Pressable>
            </View>
          </ScrollView>
        )}

        {activeTab === "event" && (
          <ScrollView contentContainerStyle={styles.scroll}>
            <Text style={styles.title}>Сезонный Ивент</Text>
            <Text style={styles.subtitle}>Месяц Осознанной Коммуникации</Text>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Прогресс сообщества</Text>
              <Text style={styles.cardText}>74% до открытия легендарного артефакта "Сердце Леса".</Text>
              <Text style={styles.cardText}>Твой вклад: {completedCount * 12} очков рефлексии.</Text>
              <Pressable
                style={eventJoined ? styles.secondaryButton : styles.primaryButton}
                onPress={() => setEventJoined(true)}
              >
                <Text style={eventJoined ? styles.secondaryButtonText : styles.primaryButtonText}>
                  {eventJoined ? "Ты уже в ивенте" : "Вступить в ивент"}
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        )}

        {activeTab === "feedback" && (
          <ScrollView contentContainerStyle={styles.scroll}>
            <Text style={styles.title}>AI-обратная связь</Text>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Твой рост сегодня</Text>
              <Text style={styles.cardText}>{lastFeedback}</Text>
              <View style={styles.tag}>
                <Text style={styles.tagText}>Уточняющий вопрос</Text>
              </View>
              <Text style={styles.cardText}>{followUpHints[(completedCount + 2) % followUpHints.length]}</Text>
              <Pressable style={styles.secondaryButton} onPress={() => setActiveTab("quest")}>
                <Text style={styles.secondaryButtonText}>Переписать ответ глубже</Text>
              </Pressable>
            </View>
          </ScrollView>
        )}

        {activeTab === "profile" && (
          <ScrollView contentContainerStyle={styles.scroll}>
            <Text style={styles.title}>Профиль героя</Text>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Текущий ранг</Text>
              <Text style={styles.cardText}>Новичок-Наблюдатель</Text>
              <Text style={styles.cardText}>Рекорд глубины рефлексии: 82/100</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Артефакты</Text>
              {artifacts.map((artifact) => (
                <Text key={artifact} style={styles.cardText}>
                  - {artifact}
                </Text>
              ))}
            </View>
          </ScrollView>
        )}
      </View>

      <View style={styles.tabBar}>
        {tabs.map((tab) => (
          <Pressable key={tab.key} style={styles.tabButton} onPress={() => setActiveTab(tab.key)}>
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>{tab.label}</Text>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}

const colors = {
  bg: "#111024",
  card: "#1C1A36",
  textPrimary: "#F4F3FF",
  textSecondary: "#B7B4DB",
  accent: "#7D5FFF",
  accentSoft: "#2D2759",
  border: "#3A366B",
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  brand: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: "700",
  },
  headerMeta: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "600",
  },
  content: {
    flex: 1,
  },
  scroll: {
    padding: 16,
    gap: 12,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: "700",
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 14,
    marginBottom: 6,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 8,
  },
  cardTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "700",
  },
  cardMeta: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "600",
  },
  cardText: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  input: {
    minHeight: 110,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    color: colors.textPrimary,
    padding: 10,
    textAlignVertical: "top",
    backgroundColor: "#151331",
  },
  primaryButton: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryButtonText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "700",
  },
  secondaryButton: {
    backgroundColor: colors.accentSoft,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: "600",
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
    backgroundColor: "#13112A",
  },
  tabButton: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
  },
  tabText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "600",
  },
  tabTextActive: {
    color: colors.textPrimary,
  },
});
