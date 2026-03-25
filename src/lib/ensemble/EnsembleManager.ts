export type EvidenceKind = 'video' | 'image' | 'audio' | 'text' | 'unknown';

export type SpecialistKey = 'forensic' | 'biometric' | 'acoustic' | 'linguistic' | 'metadata' | 'other';

export type SpecialistVote = {
  key: SpecialistKey;
  label: string;
  // 0..100 where 0 = "real/safe", 100 = "fake/risky"
  fakeScore0to100: number;
  weight: number;
  applicable: boolean;
  notes?: string[];
};

export type EnsembleWeights = Record<SpecialistKey, number>;

export const DEFAULT_ENSEMBLE_WEIGHTS: EnsembleWeights = {
  biometric: 0.4,
  forensic: 0.3,
  metadata: 0.2,
  other: 0.1,
  acoustic: 0.1,
  linguistic: 0.1
};

export type EnsembleResult = {
  finalFakeScore0to100: number;
  votes: SpecialistVote[];
  normalizedWeightsSum: number;
};

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

function normalizeApplicableWeights(votes: SpecialistVote[]) {
  const sum = votes.reduce((acc, v) => acc + (v.applicable ? v.weight : 0), 0);
  if (!sum) return { sum: 0, factor: 0 };
  return { sum, factor: 1 / sum };
}

export function aggregateWeighted(votes: SpecialistVote[]): EnsembleResult {
  const { sum, factor } = normalizeApplicableWeights(votes);
  if (!sum) return { finalFakeScore0to100: 0, votes, normalizedWeightsSum: 0 };

  let score = 0;
  for (const v of votes) {
    if (!v.applicable) continue;
    score += clamp(v.fakeScore0to100, 0, 100) * v.weight * factor;
  }
  return { finalFakeScore0to100: clamp(score, 0, 100), votes, normalizedWeightsSum: sum };
}

export function formatEnsembleVotes(votes: SpecialistVote[]) {
  return votes
    .filter((v) => v.applicable)
    .map((v) => {
      const fake = clamp(v.fakeScore0to100, 0, 100);
      const real = clamp(100 - fake, 0, 100);
      return `${v.label}: ${fake.toFixed(0)}% Fake | ${real.toFixed(0)}% Real`;
    });
}

// ---------------- Specialists (pure, based on existing KRONOS signals) ----------------

export type ForensicInputs = {
  // Generic signals used in KRONOS image/video ROI forensic checks
  roiPerfectPts?: number; // 0 or 40
  roiNoiseMismatchPts?: number; // 0 or 20

  // Image-only forensic signals
  elaSynthetic?: boolean;
  frequencySynthetic?: boolean;
  textureSynthetic?: boolean;
  edgesSmoothedSynthetic?: boolean;
  localEditLikely?: boolean;
  vectorGraphicLike?: boolean;
  noiseMean?: number;
  noiseUniformity?: number;
  edgePerfectionScore?: number;
  edgeSharpnessMean?: number;
  renderSignatureScore?: number;
};

export function ForensicAnalyst(kind: EvidenceKind, input: ForensicInputs, weights: EnsembleWeights): SpecialistVote {
  const applicable = kind === 'image' || kind === 'video';
  if (!applicable) {
    return { key: 'forensic', label: 'Forensic', fakeScore0to100: 0, weight: weights.forensic, applicable: false };
  }

  let score = 0;

  // ROI contrast is a strong forgery proxy (already gated by face confidence upstream)
  score += Number(input.roiPerfectPts ?? 0);
  score += Number(input.roiNoiseMismatchPts ?? 0);

  // Image forensic stack (conservative, aligns with existing weighted points)
  if (kind === 'image') {
    if (input.localEditLikely) score += 25;
    if (input.vectorGraphicLike) score += 20;
    if (input.textureSynthetic) score += 18;
    if (input.elaSynthetic && input.frequencySynthetic) score += 22;

    // Signals from the “Grok/Flux” upgrades
    const nm = Number(input.noiseMean ?? 0);
    const nu = Number(input.noiseUniformity ?? 0);
    const ep = Number(input.edgePerfectionScore ?? 0);
    const es = Number(input.edgeSharpnessMean ?? 0);
    const rs = Number(input.renderSignatureScore ?? 0);

    if (nm > 0 && nm < 0.018 && nu > 0.72) score += 40;
    if (ep > 0.74 && es > 0.55 && nm < 0.025) score += 20;
    if (rs > 0.78 && nm < 0.022) score += 40;
  }

  return {
    key: 'forensic',
    label: 'Forensic',
    fakeScore0to100: clamp(score, 0, 100),
    weight: weights.forensic,
    applicable: true
  };
}

export type BiometricInputs = {
  blinkWarning?: boolean; // proxy; gated upstream by reliable face
  suspiciousJitter?: boolean;
  suspiciousLowConfidence?: boolean;
  maskJitterWarning?: boolean;
  reliableFaceFrames?: number;
};

export function BiometricAnalyst(kind: EvidenceKind, input: BiometricInputs, weights: EnsembleWeights): SpecialistVote {
  const applicable = kind === 'video';
  if (!applicable) {
    return { key: 'biometric', label: 'Biometrics', fakeScore0to100: 0, weight: weights.biometric, applicable: false };
  }

  let score = 0;
  // Requested weights: blink (+30), ROI handled by Forensic (+40/+20), others moderate
  if (input.blinkWarning) score += 30;
  if (input.maskJitterWarning) score += 20;
  if (input.suspiciousJitter) score += 15;
  if (input.suspiciousLowConfidence) score += 10;

  // If we barely had reliable face frames, downweight biometric output
  const rf = Number(input.reliableFaceFrames ?? 0);
  if (rf > 0 && rf < 10) score *= 0.6;

  return {
    key: 'biometric',
    label: 'Biometrics',
    fakeScore0to100: clamp(score, 0, 100),
    weight: weights.biometric,
    applicable: true
  };
}

export type AcousticInputs = {
  score0to100?: number;
};

export function AcousticAnalyst(kind: EvidenceKind, input: AcousticInputs, weights: EnsembleWeights): SpecialistVote {
  const applicable = kind === 'audio';
  return {
    key: 'acoustic',
    label: 'Acoustic',
    fakeScore0to100: clamp(Number(input.score0to100 ?? 0), 0, 100),
    weight: weights.acoustic,
    applicable
  };
}

export type LinguisticInputs = {
  score0to100?: number;
};

export function LinguisticAnalyst(kind: EvidenceKind, input: LinguisticInputs, weights: EnsembleWeights): SpecialistVote {
  const applicable = kind === 'text';
  return {
    key: 'linguistic',
    label: 'Linguistic',
    fakeScore0to100: clamp(Number(input.score0to100 ?? 0), 0, 100),
    weight: weights.linguistic,
    applicable
  };
}

export type MetadataInputs = {
  thirdParty?: boolean;
  originNoVerify?: boolean;
  missingCameraMeta?: boolean;
};

export function MetadataAnalyst(kind: EvidenceKind, input: MetadataInputs, weights: EnsembleWeights): SpecialistVote {
  const applicable = kind === 'video' || kind === 'image' || kind === 'audio';
  if (!applicable) {
    return { key: 'metadata', label: 'Metadata', fakeScore0to100: 0, weight: weights.metadata, applicable: false };
  }

  // Conservative: metadata should not dominate, but can contribute.
  let score = 0;
  if (input.thirdParty) score += 35;
  if (input.originNoVerify) score += 10;
  if (input.missingCameraMeta) score += 10;

  return {
    key: 'metadata',
    label: 'Metadata',
    fakeScore0to100: clamp(score, 0, 100),
    weight: weights.metadata,
    applicable: true
  };
}

export function OtherAnalyst(kind: EvidenceKind, weights: EnsembleWeights): SpecialistVote {
  // Placeholder for future “specialists” without affecting today’s behavior.
  return { key: 'other', label: 'Other', fakeScore0to100: 0, weight: weights.other, applicable: kind !== 'unknown' };
}

export class EnsembleManager {
  private weights: EnsembleWeights;
  constructor(weights?: Partial<EnsembleWeights>) {
    this.weights = { ...DEFAULT_ENSEMBLE_WEIGHTS, ...(weights ?? {}) };
  }

  evaluate(input: {
    kind: EvidenceKind;
    forensic?: ForensicInputs;
    biometric?: BiometricInputs;
    acoustic?: AcousticInputs;
    linguistic?: LinguisticInputs;
    metadata?: MetadataInputs;
  }): EnsembleResult {
    const kind = input.kind;
    const votes: SpecialistVote[] = [
      ForensicAnalyst(kind, input.forensic ?? {}, this.weights),
      BiometricAnalyst(kind, input.biometric ?? {}, this.weights),
      AcousticAnalyst(kind, input.acoustic ?? {}, this.weights),
      LinguisticAnalyst(kind, input.linguistic ?? {}, this.weights),
      MetadataAnalyst(kind, input.metadata ?? {}, this.weights),
      OtherAnalyst(kind, this.weights)
    ];
    return aggregateWeighted(votes);
  }
}

