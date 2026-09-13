"use client";

import {
  ChangeEvent,
  Component,
  DragEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
  useMemo,
  useRef,
  useState,
} from "react";

type SpectrumPoint = { x: number; y: number };
type PeakKind = "main" | "solvent" | "impurity";
type MultiplicityCode =
  | "s"
  | "d"
  | "t"
  | "q"
  | "quint"
  | "sext"
  | "dd"
  | "ddd"
  | "dddd"
  | "dt"
  | "td"
  | "dq"
  | "tt"
  | "tdd"
  | "dtd"
  | "ddt"
  | "m";
type Peak = {
  id: number;
  ppm: number;
  intensity: number;
  integral: number;
  area: number;
  multiplicity: MultiplicityCode;
  multiplicityName: string;
  lineCount: number;
  kind: PeakKind;
  confidence: number;
  assignment: string;
  reason: string;
  manual?: boolean;
  selectedRange?: [number, number];
};
type Candidate = {
  name: string;
  formula: string;
  formulaKey: string;
  baseScore: number;
  score: number;
  structureType: "ethyl-benzoate" | "methyl-phenylacetate" | "ethylbenzene" | "anisole" | "diethyl-ether" | "ethyl-acetate" | "formula-scaffold" | "formula-unsaturated-chain" | "formula-ring-hetero" | "formula-ring-chain-substituted" | "formula-hetero-link" | "formula-terminal-hetero" | "formula-chain-substituted" | "formula-carbonyl-chain";
  exactMass: number;
  rationale: string;
  theoreticalMz?: number;
  massError?: number;
  functionalGroups?: string[];
  dbePlan?: DbePlan;
};
type DbePlan = {
  total: number;
  aromaticRings: number;
  carbonyls: number;
  nitriles: number;
  alkenes: number;
  alkynes: number;
  otherRings: number;
  consumed: number;
  remaining: number;
  label: string;
};
type FormulaSuggestion = {
  formula: string;
  formulaKey: string;
  c: number;
  h: number;
  n: number;
  o: number;
  exactMass: number;
  theoreticalMz: number;
  massError: number;
  dbe: number;
  score: number;
  rationale: string;
};
type IonMode = "protonated" | "deprotonated" | "sodiated";
type ChartMode = "navigate" | "add-peak";
type ParsedSpectrum = {
  points: SpectrumPoint[];
  nucleus: string;
  frequency: number | null;
  source: string;
  fileName: string;
  solvent?: string;
  note?: string;
};
type ParserInfo = Record<string, unknown>;
type ParserEntry = {
  info?: ParserInfo;
  description?: ParserInfo;
  dependentVariables?: Array<{ components?: unknown[]; componentLabels?: string[] }>;
  dimensions?: Array<{
    quantityName?: string;
    increment?: { magnitude?: unknown };
    coordinatesOffset?: { magnitude?: unknown };
    originOffset?: { magnitude?: unknown };
  }>;
  source?: { name?: string; expno?: number; isFT?: boolean };
};
type ParserSpectrum = {
  data?: { x?: unknown; re?: unknown; y?: unknown; im?: unknown };
  dataType?: string;
  xUnit?: string;
  nucleus?: unknown;
  observeFrequency?: unknown;
};

const MAX_DISPLAY_POINTS = 12000;
const MAX_PARSER_POINTS = 200000;
const MAX_FILE_COUNT = 5000;
const MAX_SINGLE_FILE_BYTES = 256 * 1024 * 1024;
const MAX_TOTAL_INPUT_BYTES = 400 * 1024 * 1024;
const MAX_ARCHIVE_BYTES = 128 * 1024 * 1024;

function finiteExtent(values: number[], fallback: [number, number] = [-0.4, 10.2]): [number, number] {
  let low = Infinity;
  let high = -Infinity;
  for (const value of values) {
    if (!Number.isFinite(value)) continue;
    if (value < low) low = value;
    if (value > high) high = value;
  }
  return Number.isFinite(low) && Number.isFinite(high) ? [low, high] : fallback;
}

function finiteMaximum(values: number[], fallback = 0) {
  let maximum = -Infinity;
  for (const value of values) if (Number.isFinite(value) && value > maximum) maximum = value;
  return Number.isFinite(maximum) ? maximum : fallback;
}

const SOLVENTS = [
  { id: "cdcl3", name: "CDCl₃", longName: "Chloroform-d", ppm: 7.26 },
  { id: "dmso", name: "DMSO-d₆", longName: "Dimethyl sulfoxide-d₆", ppm: 2.5 },
  { id: "cd3od", name: "CD₃OD", longName: "Methanol-d₄", ppm: 3.31 },
  { id: "d2o", name: "D₂O", longName: "Deuterium oxide", ppm: 4.79 },
  { id: "acetone", name: "Acetone-d₆", longName: "Acetone-d₆", ppm: 2.05 },
  { id: "c6d6", name: "C₆D₆", longName: "Benzene-d₆", ppm: 7.16 },
];

const DEMO_SIGNALS = [
  { ppm: 8.05, amp: 0.72, integral: 2, split: [-0.016, 0.016] },
  { ppm: 7.56, amp: 0.38, integral: 1, split: [-0.022, 0, 0.022] },
  { ppm: 7.45, amp: 0.7, integral: 2, split: [-0.025, 0, 0.025] },
  { ppm: 7.26, amp: 1, integral: 0, split: [0] },
  { ppm: 4.38, amp: 0.54, integral: 2, split: [-0.034, -0.011, 0.011, 0.034] },
  { ppm: 2.17, amp: 0.032, integral: 0, split: [0] },
  { ppm: 1.39, amp: 0.69, integral: 3, split: [-0.023, 0, 0.023] },
];

const DEMO_CARBON_SIGNALS = [
  { ppm: 166.6, amp: 0.68 }, // ester C=O
  { ppm: 130.6, amp: 0.52 }, // ipso aromatic carbon
  { ppm: 129.6, amp: 0.62 }, // para aromatic carbon
  { ppm: 128.3, amp: 0.88 }, // ortho/meta aromatic carbons
  { ppm: 60.8, amp: 0.76 },  // O–CH2
  { ppm: 14.4, amp: 0.72 },  // CH3
];

function lorentz(x: number, center: number, width: number, height: number) {
  const d = (x - center) / width;
  return height / (1 + d * d);
}

function buildDemoSpectrum(): SpectrumPoint[] {
  const points: SpectrumPoint[] = [];
  const count = 2200;
  for (let i = 0; i < count; i++) {
    const x = 10.2 - (10.6 * i) / (count - 1);
    let y = 0.0025 * Math.sin(i * 0.83) + 0.0017 * Math.sin(i * 0.17);
    for (const signal of DEMO_SIGNALS) {
      const splitAmp = signal.amp / Math.max(1, signal.split.length * 0.72);
      for (let j = 0; j < signal.split.length; j++) {
        const envelope = 1 - Math.abs(j - (signal.split.length - 1) / 2) * 0.12;
        y += lorentz(x, signal.ppm + signal.split[j], 0.0065, splitAmp * envelope);
      }
    }
    points.push({ x, y: Math.max(-0.006, y) });
  }
  return points;
}

function buildDemoCarbonSpectrum(): SpectrumPoint[] {
  const points: SpectrumPoint[] = [];
  const count = 7000;
  const solventLines = [76.84, 77.16, 77.48];
  for (let index = 0; index < count; index++) {
    const x = 220 - (230 * index) / (count - 1);
    let y = 0.0015 * Math.sin(index * 0.31) + 0.001 * Math.sin(index * 0.07);
    for (const signal of DEMO_CARBON_SIGNALS) y += lorentz(x, signal.ppm, 0.038, signal.amp);
    for (const center of solventLines) y += lorentz(x, center, 0.035, 0.92);
    points.push({ x, y: Math.max(-0.004, y) });
  }
  return points;
}

function movingAverage(values: number[], radius = 2) {
  return values.map((_, index) => {
    let total = 0;
    let count = 0;
    for (let i = Math.max(0, index - radius); i <= Math.min(values.length - 1, index + radius); i++) {
      total += values[i];
      count++;
    }
    return total / count;
  });
}

function assignmentFor(ppm: number) {
  if (ppm >= 7.8) return "방향족 H (전자 끌개 인접)";
  if (ppm >= 6.4) return "방향족 / 비닐 H";
  if (ppm >= 4.05) return "O–CH 또는 벤질성 H";
  if (ppm >= 3.1) return "O–CH₃ / 헤테로원자 인접 H";
  if (ppm >= 1.8) return "카보닐 α-CH / 알릴 H";
  if (ppm >= 0.7) return "알킬 H";
  return "차폐된 알킬 / 기준물질 영역";
}

function knownImpurity(ppm: number, solventId: string) {
  const waterPpm: Record<string, number> = {
    cdcl3: 1.56,
    dmso: 3.33,
    cd3od: 4.87,
    d2o: 4.79,
    acetone: 2.84,
    c6d6: 0.40,
  };
  const expected = waterPpm[solventId] ?? 1.56;
  return Math.abs(ppm - expected) < 0.075 ? `잔류 수분 후보 · 문헌값 약 ${expected.toFixed(2)} ppm` : null;
}

const MULTIPLICITY_NAMES: Record<MultiplicityCode, string> = {
  s: "singlet",
  d: "doublet",
  t: "triplet",
  q: "quartet",
  quint: "quintet",
  sext: "sextet",
  dd: "doublet of doublets",
  ddd: "doublet of doublets of doublets",
  dddd: "doublet of doublets of doublets of doublets",
  dt: "doublet of triplets",
  td: "triplet of doublets",
  dq: "doublet of quartets",
  tt: "triplet of triplets",
  tdd: "triplet of doublets of doublets",
  dtd: "doublet of triplets of doublets",
  ddt: "doublet of doublets of triplets",
  m: "multiplet",
};

const MULTIPLICITY_LINE_COUNTS: Record<Exclude<MultiplicityCode, "m">, number> = {
  s: 1,
  d: 2,
  t: 3,
  q: 4,
  quint: 5,
  sext: 6,
  dd: 4,
  ddd: 8,
  dddd: 16,
  dt: 6,
  td: 6,
  dq: 8,
  tt: 9,
  tdd: 12,
  dtd: 12,
  ddt: 12,
};

const BASIC_MULTIPLICITY_OPTIONS: MultiplicityCode[] = ["s", "d", "t", "q", "quint", "sext", "m"];
const COMPOUND_MULTIPLICITY_OPTIONS: MultiplicityCode[] = ["dd", "ddd", "dddd", "dt", "td", "dq", "tt", "tdd", "dtd", "ddt"];

function inferMultiplicity(group: { ppm: number; intensity: number }[]) {
  const strongest = Math.max(...group.map((item) => item.intensity), 0);
  const lines = group
    .filter((item) => item.intensity >= strongest * 0.14)
    .sort((a, b) => b.ppm - a.ppm);
  const count = lines.length;
  if (count <= 1) return { code: "s" as const, name: MULTIPLICITY_NAMES.s, lineCount: 1 };
  if (count === 8) return { code: "ddd" as const, name: MULTIPLICITY_NAMES.ddd, lineCount: 8 };
  if (count > 4) return { code: "m" as const, name: MULTIPLICITY_NAMES.m, lineCount: count };

  const gaps = lines.slice(1).map((line, index) => Math.abs(line.ppm - lines[index].ppm));
  const averageGap = gaps.reduce((sum, gap) => sum + gap, 0) / Math.max(1, gaps.length);
  const regular = gaps.every((gap) => Math.abs(gap - averageGap) <= Math.max(0.004, averageGap * 0.28));
  if (!regular && count === 4) return { code: "dd" as const, name: MULTIPLICITY_NAMES.dd, lineCount: 4 };
  if (!regular) return { code: "m" as const, name: MULTIPLICITY_NAMES.m, lineCount: count };
  const code = ({ 2: "d", 3: "t", 4: "q" } as const)[count as 2 | 3 | 4];
  return { code, name: MULTIPLICITY_NAMES[code], lineCount: count };
}

function analyzeSpectrum(points: SpectrumPoint[], solventId: string, carbon = false): Peak[] {
  if (points.length < 8) return [];
  const ys = movingAverage(points.map((point) => point.y), 1);
  const sorted = [...ys].sort((a, b) => a - b);
  const baseline = sorted[Math.floor(sorted.length * 0.48)] ?? 0;
  const deviations = ys.map((value) => Math.abs(value - baseline)).sort((a, b) => a - b);
  const noise = (deviations[Math.floor(deviations.length * 0.5)] ?? 0) * 1.4826;
  const maxY = finiteMaximum(ys, baseline);
  const threshold = baseline + Math.max((maxY - baseline) * 0.007, noise * 6, 1e-9);
  const raw: { ppm: number; intensity: number; index: number }[] = [];

  for (let i = 2; i < ys.length - 2; i++) {
    if (ys[i] > threshold && ys[i] >= ys[i - 1] && ys[i] > ys[i + 1]) {
      raw.push({ ppm: points[i].x, intensity: ys[i] - baseline, index: i });
    }
  }

  const groups: typeof raw[] = [];
  for (const candidate of raw.sort((a, b) => b.ppm - a.ppm)) {
    const group = groups.find((item) => Math.abs(item[0].ppm - candidate.ppm) < 0.105);
    if (group) group.push(candidate);
    else groups.push([candidate]);
  }

  const solvent = carbon ? { ppm: NaN, name: "" } : SOLVENTS.find((item) => item.id === solventId) ?? SOLVENTS[0];
  const groupedSignals = groups
    .map((group) => {
      const strongestLine = group.reduce((strongest, item) => item.intensity > strongest.intensity ? item : strongest, group[0]);
      const intensity = strongestLine.intensity;
      const weight = group.reduce((sum, item) => sum + item.intensity, 0);
      const weightedPpm = group.reduce((sum, item) => sum + item.ppm * item.intensity, 0) / Math.max(weight, 1e-9);
      const isSolventGroup = group.some((item) => Math.abs(item.ppm - solvent.ppm) < 0.095);
      return {
        ppm: isSolventGroup ? strongestLine.ppm : weightedPpm,
        intensity,
        group,
        multiplicity: isSolventGroup
          ? { code: "s" as const, name: MULTIPLICITY_NAMES.s, lineCount: 1 }
          : inferMultiplicity(group),
      };
    })
    .filter((peak) => peak.intensity > Math.max((maxY - baseline) * 0.008, noise * 6))
    .sort((a, b) => b.ppm - a.ppm)
    .slice(0, carbon ? 200 : 28);

  const summarizedRaw = groupedSignals.map((signal, index) => {
      const leftDistance = index > 0 ? Math.abs(groupedSignals[index - 1].ppm - signal.ppm) : Infinity;
      const rightDistance = index < groupedSignals.length - 1 ? Math.abs(signal.ppm - groupedSignals[index + 1].ppm) : Infinity;
      const closestNeighbor = Math.min(leftDistance, rightDistance);
      const groupSpan = Math.max(...signal.group.map((item) => item.ppm)) - Math.min(...signal.group.map((item) => item.ppm));
      const window = Math.max(0.025, Math.min(0.105, groupSpan / 2 + 0.024, closestNeighbor * 0.46));
      let area = 0;
      for (let i = 1; i < points.length; i++) {
        if (Math.abs(points[i].x - signal.ppm) <= window || Math.abs(points[i - 1].x - signal.ppm) <= window) {
          area += Math.max(0, (points[i].y + points[i - 1].y) / 2 - baseline) * Math.abs(points[i].x - points[i - 1].x);
        }
      }
      return { ...signal, area };
    });
  const dominantSolvent = summarizedRaw
    .filter((signal) => Math.abs(signal.ppm - solvent.ppm) < 0.095)
    .sort((a, b) => b.intensity - a.intensity)[0];
  const summarized = summarizedRaw.filter((signal) => (
    carbon || Math.abs(signal.ppm - solvent.ppm) >= 0.095 || signal === dominantSolvent
  ));

  const nonSolventAreas = summarized
    .filter((peak) => Math.abs(peak.ppm - solvent.ppm) > 0.09 && peak.area > 0)
    .map((peak) => peak.area)
    .sort((a, b) => a - b);
  const areaUnit = nonSolventAreas[Math.max(0, Math.floor(nonSolventAreas.length * 0.18))] || 1;
  return summarized
    .map((peak, id) => {
      const isSolvent = Math.abs(peak.ppm - solvent.ppm) < 0.085;
      const known = carbon ? null : knownImpurity(peak.ppm, solventId);
      const relative = peak.intensity / Math.max(maxY - baseline, 1e-9);
      const impurity = known;
      const kind: PeakKind = isSolvent ? "solvent" : impurity ? "impurity" : "main";
      const confidence = isSolvent
        ? Math.round(96 - Math.min(12, Math.abs(peak.ppm - solvent.ppm) * 100))
        : impurity
          ? Math.round(91 - Math.min(18, Math.abs(peak.ppm - Number(impurity.match(/[0-9.]+/)?.[0] ?? peak.ppm)) * 100))
          : Math.round(82 + Math.min(14, relative * 15));
      return {
        id,
        ppm: peak.ppm,
        intensity: peak.intensity,
        integral: kind === "main" ? Math.max(1, Math.min(12, Math.round(peak.area / areaUnit))) : 0,
        area: peak.area,
        multiplicity: peak.multiplicity.code,
        multiplicityName: peak.multiplicity.name,
        lineCount: peak.multiplicity.lineCount,
        kind,
        confidence,
        assignment: isSolvent ? `${solvent.name} 잔류 피크 · singlet` : impurity ?? assignmentFor(peak.ppm),
        reason: isSolvent
          ? `문헌 기준 ${solvent.ppm.toFixed(2)} ppm 주변에서 가장 큰 선만 단일 singlet로 적용`
          : impurity
            ? "선택 용매에서 알려진 잔류 수분 영역과 일치"
            : `S/N·피크 폭·용매 거리 기반 메인 신호 점수 ${confidence}%`,
      };
    })
    .sort((a, b) => b.ppm - a.ppm);
}

function peakFromSelectedRange(points: SpectrumPoint[], firstPpm: number, secondPpm: number, id: number): Peak | null {
  const low = Math.min(firstPpm, secondPpm);
  const high = Math.max(firstPpm, secondPpm);
  const selected = points.filter((point) => point.x >= low && point.x <= high);
  if (selected.length < 4) return null;

  const smoothed = movingAverage(selected.map((point) => point.y), 1);
  const sorted = [...smoothed].sort((a, b) => a - b);
  const baseline = sorted[Math.floor(sorted.length * 0.28)] ?? 0;
  const maximum = finiteMaximum(smoothed, baseline);
  const height = Math.max(maximum - baseline, 1e-12);
  const lines: { ppm: number; intensity: number }[] = [];
  for (let index = 1; index < smoothed.length - 1; index++) {
    if (smoothed[index] >= baseline + height * 0.1 && smoothed[index] >= smoothed[index - 1] && smoothed[index] > smoothed[index + 1]) {
      lines.push({ ppm: selected[index].x, intensity: smoothed[index] - baseline });
    }
  }
  const strongest = lines.length
    ? lines.reduce((best, line) => line.intensity > best.intensity ? line : best, lines[0])
    : selected.reduce((best, point) => point.y > best.y ? point : best, selected[0]);
  let area = 0;
  for (let index = 1; index < selected.length; index++) {
    const averageHeight = Math.max(0, ((selected[index - 1].y - baseline) + (selected[index].y - baseline)) / 2);
    area += averageHeight * Math.abs(selected[index].x - selected[index - 1].x);
  }
  const ppm = "ppm" in strongest ? strongest.ppm : strongest.x;
  const multiplicity = inferMultiplicity(lines.length ? lines : [{ ppm, intensity: height }]);
  return {
    id,
    ppm,
    intensity: height,
    integral: 1,
    area: Math.max(area, height * Math.max(high - low, 1e-6)),
    multiplicity: multiplicity.code,
    multiplicityName: multiplicity.name,
    lineCount: multiplicity.lineCount,
    kind: "main",
    confidence: 100,
    assignment: assignmentFor(ppm),
    reason: `사용자가 ${high.toFixed(3)}–${low.toFixed(3)} ppm 구간을 직접 지정`,
    manual: true,
    selectedRange: [low, high],
  };
}

function structureCandidates(peaks: Peak[], isDemo: boolean): Candidate[] {
  const main = peaks.filter((peak) => peak.kind === "main");
  if (!main.length) return [];
  const hasAromatic = main.filter((peak) => peak.ppm > 6.7).length >= 2;
  const hasOch2 = main.some((peak) => peak.ppm > 4.05 && peak.ppm < 4.65);
  const hasEthyl = hasOch2 && main.some((peak) => peak.ppm > 1.05 && peak.ppm < 1.65);

  if (hasAromatic && hasEthyl) {
    return [
      {
        name: "Ethyl benzoate",
        formula: "C₉H₁₀O₂",
        formulaKey: "C9H10O2",
        baseScore: isDemo ? 91 : 82,
        score: isDemo ? 91 : 82,
        structureType: "ethyl-benzoate",
        exactMass: 150.0681,
        rationale: "방향족 5H 패턴과 4.3/1.4 ppm의 ethoxy 패턴이 함께 관찰됩니다.",
      },
      {
        name: "Methyl phenylacetate",
        formula: "C₉H₁₀O₂",
        formulaKey: "C9H10O2",
        baseScore: isDemo ? 59 : 55,
        score: isDemo ? 59 : 55,
        structureType: "methyl-phenylacetate",
        exactMass: 150.0681,
        rationale: "분자식과 질량은 같지만, 4.3/1.4 ppm의 q/t 조합 때문에 ethyl benzoate보다 가능성이 낮습니다.",
      },
    ];
  }

  if (hasAromatic) {
    return [
      {
        name: "Ethylbenzene",
        formula: "C₈H₁₀",
        formulaKey: "C8H10",
        baseScore: 67,
        score: 67,
        structureType: "ethylbenzene",
        exactMass: 106.0783,
        rationale: "6.7–8.5 ppm의 방향족 신호와 알킬 영역의 ethyl 패턴을 근거로 제안합니다.",
      },
      {
        name: "Anisole",
        formula: "C₇H₈O",
        formulaKey: "C7H8O",
        baseScore: 52,
        score: 52,
        structureType: "anisole",
        exactMass: 108.0575,
        rationale: "방향족 신호와 3–5 ppm의 O–CH₃ 가능성을 근거로 제안합니다.",
      },
    ];
  }

  return [
    {
      name: "Diethyl ether",
      formula: "C₄H₁₀O",
      formulaKey: "C4H10O",
      baseScore: 58,
      score: 58,
      structureType: "diethyl-ether",
      exactMass: 74.0732,
      rationale: "0.7–4.5 ppm의 ethyl형 주 신호 분포를 기반으로 제안합니다.",
    },
    {
      name: "Ethyl acetate",
      formula: "C₄H₈O₂",
      formulaKey: "C4H8O2",
      baseScore: 39,
      score: 39,
      structureType: "ethyl-acetate",
      exactMass: 88.0524,
      rationale: "1D ¹H 특징 신호가 부족해 낮은 확신도로 제시되는 비교 후보입니다.",
    },
  ];
}

function dbePlanFor(formulaKeyValue: string, type: Candidate["structureType"]): DbePlan {
  const composition = parseFormulaKey(formulaKeyValue);
  const total = Math.max(0, Math.round((2 * composition.c + 2 + composition.n - composition.h) / 2));
  let available = total;
  const aromaticType = ["ethyl-benzoate", "methyl-phenylacetate", "ethylbenzene", "anisole", "formula-scaffold", "formula-ring-hetero", "formula-ring-chain-substituted"].includes(type);
  const carbonylType = ["ethyl-benzoate", "methyl-phenylacetate", "ethyl-acetate", "formula-carbonyl-chain"].includes(type);
  const aromaticRings = aromaticType && composition.c >= 6 && available >= 4 ? 1 : 0;
  available -= aromaticRings * 4;
  const carbonyls = carbonylType && composition.o > 0 && available >= 1 ? 1 : 0;
  available -= carbonyls;
  const nitrileType = ["formula-hetero-link", "formula-terminal-hetero"].includes(type);
  const nitriles = nitrileType && composition.n > 0 && available >= 2 ? 1 : 0;
  available -= nitriles * 2;

  // 낮은 DBE는 관측 가능한 C=C로, 큰 잔여 DBE는 과도한 누적 이중결합 대신 C≡C로 배분합니다.
  const alkenes = available <= 3 ? available : available % 2;
  const alkynes = Math.floor((available - alkenes) / 2);
  available -= alkenes + alkynes * 2;
  const otherRings = 0;
  const consumed = aromaticRings * 4 + carbonyls + nitriles * 2 + alkenes + alkynes * 2 + otherRings;
  const remaining = Math.max(0, total - consumed);
  const parts = [
    aromaticRings ? `방향족 고리 ${aromaticRings}개(4)` : "",
    otherRings ? `지방족 고리 ${otherRings}개` : "",
    carbonyls ? `C=O ${carbonyls}개` : "",
    nitriles ? `C≡N ${nitriles}개(2)` : "",
    alkenes ? `C=C ${alkenes}개` : "",
    alkynes ? `C≡C ${alkynes}개(${alkynes * 2})` : "",
  ].filter(Boolean);
  return {
    total,
    aromaticRings,
    carbonyls,
    nitriles,
    alkenes,
    alkynes,
    otherRings,
    consumed,
    remaining,
    label: parts.length ? `DBE ${total} = ${parts.join(" + ")}` : "DBE 0 = 포화 골격",
  };
}

function applyDbePlan(candidate: Candidate, peaks: Peak[]): Candidate {
  const dbePlan = candidate.dbePlan ?? dbePlanFor(candidate.formulaKey, candidate.structureType);
  const main = peaks.filter((peak) => peak.kind === "main");
  const aromaticEvidence = main.filter((peak) => peak.ppm >= 6.4).length >= 2;
  const olefinEvidence = main.some((peak) => peak.ppm >= 4.5 && peak.ppm < 6.4);
  const carbonylAlphaEvidence = main.some((peak) => peak.ppm >= 1.8 && peak.ppm < 3.2);
  let evidenceAdjustment = dbePlan.remaining ? -45 : 8;
  if (dbePlan.aromaticRings) evidenceAdjustment += aromaticEvidence ? 13 : -22;
  if (dbePlan.alkenes) evidenceAdjustment += olefinEvidence ? 8 : -Math.min(14, dbePlan.alkenes * 4);
  if (dbePlan.carbonyls) evidenceAdjustment += carbonylAlphaEvidence ? 7 : -3;
  if (dbePlan.alkynes + dbePlan.nitriles > 1) evidenceAdjustment -= 5;
  return {
    ...candidate,
    dbePlan,
    baseScore: Math.max(8, Math.min(99, candidate.baseScore + evidenceAdjustment)),
    rationale: `${candidate.rationale} ${dbePlan.label}로 불포화도 예산을 모두 배치했습니다.`,
  };
}

function formulaStructureCandidates(formula: FormulaSuggestion, peaks: Peak[], carbon: Peak[] = []): Candidate[] {
  const main = peaks.filter((peak) => peak.kind === "main");
  const aromaticPeaks = main.filter((peak) => peak.ppm >= 6.4);
  const aromaticSignals = aromaticPeaks.length;
  const aromaticIntegral = aromaticPeaks.reduce((sum, peak) => sum + Math.max(0, peak.integral), 0);
  const heteroPeaks = main.filter((peak) => peak.ppm >= 3.1 && peak.ppm < 6.4);
  const heteroSignals = heteroPeaks.length;
  const alkylSignals = main.filter((peak) => peak.ppm >= 0.7 && peak.ppm < 3.1).length;
  const carbonylAlphaSignals = main.filter((peak) => peak.ppm >= 1.8 && peak.ppm < 3.2).length;
  const ethylLike = main.some((peak) => peak.multiplicity === "q" && peak.ppm >= 2.8 && peak.ppm < 4.7)
    && main.some((peak) => peak.multiplicity === "t" && peak.ppm >= 0.7 && peak.ppm < 1.8);
  const methoxyLike = main.some((peak) => peak.multiplicity === "s" && peak.ppm >= 3.1 && peak.ppm < 4.2);
  const aromaticPossible = formula.dbe >= 4 && formula.c >= 6;
  const aromaticSupported = aromaticPossible && ((aromaticSignals >= 2 && aromaticIntegral >= 2) || carbon.filter((peak) => peak.kind === "main" && peak.ppm >= 110 && peak.ppm < 160).length >= 2);
  const heteroLabel = [formula.o ? `O${formula.o > 1 ? subscript(formula.o) : ""}` : "", formula.n ? `N${formula.n > 1 ? subscript(formula.n) : ""}` : ""].filter(Boolean).join("/");

  if (formula.n + formula.o === 0) {
    return [applyDbePlan({
      name: aromaticSupported ? "방향족 탄화수소 골격" : "탄화수소 사슬 골격",
      formula: formula.formula,
      formulaKey: formula.formulaKey,
      baseScore: Math.max(32, formula.score),
      score: Math.max(32, formula.score),
      structureType: aromaticSupported ? "formula-scaffold" : "formula-unsaturated-chain",
      exactMass: formula.exactMass,
      functionalGroups: [aromaticSupported ? "방향족 고리" : "탄화수소 사슬", alkylSignals ? "알킬 사슬" : "불포화 골격"],
      rationale: `원자가와 DBE ${formula.dbe.toFixed(0)}를 먼저 만족시키고, 실제 방향족 신호가 ${aromaticSignals}개인 점을 반영한 연결성 가설입니다.`,
    }, peaks)];
  }

  const carbonylPossible = formula.o >= 1 && formula.dbe >= 1;
  const chainEvidence = Math.min(24, alkylSignals * 4) + Math.min(20, heteroSignals * 7) + (ethylLike ? 8 : 0) + (methoxyLike ? 6 : 0);
  const candidates: Candidate[] = [
    {
      name: `${heteroLabel} 사슬 내부 다중 치환형`,
      formula: formula.formula,
      formulaKey: formula.formulaKey,
      baseScore: 54 + chainEvidence,
      score: 0,
      structureType: "formula-chain-substituted",
      exactMass: formula.exactMass,
      functionalGroups: ["분지 가능한 탄소 사슬", formula.o ? "사슬 내부 OH/OR" : "", formula.n ? "사슬 내부 NH/N-alkyl" : "", ethylLike ? "q/t ethyl 단위" : "", methoxyLike ? "OCH₃ 가능" : ""].filter(Boolean),
      rationale: `원자가·DBE ${formula.dbe.toFixed(0)}를 만족시키면서 ${heteroSignals}개의 O/N 인접 신호와 ${alkylSignals}개의 알킬 신호를 설명하도록 작용기를 사슬 내부와 분지점에 우선 배치했습니다.`,
    },
    {
      name: `${formula.o ? "ether/alcohol" : "amine"} 사슬 연결형`,
      formula: formula.formula,
      formulaKey: formula.formulaKey,
      baseScore: 45 + Math.min(26, heteroSignals * 8) + (ethylLike || methoxyLike ? 7 : 0),
      score: 0,
      structureType: "formula-hetero-link",
      exactMass: formula.exactMass,
      functionalGroups: ["알킬/불포화 사슬", formula.o ? "C–O–C 또는 C–OH" : "", formula.n ? "C–N–C 또는 C–NH" : ""].filter(Boolean),
      rationale: `3.1–6.4 ppm 신호 ${heteroSignals}개와 확정 다중도를 설명하도록 O/N을 사슬 결합 사이에 둔 합성 가능한 연결성입니다.`,
    },
    {
      name: `말단 ${heteroLabel} + 내부 치환 사슬형`,
      formula: formula.formula,
      formulaKey: formula.formulaKey,
      baseScore: 38 + Math.min(22, alkylSignals * 4) + Math.min(15, heteroSignals * 5),
      score: 0,
      structureType: "formula-terminal-hetero",
      exactMass: formula.exactMass,
      functionalGroups: ["탄소 사슬", formula.o ? "말단 OH + 내부 OR" : "", formula.n ? "말단 NH₂ + 내부 NHR" : ""].filter(Boolean),
      rationale: `말단 하나에만 작용기를 몰지 않고, 남은 O/N은 관측 ppm에 맞춰 사슬 중간에 분산한 비교 이성질체입니다.`,
    },
  ];

  if (carbonylPossible) {
    candidates.splice(1, 0, {
      name: formula.o >= 2 ? "사슬 carbonyl–O 치환형" : "사슬 ketone/aldehyde형",
      formula: formula.formula,
      formulaKey: formula.formulaKey,
      baseScore: 40 + Math.min(28, carbonylAlphaSignals * 9) + Math.min(12, heteroSignals * 4),
      score: 0,
      structureType: "formula-carbonyl-chain",
      exactMass: formula.exactMass,
      functionalGroups: ["사슬 내부 C=O", formula.o >= 2 ? "ester/acid/ether O 가능" : "ketone/aldehyde 가능", formula.n ? "amide/amine 치환 가능" : ""].filter(Boolean),
      rationale: `1.8–3.2 ppm의 α-수소 후보 ${carbonylAlphaSignals}개를 근거로 사슬 내부 C=O를 검토하고, 남은 O/N은 ether·alcohol·amine/amide 형태로 분산했습니다.`,
    });
  }

  if (aromaticSupported) {
    candidates.push({
      name: "방향족 고리 + 작용기화 사슬형",
      formula: formula.formula,
      formulaKey: formula.formulaKey,
      baseScore: 42 + Math.min(24, aromaticSignals * 7) + Math.min(16, heteroSignals * 5),
      score: 0,
      structureType: "formula-ring-chain-substituted",
      exactMass: formula.exactMass,
      functionalGroups: ["방향족 고리", "작용기화 측쇄", formula.o ? "측쇄 OH/OR/C=O" : "", formula.n ? "측쇄 NH/N-alkyl" : ""].filter(Boolean),
      rationale: `방향족 영역 ${aromaticSignals}개·적분 약 ${aromaticIntegral.toFixed(0)}H가 실제로 관찰되어 고리를 허용하되, O/N 작용기는 고리보다 측쇄에 우선 배치했습니다.`,
    });
  }

  return candidates.map((candidate) => applyDbePlan(candidate, peaks));
}

function comparePeakToCandidate(candidate: Candidate, peak: Peak) {
  const composition = parseFormulaKey(candidate.formulaKey);
  const dbePlan = candidate.dbePlan ?? dbePlanFor(candidate.formulaKey, candidate.structureType);
  const groups = (candidate.functionalGroups ?? []).join(" ").toLowerCase();
  if (peak.ppm >= 6.4) {
    const aromaticFit = dbePlan.aromaticRings > 0 && composition.c >= 6;
    const unsaturatedFit = dbePlan.alkenes + dbePlan.alkynes > 0;
    return { match: aromaticFit || unsaturatedFit, label: aromaticFit ? "DBE의 방향족 고리와 부합" : unsaturatedFit ? "DBE의 C=C/C≡C와 비교" : "불포화 결합 부족 · 검토" };
  }
  if (peak.ppm >= 3.1) {
    return { match: composition.o + composition.n > 0, label: composition.o + composition.n > 0 ? "O/N 인접 치환과 부합" : "헤테로원자 부재 · 검토" };
  }
  if (peak.ppm >= 1.8) {
    const carbonylFit = dbePlan.carbonyls > 0 || groups.includes("c=o") || groups.includes("carbonyl") || candidate.structureType.includes("carbonyl");
    return { match: carbonylFit || composition.c >= 3, label: carbonylFit ? "C=O α-사슬과 부합" : "벤질/알릴 사슬과 비교" };
  }
  return { match: composition.c >= 2, label: candidate.structureType.includes("chain") || groups.includes("사슬") ? "사슬/분지 알킬과 부합" : "알킬 말단과 비교" };
}

const ION_MODES: Record<IonMode, { label: string; short: string; delta: number }> = {
  protonated: { label: "Protonation (H⁺)", short: "[M+H]⁺", delta: 1.007276 },
  deprotonated: { label: "Ionization (H⁻)", short: "[M−H]⁻", delta: -1.007276 },
  sodiated: { label: "Sodiation (Na⁺)", short: "[M+Na]⁺", delta: 22.989218 },
};

const ATOMIC_MASS = { C: 12, H: 1.007825032, N: 14.003074004, O: 15.99491462 };
const SUBSCRIPT = ["₀", "₁", "₂", "₃", "₄", "₅", "₆", "₇", "₈", "₉"];

function subscript(value: number) {
  return String(value).split("").map((digit) => SUBSCRIPT[Number(digit)]).join("");
}

function formulaLabel(c: number, h: number, n: number, o: number) {
  return [
    c ? `C${c === 1 ? "" : subscript(c)}` : "",
    h ? `H${h === 1 ? "" : subscript(h)}` : "",
    n ? `N${n === 1 ? "" : subscript(n)}` : "",
    o ? `O${o === 1 ? "" : subscript(o)}` : "",
  ].join("");
}

function formulaKey(c: number, h: number, n: number, o: number) {
  return `${c ? `C${c}` : ""}${h ? `H${h}` : ""}${n ? `N${n}` : ""}${o ? `O${o}` : ""}`;
}

function parseFormulaKey(value: string) {
  const count = (element: "C" | "H" | "N" | "O") => Number(value.match(new RegExp(`${element}(\\d*)`))?.[1] || (value.includes(element) ? 1 : 0));
  return { c: count("C"), h: count("H"), n: count("N"), o: count("O") };
}

function FormulaText({ formulaKey: value }: { formulaKey: string }) {
  const tokens = Array.from(value.matchAll(/([A-Z][a-z]?)(\d*)/g));
  return (
    <span className="formula-text" aria-label={value}>
      {tokens.map((token, index) => (
        <span className="formula-token" key={`${token[1]}-${index}`}>
          {token[1]}{Number(token[2]) > 1 ? <sub>{token[2]}</sub> : null}
        </span>
      ))}
    </span>
  );
}

function suggestFormulas(mzText: string, ionMode: IonMode, peaks: Peak[], carbon: Peak[] = []): FormulaSuggestion[] {
  const observed = Number(mzText);
  if (!Number.isFinite(observed) || observed <= 1) return [];
  const neutralTarget = observed - ION_MODES[ionMode].delta;
  if (neutralTarget < 12 || neutralTarget > 900) return [];
  const decimals = mzText.includes(".") ? mzText.split(".")[1]?.length ?? 0 : 0;
  const tolerance = decimals === 0 ? 0.55 : decimals === 1 ? 0.12 : decimals === 2 ? 0.025 : 0.008;
  const hasAromatic = peaks.filter((peak) => peak.kind === "main" && peak.ppm >= 6.4).length >= 2
    || carbon.filter((peak) => peak.kind === "main" && peak.ppm >= 110 && peak.ppm < 160).length >= 2;
  const heteroShiftCount = peaks.filter((peak) => peak.kind === "main" && peak.ppm >= 3.1 && peak.ppm < 6.4).length;
  const hasHeteroShift = heteroShiftCount > 0;
  const maxMainIntensity = Math.max(...peaks.filter((peak) => peak.kind === "main").map((peak) => peak.intensity), 0);
  const estimatedHydrogen = peaks
    .filter((peak) => peak.kind === "main" && peak.intensity >= maxMainIntensity * 0.08)
    .reduce((sum, peak) => sum + Math.max(0, peak.integral), 0);
  const suggestions: FormulaSuggestion[] = [];
  const maxCarbon = Math.min(55, Math.floor(neutralTarget / ATOMIC_MASS.C));

  for (let c = 1; c <= maxCarbon; c++) {
    for (let n = 0; n <= Math.min(6, Math.floor((neutralTarget - c * ATOMIC_MASS.C) / ATOMIC_MASS.N)); n++) {
      for (let o = 0; o <= Math.min(12, Math.floor((neutralTarget - c * ATOMIC_MASS.C - n * ATOMIC_MASS.N) / ATOMIC_MASS.O)); o++) {
        const remainder = neutralTarget - c * ATOMIC_MASS.C - n * ATOMIC_MASS.N - o * ATOMIC_MASS.O;
        const h = Math.round(remainder / ATOMIC_MASS.H);
        if (h < 0 || h > 2 * c + n + 2) continue;
        const dbe = (2 * c + 2 + n - h) / 2;
        if (dbe < 0 || Math.abs(dbe - Math.round(dbe)) > 1e-6) continue;
        const exactMass = c * ATOMIC_MASS.C + h * ATOMIC_MASS.H + n * ATOMIC_MASS.N + o * ATOMIC_MASS.O;
        const theoreticalMz = exactMass + ION_MODES[ionMode].delta;
        const massError = Math.abs(observed - theoreticalMz);
        if (massError > tolerance) continue;

        let chemistryFit = 61;
        const carbonMain = carbon.filter((peak) => peak.kind === "main");
        if (carbonMain.length) {
          chemistryFit -= Math.max(0, carbonMain.length - c) * 12;
          if (carbonMain.some((peak) => peak.ppm >= 160)) chemistryFit += o > 0 && dbe > 0 ? 12 : -30;
          if (carbonMain.some((peak) => peak.ppm >= 100 && peak.ppm < 160)) chemistryFit += dbe > 0 ? 5 : -20;
        }
        if (hasAromatic) chemistryFit += dbe >= 4 ? 17 : -28;
        else if (dbe <= 3) chemistryFit += 8;
        if (hasHeteroShift) chemistryFit += o + n > 0 ? 11 : -18;
        if (o > 5 || n > 4) chemistryFit -= 8;
        if (n > 2) chemistryFit -= (n - 2) * 10;
        const supportedHeteroCount = Math.max(hasHeteroShift ? 2 : 0, heteroShiftCount + 2);
        if (o + n > supportedHeteroCount) chemistryFit -= (o + n - supportedHeteroCount) * 9;
        if (o + n > Math.max(3, c * 0.65)) chemistryFit -= Math.round((o + n - c * 0.65) * 8);
        if (h === 0) chemistryFit -= 20;
        if (estimatedHydrogen >= 2) chemistryFit += Math.max(-42, 25 - Math.abs(h - estimatedHydrogen) * 6);
        if (hasAromatic && h / c < 0.45) chemistryFit -= 18;
        chemistryFit = Math.max(0, Math.min(100, chemistryFit));
        const massFit = Math.max(0, 100 * (1 - massError / tolerance));
        const massWeight = decimals === 0 ? 0.24 : 0.62;
        const score = Math.max(12, Math.min(98, Math.round(massFit * massWeight + chemistryFit * (1 - massWeight))));
        const reasons = [
          decimals === 0 ? `정수 m/z ±${tolerance.toFixed(2)} Da 범위` : `입력 정밀도 기준 ±${tolerance.toFixed(3)} Da 범위`,
          hasAromatic && dbe >= 4 ? "방향족 NMR 패턴과 DBE가 부합" : !hasAromatic && dbe <= 3 ? "비방향족 신호와 낮은 DBE가 부합" : "DBE와 1D 패턴 검토 필요",
          hasHeteroShift && o + n > 0 ? "헤테로원자 인접 피크를 설명 가능" : "질량·원자가 규칙 우선",
          estimatedHydrogen >= 2 ? `관측 적분 약 ${estimatedHydrogen.toFixed(0)}H와 비교` : "적분 수소 수 검토 필요",
        ];
        suggestions.push({
          formula: formulaLabel(c, h, n, o),
          formulaKey: formulaKey(c, h, n, o),
          c, h, n, o, exactMass, theoreticalMz, massError, dbe, score,
          rationale: reasons.join(" · "),
        });
      }
    }
  }

  return suggestions
    .sort((a, b) => b.score - a.score || Math.abs(a.o + a.n - Math.min(4, heteroShiftCount + 1)) - Math.abs(b.o + b.n - Math.min(4, heteroShiftCount + 1)) || a.massError - b.massError)
    .slice(0, 4);
}

function MolecularStructure({ type, formulaKey: selectedFormulaKey, dbePlan: suppliedDbePlan }: { type: Candidate["structureType"]; formulaKey: string; dbePlan?: DbePlan }) {
  const composition = parseFormulaKey(selectedFormulaKey);
  const dbe = Math.max(0, (2 * composition.c + 2 + composition.n - composition.h) / 2);
  const dbePlan = suppliedDbePlan ?? dbePlanFor(selectedFormulaKey, type);
  const isFormulaScaffold = type.startsWith("formula-");
  const chainFirstTypes: Candidate["structureType"][] = ["formula-unsaturated-chain", "formula-hetero-link", "formula-terminal-hetero", "formula-chain-substituted", "formula-carbonyl-chain"];
  const isAromaticScaffold = isFormulaScaffold && !chainFirstTypes.includes(type) && dbe >= 4 && composition.c >= 6;
  const aromatic = [
    [48, 66], [71, 27], [116, 27], [139, 66], [116, 105], [71, 105], [48, 66],
  ].map((point) => point.join(",")).join(" ");

  function chainCoordinates(count: number, ringAttached: boolean) {
    const points: [number, number][] = [];
    const perRow = ringAttached ? 7 : 10;
    for (let index = 0; index < count; index++) {
      const row = Math.floor(index / perRow);
      const position = index % perRow;
      const movesRight = row % 2 === 0;
      const firstX = ringAttached ? 157 : 34;
      const stepX = ringAttached ? 25 : 29;
      const lastX = firstX + (perRow - 1) * stepX;
      const x = movesRight ? firstX + position * stepX : lastX - position * stepX;
      const y = (ringAttached ? 61 : 62) + row * 28 + (position % 2) * 14;
      points.push([x, y]);
    }
    return points;
  }

  const sideCarbonCount = Math.max(0, composition.c - 6);
  const chain = chainCoordinates(isAromaticScaffold ? sideCarbonCount : composition.c, isAromaticScaffold);
  const lastCarbon = chain[chain.length - 1] ?? (isAromaticScaffold ? [139, 66] : [52, 66]);
  const chainPath = (isAromaticScaffold ? [[139, 66] as [number, number], ...chain] : chain).map((point) => point.join(",")).join(" ");
  const heteroSummary = [
    composition.o ? `O${composition.o > 1 ? composition.o : ""}` : "",
    composition.n ? `N${composition.n > 1 ? composition.n : ""}` : "",
  ].filter(Boolean).join(" · ");
  const primaryHetero = composition.o ? "O" : "N";
  const terminalHetero = composition.o ? "OH" : "NH2";
  function remainingHeteroLabels(skipPrimary = false, skipNitrogen = 0) {
    const oxygenCount = Math.max(0, composition.o - (skipPrimary && primaryHetero === "O" ? 1 : 0));
    const nitrogenCount = Math.max(0, composition.n - (skipPrimary && primaryHetero === "N" ? 1 : 0) - skipNitrogen);
    const labels = [
      ...Array.from({ length: Math.min(oxygenCount, 3) }, () => "OH"),
      ...Array.from({ length: Math.min(nitrogenCount, 3) }, () => "NH2"),
    ];
    const positions = isAromaticScaffold
      ? [[73, 18], [19, 54], [18, 112], [105, 126], [216, 30], [282, 28]]
      : [[38, 45], [96, 45], [154, 45], [212, 45], [270, 45], [326, 45]];
    const bondAnchors = isAromaticScaffold
      ? [[[71, 27], [71, 21]], [[48, 66], [29, 58]], [[71, 105], [42, 116]], [[116, 105], [112, 120]]]
      : [[[34, 62], [38, 49]], [[92, 62], [96, 49]], [[150, 62], [154, 49]], [[208, 62], [212, 49]]];
    return <>
      {labels.map((label, index) => {
        const anchor = bondAnchors[index];
        return <g key={`${label}-${index}`}>
          {anchor && <line className="hetero-bond" x1={anchor[0][0]} y1={anchor[0][1]} x2={anchor[1][0]} y2={anchor[1][1]} />}
          <text className="hetero-label" x={positions[index]?.[0] ?? 300} y={positions[index]?.[1] ?? 30}>{label}</text>
        </g>;
      })}
      {oxygenCount > 3 && <text className="hetero-count" x="284" y="126">+ O×{oxygenCount - 3}</text>}
      {nitrogenCount > 3 && <text className="hetero-count" x="284" y="144">+ N×{nitrogenCount - 3}</text>}
    </>;
  }

  function chainSubstituentLabels(skipOxygen = 0, skipNitrogen = 0) {
    const oxygenCount = Math.max(0, composition.o - skipOxygen);
    const nitrogenCount = Math.max(0, composition.n - skipNitrogen);
    const labels = [
      ...Array.from({ length: Math.min(oxygenCount, 3) }, (_, index) => index % 2 ? "OR" : "OH"),
      ...Array.from({ length: Math.min(nitrogenCount, 3) }, (_, index) => index % 2 ? "NHR" : "NH2"),
    ];
    const anchors = chain.length ? chain : [[139, 66] as [number, number]];
    return <>
      {labels.map((label, index) => {
        const anchorIndex = Math.min(anchors.length - 1, Math.max(0, Math.round(((index + 1) * (anchors.length - 1)) / (labels.length + 1))));
        const anchor = anchors[anchorIndex];
        const direction = index % 2 === 0 ? -1 : 1;
        const y2 = Math.max(19, Math.min(146, anchor[1] + direction * 23));
        return <g key={`chain-${label}-${index}`}>
          <line className="hetero-bond chain-branch" x1={anchor[0]} y1={anchor[1]} x2={anchor[0]} y2={y2} />
          <text className="hetero-label" x={anchor[0] + 4} y={y2 + (direction < 0 ? -2 : 12)}>{label}</text>
        </g>;
      })}
      {oxygenCount > 3 && <text className="hetero-count" x="284" y="144">+ O×{oxygenCount - 3}</text>}
      {nitrogenCount > 3 && <text className="hetero-count" x="284" y="160">+ N×{nitrogenCount - 3}</text>}
    </>;
  }

  function carbonylOnChain() {
    const anchor = chain[Math.max(0, Math.floor(chain.length * 0.55))] ?? [139, 66];
    const y2 = Math.max(20, anchor[1] - 28);
    return <g>
      <line className="hetero-bond" x1={anchor[0] - 3} y1={anchor[1]} x2={anchor[0] - 3} y2={y2} />
      <line className="hetero-bond" x1={anchor[0] + 3} y1={anchor[1]} x2={anchor[0] + 3} y2={y2} />
      <text className="hetero-label" x={anchor[0] - 5} y={y2 - 3}>O</text>
    </g>;
  }

  function unsaturationOnChain() {
    if (chain.length < 2) return null;
    const marks = [
      ...Array.from({ length: dbePlan.alkenes }, () => "double" as const),
      ...Array.from({ length: dbePlan.alkynes }, () => "triple" as const),
    ];
    return <>
      {marks.map((kind, index) => {
        const usable = Math.max(1, chain.length - 1);
        const segmentIndex = Math.min(chain.length - 2, Math.floor(((index + 1) * usable) / (marks.length + 1)));
        const [x1, y1] = chain[segmentIndex];
        const [x2, y2] = chain[segmentIndex + 1];
        const length = Math.max(1, Math.hypot(x2 - x1, y2 - y1));
        const ox = (-(y2 - y1) / length) * 3.2;
        const oy = ((x2 - x1) / length) * 3.2;
        return <g className="dbe-bond" key={`${kind}-${index}`}>
          <line x1={x1 + ox} y1={y1 + oy} x2={x2 + ox} y2={y2 + oy} />
          {kind === "triple" && <line x1={x1 - ox} y1={y1 - oy} x2={x2 - ox} y2={y2 - oy} />}
        </g>;
      })}
    </>;
  }

  function nitrileOnChain() {
    if (!dbePlan.nitriles) return null;
    const x1 = lastCarbon[0];
    const y1 = lastCarbon[1];
    const x2 = Math.min(336, x1 + 25);
    const y2 = Math.max(22, y1 - 14);
    const length = Math.max(1, Math.hypot(x2 - x1, y2 - y1));
    const ox = (-(y2 - y1) / length) * 2.8;
    const oy = ((x2 - x1) / length) * 2.8;
    return <g className="dbe-bond nitrile-bond">
      <line x1={x1} y1={y1} x2={x2} y2={y2} />
      <line x1={x1 + ox} y1={y1 + oy} x2={x2 + ox} y2={y2 + oy} />
      <line x1={x1 - ox} y1={y1 - oy} x2={x2 - ox} y2={y2 - oy} />
      <text className="hetero-label" x={Math.min(344, x2 + 3)} y={y2 - 2}>N</text>
    </g>;
  }

  const genericCaption = <>
    <text className="formula-caption" x="180" y="176" textAnchor="middle">{selectedFormulaKey} · 연결성 가설</text>
    <text className="carbon-balance" x="180" y="195" textAnchor="middle">{isAromaticScaffold ? `고리 6C + 사슬 ${sideCarbonCount}C` : `사슬 ${composition.c}C`} = 총 {composition.c}C{heteroSummary ? ` · ${heteroSummary}` : ""} · DBE {dbe.toFixed(0)}/{dbePlan.consumed}</text>
  </>;
  const side = {
    "ethyl-benzoate": <><line x1="139" y1="66" x2="176" y2="66" /><line x1="176" y1="64" x2="176" y2="37" /><line x1="182" y1="64" x2="182" y2="37" /><text x="171" y="28">O</text><line x1="176" y1="66" x2="203" y2="83" /><text x="207" y="89">O</text><line x1="222" y1="82" x2="251" y2="65" /><line x1="251" y1="65" x2="282" y2="82" /></>,
    "methyl-phenylacetate": <><line x1="139" y1="66" x2="170" y2="66" /><line x1="170" y1="66" x2="195" y2="83" /><line x1="195" y1="83" x2="216" y2="56" /><line x1="200" y1="86" x2="221" y2="59" /><text x="223" y="53">O</text><line x1="195" y1="83" x2="222" y2="100" /><text x="226" y="106">O</text><line x1="241" y1="99" x2="274" y2="80" /></>,
    ethylbenzene: <><line x1="139" y1="66" x2="177" y2="66" /><line x1="177" y1="66" x2="213" y2="45" /></>,
    anisole: <><line x1="139" y1="66" x2="171" y2="66" /><text x="176" y="71">O</text><line x1="191" y1="66" x2="225" y2="46" /></>,
    "diethyl-ether": <><line x1="58" y1="76" x2="96" y2="54" /><line x1="96" y1="54" x2="130" y2="74" /><text x="136" y="80">O</text><line x1="153" y1="74" x2="188" y2="54" /><line x1="188" y1="54" x2="226" y2="76" /></>,
    "ethyl-acetate": <><line x1="45" y1="76" x2="82" y2="55" /><line x1="82" y1="55" x2="119" y2="76" /><line x1="119" y1="76" x2="143" y2="47" /><line x1="123" y1="78" x2="147" y2="49" /><text x="150" y="45">O</text><line x1="119" y1="76" x2="149" y2="94" /><text x="153" y="100">O</text><line x1="168" y1="93" x2="201" y2="74" /><line x1="201" y1="74" x2="235" y2="94" /></>,
    "formula-scaffold": <>{chainPath && <polyline className="scaffold-chain" points={chainPath} />}{unsaturationOnChain()}{nitrileOnChain()}{genericCaption}</>,
    "formula-unsaturated-chain": <>{chainPath && <polyline className="scaffold-chain" points={chainPath} />}{unsaturationOnChain()}{nitrileOnChain()}{genericCaption}</>,
    "formula-ring-hetero": <>
      {chainPath && <polyline className="scaffold-chain" points={chainPath} />}
      {remainingHeteroLabels(false)}
      {unsaturationOnChain()}
      {nitrileOnChain()}
      {genericCaption}
    </>,
    "formula-ring-chain-substituted": <>
      {chainPath && <polyline className="scaffold-chain" points={chainPath} />}
      {chainSubstituentLabels()}
      {unsaturationOnChain()}
      {nitrileOnChain()}
      {genericCaption}
    </>,
    "formula-hetero-link": <>
      {isAromaticScaffold ? <>
        <line x1="139" y1="66" x2="147" y2="66" />
        <text className="hetero-label" x="151" y="71">{primaryHetero}</text>
        {chain.length > 0 && <line x1="165" y1="66" x2={chain[0][0]} y2={chain[0][1]} />}
        {chain.length > 1 && <polyline className="scaffold-chain" points={chain.map((point) => point.join(",")).join(" ")} />}
      </> : <>
        {chainPath && <polyline className="scaffold-chain" points={chainPath} />}
        <text className="hetero-label" x="176" y="52">{primaryHetero}</text>
      </>}
      {remainingHeteroLabels(true, dbePlan.nitriles)}
      {unsaturationOnChain()}
      {nitrileOnChain()}
      {genericCaption}
    </>,
    "formula-terminal-hetero": <>
      {chainPath && <polyline className="scaffold-chain" points={chainPath} />}
      <line x1={lastCarbon[0]} y1={lastCarbon[1]} x2={Math.min(340, lastCarbon[0] + 22)} y2={Math.max(18, lastCarbon[1] - 13)} />
      <text className="hetero-label" x={Math.min(340, lastCarbon[0] + 24)} y={Math.max(18, lastCarbon[1] - 14)}>{terminalHetero}</text>
      {remainingHeteroLabels(true, dbePlan.nitriles)}
      {unsaturationOnChain()}
      {nitrileOnChain()}
      {genericCaption}
    </>,
    "formula-chain-substituted": <>
      {chainPath && <polyline className="scaffold-chain" points={chainPath} />}
      {chainSubstituentLabels(0, dbePlan.nitriles)}
      {unsaturationOnChain()}
      {nitrileOnChain()}
      {genericCaption}
    </>,
    "formula-carbonyl-chain": <>
      {chainPath && <polyline className="scaffold-chain" points={chainPath} />}
      {carbonylOnChain()}
      {chainSubstituentLabels(1, dbePlan.nitriles)}
      {unsaturationOnChain()}
      {nitrileOnChain()}
      {genericCaption}
    </>,
  }[type];
  const hasRing = isFormulaScaffold ? isAromaticScaffold : !["diethyl-ether", "ethyl-acetate"].includes(type);

  return (
    <svg className={`molecule-structure ${isFormulaScaffold ? "formula-scaffold" : ""}`} viewBox={isFormulaScaffold ? "0 0 360 210" : "0 0 320 132"} role="img" aria-label={`예상 2D 분자 구조, 탄소 ${composition.c}개, 산소 ${composition.o}개, 질소 ${composition.n}개`}>
      <g className="molecule-bonds">
        {hasRing && <>
          <polyline points={aromatic} />
          <circle className="aromatic-circle" cx="93.5" cy="66" r="27" />
        </>}
        {side}
      </g>
    </svg>
  );
}

function safeArray(value: unknown, maxLength = MAX_PARSER_POINTS, sampleEvenly = true): number[] {
  if (!value) return [];
  const source = Array.isArray(value) || ArrayBuffer.isView(value)
    ? value as unknown as ArrayLike<unknown>
    : null;
  if (!source) return [];
  const length = source.length;
  if (!Number.isFinite(length) || length <= 0) return [];
  const outputLength = Math.min(length, maxLength);
  const step = sampleEvenly && length > outputLength ? length / outputLength : 1;
  const output = new Array<number>(outputLength);
  for (let index = 0; index < outputLength; index++) {
    const sourceIndex = sampleEvenly ? Math.min(length - 1, Math.floor(index * step)) : index;
    output[index] = Number(source[sourceIndex]);
  }
  return output;
}

function firstFinite(...values: unknown[]) {
  for (const value of values.flatMap((item) => Array.isArray(item) ? item : [item])) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

function brukerValue(text: string, key: string) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`^##\\$${escaped}=\\s*(.+)$`, "m"));
  return match?.[1]?.trim().replace(/^<|>$/g, "") ?? "";
}

function brukerNumber(text: string, key: string) {
  const value = Number(brukerValue(text, key).split(/\s+/)[0]);
  return Number.isFinite(value) ? value : null;
}

async function parseFlatBruker(files: File[]): Promise<ParsedSpectrum | null> {
  const named = new Map(files.map((file) => [file.name.toLowerCase(), file]));
  const processed = named.get("1r");
  const procs = named.get("procs");
  const acqus = named.get("acqus") ?? named.get("acqu");
  const fid = named.get("fid");

  if (processed && procs) {
    const [parameters, acquisition, buffer] = await Promise.all([
      procs.text(),
      acqus?.text() ?? Promise.resolve(""),
      processed.arrayBuffer(),
    ]);
    const frequency = firstFinite(brukerNumber(parameters, "SF"), brukerNumber(acquisition, "SFO1"), brukerNumber(acquisition, "BF1"));
    const offset = brukerNumber(parameters, "OFFSET");
    const spectralWidthHz = brukerNumber(parameters, "SW_p");
    const declaredSize = brukerNumber(parameters, "SI");
    if (!frequency || offset === null || spectralWidthHz === null) {
      throw new Error("Bruker 1r을 표시하려면 같은 처리 폴더의 procs 파일이 필요합니다.");
    }
    const availablePointCount = Math.min(declaredSize ?? Infinity, Math.floor(buffer.byteLength / 4));
    if (availablePointCount < 16) throw new Error("Bruker 1r 데이터 포인트가 부족합니다.");
    const littleEndian = (brukerNumber(parameters, "BYTORDP") ?? 0) === 0;
    const scaleValue = 2 ** (brukerNumber(parameters, "NC_proc") ?? 0);
    const scale = Number.isFinite(scaleValue) ? scaleValue : 1;
    const widthPpm = spectralWidthHz / frequency;
    const view = new DataView(buffer);
    const pointCount = Math.min(availablePointCount, MAX_DISPLAY_POINTS);
    const step = availablePointCount / pointCount;
    const points = Array.from({ length: pointCount }, (_, index) => ({
      x: offset - (widthPpm * Math.floor(index * step)) / Math.max(1, availablePointCount - 1),
      y: view.getInt32(Math.min(availablePointCount - 1, Math.floor(index * step)) * 4, littleEndian) * scale,
    }));
    return {
      points,
      nucleus: brukerValue(acquisition, "NUC1") || "",
      frequency,
      source: "BRUKER · 1r + procs",
      fileName: "Bruker processed spectrum",
      solvent: brukerValue(acquisition, "SOLVENT"),
      note: `${pointCount.toLocaleString()}개 포인트와 ${frequency.toFixed(2)} MHz를 처리 파일에서 자동으로 읽었습니다.`,
    };
  }

  if (fid && acqus) {
    const [parameters, buffer] = await Promise.all([acqus.text(), fid.arrayBuffer()]);
    const frequency = firstFinite(brukerNumber(parameters, "SFO1"), brukerNumber(parameters, "BF1"));
    const spectralWidthHz = brukerNumber(parameters, "SW_h");
    const declaredValues = brukerNumber(parameters, "TD");
    if (!frequency || !spectralWidthHz) throw new Error("Bruker fid의 주파수 또는 spectral width 메타데이터를 찾지 못했습니다.");
    const availableValueCount = Math.min(declaredValues ?? Infinity, Math.floor(buffer.byteLength / 4));
    const availableComplexCount = Math.floor(availableValueCount / 2);
    if (availableComplexCount < 16) throw new Error("Bruker fid 데이터 포인트가 부족합니다.");
    const complexCount = Math.min(availableComplexCount, 16384);
    const littleEndian = (brukerNumber(parameters, "BYTORDA") ?? 0) === 0;
    const view = new DataView(buffer);
    const re = new Array(complexCount);
    const im = new Array(complexCount);
    for (let index = 0; index < complexCount; index++) {
      re[index] = view.getInt32(index * 8, littleEndian);
      im[index] = view.getInt32(index * 8 + 4, littleEndian);
    }
    return {
      points: magnitudeFT(re, im, {
        baseFrequency: frequency,
        frequencyOffset: brukerNumber(parameters, "O1") ?? 0,
        spectralWidth: spectralWidthHz / frequency,
      }),
      nucleus: brukerValue(parameters, "NUC1") || "",
      frequency,
      source: "BRUKER · fid + acqus",
      fileName: "Bruker raw FID preview",
      solvent: brukerValue(parameters, "SOLVENT"),
      note: `원시 FID와 ${frequency.toFixed(2)} MHz를 자동으로 읽어 magnitude FT 미리보기를 만들었습니다. 정량 전 위상/베이스라인 검토가 필요합니다.`,
    };
  }

  if (processed || procs || fid || acqus) {
    throw new Error("압축을 푼 Bruker 파일은 1r + procs 또는 fid + acqus를 함께 선택해 주세요. 전체 폴더 선택도 가능합니다.");
  }
  return null;
}

function filePath(file: File) {
  return (file.webkitRelativePath || file.name).replace(/\\/g, "/").replace(/^\/+/, "");
}

function pathName(path: string) {
  return path.split("/").filter(Boolean).pop()?.toLowerCase() ?? "";
}

function pathDirectory(path: string) {
  const parts = path.split("/").filter(Boolean);
  return parts.slice(0, -1).join("/");
}

function pathSegments(path: string) {
  return path.split("/").filter(Boolean);
}

function nearestAncestorFile(files: File[], targetName: string, childPath: string) {
  const childDirectory = pathDirectory(childPath);
  return files
    .filter((file) => pathName(filePath(file)) === targetName)
    .map((file) => ({ file, directory: pathDirectory(filePath(file)) }))
    .filter(({ directory }) => !directory || childDirectory === directory || childDirectory.startsWith(`${directory}/`))
    .sort((a, b) => pathSegments(b.directory).length - pathSegments(a.directory).length)[0]?.file;
}

function brukerDatasetLabel(path: string, raw = false) {
  const parts = pathSegments(path);
  const root = (parts[0] ?? "Bruker").replace(/([A-Za-z]+)(\d+)$/i, "$1 $2");
  const experiment = parts.find((part, index) => index > 0 && /^\d+$/.test(part));
  const pdataIndex = parts.findIndex((part) => part.toLowerCase() === "pdata");
  const processing = pdataIndex >= 0 ? parts[pdataIndex + 1] : null;
  return [root, experiment ? `Exp ${experiment}` : "", !raw && processing ? `Proc ${processing}` : raw ? "FID" : ""]
    .filter(Boolean)
    .join(" · ");
}

async function parseBrukerFolderDatasets(files: File[]) {
  const datasets: ParsedSpectrum[] = [];
  const processedFiles = files.filter((file) => pathName(filePath(file)) === "1r");
  for (const processed of processedFiles) {
    const processedPath = filePath(processed);
    const directory = pathDirectory(processedPath);
    const procs = files.find((file) => pathName(filePath(file)) === "procs" && pathDirectory(filePath(file)) === directory);
    if (!procs) continue;
    const acqus = nearestAncestorFile(files, "acqus", processedPath) ?? nearestAncestorFile(files, "acqu", processedPath);
    const parsed = await parseFlatBruker([processed, procs, ...(acqus ? [acqus] : [])]);
    if (parsed) datasets.push({ ...parsed, fileName: brukerDatasetLabel(processedPath) });
  }

  const fidFiles = files.filter((file) => pathName(filePath(file)) === "fid");
  for (const fid of fidFiles) {
    const fidPath = filePath(fid);
    if (processedFiles.some((file) => filePath(file).startsWith(`${pathDirectory(fidPath)}/pdata/`))) continue;
    const acqus = nearestAncestorFile(files, "acqus", fidPath) ?? nearestAncestorFile(files, "acqu", fidPath);
    if (!acqus) continue;
    const parsed = await parseFlatBruker([fid, acqus]);
    if (parsed) datasets.push({ ...parsed, fileName: brukerDatasetLabel(fidPath, true) });
  }
  return datasets;
}

async function parseStandaloneBrukerBinary(file: File): Promise<ParsedSpectrum | null> {
  const name = pathName(filePath(file));
  if (name !== "1r" && name !== "fid") return null;
  const buffer = await file.arrayBuffer();
  if (buffer.byteLength < 64) throw new Error(`${file.name}에는 표시할 Bruker 데이터 포인트가 부족합니다.`);
  const view = new DataView(buffer);
  if (name === "1r") {
    const availablePointCount = Math.floor(buffer.byteLength / 4);
    const pointCount = Math.min(availablePointCount, MAX_DISPLAY_POINTS);
    const step = availablePointCount / pointCount;
    const points = Array.from({ length: pointCount }, (_, index) => ({
      x: 12 - (13 * index) / Math.max(1, pointCount - 1),
      y: view.getInt32(Math.min(availablePointCount - 1, Math.floor(index * step)) * 4, true),
    }));
    return {
      points,
      nucleus: "",
      frequency: null,
      source: "BRUKER · 1r 단독 미리보기",
      fileName: file.name,
      note: "1r 세기 데이터는 정상적으로 읽었습니다. procs가 없어 ppm 축은 임시 상대축입니다. 정확한 ppm·적분·구조 비교에는 같은 처리 폴더의 procs를 함께 놓아 주세요.",
    };
  }

  const availableComplexCount = Math.floor(buffer.byteLength / 8);
  const complexCount = Math.min(availableComplexCount, 16384);
  if (complexCount < 8) throw new Error(`${file.name}에는 표시할 FID 데이터 포인트가 부족합니다.`);
  const re = new Array<number>(complexCount);
  const im = new Array<number>(complexCount);
  for (let index = 0; index < complexCount; index++) {
    re[index] = view.getInt32(index * 8, true);
    im[index] = view.getInt32(index * 8 + 4, true);
  }
  return {
    points: magnitudeFT(re, im, { baseFrequency: 400, spectralWidth: 13 }),
    nucleus: "",
    frequency: null,
    source: "BRUKER · fid 단독 미리보기",
    fileName: file.name,
    note: "fid 데이터는 정상적으로 읽어 magnitude FT 미리보기를 만들었습니다. acqus가 없어 ppm 축은 임시 상대축입니다. 정확한 분석에는 acqus를 함께 놓아 주세요.",
  };
}

function magnitudeFT(reInput: number[], imInput: number[], info: Record<string, unknown>) {
  const maxN = Math.min(8192, reInput.length);
  const n = 2 ** Math.floor(Math.log2(Math.max(2, maxN)));
  const re = reInput.slice(0, n);
  const im = imInput.length >= n ? imInput.slice(0, n) : new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const window = Math.exp((-2.2 * i) / n);
    re[i] *= window;
    im[i] *= window;
  }
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len;
    for (let start = 0; start < n; start += len) {
      for (let j = 0; j < len / 2; j++) {
        const cos = Math.cos(angle * j);
        const sin = Math.sin(angle * j);
        const even = start + j;
        const odd = even + len / 2;
        const tr = re[odd] * cos - im[odd] * sin;
        const ti = re[odd] * sin + im[odd] * cos;
        re[odd] = re[even] - tr;
        im[odd] = im[even] - ti;
        re[even] += tr;
        im[even] += ti;
      }
    }
  }
  const spectralWidth = Number(info.spectraWidth ?? info.spectralWidth ?? 12) || 12;
  const center = Number(info.frequencyOffset ?? 0) / (Number(info.baseFrequency ?? 400) || 400);
  return Array.from({ length: n }, (_, i) => {
    const shifted = (i + n / 2) % n;
    const x = center + spectralWidth / 2 - (spectralWidth * i) / (n - 1);
    return { x, y: Math.hypot(re[shifted], im[shifted]) };
  });
}

function firstValue(value: unknown) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeParsed(entry: ParserEntry, fileName: string, source: string): ParsedSpectrum {
  const info = entry.info ?? entry.description ?? {};
  const components = entry.dependentVariables?.[0]?.components;
  const spectra = Array.isArray(components) ? components as ParserSpectrum[] : [];
  const xySpectrum = spectra.find((item) => item?.data?.x && (item.data.re || item.data.y));

  if (xySpectrum) {
    const spectrumData = xySpectrum.data ?? {};
    const isFid = Boolean(info.fid || info.isFid || /fid/i.test(xySpectrum.dataType ?? "") || /sec/i.test(xySpectrum.xUnit ?? ""));
    const limit = isFid ? 16384 : MAX_PARSER_POINTS;
    const x = safeArray(spectrumData.x, limit, !isFid);
    const re = safeArray(spectrumData.re ?? spectrumData.y, limit, !isFid);
    const im = safeArray(spectrumData.im, limit, !isFid);
    const points = isFid ? magnitudeFT(re, im, info) : x.map((value, index) => ({ x: value, y: re[index] ?? 0 }));
    return {
      points,
      nucleus: String(firstValue(info.nucleus) ?? firstValue(xySpectrum.nucleus) ?? "").replace(/[<>]/g, ""),
      frequency: firstFinite(info.baseFrequency, info.originFrequency, xySpectrum.observeFrequency),
      source,
      fileName,
      solvent: String(info.solvent ?? ""),
      note: isFid ? "원시 FID를 magnitude FT로 변환한 빠른 미리보기입니다. 정량 전 위상/베이스라인 검토가 필요합니다." : undefined,
    };
  }

  const rawComponent = Array.isArray(components) ? components[0] : undefined;
  const dim = entry.dimensions?.[0] ?? {};
  const rawIsFid = Boolean(info.isFid || dim.quantityName === "time");
  const data = safeArray(rawComponent, rawIsFid ? 32768 : MAX_PARSER_POINTS, !rawIsFid);
  if (data.length > 8) {
    const isComplex = entry.dependentVariables?.[0]?.componentLabels?.includes("complex");
    const y = isComplex ? data.filter((_, index) => index % 2 === 0) : data;
    if (rawIsFid) {
      const im = isComplex ? data.filter((_, index) => index % 2 === 1) : [];
      return {
        points: magnitudeFT(y, im, info),
        nucleus: String(firstValue(info.nucleus) ?? ""),
        frequency: firstFinite(info.baseFrequency, info.originFrequency),
        source,
        fileName,
        solvent: String(info.solvent ?? ""),
        note: "JEOL FID를 magnitude FT로 변환한 빠른 미리보기입니다. 정량 전 위상/베이스라인 검토가 필요합니다.",
      };
    }
    const increment = Number(dim.increment?.magnitude ?? 1);
    const offset = Number(dim.coordinatesOffset?.magnitude ?? 0);
    const origin = Number(dim.originOffset?.magnitude ?? (Number(firstValue(info.baseFrequency) ?? 400) * 1e6));
    const points = y.map((value, index) => ({ x: ((offset + index * increment) / origin) * 1e6, y: value }));
    return {
      points: points.sort((a, b) => b.x - a.x),
      nucleus: String(firstValue(info.nucleus) ?? ""),
      frequency: firstFinite(info.baseFrequency, info.originFrequency),
      source,
      fileName,
      solvent: String(info.solvent ?? ""),
    };
  }

  throw new Error("1D 스펙트럼 배열을 찾지 못했습니다. 처리된 1r/JDF 또는 JCAMP-DX 파일을 확인해 주세요.");
}

function solventFromMetadata(name?: string) {
  const normalized = (name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (normalized.includes("dmso")) return "dmso";
  if (normalized.includes("cd3od") || normalized.includes("meod") || normalized.includes("methanol")) return "cd3od";
  if (normalized.includes("d2o") || normalized.includes("deuteriumoxide")) return "d2o";
  if (normalized.includes("acetone")) return "acetone";
  if (normalized.includes("c6d6") || normalized.includes("benzene")) return "c6d6";
  if (normalized.includes("cdcl3") || normalized.includes("chloroform")) return "cdcl3";
  return null;
}

function sanitizeSpectrumPoints(points: SpectrumPoint[], max = MAX_DISPLAY_POINTS) {
  const finite = points.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (finite.length <= max) return finite;
  const sampled: SpectrumPoint[] = [];
  const step = finite.length / max;
  for (let index = 0; index < max; index++) sampled.push(finite[Math.min(finite.length - 1, Math.floor(index * step))]);
  return sampled;
}

async function parseTextXyFile(file: File): Promise<ParsedSpectrum | null> {
  if (!/\.(csv|tsv|txt|dat|asc)$/i.test(file.name)) return null;
  const text = await file.text();
  const points: SpectrumPoint[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith("//")) continue;
    const values = line.split(/[\s,;]+/).map((value) => Number(value)).filter(Number.isFinite);
    if (values.length >= 2) points.push({ x: values[0], y: values[1] });
    if (points.length >= MAX_PARSER_POINTS) break;
  }
  if (points.length < 16) return null;
  const cleaned = sanitizeSpectrumPoints(points).sort((a, b) => b.x - a.x);
  const [low, high] = finiteExtent(cleaned.map((point) => point.x), [0, 0]);
  if (Math.abs(high - low) < 1e-9) return null;
  return {
    points: cleaned,
    nucleus: /(?:13c|c13|carbon)/i.test(file.name) ? "13C" : /(?:1h|h1|proton)/i.test(file.name) ? "1H" : "",
    frequency: null,
    source: "OPEN · XY TEXT",
    fileName: file.name,
    note: `개별 ${file.name.split(".").pop()?.toUpperCase() ?? "TEXT"} 파일에서 ${cleaned.length.toLocaleString()}개의 x/y 포인트를 직접 읽었습니다.`,
  };
}

function validateInputFiles(files: File[]) {
  if (files.length > MAX_FILE_COUNT) throw new Error(`한 번에 최대 ${MAX_FILE_COUNT.toLocaleString()}개 파일까지 읽을 수 있습니다.`);
  // Bruker experiment folders can legitimately contain empty bookkeeping files
  // such as `prosol_History`. Directory drag-and-drop also occasionally exposes
  // an empty folder placeholder alongside the real files. Neither should make an
  // otherwise complete 1r/procs or fid/acqus dataset fail validation.
  const readableFiles = files.filter((file) => Boolean(file.name.trim()) && file.size > 0);
  if (!readableFiles.length) {
    throw new Error("선택한 항목에서 읽을 수 있는 NMR 파일을 찾지 못했습니다. ANRE1 폴더 전체를 다시 놓거나 ZIP 파일을 선택해 주세요.");
  }
  let totalBytes = 0;
  for (const file of readableFiles) {
    if (file.size > MAX_SINGLE_FILE_BYTES) throw new Error(`${file.name} 파일이 256 MB를 넘어 브라우저에서 안전하게 처리할 수 없습니다.`);
    if (/\.zip$/i.test(file.name) && file.size > MAX_ARCHIVE_BYTES) throw new Error("ZIP 파일은 128 MB 이하만 브라우저에서 안전하게 열 수 있습니다.");
    totalBytes += file.size;
  }
  if (totalBytes > MAX_TOTAL_INPUT_BYTES) throw new Error("선택한 데이터 전체가 400 MB를 넘어 브라우저에서 안전하게 처리할 수 없습니다.");
  return readableFiles;
}

type DroppedEntry = {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file?: (success: (file: File) => void, error?: (reason: DOMException) => void) => void;
  createReader?: () => {
    readEntries: (success: (entries: DroppedEntry[]) => void, error?: (reason: DOMException) => void) => void;
  };
};

type FileSystemHandleCompat = {
  kind: "file" | "directory";
  name: string;
  getFile?: () => Promise<File>;
  values?: () => AsyncIterable<FileSystemHandleCompat>;
};

async function readFileSystemHandle(handle: FileSystemHandleCompat, prefix = ""): Promise<File[]> {
  const path = `${prefix}${handle.name}`;
  if (handle.kind === "file" && handle.getFile) {
    const file = await handle.getFile();
    const copy = new File([file], file.name, { type: file.type, lastModified: file.lastModified });
    Object.defineProperty(copy, "webkitRelativePath", { value: path, configurable: true });
    return [copy];
  }
  if (handle.kind !== "directory" || !handle.values) return [];
  const nested: File[] = [];
  for await (const child of handle.values()) nested.push(...await readFileSystemHandle(child, `${path}/`));
  return nested;
}

async function readDroppedEntry(entry: DroppedEntry, prefix = ""): Promise<File[]> {
  const path = `${prefix}${entry.name}`;
  if (entry.isFile && entry.file) {
    const file = await new Promise<File>((resolve, reject) => entry.file?.(resolve, reject));
    const copy = new File([file], file.name, { type: file.type, lastModified: file.lastModified });
    Object.defineProperty(copy, "webkitRelativePath", { value: path, configurable: true });
    return [copy];
  }
  if (!entry.isDirectory || !entry.createReader) return [];

  const reader = entry.createReader();
  const children: DroppedEntry[] = [];
  while (true) {
    const batch = await new Promise<DroppedEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (!batch.length) break;
    children.push(...batch);
  }
  const nested = await Promise.all(children.map((child) => readDroppedEntry(child, `${path}/`)));
  return nested.flat();
}

async function filesFromDrop(transfer: DataTransfer) {
  const items = Array.from(transfer.items ?? []);
  const handles = (await Promise.all(items.map(async (item) => {
    const getter = (item as unknown as { getAsFileSystemHandle?: () => Promise<FileSystemHandleCompat | null> }).getAsFileSystemHandle;
    try {
      return getter ? await getter.call(item) : null;
    } catch {
      return null;
    }
  }))).filter((handle): handle is FileSystemHandleCompat => Boolean(handle));
  if (handles.length) {
    const handleFiles = (await Promise.all(handles.map((handle) => readFileSystemHandle(handle)))).flat();
    if (handleFiles.length) return handleFiles;
  }
  const entries = items
    .map((item): DroppedEntry | null => {
      const getter = (item as unknown as { webkitGetAsEntry?: () => DroppedEntry | null }).webkitGetAsEntry;
      return getter?.call(item) ?? null;
    })
    .filter((entry): entry is DroppedEntry => Boolean(entry));
  if (!entries.length) return Array.from(transfer.files);
  const files = (await Promise.all(entries.map((entry) => readDroppedEntry(entry)))).flat();
  return files.length ? files : Array.from(transfer.files);
}

function SpectrumChart({
  points,
  peaks,
  range,
  setRange,
  solventPpm,
  verticalScale,
  setVerticalScale,
  mode,
  onAddPeak,
}: {
  points: SpectrumPoint[];
  peaks: Peak[];
  range: [number, number];
  setRange: (range: [number, number]) => void;
  solventPpm: number;
  verticalScale: number;
  setVerticalScale: (scale: number) => void;
  mode: ChartMode;
  onAddPeak: (startPpm: number, endPpm: number) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{
    startPpm: number;
    currentPpm: number;
    startX: number;
    startY: number;
    startRange: [number, number];
    startScale: number;
  } | null>(null);
  const [cursor, setCursor] = useState<{ ppm: number; y: number } | null>(null);
  const [low, high] = range[0] < range[1] ? range : [range[1], range[0]];
  const [fullLow, fullHigh] = finiteExtent(points.map((point) => point.x), [low, high]);
  const fullSpan = Math.max(fullHigh - fullLow, 1e-9);
  const isZoomed = high - low < fullSpan * 0.995;
  const visible = useMemo(() => points.filter((point) => point.x >= low && point.x <= high), [points, low, high]);
  const [visibleMinY, visibleMaxY] = finiteExtent(visible.map((point) => point.y), [0, 1e-9]);
  const minY = Math.min(0, visibleMinY);
  const maxY = Math.max(1e-9, visibleMaxY);
  const width = 1000;
  const plotTop = 24;
  const baselineY = 275;
  const plotHeight = baselineY - plotTop;
  const displayedBaselineY = baselineY;
  const xAt = (ppm: number) => 54 + ((high - ppm) / Math.max(high - low, 1e-9)) * 916;
  const yAt = (value: number) => displayedBaselineY - ((value - minY) / Math.max(maxY - minY, 1e-9)) * plotHeight * verticalScale;
  const clippedYAt = (value: number) => Math.max(plotTop, Math.min(baselineY, yAt(value)));
  const path = visible
    .filter((_, index) => index % Math.max(1, Math.floor(visible.length / 2600)) === 0)
    .map((point, index) => `${index ? "L" : "M"}${xAt(point.x).toFixed(2)},${yAt(point.y).toFixed(2)}`)
    .join(" ");
  const areaPath = path ? `${path} L${xAt(visible.at(-1)?.x ?? low)},${displayedBaselineY} L${xAt(visible[0]?.x ?? high)},${displayedBaselineY} Z` : "";
  const ticks = Array.from({ length: 7 }, (_, index) => high - ((high - low) * index) / 6);

  function ppmFromEvent(event: ReactMouseEvent<HTMLDivElement>) {
    const rect = boxRef.current?.getBoundingClientRect();
    if (!rect) return high;
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    return high - ratio * (high - low);
  }

  function clampRange(nextLow: number, nextHigh: number): [number, number] {
    const span = Math.min(Math.max(nextHigh - nextLow, fullSpan / 5000), fullSpan);
    let center = (nextLow + nextHigh) / 2;
    center = Math.max(fullLow + span / 2, Math.min(fullHigh - span / 2, center));
    return [center - span / 2, center + span / 2];
  }

  function zoomAt(ppm: number, factor: number) {
    const span = high - low;
    const nextSpan = Math.min(fullSpan, Math.max(fullSpan / 5000, span * factor));
    const anchor = Math.max(0, Math.min(1, (ppm - low) / Math.max(span, 1e-9)));
    setRange(clampRange(ppm - anchor * nextSpan, ppm + (1 - anchor) * nextSpan));
  }

  return (
    <div
      className={`spectrum-shell mode-${mode} ${drag ? "dragging" : ""}`}
      ref={boxRef}
      onMouseDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        const ppm = ppmFromEvent(event);
        setDrag({ startPpm: ppm, currentPpm: ppm, startX: event.clientX, startY: event.clientY, startRange: [low, high], startScale: verticalScale });
      }}
      onMouseMove={(event) => {
        const ppm = ppmFromEvent(event);
        let nearest = visible[0];
        for (const point of visible) if (!nearest || Math.abs(point.x - ppm) < Math.abs(nearest.x - ppm)) nearest = point;
        if (nearest) setCursor({ ppm: nearest.x, y: nearest.y });
        if (!drag) return;
        const nextDrag = { ...drag, currentPpm: ppm };
        setDrag(nextDrag);
        if (mode !== "navigate") return;
        const dx = event.clientX - drag.startX;
        const dy = event.clientY - drag.startY;
        if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx) * 0.72) {
          setVerticalScale(Math.max(0.01, Math.min(12, drag.startScale * Math.exp(-dy / 88))));
        } else if (Math.abs(dx) > 8 && drag.startRange[1] - drag.startRange[0] < fullSpan * 0.995) {
          const delta = drag.startPpm - ppm;
          setRange(clampRange(drag.startRange[0] + delta, drag.startRange[1] + delta));
        }
      }}
      onMouseLeave={() => {
        setCursor(null);
        setDrag(null);
      }}
      onMouseUp={(event) => {
        const end = ppmFromEvent(event);
        if (!drag) return;
        const dx = event.clientX - drag.startX;
        const dy = event.clientY - drag.startY;
        const horizontalDrag = Math.abs(dx) > 8 && Math.abs(dx) >= Math.abs(dy) * 0.72;
        if (mode === "add-peak") {
          if (horizontalDrag) onAddPeak(drag.startPpm, end);
        } else if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx) * 0.72) {
          setVerticalScale(Math.max(0.01, Math.min(12, drag.startScale * Math.exp(-dy / 88))));
        } else if (horizontalDrag) {
          const startedZoomed = drag.startRange[1] - drag.startRange[0] < fullSpan * 0.995;
          if (!startedZoomed) setRange(clampRange(Math.min(end, drag.startPpm), Math.max(end, drag.startPpm)));
        } else {
          zoomAt(end, 0.62);
        }
        setDrag(null);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        zoomAt(ppmFromEvent(event), 1.72);
        setDrag(null);
      }}
      onWheel={(event) => {
        event.preventDefault();
        const factor = event.deltaY < 0 ? 1.16 : 0.86;
        setVerticalScale(Math.max(0.01, Math.min(12, verticalScale * factor)));
      }}
      role="img"
      aria-label={mode === "add-peak" ? "NMR spectrum. Drag across a signal to add a manual peak and integration range." : "NMR spectrum. Left click zooms in, right click zooms out, horizontal drag pans a zoomed view, and vertical drag changes height."}
    >
      <svg viewBox={`0 0 ${width} 330`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="spectrumFade" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#a7e34b" stopOpacity="0.24" />
            <stop offset="1" stopColor="#a7e34b" stopOpacity="0" />
          </linearGradient>
          <clipPath id="spectrumPlotClip"><rect x="54" y="22" width="916" height="258" /></clipPath>
        </defs>
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={xAt(tick)} y1="22" x2={xAt(tick)} y2="280" className="grid-line" />
            <text x={xAt(tick)} y="309" textAnchor="middle" className="axis-label">{tick.toFixed(1)}</text>
          </g>
        ))}
        <line x1="54" y1={baselineY} x2="970" y2={baselineY} className="axis-line" />
        <g clipPath="url(#spectrumPlotClip)">
          <line x1="54" y1={displayedBaselineY} x2="970" y2={displayedBaselineY} className="spectrum-baseline" />
          {solventPpm >= low && solventPpm <= high && (
            <line x1={xAt(solventPpm)} y1="24" x2={xAt(solventPpm)} y2={baselineY} className="solvent-guide" />
          )}
          {areaPath && <path d={areaPath} fill="url(#spectrumFade)" />}
          {path && <path d={path} className="spectrum-line" />}
          {drag && (mode === "add-peak" || !isZoomed) && Math.abs(drag.currentPpm - drag.startPpm) > (high - low) * 0.002 && (
            <rect
              x={Math.min(xAt(drag.startPpm), xAt(drag.currentPpm))}
              y="22"
              width={Math.abs(xAt(drag.startPpm) - xAt(drag.currentPpm))}
              height="258"
              className={mode === "add-peak" ? "manual-peak-selection" : "zoom-selection"}
            />
          )}
        </g>
        {peaks.filter((peak) => peak.ppm >= low && peak.ppm <= high).map((peak) => (
          <g key={peak.id} opacity={Math.max(0, Math.min(1, (verticalScale - 0.01) / 0.16))}>
            <line x1={xAt(peak.ppm)} y1={clippedYAt(peak.intensity)} x2={xAt(peak.ppm)} y2="55" className={`peak-pin ${peak.kind}`} />
            <circle cx={xAt(peak.ppm)} cy="50" r="5" className={`peak-dot ${peak.kind}`} />
            <text x={xAt(peak.ppm)} y="38" textAnchor="middle" className={`peak-label ${peak.kind}`}>{peak.multiplicity}</text>
          </g>
        ))}
        {cursor && (
          <line x1={xAt(cursor.ppm)} x2={xAt(cursor.ppm)} y1="22" y2={baselineY} className="cursor-line" />
        )}
        <text x="985" y="310" textAnchor="end" className="axis-unit">δ (ppm)</text>
      </svg>
      {cursor && <div className="cursor-readout">{cursor.ppm.toFixed(3)} ppm</div>}
      <div className="mouse-gesture-hint">{mode === "add-peak" ? "피크 범위를 가로로 드래그" : "좌클릭 확대 · 우클릭 축소 · 가로 드래그 이동 · 세로 드래그/휠 배율"}</div>
      <div className="chart-legend">
        <span><i className="legend-dot main" /> 메인</span>
        <span><i className="legend-dot solvent" /> 용매</span>
        <span><i className="legend-dot impurity" /> 잔류 수분</span>
      </div>
    </div>
  );
}

class PageErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="app-shell recovery-shell">
          <section className="recovery-card" role="alert">
            <span>!</span>
            <h1>데이터를 안전하게 표시하지 못했습니다</h1>
            <p>파일은 전송되지 않았습니다. 화면을 복구한 뒤 다른 처리 스펙트럼이나 ZIP으로 다시 시도해 주세요.</p>
            <button type="button" onClick={() => window.location.reload()}>안전하게 다시 시작</button>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}

type Nucleus = "1H" | "13C";
function nucleusKey(value: string): Nucleus | null {
  const normalized = value.replace(/[<>^\s_\-]/g, "").toUpperCase();
  if (/(?:13C|C13|¹³C|CARBON)/.test(normalized)) return "13C";
  if (/(?:1H|H1|¹H|PROTON)/.test(normalized)) return "1H";
  return null;
}

function inferDatasetNucleus(dataset: ParsedSpectrum): Nucleus | null {
  const metadataNucleus = nucleusKey(dataset.nucleus);
  if (metadataNucleus) return metadataNucleus;

  const label = `${dataset.fileName} ${dataset.source}`;
  const labelNucleus = nucleusKey(label);
  if (labelNucleus) return labelNucleus;
  if (/(?:^|[^a-z])(?:dept(?:45|90|135)?|apt|jmod|zgpg\d*|carbon)(?:[^a-z]|$)/i.test(label)) return "13C";

  const [low, high] = finiteExtent(dataset.points.map((point) => point.x), [0, 0]);
  const ppmSpan = Math.abs(high - low);
  if (high > 25 || ppmSpan > 25) return "13C";
  if (dataset.frequency && dataset.frequency >= 220) return "1H";
  if (dataset.frequency && dataset.frequency > 0 && dataset.frequency < 220 && high > 12) return "13C";
  return null;
}
// Carbon solvent centers; D2O contains no carbon. Acetone has two carbon sites.
const CARBON_SOLVENTS = SOLVENTS.map((item) => ({ ...item, ppm: ({ cdcl3: 77.16, dmso: 39.52, cd3od: 49.0, d2o: NaN, acetone: 29.84, c6d6: 128.06 } as Record<string, number>)[item.id] }));
function carbonAssignment(ppm: number) {
  if (ppm >= 185) return "알데하이드 / 케톤 C=O 영역";
  if (ppm >= 160) return "에스터 / 산 / 아마이드 C=O 영역";
  if (ppm >= 100) return "방향족 / 알켄 / 아세탈 탄소 영역";
  if (ppm >= 50) return "O/N 인접 또는 sp 탄소 영역";
  return "지방족 탄소 영역";
}
function analyzeCarbon(points: SpectrumPoint[], solventId: string): Peak[] {
  // Reuse noise rejection and area calculation, never proton assignments or integrals.
  const solvent = CARBON_SOLVENTS.find((item) => item.id === solventId)!;
  const centers = solventId === "acetone" ? [solvent.ppm, 206.26] : [solvent.ppm];
  return analyzeSpectrum(points, "carbon-unassigned", true).map((peak) => {
    const isSolvent = centers.some((center) => Math.abs(peak.ppm - center) < 0.85);
    return { ...peak, integral: 0, multiplicity: "s", multiplicityName: "탄소 신호", lineCount: 1,
      kind: isSolvent ? "solvent" : "main", assignment: isSolvent ? `${solvent.name} 탄소 용매 영역` : carbonAssignment(peak.ppm),
      reason: isSolvent ? "중수소 결합으로 갈라진 용매선 포함 · 구조 예측에서 제외" : "¹³C ppm 기반 영역 추정 · 면적은 탄소 수로 사용하지 않음" };
  });
}
type SpectrumSession = {
  points: SpectrumPoint[]; fileName: string; source: string; frequency: number | null;
  solventId: string; offset: number; isDemo: boolean; referencePeakId: number | null;
  referenceIntegral: string; excludedPeakIds: number[]; multiplicityOverrides: Record<number, MultiplicityCode>;
  verticalScale: number; chartMode: ChartMode; manualPeaks: Peak[]; range: [number, number]; activeDataset: number;
};
function emptySession(nucleus: Nucleus): SpectrumSession {
  return { points: [], fileName: `${nucleus} 데이터를 업로드하세요`, source: "미입력", frequency: null,
    solventId: "cdcl3", offset: 0, isDemo: false, referencePeakId: null, referenceIntegral: "1",
    excludedPeakIds: [], multiplicityOverrides: {}, verticalScale: 1, chartMode: "navigate", manualPeaks: [],
    range: nucleus === "13C" ? [-10, 220] : [-0.4, 10.2], activeDataset: -1 };
}
function sessionPeaks(session: SpectrumSession, nucleus: Nucleus): Peak[] {
  const shifted = session.points.map((point) => ({ ...point, x: point.x + session.offset }));
  let detected = nucleus === "13C" ? analyzeCarbon(shifted, session.solventId) : analyzeSpectrum(shifted, session.solventId);
  if (session.isDemo) detected = detected.map((peak) => {
    const expected = DEMO_SIGNALS.find((signal) => signal.integral > 0 && Math.abs(signal.ppm + session.offset - peak.ppm) < 0.08);
    return expected && peak.kind === "main" ? { ...peak, integral: expected.integral, area: expected.integral } : peak;
  });
  const reviewed = [...detected, ...session.manualPeaks].filter((peak) => !session.excludedPeakIds.includes(peak.id)).map((peak) => {
    const multiplicity = session.multiplicityOverrides[peak.id] ?? peak.multiplicity;
    return { ...peak, multiplicity };
  });
  if (nucleus === "13C") return reviewed;
  const main = reviewed.filter((peak) => peak.kind === "main");
  const largest = Math.max(0, ...main.map((peak) => peak.area));
  const reference = main.find((peak) => peak.id === session.referencePeakId)
    ?? main.filter((peak) => peak.area >= largest * 0.12).reduce<Peak | undefined>((a, b) => !a || b.area < a.area ? b : a, undefined);
  const value = Number(session.referenceIntegral);
  return reviewed.map((peak) => ({ ...peak, integral: reference && value > 0 && Number.isFinite(value) ? peak.area / Math.max(reference.area, 1e-12) * value : 0 }));
}
function compareCarbon(candidate: Candidate, peak: Peak) {
  const plan = candidate.dbePlan ?? dbePlanFor(candidate.formulaKey, candidate.structureType);
  const composition = parseFormulaKey(candidate.formulaKey);
  const match = peak.ppm >= 160 ? plan.carbonyls > 0 : peak.ppm >= 100 ? plan.aromaticRings + plan.alkenes > 0 : peak.ppm >= 50 ? composition.o + composition.n + plan.alkynes > 0 : composition.c > 0;
  return { match, label: `${carbonAssignment(peak.ppm)} · ${match ? "골격과 비교 가능" : "골격 불일치 검토"}` };
}
function rankWithCarbon(candidates: Candidate[], carbon: Peak[], hasProton: boolean): Candidate[] {
  const main = carbon.filter((peak) => peak.kind === "main");
  if (!main.length) return candidates;
  return candidates.map((candidate) => {
    const matches = main.filter((peak) => compareCarbon(candidate, peak).match).length;
    const countPenalty = Math.max(0, main.length - parseFormulaKey(candidate.formulaKey).c) * 12;
    const carbonScore = Math.max(5, 25 + 65 * matches / main.length - countPenalty);
    const score = Math.round(hasProton ? candidate.baseScore * 0.55 + carbonScore * 0.45 : carbonScore);
    return { ...candidate, baseScore: score, score, rationale: `${hasProton ? candidate.rationale : "¹³C만으로 제시한 제한된 구조 가설입니다."} ¹³C 주 신호 ${main.length}개 중 ${matches}개 영역이 골격과 양립합니다. 대칭·겹침 때문에 신호 수는 총 탄소 수와 다를 수 있습니다.` };
  });
}
function carbonCandidates(): Candidate[] {
  // Existing small comparison library, with no fabricated proton observations.
  return [
    ["Ethyl benzoate", "C9H10O2", "ethyl-benzoate", 150.0681],
    ["Methyl phenylacetate", "C9H10O2", "methyl-phenylacetate", 150.0681],
    ["Ethylbenzene", "C8H10", "ethylbenzene", 106.0783],
    ["Anisole", "C7H8O", "anisole", 108.0575],
    ["Diethyl ether", "C4H10O", "diethyl-ether", 74.0732],
    ["Ethyl acetate", "C4H8O2", "ethyl-acetate", 88.0524],
  ].map(([name, formulaKey, structureType, exactMass]) => ({ name, formula: formulaKey, formulaKey, structureType, exactMass, baseScore: 50, score: 50, rationale: "¹³C 비교 후보" } as Candidate));
}

function NmrApp() {
  const demoPoints = useMemo(() => buildDemoSpectrum(), []);
  const demoCarbonPoints = useMemo(() => buildDemoCarbonSpectrum(), []);
  const [nucleus, setNucleus] = useState<Nucleus>("1H");
  const [sessions, setSessions] = useState<Record<Nucleus, SpectrumSession>>(() => ({
    "1H": { ...emptySession("1H"), points: demoPoints, fileName: "ethyl-benzoate_demo.dx", source: "DEMO · JCAMP-DX", frequency: 400.13, isDemo: true },
    "13C": { ...emptySession("13C"), points: demoCarbonPoints, fileName: "ethyl-benzoate_13C_demo.dx", source: "DEMO · ¹³C", frequency: 100.61, isDemo: true },
  }));
  function spectrumSetter<K extends keyof SpectrumSession>(key: K) {
    return (value: SpectrumSession[K] | ((previous: SpectrumSession[K]) => SpectrumSession[K])) => setSessions((previous) => ({ ...previous, [nucleus]: { ...previous[nucleus], [key]: typeof value === "function" ? (value as (previous: SpectrumSession[K]) => SpectrumSession[K])(previous[nucleus][key]) : value } }));
  }
  const isCarbon = nucleus === "13C";
  const availableSolvents = isCarbon ? CARBON_SOLVENTS : SOLVENTS;
  const points = sessions[nucleus].points;
  const fileName = sessions[nucleus].fileName;
  const source = sessions[nucleus].source;
  const frequency = sessions[nucleus].frequency;
  const [datasets, setDatasets] = useState<ParsedSpectrum[]>([]);
  const activeDataset = sessions[nucleus].activeDataset;
  const solventId = sessions[nucleus].solventId;
  const setSolventId = spectrumSetter("solventId");
  const offset = sessions[nucleus].offset;
  const setOffset = spectrumSetter("offset");
  const [status, setStatus] = useState<"ready" | "loading" | "error">("ready");
  const [message, setMessage] = useState("예제 데이터를 분석했습니다. 새 파일을 드롭하면 교체됩니다.");
  const isDemo = sessions[nucleus].isDemo;
  const [filter, setFilter] = useState<"all" | PeakKind>("all");
  const referencePeakId = sessions[nucleus].referencePeakId;
  const setReferencePeakId = spectrumSetter("referencePeakId");
  const referenceIntegral = sessions[nucleus].referenceIntegral;
  const setReferenceIntegral = spectrumSetter("referenceIntegral");
  const [observedMz, setObservedMz] = useState("");
  const [ionMode, setIonMode] = useState<IonMode>("protonated");
  const [selectedFormulaKey, setSelectedFormulaKey] = useState("");
  const excludedPeakIds = sessions[nucleus].excludedPeakIds;
  const setExcludedPeakIds = spectrumSetter("excludedPeakIds");
  const multiplicityOverrides = sessions[nucleus].multiplicityOverrides;
  const setMultiplicityOverrides = spectrumSetter("multiplicityOverrides");
  const verticalScale = sessions[nucleus].verticalScale;
  const setVerticalScale = spectrumSetter("verticalScale");
  const chartMode = sessions[nucleus].chartMode;
  const setChartMode = spectrumSetter("chartMode");
  const manualPeaks = sessions[nucleus].manualPeaks;
  const setManualPeaks = spectrumSetter("manualPeaks");
  const [searchCopied, setSearchCopied] = useState(false);
  const loadTokenRef = useRef(0);
  const manualPeakIdRef = useRef(1_000_000);
  const fullRange = useMemo<[number, number]>(() => {
    return finiteExtent(points.map((point) => point.x), isCarbon ? [-10, 220] : [-0.4, 10.2]);
  }, [points, isCarbon]);
  const range = sessions[nucleus].range;
  const setRange = spectrumSetter("range");
  const solvent = availableSolvents.find((item) => item.id === solventId) ?? availableSolvents[0];
  const shiftedPoints = useMemo(() => points.map((point) => ({ ...point, x: point.x + offset })), [points, offset]);
  const detectedPeaks = useMemo(() => {
    const detected = isCarbon ? analyzeCarbon(shiftedPoints, solventId) : analyzeSpectrum(shiftedPoints, solventId);
    if (!isDemo) return detected;
    return detected.map((peak) => {
      if (peak.kind !== "main") return peak;
      const expected = DEMO_SIGNALS.find((signal) => signal.integral > 0 && Math.abs(signal.ppm + offset - peak.ppm) < 0.08);
      return expected ? { ...peak, integral: expected.integral, area: expected.integral } : peak;
    });
  }, [shiftedPoints, solventId, isDemo, offset, isCarbon]);
  const combinedPeaks = useMemo(
    () => [...detectedPeaks, ...manualPeaks].sort((a, b) => b.ppm - a.ppm),
    [detectedPeaks, manualPeaks],
  );
  const reviewedPeaks = useMemo(
    () => combinedPeaks.map((peak) => {
      const multiplicity = multiplicityOverrides[peak.id];
      return multiplicity
        ? { ...peak, multiplicity, multiplicityName: MULTIPLICITY_NAMES[multiplicity], lineCount: multiplicity === "m" ? peak.lineCount : MULTIPLICITY_LINE_COUNTS[multiplicity] }
        : peak;
    }),
    [combinedPeaks, multiplicityOverrides],
  );
  const peaks = useMemo(
    () => reviewedPeaks.filter((peak) => !excludedPeakIds.includes(peak.id)),
    [reviewedPeaks, excludedPeakIds],
  );
  const excludedPeaks = useMemo(
    () => reviewedPeaks.filter((peak) => excludedPeakIds.includes(peak.id)),
    [reviewedPeaks, excludedPeakIds],
  );
  const shownPeaks = filter === "all" ? peaks : peaks.filter((peak) => peak.kind === filter);
  const mainPeaks = peaks.filter((peak) => peak.kind === "main");
  const largestMainArea = Math.max(...mainPeaks.map((peak) => peak.area), 0);
  const referenceCandidates = mainPeaks.filter((peak) => peak.area >= largestMainArea * 0.12);
  const referencePeak = mainPeaks.find((peak) => peak.id === referencePeakId)
    ?? referenceCandidates.reduce<Peak | null>((smallest, peak) => !smallest || peak.area < smallest.area ? peak : smallest, null)
    ?? mainPeaks[0]
    ?? null;
  const referenceArea = Math.max(referencePeak?.area ?? 1, 1e-12);
  const referenceIntegralValue = Number(referenceIntegral);
  const hasValidReferenceIntegral = referenceIntegral.trim() !== ""
    && Number.isFinite(referenceIntegralValue)
    && referenceIntegralValue > 0;
  const shiftedFullRange = useMemo<[number, number]>(() => [fullRange[0] + offset, fullRange[1] + offset], [fullRange, offset]);
  const fullSpan = Math.max(shiftedFullRange[1] - shiftedFullRange[0], 1e-9);
  const visibleSpan = Math.min(Math.abs(range[1] - range[0]), fullSpan);
  const isZoomed = visibleSpan < fullSpan * 0.995;
  const protonPeaks = useMemo(() => sessionPeaks(sessions["1H"], "1H"), [sessions]);
  const carbonPeaks = useMemo(() => sessionPeaks(sessions["13C"], "13C"), [sessions]);
  const hasProton = protonPeaks.some((peak) => peak.kind === "main");
  const hasCarbon = carbonPeaks.some((peak) => peak.kind === "main");
  const evidenceLabel = hasProton && hasCarbon ? "¹H + ¹³C" : hasCarbon ? "¹³C만" : hasProton ? "¹H만" : "입력 없음";
  const formulaSuggestions = useMemo(
    () => suggestFormulas(observedMz, ionMode, protonPeaks, carbonPeaks),
    [observedMz, ionMode, protonPeaks, carbonPeaks],
  );
  const selectedFormula = formulaSuggestions.find((suggestion) => suggestion.formulaKey === selectedFormulaKey) ?? null;
  const literaturePeaks = useMemo(
    () => mainPeaks
      .filter((peak) => peak.confidence >= 70)
      .sort((a, b) => b.intensity - a.intensity)
      .slice(0, 6),
    [mainPeaks],
  );
  const nmrSignature = useMemo(
    () => literaturePeaks.map((peak) => peak.ppm.toFixed(3)).join(","),
    [literaturePeaks],
  );
  const exactSearchQuery = selectedFormula
    ? [
      selectedFormula.formulaKey,
      observedMz ? `m/z ${observedMz}` : "",
      ...literaturePeaks.map((peak) => `${peak.ppm.toFixed(3)} ppm`),
    ].filter(Boolean).join(" ")
    : "";
  const literatureSearchLinks = selectedFormula ? [
    { label: "CAS SciFinder", detail: "위 정밀 검색식을 복사한 뒤 CAS 검색창에 붙여넣기", url: "https://scifinder-n.cas.org/" },
    { label: "PubMed", detail: "예상 분자식·m/z·ppm으로 생명과학 문헌 검색", url: `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(exactSearchQuery)}` },
    { label: "ChemSpider", detail: "동일한 세 값으로 화합물·구조 데이터베이스 검색", url: `https://www.chemspider.com/Search.aspx?q=${encodeURIComponent(exactSearchQuery)}` },
  ] : [];

  const candidates = useMemo(() => {
    if (status !== "ready") return [];
    const mz = Number(observedMz);
    const hasMassInput = Number.isFinite(mz) && mz > 0;
    if (hasMassInput && !selectedFormula) return [];

    if (!hasProton && !hasCarbon) return [];
    let base = hasProton ? structureCandidates(protonPeaks, sessions["1H"].isDemo) : carbonCandidates();
    if (selectedFormula) {
      const formulaMatches = base.filter((candidate) => candidate.formulaKey === selectedFormula.formulaKey);
      base = formulaMatches.length ? formulaMatches : formulaStructureCandidates(selectedFormula, protonPeaks, carbonPeaks);
    }
    base = base.map((candidate) => candidate.dbePlan ? candidate : hasProton ? applyDbePlan(candidate, protonPeaks) : { ...candidate, dbePlan: dbePlanFor(candidate.formulaKey, candidate.structureType) });
    base = rankWithCarbon(base, carbonPeaks, hasProton);

    const ranked = base
      .map((candidate) => {
        if (!hasMassInput) return candidate;
        const theoreticalMz = candidate.exactMass + ION_MODES[ionMode].delta;
        const massError = Math.abs(mz - theoreticalMz);
        const tolerance = observedMz.includes(".") ? 0.22 : 0.55;
        const massFit = 100 * Math.exp(-Math.pow(massError / tolerance, 2));
        const formulaBoost = selectedFormula ? selectedFormula.score : 50;
        const score = Math.max(8, Math.min(99, Math.round(candidate.baseScore * 0.48 + massFit * 0.27 + formulaBoost * 0.25)));
        return { ...candidate, score, theoreticalMz, massError };
      })
      .sort((a, b) => b.score - a.score);
    if (!selectedFormula || ranked.length < 2) return ranked;
    const total = ranked.reduce((sum, candidate) => sum + Math.max(1, candidate.score), 0);
    let assigned = 0;
    return ranked.map((candidate, index) => {
      const score = index === ranked.length - 1
        ? Math.max(1, 100 - assigned)
        : Math.max(1, Math.round((Math.max(1, candidate.score) / total) * 100));
      assigned += score;
      return { ...candidate, score };
    });
  }, [protonPeaks, carbonPeaks, hasProton, hasCarbon, sessions, observedMz, ionMode, status, selectedFormula]);

  function normalizedIntegral(peak: Peak) {
    if (!hasValidReferenceIntegral) return 0;
    return (peak.area / referenceArea) * referenceIntegralValue;
  }

  function excludePeak(peak: Peak) {
    setExcludedPeakIds((current) => current.includes(peak.id) ? current : [...current, peak.id]);
    if (referencePeakId === peak.id) setReferencePeakId(null);
  }

  function restorePeak(id: number) {
    setExcludedPeakIds((current) => current.filter((peakId) => peakId !== id));
  }

  function updateMultiplicity(peakId: number, multiplicity: MultiplicityCode) {
    setMultiplicityOverrides((current) => ({ ...current, [peakId]: multiplicity }));
  }

  function addManualPeak(startPpm: number, endPpm: number) {
    const manualPeak = peakFromSelectedRange(shiftedPoints, startPpm, endPpm, manualPeakIdRef.current++);
    if (!manualPeak) {
      setMessage("선택 구간이 너무 좁습니다. 신호의 양쪽 기준선까지 조금 넓게 드래그해 주세요.");
      return;
    }
    setManualPeaks((current) => [...current, isCarbon ? { ...manualPeak, integral: 0, assignment: carbonAssignment(manualPeak.ppm), reason: "직접 선택한 탄소 신호 · 비정량 면적" } : manualPeak]);
    setFilter("all");
    setMessage(`${manualPeak.ppm.toFixed(3)} ppm 피크를 수동 적분 구간으로 추가했습니다. 표에서 다중도와 적분 기준을 바로 조정할 수 있습니다.`);
  }

  function formatIntegral(value: number) {
    if (!hasValidReferenceIntegral) return "—";
    return value > 0 && value < 0.01 ? "<0.01" : value.toFixed(2);
  }

  function resetSpectrumView() {
    setRange([fullRange[0] + offset, fullRange[1] + offset]);
    setVerticalScale(1);
  }

  function amountLabel(peak: Peak) {
    const ratio = normalizedIntegral(peak);
    if (isCarbon) return "상대 면적 · 탄소 수 아님";
    if (peak.kind === "solvent") return "정량 제외";
    if (peak.kind === "impurity") return "잔류 수분 후보";
    if (!hasValidReferenceIntegral) return "적분값 입력 필요";
    const nearest = Math.max(1, Math.round(ratio));
    return Math.abs(ratio - nearest) <= Math.max(0.18, nearest * 0.14) ? `≈ ${nearest}H` : "비정수 · 검토";
  }

  function applySolventCorrection(nextId = solventId) {
    const target = availableSolvents.find((item) => item.id === nextId) ?? availableSolvents[0];
    if (!Number.isFinite(target.ppm)) { setMessage("D₂O에는 탄소 기준 신호가 없습니다."); return; }
    const provisional = isCarbon ? analyzeCarbon(points, nextId) : analyzeSpectrum(points, nextId);
    const solventPeak = provisional
      .filter((peak) => peak.kind === "solvent")
      .sort((a, b) => b.intensity - a.intensity)[0];
    const carbonSolventLines = provisional.filter((peak) => peak.kind === "solvent" && Math.abs(peak.ppm - target.ppm) < 0.85);
    const center = isCarbon && carbonSolventLines.length ? (Math.min(...carbonSolventLines.map((peak) => peak.ppm)) + Math.max(...carbonSolventLines.map((peak) => peak.ppm))) / 2 : solventPeak?.ppm;
    const nextOffset = center !== undefined ? target.ppm - center : 0;
    setRange(([low, high]) => [low + nextOffset - offset, high + nextOffset - offset]);
    setManualPeaks((current) => current.map((peak) => ({ ...peak, ppm: peak.ppm + nextOffset - offset })));
    setOffset(nextOffset);
    setMessage(solventPeak
      ? `${target.name} ${isCarbon ? "탄소 용매선 중심을" : "잔류 피크를"} ${target.ppm.toFixed(2)} ppm에 맞춰 ${nextOffset >= 0 ? "+" : ""}${nextOffset.toFixed(3)} ppm 보정했습니다.`
      : `${target.name} 기준 피크를 확실히 찾지 못해 보정값을 0.000 ppm으로 유지했습니다.`);
  }

  function showDataset(dataset: ParsedSpectrum, index: number, total: number) {
    const target = inferDatasetNucleus(dataset) ?? nucleus;
    const cleaned = sanitizeSpectrumPoints(dataset.points);
    if (cleaned.length < 16) throw new Error("표시할 유효 데이터 포인트가 부족합니다.");
    setSessions((previous) => ({ ...previous, [target]: { ...emptySession(target), points: cleaned, fileName: dataset.fileName,
      source: dataset.source, frequency: dataset.frequency, solventId: solventFromMetadata(dataset.solvent) ?? previous[target].solventId,
      range: finiteExtent(cleaned.map((point) => point.x)), activeDataset: index } }));
    setNucleus(target);
    setStatus("ready");
    setMessage(dataset.note ?? `${total}개 스펙트럼 · ${target} 데이터를 읽었습니다.`);
  }
  function acceptDatasets(incoming: ParsedSpectrum[]) {
    if (!incoming.length) throw new Error("¹H 또는 ¹³C 1D 데이터가 필요합니다.");
    // Metadata, experiment label, frequency and ppm range are considered in that order.
    // Only a truly ambiguous standalone spectrum falls back to the tab selected at upload time.
    const normalized = incoming.map((dataset) => ({ ...dataset, nucleus: inferDatasetNucleus(dataset) ?? nucleus }));
    for (const dataset of normalized) {
      const cleaned = sanitizeSpectrumPoints(dataset.points);
      const [low, high] = finiteExtent(cleaned.map((point) => point.x), [0, 0]);
      if (cleaned.length < 16 || high - low < 1e-9) throw new Error("유효한 ppm 범위와 16개 이상의 데이터 포인트가 필요합니다.");
    }
    const firstByNucleus = (["1H", "13C"] as const).map((target) => ({
      target,
      match: normalized.map((dataset, index) => ({ dataset, index })).find(({ dataset }) => dataset.nucleus === target),
    }));
    setDatasets(normalized);
    setSessions((previous) => {
      const next = { ...previous };
      if (next["1H"].isDemo) next["1H"] = emptySession("1H");
      if (next["13C"].isDemo) next["13C"] = emptySession("13C");
      for (const { target, match } of firstByNucleus) {
        if (!match) continue;
        const cleaned = sanitizeSpectrumPoints(match.dataset.points);
        next[target] = {
          ...emptySession(target),
          points: cleaned,
          fileName: match.dataset.fileName,
          source: match.dataset.source,
          frequency: match.dataset.frequency,
          solventId: solventFromMetadata(match.dataset.solvent) ?? previous[target].solventId,
          range: finiteExtent(cleaned.map((point) => point.x), target === "13C" ? [-10, 220] : [-0.4, 10.2]),
          activeDataset: match.index,
        };
      }
      return next;
    });
    const protonCount = normalized.filter((dataset) => dataset.nucleus === "1H").length;
    const carbonCount = normalized.filter((dataset) => dataset.nucleus === "13C").length;
    const firstTarget = protonCount ? "1H" : "13C";
    setNucleus(firstTarget);
    setStatus("ready");
    setMessage(`자동 분류 완료 · ¹H ${protonCount}개 · ¹³C ${carbonCount}개. 위 토글로 그래프를 전환할 수 있습니다.`);
  }

  async function loadFiles(files: File[]) {
    if (!files.length) return;
    const loadToken = ++loadTokenRef.current;
    setStatus("loading");
    setSelectedFormulaKey("");
    setMessage("제조사 형식을 확인하고 1D 스펙트럼을 읽는 중입니다…");
    try {
      const readableFiles = validateInputFiles(files);
      const brukerFolderDatasets = await parseBrukerFolderDatasets(readableFiles);
      if (brukerFolderDatasets.length) {
        if (loadToken !== loadTokenRef.current) return;
        acceptDatasets(brukerFolderDatasets);
        return;
      }
      const textSpectra = await Promise.all(readableFiles.map(parseTextXyFile));
      if (textSpectra.every((dataset) => dataset !== null)) {
        if (loadToken !== loadTokenRef.current) return;
        acceptDatasets(textSpectra as ParsedSpectrum[]);
        return;
      }
      if (readableFiles.length === 1) {
        const textSpectrum = await parseTextXyFile(readableFiles[0]);
        if (textSpectrum) {
          if (loadToken !== loadTokenRef.current) return;
          acceptDatasets([textSpectrum]);
          return;
        }
        const standaloneBruker = await parseStandaloneBrukerBinary(readableFiles[0]);
        if (standaloneBruker) {
          if (loadToken !== loadTokenRef.current) return;
          acceptDatasets([standaloneBruker]);
          return;
        }
      }
      const hasPaths = readableFiles.some((file) => Boolean(file.webkitRelativePath));
      const isArchiveOrOpenFormat = readableFiles.some((file) => /\.(zip|jdf|jdx?|jcamp)$/i.test(file.name));
      if (!hasPaths && !isArchiveOrOpenFormat) {
        const flatBruker = await parseFlatBruker(readableFiles);
        if (flatBruker) {
          if (loadToken !== loadTokenRef.current) return;
          acceptDatasets([flatBruker]);
          return;
        }
      }

      const [{ read }, { fileCollectionFromFiles }] = await Promise.all([import("nmr-parser"), import("filelist-utils")]);
      const collection = await fileCollectionFromFiles(readableFiles);
      const parsed = await read(collection) as ParserEntry[];
      if (loadToken !== loadTokenRef.current) return;
      if (!parsed.length) throw new Error("지원되는 1D NMR 데이터가 없습니다.");
      const extension = readableFiles[0].name.split(".").pop()?.toUpperCase() ?? "DATA";
      const vendor = readableFiles.some((file) => file.name.toLowerCase().endsWith(".jdf"))
        ? "JEOL · JDF"
        : readableFiles.some((file) => /(^|\/)acqus$|(^|\/)fid$|(^|\/)1r$/i.test(file.webkitRelativePath || file.name)) || readableFiles[0].name.toLowerCase().endsWith(".zip")
          ? "BRUKER · DATASET"
          : `OPEN · ${extension}`;
      const oneDimensional = parsed.filter((entry) => Number(entry.info?.dimension ?? entry.description?.dimension ?? 1) === 1);
      const processed = oneDimensional.filter((entry) => !entry.info?.isFid && !entry.description?.isFid);
      const preferred = oneDimensional.filter((entry) => {
        if (!entry.info?.isFid && !entry.description?.isFid) return true;
        return !processed.some((other) => other.source?.name === entry.source?.name && other.source?.expno === entry.source?.expno
          && String(firstValue(other.info?.nucleus)) === String(firstValue(entry.info?.nucleus)));
      });
      if (!preferred.length) throw new Error("지원되는 1D NMR 데이터가 없습니다.");
      const normalized = preferred.map((entry, index: number) => {
        const sourceInfo = entry.source;
        const experimentName = sourceInfo?.name?.replace(/([A-Za-z]+)(\d+)$/i, "$1 $2");
        const label = sourceInfo?.name
          ? `${experimentName}${sourceInfo.expno !== undefined ? ` · Exp ${sourceInfo.expno}` : ""}`
          : preferred.length > 1
            ? `${readableFiles[0].name} · Spectrum ${index + 1}`
            : readableFiles.length > 1
              ? `${readableFiles[0].name} 외 ${readableFiles.length - 1}개`
              : readableFiles[0].name;
        const sourceLabel = sourceInfo?.isFT ? `${vendor} · PROCESSED` : vendor;
        return normalizeParsed(entry, label, sourceLabel);
      });
      acceptDatasets(normalized);
    } catch (error) {
      if (loadToken !== loadTokenRef.current) return;
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "파일을 읽지 못했습니다.");
    }
  }

  function onFileInput(event: ChangeEvent<HTMLInputElement>) {
    void loadFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  }

  function exportCsv() {
    const lines = [`nucleus,ppm,multiplicity,${isCarbon ? "relative_area" : "scaled_integral"},amount_label,classification,confidence,assignment`, ...peaks.map((peak) => [nucleus, peak.ppm.toFixed(4), peak.multiplicity, hasValidReferenceIntegral ? normalizedIntegral(peak).toFixed(3) : "", amountLabel(peak), peak.kind, peak.confidence, `\"${peak.assignment}\"`].join(","))];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${fileName.replace(/\.[^.]+$/, "")}_nmr-analysis.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="NMRaid home">
          <span className="brand-mark"><i /><i /><i /></span>
          <span><b>NMR</b>aid</span>
        </a>
        <div className="topbar-meta">
          <span className="version-pill">ALPHA 0.1</span>
        </div>
      </header>

      <section
        className={`upload-zone ${status}`}
        onDragOver={(event: DragEvent) => event.preventDefault()}
        onDrop={(event: DragEvent) => {
          event.preventDefault();
          void filesFromDrop(event.dataTransfer)
            .then(loadFiles)
            .catch((error: unknown) => {
              setStatus("error");
              setMessage(error instanceof Error ? error.message : "드롭한 파일을 읽지 못했습니다.");
            });
        }}
      >
        <div className="upload-icon"><span>↗</span></div>
        <div className="upload-copy">
          <h2>{status === "loading" ? "NMR 데이터를 읽고 있습니다" : "NMR 데이터를 여기에 놓으세요"}</h2>
        </div>
        <div className="upload-actions">
          <label className="button primary">
            ZIP / 개별 FILE / JDF
            <input type="file" multiple onClick={(event) => { event.currentTarget.value = ""; }} onChange={onFileInput} aria-label="ZIP 또는 개별 NMR 파일 선택" />
          </label>
        </div>
      </section>

      <div className={`notice ${status}`} role="status">
        <span>{status === "loading" ? "◌" : status === "error" ? "!" : "✓"}</span>
        <p>{message}</p>
        {status === "error" && <button onClick={() => { setStatus("ready"); setMessage("기존 데이터를 유지합니다. 파일을 다시 선택하세요."); }}>기존 분석으로 돌아가기</button>}
      </div>

      <section className="workflow" aria-label="analysis progress">
        {["데이터 로드", "용매 보정", "AI 피크 분류", "결과 해석"].map((label, index) => (
          <div className="workflow-step done" key={label}>
            <span>{index + 1}</span>
            <div><small>STEP {index + 1}</small><strong>{label}</strong></div>
          </div>
        ))}
      </section>

      <section className="workspace-grid">
        <article className="panel spectrum-panel">
          <div className="panel-heading">
            <div>
              <div className="nucleus-toggle" role="tablist" aria-label="NMR 핵종 선택">
                {(["1H", "13C"] as const).map((value) => <button key={value} role="tab" aria-selected={nucleus === value} disabled={status === "loading"} className={nucleus === value ? "active" : ""} onClick={() => setNucleus(value)}>{value === "1H" ? "¹H NMR" : "¹³C NMR"}</button>)}
              </div>
              {datasets.filter((dataset) => nucleusKey(dataset.nucleus) === nucleus).length > 1 ? (
                <div className="dataset-picker">
                  <label htmlFor="dataset">스펙트럼 선택</label>
                  <select
                    id="dataset"
                    value={activeDataset}
                    onChange={(event) => {
                      const index = Number(event.target.value);
                      showDataset(datasets[index], index, datasets.length);
                    }}
                  >
                    {datasets.map((dataset, index) => nucleusKey(dataset.nucleus) === nucleus && <option value={index} key={`${dataset.fileName}-${index}`}>{index + 1}. {dataset.fileName}</option>)}
                  </select>
                </div>
              ) : <h2>{fileName}</h2>}
            </div>
            <div className="dataset-meta">
              <span>{source}</span><span>{nucleus}</span>
              {frequency ? <span title="파일 메타데이터에서 자동 판독">AUTO · {frequency.toFixed(2)} MHz</span> : <span>MHz 정보 없음</span>}
            </div>
          </div>
          <div className="chart-toolbar">
            <div><span className="live-dot" /> {shiftedPoints.length.toLocaleString()} points</div>
            <div>
              <span>{isZoomed ? `${range[1].toFixed(2)}–${range[0].toFixed(2)} ppm · ${verticalScale < 1 ? verticalScale.toFixed(2) : verticalScale.toFixed(1)}×` : "전체 구간"}</span>
              <button onClick={resetSpectrumView}>뷰 리셋</button>
            </div>
          </div>
          <div className="spectrum-mode-bar" role="group" aria-label="스펙트럼 마우스 조작 모드">
            <button className={chartMode === "navigate" ? "active" : ""} onClick={() => setChartMode("navigate")}><span>↔</span><b>보기 조작</b><small>좌클릭 확대 · 우클릭 축소</small></button>
            <button className={chartMode === "add-peak" ? "active add" : "add"} onClick={() => setChartMode("add-peak")}><span>＋</span><b>피크 구간 추가</b><small>드래그한 범위를 표에 적분</small></button>
          </div>
          {!points.length && <p className="empty-spectrum">{nucleus} 데이터가 없습니다. 위에서 파일을 업로드하세요.</p>}
          <SpectrumChart
            key={nucleus}
            points={shiftedPoints}
            peaks={peaks}
            range={range}
            setRange={setRange}
            solventPpm={solvent.ppm}
            verticalScale={verticalScale}
            setVerticalScale={setVerticalScale}
            mode={chartMode}
            onAddPeak={addManualPeak}
          />
        </article>

        <aside className="panel solvent-panel">
          <div className="panel-heading compact">
            <div><p className="panel-kicker">REFERENCE</p><h2>용매 설정 & 보정</h2></div>
            <span className="status-chip">AUTO</span>
          </div>
          <label className="field-label" htmlFor="solvent">측정 용매</label>
          <div className="select-wrap">
            <select
              id="solvent"
              value={solventId}
              onChange={(event) => {
                const next = event.target.value;
                setSolventId(next);
                setRange(([low, high]) => [low - offset, high - offset]);
                setManualPeaks((current) => current.map((peak) => ({ ...peak, ppm: peak.ppm - offset })));
                setOffset(0);
                setMessage(`${SOLVENTS.find((item) => item.id === next)?.name} 기준값을 선택했습니다. 자동 보정을 실행하세요.`);
              }}
            >
              {availableSolvents.map((item) => <option key={item.id} value={item.id}>{item.name} · {Number.isFinite(item.ppm) ? `${item.ppm.toFixed(2)} ppm` : "탄소 없음"}</option>)}
            </select>
          </div>
          <div className="reference-card">
            <div><span>기준 신호</span><strong>{Number.isFinite(solvent.ppm) ? solvent.ppm.toFixed(2) : "—"} <small>ppm</small></strong></div>
            <div><span>적용 보정</span><strong className={offset === 0 ? "" : "accent"}>{offset >= 0 ? "+" : ""}{offset.toFixed(3)} <small>ppm</small></strong></div>
          </div>
          <button className="button correction" onClick={() => applySolventCorrection()}>
            <span>◎</span> 용매 피크 자동 보정
          </button>
          <p className="helper-text">{isCarbon ? "탄소 용매 영역의 양끝 선 중심을 기준으로 보정합니다. 용매와 시료 신호가 겹치면 확인이 필요합니다." : "기준값 주변에 큰 피크와 작은 피크가 함께 있어도 가장 큰 선 하나를 singlet 용매 피크로 맞춥니다."}</p>
          <div className="quality-meter">
            <div><span>Reference confidence</span><b>{peaks.some((peak) => peak.kind === "solvent") ? "HIGH" : "REVIEW"}</b></div>
            <div className="meter"><i style={{ width: peaks.some((peak) => peak.kind === "solvent") ? "94%" : "48%" }} /></div>
          </div>
        </aside>
      </section>

      <section className="results-grid">
        <article className="panel peak-panel">
          <div className="panel-heading result-heading">
            <div>
              <p className="panel-kicker">AI-ASSISTED TRIAGE</p>
              <h2>피크 분류 & 적분</h2>
              <p>{mainPeaks.length}개 메인 신호{manualPeaks.length ? ` · ${manualPeaks.length}개 직접 추가` : ""} · {peaks.filter((peak) => peak.kind === "solvent").length}개 용매 · {peaks.filter((peak) => peak.kind === "impurity").length}개 잔류 수분 후보{excludedPeaks.length ? ` · ${excludedPeaks.length}개 수동 제외` : ""}</p>
            </div>
            <div className="filter-tabs" role="group" aria-label="피크 필터">
              {(["all", "main", "solvent", "impurity"] as const).map((kind) => (
                <button key={kind} className={filter === kind ? "active" : ""} onClick={() => setFilter(kind)}>
                  {kind === "all" ? "전체" : kind === "main" ? "메인" : kind === "solvent" ? "용매" : "잔류 수분"}
                </button>
              ))}
            </div>
          </div>
          {isCarbon && <p className="helper-text">¹³C 분석은 ppm과 신호 수를 사용합니다. 상대 면적·다중도는 확인용이며 탄소 수나 수소 수로 환산하지 않습니다.</p>}
          <div className="integration-reference">
            <div className="reference-copy">
              <span className="reference-icon">∫</span>
              <div><b>사용자 적분 기준</b><small>선택한 메인 피크에 직접 입력한 값을 적용해 전체 적분을 다시 계산합니다.</small></div>
            </div>
            <label>
              <span>기준 피크 선택</span>
              <select value={referencePeak?.id ?? ""} onChange={(event) => setReferencePeakId(Number(event.target.value))}>
                {mainPeaks.map((peak) => <option value={peak.id} key={peak.id}>{peak.ppm.toFixed(3)} ppm · {peak.multiplicity} ({peak.multiplicityName})</option>)}
              </select>
            </label>
            <label className="integral-input-label">
              <span>이 피크의 적분값</span>
              <div className={`number-field ${hasValidReferenceIntegral ? "" : "invalid"}`}>
                <input
                  type="number"
                  step="any"
                  inputMode="decimal"
                  placeholder="예: 1.00"
                  value={referenceIntegral}
                  onChange={(event) => setReferenceIntegral(event.target.value)}
                  aria-invalid={!hasValidReferenceIntegral}
                  aria-describedby="integral-input-help"
                />
                <b>{isCarbon ? "상대" : "H"}</b>
              </div>
              <small id="integral-input-help" className={hasValidReferenceIntegral ? "integral-input-help" : "integral-input-error"}>
                {hasValidReferenceIntegral ? "전체를 지운 뒤 새 값을 입력할 수 있습니다." : "0보다 큰 적분값을 입력하세요."}
              </small>
            </label>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>분류</th><th>δ / ppm</th><th>다중도</th><th>{isCarbon ? "상대 면적" : "보정 적분"}</th><th>예상 배정</th><th>신뢰도</th><th>사용자 조정</th></tr></thead>
              <tbody>
                {shownPeaks.map((peak) => {
                  const ratio = normalizedIntegral(peak);
                  return <tr key={peak.id} className={referencePeak?.id === peak.id ? "reference-row" : ""}>
                    <td><span className={`kind-badge ${peak.kind} ${peak.manual ? "manual" : ""}`}>{peak.manual ? "MANUAL" : peak.kind === "main" ? "MAIN" : peak.kind === "solvent" ? "SOLVENT" : "WATER"}</span></td>
                    <td><b className="mono">{peak.ppm.toFixed(3)}</b>{peak.selectedRange && <small>{peak.selectedRange[1].toFixed(3)}–{peak.selectedRange[0].toFixed(3)}</small>}</td>
                    <td>
                      <div className="select-wrap multiplicity-select-wrap">
                        <select
                          value={peak.multiplicity}
                          onChange={(event) => updateMultiplicity(peak.id, event.target.value as MultiplicityCode)}
                          aria-label={`${peak.ppm.toFixed(3)} ppm 피크의 다중도 수정`}
                        >
                          <optgroup label="기본 다중도">
                            {BASIC_MULTIPLICITY_OPTIONS.map((code) => (
                              <option key={code} value={code}>{code} · {MULTIPLICITY_NAMES[code]}</option>
                            ))}
                          </optgroup>
                          <optgroup label="복합 다중도">
                            {COMPOUND_MULTIPLICITY_OPTIONS.map((code) => (
                              <option key={code} value={code}>{code} · {MULTIPLICITY_NAMES[code]}</option>
                            ))}
                          </optgroup>
                        </select>
                      </div>
                      <small>{multiplicityOverrides[peak.id] ? "사용자 선택 · 확정" : peak.manual ? `구간 판정 · ${peak.lineCount}개 선 · 눌러서 변경` : `AI 판정 · ${peak.lineCount}개 선 · 눌러서 변경`}</small>
                    </td>
                    <td>
                      <span className={`integral ${peak.kind}`}><i style={{ width: `${hasValidReferenceIntegral ? Math.min(100, (ratio / Math.max(referenceIntegralValue, 1)) * 28) : 0}%` }} />{formatIntegral(ratio)}</span>
                      <small className={peak.kind === "impurity" ? "amount impurity" : "amount"}>{referencePeak?.id === peak.id ? (hasValidReferenceIntegral ? `기준 · ${referenceIntegralValue.toFixed(2)}${isCarbon ? " (상대)" : "H"}` : "기준 · 값 입력 필요") : amountLabel(peak)}</small>
                    </td>
                    <td><strong>{peak.assignment}</strong><small>{peak.reason}</small></td>
                    <td><span className="confidence"><i style={{ width: `${peak.confidence}%` }} /></span><b>{peak.confidence}%</b></td>
                    <td><button className="peak-remove" onClick={() => excludePeak(peak)} aria-label={`${peak.ppm.toFixed(3)} ppm 피크를 분석에서 제외`}>피크 제외</button></td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
          {excludedPeaks.length > 0 && (
            <div className="excluded-peaks" aria-label="수동 제외된 피크">
              <div><b>수동 제외 피크</b><small>그래프·적분·구조 예상에서 빠집니다. 잘못 제외했다면 복원하세요.</small></div>
              <div className="excluded-peak-list">
                {excludedPeaks.map((peak) => <button key={peak.id} onClick={() => restorePeak(peak.id)}>{peak.ppm.toFixed(3)} ppm <span>복원 ↺</span></button>)}
              </div>
            </div>
          )}
          <div className="table-footer">
            <p><span>AI</span> 기본·복합 다중도(s/d/t/q/quint/sext, dd/ddd/dddd/dt/td/dq/tt/tdd/dtd/ddt, m)를 선택하면 구조 후보와 문헌 검색에 즉시 반영됩니다.</p>
            <button onClick={exportCsv}>CSV 결과 저장 ↓</button>
          </div>
        </article>
      </section>

      <section className="structure-section">
        <article className="panel structure-panel wide">
          <div className="panel-heading compact">
            <div><p className="panel-kicker">STRUCTURE</p><h2>분자식·구조 예상</h2></div>
            <span className="status-chip structure-live">SCIFINDER + PUBMED + CHEMSPIDER</span>
          </div>
          <p className="structure-sync-note">분자식의 원자가·DBE를 먼저 만족시킨 뒤 ppm·확정 다중도·적분을 비교합니다. 방향족 신호가 분명할 때만 고리를 허용하고, 그 외에는 사슬의 분지점과 내부에 OH/OR/NH/C=O 작용기를 우선 배치합니다.</p>
          <div className="structure-controls">
            <div className="mass-input-card">
              <div className="mass-input-heading"><b>m/z로 분자식 탐색</b><span>정수 입력 가능</span></div>
              <label htmlFor="observed-mz">관측 m/z</label>
              <input id="observed-mz" type="number" min="0" step="any" inputMode="decimal" placeholder="예: 151 또는 151.0754" value={observedMz} onChange={(event) => { setObservedMz(event.target.value); setSelectedFormulaKey(""); }} />
              <label htmlFor="ion-mode">이온화 형태</label>
              <div className="select-wrap">
                <select id="ion-mode" value={ionMode} onChange={(event) => { setIonMode(event.target.value as IonMode); setSelectedFormulaKey(""); }}>
                  {(Object.entries(ION_MODES) as [IonMode, (typeof ION_MODES)[IonMode]][]).map(([key, mode]) => <option value={key} key={key}>{mode.label} · {mode.short}</option>)}
                </select>
              </div>
              {Number(observedMz) > 0 && <p>환산 중성 질량 <b>{(Number(observedMz) - ION_MODES[ionMode].delta).toFixed(4)} Da</b></p>}
            </div>
            {Number(observedMz) > 0 ? (
              <div className="formula-suggestion-panel">
                <div className="formula-suggestion-heading">
                  <div><b>합리적인 분자식 제안</b><small>{observedMz.includes(".") ? "입력한 소수점 정밀도" : "명목질량 모드 ±0.55 Da"} · CHON · 원자가/DBE/NMR 필터</small></div>
                  <span>{formulaSuggestions.length}개</span>
                </div>
                {formulaSuggestions.length ? (
                  <div className="formula-options" role="radiogroup" aria-label="분자식 제안">
                    {formulaSuggestions.map((suggestion) => (
                      <button
                        key={suggestion.formulaKey}
                        className={selectedFormulaKey === suggestion.formulaKey ? "selected" : ""}
                        onClick={() => setSelectedFormulaKey(suggestion.formulaKey)}
                        role="radio"
                        aria-checked={selectedFormulaKey === suggestion.formulaKey}
                      >
                        <span><strong><FormulaText formulaKey={suggestion.formulaKey} /></strong><b>{suggestion.score}%</b></span>
                        <small>DBE {suggestion.dbe.toFixed(0)} · Δ {suggestion.massError.toFixed(observedMz.includes(".") ? 4 : 2)} Da</small>
                        <em>{suggestion.rationale}</em>
                      </button>
                    ))}
                  </div>
                ) : <p className="formula-none">CHON 조합을 찾지 못했습니다. 이온화 형태와 m/z를 확인해 주세요.</p>}
              </div>
            ) : (
              <div className="formula-suggestion-panel formula-placeholder"><span>01</span><b>먼저 m/z를 입력하세요</b><p>질량과 현재 NMR 피크를 함께 사용해 가능한 분자식을 제안합니다.</p></div>
            )}
          </div>
          {selectedFormula && Number(observedMz) > 0 && (
            <section className="literature-evidence" aria-label="SciFinder, PubMed, ChemSpider 정밀 검색">
              <div className="literature-heading">
                <div><p className="panel-kicker">EVIDENCE</p><h3>SciFinder · PubMed · ChemSpider</h3></div>
                <span>3 SEARCHES</span>
              </div>
              <p className="literature-signature"><b><FormulaText formulaKey={selectedFormula.formulaKey} /></b><span>m/z {observedMz}</span><span>δ {nmrSignature || "피크 없음"} ppm</span></p>
              <div className="exact-search-query">
                <code>{exactSearchQuery}</code>
                <button onClick={() => {
                  void navigator.clipboard.writeText(exactSearchQuery).then(() => {
                    setSearchCopied(true);
                    window.setTimeout(() => setSearchCopied(false), 1600);
                  });
                }}>{searchCopied ? "복사됨 ✓" : "검색식 복사"}</button>
              </div>
              <p className="multiplicity-search-hint">검색식에는 예상 분자식·m/z·ppm만 넣습니다. 사용자가 선택한 s/d/dd/ddd/t/q/m은 문헌 검색어가 아니라 구조 후보의 NMR 비교 점수에 반영됩니다.</p>
              <div className="literature-search-grid" aria-label="문헌 검색 출처">
                {literatureSearchLinks.map((sourceItem) => (
                  <a href={sourceItem.url} target="_blank" rel="noreferrer" key={sourceItem.label}>
                    <strong>{sourceItem.label}</strong><small>{sourceItem.detail}</small><span>검색 열기 ↗</span>
                  </a>
                ))}
              </div>
            </section>
          )}
          {!candidates.length && (
            <div className={`structure-empty ${status === "loading" ? "loading" : ""}`}>
              <span>{status === "loading" ? "◌" : "∿"}</span>
              <b>{status === "loading" ? "새 NMR 데이터로 구조 후보를 교체하는 중입니다" : Number(observedMz) > 0 && formulaSuggestions.length ? "위에서 분자식을 선택해 주세요" : "구조를 예상할 정보가 부족합니다"}</b>
              <p>{status === "loading" ? "이전 예시 구조는 표시하지 않습니다." : Number(observedMz) > 0 && formulaSuggestions.length ? "선택한 분자식에 맞는 구조 가설과 NMR 배정이 열립니다." : "m/z를 입력하거나 제외한 피크를 복원해 주세요."}</p>
            </div>
          )}
          <div className="candidate-grid">
            {candidates.map((candidate, index) => (
              <div className={`candidate ${index === 0 ? "top" : ""}`} key={`${candidate.name}-${candidate.formulaKey}`}>
                <div className="candidate-rank">0{index + 1}</div>
                <div className="candidate-title"><div><strong>{candidate.name}</strong><span className="candidate-formula-line"><FormulaText formulaKey={candidate.formulaKey} /> · exact mass {candidate.exactMass.toFixed(4)}</span></div><div className="ai-score"><small>{selectedFormula && candidates.length > 1 ? "상대 가능성" : "AI 확신도"}</small><b>{candidate.score}%</b></div></div>
                <MolecularStructure type={candidate.structureType} formulaKey={candidate.formulaKey} dbePlan={candidate.dbePlan} />
                {candidate.dbePlan && (
                  <div className={`dbe-budget ${candidate.dbePlan.remaining === 0 ? "matched" : "review"}`}>
                    <b>{candidate.dbePlan.remaining === 0 ? "DBE 예산 일치" : "DBE 재검토"}</b>
                    <span>{candidate.dbePlan.label}</span>
                    <small>선택 분자식 DBE {candidate.dbePlan.total} 중 구조에 {candidate.dbePlan.consumed} 반영</small>
                  </div>
                )}
                {candidate.functionalGroups?.length ? <div className="functional-group-chips">{candidate.functionalGroups.map((group) => <span key={group}>{group}</span>)}</div> : null}
                <div className="candidate-nmr-compare">
                  <b>관측 NMR 값 비교</b>
                  {mainPeaks.slice(0, 4).map((peak) => {
                    const comparison = isCarbon ? compareCarbon(candidate, peak) : comparePeakToCandidate(candidate, peak);
                    return <span className={comparison.match ? "match" : "review"} key={peak.id}><strong>{peak.ppm.toFixed(3)} {peak.multiplicity}</strong><small>{comparison.label}</small></span>;
                  })}
                </div>
                <div className="candidate-score"><i style={{ width: `${candidate.score}%` }} /></div>
                {candidate.theoreticalMz !== undefined && <div className={`mass-match ${candidate.massError !== undefined && candidate.massError <= 0.22 ? "match" : "mismatch"}`}><span>예상 {ION_MODES[ionMode].short}</span><b>{candidate.theoreticalMz.toFixed(4)}</b><small>Δ {candidate.massError?.toFixed(4)} Da</small></div>}
                <p>{candidate.rationale}</p>
              </div>
            ))}
          </div>
          {selectedFormula && candidates.length > 0 && (
            <div className="nmr-assignment-panel">
              <div className="assignment-heading"><div><b>구조–NMR 예상 배정</b><small><FormulaText formulaKey={selectedFormula.formulaKey} /> 구조 가설 기준</small></div><span>{nucleus}</span></div>
              <div className="assignment-list">
                {mainPeaks.map((peak, index) => (
                  <div className="assignment-row" key={peak.id}>
                    <span className="assignment-index">{isCarbon ? "C" : "H"}{index + 1}</span>
                    <div><strong>{peak.ppm.toFixed(3)} ppm</strong><small>{peak.multiplicity} · {peak.multiplicityName} · 적분 {formatIntegral(normalizedIntegral(peak))}{isCarbon ? " (상대 면적)" : "H"}</small></div>
                    <p>{peak.assignment}</p>
                  </div>
                ))}
              </div>
              <p className="assignment-note">피크 번호는 결합 확정이 아닌 예상 배정입니다. COSY/HSQC/HMBC로 위치를 확인하세요.</p>
            </div>
          )}
          <div className="caution-box">
            <b>구조 확정 전 확인</b>
            <p>현재 근거: {evidenceLabel}. 후보 점수는 입력된 ¹H ppm·다중도·적분, ¹³C ppm·신호 수 및 m/z를 참고하는 규칙 기반 비교값이며 검증된 확률이 아닙니다. 합성 가능한 결합을 우선하되 입체화학과 정확한 결합 위치는 ¹³C, COSY, HSQC, HMBC 또는 표준물질로 검증하세요.</p>
          </div>
        </article>
      </section>

      <footer>
        <div><span className="brand-mark small"><i /><i /><i /></span><b>NMRaid</b><span>Research preview · 결과는 전문가 검토가 필요합니다.</span></div>
        <a className="footer-email" href="mailto:yjha970220@gmail.com">yjha970220@gmail.com</a>
        <a href="#top">맨 위로 ↑</a>
      </footer>
    </main>
  );
}

export default function Home() {
  return <PageErrorBoundary><NmrApp /></PageErrorBoundary>;
}
