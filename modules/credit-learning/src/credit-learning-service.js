import {
  CreditEventType,
  CreditLearningCycleType,
  CreditLearningSignalType,
  RiskTier,
  createBehavioralMetric,
  createCreditEvent,
  createCreditLearningEvent,
  createCreditLimitRecommendation,
  createCreditProfile,
  createInterestRateRecommendation,
  createReputationSignal,
  demoInterestRateForTier,
  tierForScore
} from "../../../packages/domain/src/index.js";
import { DomainError } from "../../../packages/domain/src/index.js";

const SIGNAL_RULES = Object.freeze({
  [CreditLearningSignalType.ON_TIME_REPAYMENT]: {
    delta: 25,
    reasonCode: "on_time_repayment",
    label: "On-time repayment improved repayment reliability."
  },
  [CreditLearningSignalType.FULL_REPAYMENT]: {
    delta: 20,
    reasonCode: "full_repayment",
    label: "Full repayment closed outstanding obligation."
  },
  [CreditLearningSignalType.HIGH_REVENUE_CAPTURE]: {
    delta: 15,
    reasonCode: "high_revenue_capture",
    label: "Captured revenue exceeded the demo threshold."
  },
  [CreditLearningSignalType.LOW_UTILIZATION]: {
    delta: 10,
    reasonCode: "low_utilization",
    label: "Utilization stayed inside conservative bounds."
  },
  [CreditLearningSignalType.HEALTHY_REPEAT_CYCLE]: {
    delta: 15,
    reasonCode: "healthy_repeat_cycle",
    label: "Repeated healthy cycle supports controlled improvement."
  },
  [CreditLearningSignalType.LATE_REPAYMENT]: {
    delta: -40,
    reasonCode: "late_repayment",
    label: "Late repayment weakens the next-cycle policy."
  },
  [CreditLearningSignalType.REJECTED_RISKY_SPEND]: {
    delta: -15,
    reasonCode: "rejected_risky_spend",
    label: "Risky or non-allowlisted spend was rejected."
  },
  [CreditLearningSignalType.HIGH_UTILIZATION]: {
    delta: -20,
    reasonCode: "high_utilization",
    label: "High utilization increases repayment stress."
  },
  [CreditLearningSignalType.DEFAULT_EVENT]: {
    delta: -120,
    reasonCode: "default_event",
    label: "Default event requires major credit restriction."
  },
  [CreditLearningSignalType.ADMIN_FREEZE]: {
    delta: -80,
    reasonCode: "admin_freeze",
    label: "Admin freeze reduces available credit until reviewed."
  }
});

function clampScore(score) {
  return Math.max(300, Math.min(850, score));
}

function recommendationForTier(riskTier, currentLimitMinor) {
  const current = BigInt(currentLimitMinor ?? "0");
  if (riskTier === RiskTier.PRIME) return { nextLimit: ((current * 150n) / 100n).toString(), reasonCode: "prime_increase_50pct" };
  if (riskTier === RiskTier.STRONG) return { nextLimit: ((current * 125n) / 100n).toString(), reasonCode: "strong_increase_25pct" };
  if (riskTier === RiskTier.STANDARD) return { nextLimit: ((current * 110n) / 100n).toString(), reasonCode: "standard_controlled_increase_10pct" };
  if (riskTier === RiskTier.WATCH) return { nextLimit: ((current * 80n) / 100n).toString(), reasonCode: "watch_reduce_20pct" };
  return { nextLimit: "0", reasonCode: "restricted_freeze_new_credit" };
}

export class CreditLearningService {
  constructor({ eventStore }) {
    this.eventStore = eventStore;
    this.profiles = new Map();
    this.signals = new Map();
    this.metrics = new Map();
    this.limitRecommendations = new Map();
    this.interestRateRecommendations = new Map();
    this.learningEvents = new Map();
  }

  createProfile({ subjectId, initialScore = 500, currentCreditLimitMinor = "0" }) {
    if (this.profiles.has(subjectId)) return this.getProfile(subjectId);
    const profile = createCreditProfile({ subjectId, initialScore, currentCreditLimitMinor });
    this.profiles.set(subjectId, profile);
    this.eventStore.appendCreditEvent(
      createCreditEvent({
        eventType: CreditEventType.CREDIT_PROFILE_CREATED,
        subjectId,
        payload: {
          creditProfileId: profile.creditProfileId,
          currentScore: profile.currentScore,
          riskTier: profile.riskTier
        }
      })
    );
    return structuredClone(profile);
  }

  evaluate({
    subjectId,
    signals = [],
    currentCreditLimitMinor,
    currentDemoInterestRateBps,
    repaymentPerformanceBps = 0,
    utilizationBehaviorBps = 0,
    revenueConsistencyBps = 0,
    cycleType = CreditLearningCycleType.MANUAL,
    relatedEventId
  }) {
    const profile = this.#requireOrCreateProfile(subjectId, currentCreditLimitMinor);
    const normalizedSignals = signals.length > 0 ? signals : [CreditLearningSignalType.LOW_UTILIZATION];
    const previousTier = profile.riskTier;
    const createdSignals = [];

    for (const signalType of normalizedSignals) {
      const rule = SIGNAL_RULES[signalType];
      if (!rule) {
        throw new DomainError("unknown_reputation_signal", "credit learning signal is not configured", { signalType });
      }
      const previousScore = profile.currentScore;
      const newScore = clampScore(previousScore + rule.delta);
      profile.currentScore = newScore;
      profile.riskTier = tierForScore(newScore);

      const signal = createReputationSignal({
        subjectId,
        signalType,
        scoreDelta: rule.delta,
        previousScore,
        newScore,
        reasonCode: rule.reasonCode,
        relatedEventId,
        cycleType
      });
      this.signals.set(signal.reputationSignalId, signal);
      profile.recentSignalIds.unshift(signal.reputationSignalId);
      profile.recentSignalIds = profile.recentSignalIds.slice(0, 12);
      profile.scoreHistory.push({
        score: newScore,
        riskTier: profile.riskTier,
        reasonCode: rule.reasonCode,
        signalType,
        occurredAt: signal.occurredAt
      });
      createdSignals.push(signal);

      this.eventStore.appendCreditEvent(
        createCreditEvent({
          eventType: CreditEventType.REPUTATION_SIGNAL_RECORDED,
          subjectId,
          payload: { ...signal, label: rule.label }
        })
      );
      this.eventStore.appendCreditEvent(
        createCreditEvent({
          eventType: CreditEventType.CREDIT_SCORE_UPDATED,
          subjectId,
          payload: {
            signalType,
            scoreDelta: rule.delta,
            previousScore,
            newScore,
            reasonCode: rule.reasonCode,
            relatedEventId
          }
        })
      );
    }

    profile.currentCreditLimitMinor = currentCreditLimitMinor ?? profile.currentCreditLimitMinor;
    profile.currentDemoInterestRateBps = currentDemoInterestRateBps ?? profile.currentDemoInterestRateBps;
    profile.repaymentPerformanceBps = repaymentPerformanceBps;
    profile.utilizationBehaviorBps = utilizationBehaviorBps;
    profile.revenueConsistencyBps = revenueConsistencyBps;
    profile.updatedAt = new Date().toISOString();

    const repaymentMetric = createBehavioralMetric({
      subjectId,
      metricType: "repayment_performance",
      value: repaymentPerformanceBps,
      cycleType
    });
    const utilizationMetric = createBehavioralMetric({
      subjectId,
      metricType: "utilization_behavior",
      value: utilizationBehaviorBps,
      cycleType
    });
    const revenueMetric = createBehavioralMetric({
      subjectId,
      metricType: "revenue_consistency",
      value: revenueConsistencyBps,
      cycleType
    });
    for (const metric of [repaymentMetric, utilizationMetric, revenueMetric]) {
      this.metrics.set(metric.behavioralMetricId, metric);
    }

    if (previousTier !== profile.riskTier) {
      this.eventStore.appendCreditEvent(
        createCreditEvent({
          eventType: CreditEventType.RISK_TIER_UPDATED,
          subjectId,
          payload: { previousTier, newTier: profile.riskTier, score: profile.currentScore }
        })
      );
    }

    const limitPlan = recommendationForTier(profile.riskTier, profile.currentCreditLimitMinor);
    const limitRecommendation = createCreditLimitRecommendation({
      subjectId,
      riskTier: profile.riskTier,
      currentLimitMinor: profile.currentCreditLimitMinor,
      recommendedLimitMinor: limitPlan.nextLimit,
      reasonCode: limitPlan.reasonCode
    });
    this.limitRecommendations.set(limitRecommendation.creditLimitRecommendationId, limitRecommendation);
    profile.recommendedNextCreditLimitMinor = limitRecommendation.recommendedLimitMinor;
    this.eventStore.appendCreditEvent(
      createCreditEvent({
        eventType: CreditEventType.CREDIT_LIMIT_RECOMMENDED,
        subjectId,
        payload: limitRecommendation
      })
    );

    const recommendedRate = demoInterestRateForTier(profile.riskTier);
    const interestRateRecommendation = createInterestRateRecommendation({
      subjectId,
      riskTier: profile.riskTier,
      currentDemoInterestRateBps: profile.currentDemoInterestRateBps,
      recommendedDemoInterestRateBps: recommendedRate,
      reasonCode: `${profile.riskTier}_demo_rate`
    });
    this.interestRateRecommendations.set(
      interestRateRecommendation.interestRateRecommendationId,
      interestRateRecommendation
    );
    profile.recommendedDemoInterestRateBps = recommendedRate;
    this.eventStore.appendCreditEvent(
      createCreditEvent({
        eventType: CreditEventType.INTEREST_RATE_RECOMMENDED,
        subjectId,
        payload: interestRateRecommendation
      })
    );

    const learningEvent = createCreditLearningEvent({
      subjectId,
      cycleType,
      score: profile.currentScore,
      riskTier: profile.riskTier,
      signalIds: createdSignals.map((signal) => signal.reputationSignalId),
      reasonCodes: createdSignals.map((signal) => signal.reasonCode)
    });
    this.learningEvents.set(learningEvent.creditLearningEventId, learningEvent);
    this.eventStore.appendCreditEvent(
      createCreditEvent({
        eventType: CreditEventType.CREDIT_LEARNING_CYCLE_COMPLETED,
        subjectId,
        payload: learningEvent
      })
    );

    return {
      profile: this.getProfile(subjectId),
      signals: createdSignals.map((signal) => structuredClone(signal)),
      metrics: [repaymentMetric, utilizationMetric, revenueMetric].map((metric) => structuredClone(metric)),
      limitRecommendation: structuredClone(limitRecommendation),
      interestRateRecommendation: structuredClone(interestRateRecommendation),
      learningEvent: structuredClone(learningEvent)
    };
  }

  runHealthyCycle(subjectId, context = {}) {
    return this.evaluate({
      subjectId,
      cycleType: CreditLearningCycleType.HEALTHY,
      signals: [
        CreditLearningSignalType.ON_TIME_REPAYMENT,
        CreditLearningSignalType.FULL_REPAYMENT,
        CreditLearningSignalType.HIGH_REVENUE_CAPTURE,
        CreditLearningSignalType.LOW_UTILIZATION,
        CreditLearningSignalType.HEALTHY_REPEAT_CYCLE
      ],
      repaymentPerformanceBps: 10000,
      utilizationBehaviorBps: 3500,
      revenueConsistencyBps: 9500,
      ...context
    });
  }

  runRiskyCycle(subjectId, context = {}) {
    return this.evaluate({
      subjectId,
      cycleType: CreditLearningCycleType.RISKY,
      signals: [
        CreditLearningSignalType.LATE_REPAYMENT,
        CreditLearningSignalType.REJECTED_RISKY_SPEND,
        CreditLearningSignalType.HIGH_UTILIZATION
      ],
      repaymentPerformanceBps: 4200,
      utilizationBehaviorBps: 9400,
      revenueConsistencyBps: 6000,
      ...context
    });
  }

  runRecoveryCycle(subjectId, context = {}) {
    return this.evaluate({
      subjectId,
      cycleType: CreditLearningCycleType.RECOVERY,
      signals: [
        CreditLearningSignalType.ON_TIME_REPAYMENT,
        CreditLearningSignalType.HIGH_REVENUE_CAPTURE,
        CreditLearningSignalType.LOW_UTILIZATION
      ],
      repaymentPerformanceBps: 8800,
      utilizationBehaviorBps: 5000,
      revenueConsistencyBps: 8400,
      ...context
    });
  }

  getProfile(subjectId) {
    const profile = this.profiles.get(subjectId);
    if (!profile) throw new DomainError("credit_profile_not_found", "credit profile not found", { subjectId });
    const recentSignals = profile.recentSignalIds
      .map((signalId) => this.signals.get(signalId))
      .filter(Boolean)
      .map((signal) => structuredClone(signal));
    return { ...structuredClone(profile), recentSignals };
  }

  #requireOrCreateProfile(subjectId, currentCreditLimitMinor = "0") {
    if (!this.profiles.has(subjectId)) {
      return this.createProfile({ subjectId, currentCreditLimitMinor });
    }
    return this.profiles.get(subjectId);
  }
}

export { CreditLearningSignalType, RiskTier };
