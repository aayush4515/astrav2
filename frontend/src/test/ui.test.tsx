import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { BoothView } from "../features/booth/BoothView";
import { SummaryView } from "../features/check-in/SummaryView";
import { BodyMap, regionStatus } from "../features/dashboard/BodyMap";
import type { AnalysisResult, MetricState } from "../types";

const metric = (over: Partial<MetricState>): MetricState => ({
  label: "Heart rate", value: 70, unit: "bpm", region: "cardiovascular", device: "vitals_module", simulated: true, context: "resting",
  ref_low: 50, ref_high: 100, outside_reference: false, z: 0.2, baseline: 68, spread: 3, trend_per_day: 0, status: "normal", ...over,
});

describe("UI components", () => {
  it("summary shows one status, observations and the next action", () => {
    const result = {
      status_level: "watch",
      status: "Additional assessment suggested",
      observations: [{ severity: "watch", title: "Combined change in recovery indicators", explanation: "x", metrics: [], category: "wellbeing", method: "pattern", comparison: {}, guidance_ids: [], uncertainty: null, experimental: false }],
      guidance: [{ id: "sleep_hygiene", tier: "routine", title: "Protect your sleep period", spoken: "", steps: ["Dim lights"], why: "", source: "", category: "sleep", demo_only: true }],
      disclaimer: "Not a medical device.",
      data_provenance: { note: "simulated", simulated_readings: 1, real_readings: 0, user_reported: 1 },
    } as unknown as AnalysisResult;
    render(<SummaryView result={result} onDetails={() => undefined} />);
    expect(screen.getByText("Additional assessment suggested")).toBeInTheDocument();
    expect(screen.getByText("Combined change in recovery indicators")).toBeInTheDocument();
    expect(screen.getByText("Protect your sleep period")).toBeInTheDocument();
    expect(screen.getByText("Detailed health insights")).toBeInTheDocument();
    expect(screen.queryByText(/score/i)).toBeNull();
  });

  it("body map regions reflect worst metric status", () => {
    const metrics = { heart_rate: metric({ status: "notable" }), spo2: metric({ region: "respiratory", status: "normal" }) };
    expect(regionStatus(metrics, "cardiovascular")).toBe("notable");
    expect(regionStatus(metrics, "respiratory")).toBe("normal");
    render(<BodyMap metrics={metrics} selected={null} onSelect={() => undefined} />);
    expect(screen.getAllByRole("button", { name: "Cardiovascular" }).length).toBeGreaterThan(0);
  });

  it("booth falls back to an accessible device list without WebGL", () => {
    render(
      <MemoryRouter>
        <BoothView activeDevice="vitals_module" phase="scanning" />
      </MemoryRouter>,
    );
    expect(screen.getByText(/WebGL disabled/)).toBeInTheDocument();
    expect(screen.getByText(/● Vitals/)).toBeInTheDocument();
  });
});
