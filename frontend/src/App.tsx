import { useEffect, useState } from "react";

interface HealthResponse {
  status: "ok";
  service: string;
}
type ConnectionState =
  | { phase: "checking" }
  | { phase: "connected"; service: string }
  | { phase: "unavailable" };

export function App() {
  const [connection, setConnection] = useState<ConnectionState>({ phase: "checking" });

  useEffect(() => {
    const controller = new AbortController();

    async function checkApi(): Promise<void> {
      try {
        const response = await fetch("/api/health", { signal: controller.signal });

        if (!response.ok) {
          throw new Error(`Health check failed with status ${response.status}`);
        }

        const health = (await response.json()) as HealthResponse;

        if (health.status !== "ok") {
          throw new Error("Health check returned an unexpected payload");
        }

        setConnection({ phase: "connected", service: health.service });
      } catch (error: unknown) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setConnection({ phase: "unavailable" });
        }
      }
    }

    void checkApi();
    return () => controller.abort();
  }, []);

  const message =
    connection.phase === "checking"
      ? "Checking API connectivity…"
      : connection.phase === "connected"
        ? `Connected to ${connection.service}`
        : "API is unavailable. Start the backend and refresh.";

  return (
    <main className="shell">
      <section className="panel" aria-labelledby="page-title">
        <p className="eyebrow">Layer 1 foundation</p>
        <h1 id="page-title">AcademicCloud</h1>
        <p className="summary">A private, dependable home for academic files.</p>
        <div className={`status status--${connection.phase}`} role="status">
          <span className="status__dot" aria-hidden="true" />
          {message}
        </div>
      </section>
    </main>
  );
}
