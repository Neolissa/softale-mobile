import { type ErrorInfo, type ReactNode, Component } from "react";
import { Platform, Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";

type AppErrorBoundaryProps = {
  children: ReactNode;
};

type AppErrorBoundaryState = {
  hasError: boolean;
  errorId: string;
};

function nextErrorId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export default class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    hasError: false,
    errorId: "",
  };

  static getDerivedStateFromError() {
    return {
      hasError: true,
      errorId: nextErrorId(),
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const globalContext = globalThis as Record<string, unknown>;
    const activeTab = typeof globalContext.__SOFTALE_ACTIVE_TAB__ === "string" ? globalContext.__SOFTALE_ACTIVE_TAB__ : "unknown";
    console.error("[runtime-guard] UI crash captured", {
      errorId: this.state.errorId,
      activeTab,
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack,
    });
  }

  private handleRecover = () => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.location.reload();
      return;
    }
    this.setState({
      hasError: false,
      errorId: "",
    });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.card}>
          <Text style={styles.title}>Что-то пошло не так</Text>
          <Text style={styles.text}>
            Интерфейс столкнулся с непредвиденной ошибкой. Нажми кнопку ниже, чтобы безопасно перезапустить экран.
          </Text>
          <Text style={styles.code}>Код ошибки: {this.state.errorId || "unknown"}</Text>
          <Pressable style={styles.button} onPress={this.handleRecover}>
            <Text style={styles.buttonText}>Перезагрузить приложение</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#061526",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  card: {
    width: "100%",
    maxWidth: 520,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#2E3D52",
    backgroundColor: "#10243A",
    padding: 20,
    gap: 12,
  },
  title: {
    color: "#F5F8FF",
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "700",
  },
  text: {
    color: "#B3C2D9",
    fontSize: 15,
    lineHeight: 22,
  },
  code: {
    color: "#7EC8FF",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  button: {
    marginTop: 4,
    borderRadius: 10,
    backgroundColor: "#2E9BFF",
    paddingVertical: 12,
    alignItems: "center",
  },
  buttonText: {
    color: "#F5F8FF",
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "700",
  },
});

