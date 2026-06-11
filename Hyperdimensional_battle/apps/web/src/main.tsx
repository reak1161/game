import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles.css";

type ErrorBoundaryState = {
  hasError: boolean;
  message: string;
};

class RootErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    message: ""
  };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : String(error ?? "Unknown error")
    };
  }

  componentDidCatch(error: unknown) {
    console.error("Root render failed", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
            background: "#0f172a",
            color: "#e2e8f0",
            padding: "32px"
          }}
        >
          <div
            style={{
              width: "min(760px, 100%)",
              border: "1px solid rgba(148, 163, 184, 0.35)",
              borderRadius: "18px",
              background: "rgba(15, 23, 42, 0.9)",
              padding: "24px 28px",
              boxShadow: "0 24px 60px rgba(15, 23, 42, 0.45)"
            }}
          >
            <div style={{ fontSize: "24px", fontWeight: 700, marginBottom: "12px" }}>画面の読み込みに失敗しました</div>
            <div style={{ fontSize: "15px", lineHeight: 1.7, color: "#cbd5e1" }}>
              {this.state.message || "Unknown error"}
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </React.StrictMode>
);
