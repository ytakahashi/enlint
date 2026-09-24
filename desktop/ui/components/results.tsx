import {
  isLowConfidence,
  type LintResult,
  METRIC_DEFINITIONS,
  TONE_DEFINITION,
  type ToneValue,
} from "#core/mod.ts";
import { errorMessage, STATUS_LABELS } from "../messages.ts";
import type { SessionController } from "../state/controller.ts";
import { type AdviceReport, isStale } from "../state/session.ts";
import { Candidate } from "./candidate.tsx";

const TONE_VALUES = Object.keys(TONE_DEFINITION.choices) as ToneValue[];

export function Results(
  { controller }: { readonly controller: SessionController },
) {
  const session = controller.session.value;
  const { check } = session;

  switch (check.phase) {
    case "idle":
      return (
        <section class="results">
          <p class="placeholder">The score and issues appear here.</p>
        </section>
      );
    case "linting":
      return (
        <section class="results">
          <p class="pending">Evaluating…</p>
        </section>
      );
    case "failed":
      return (
        <section class="results">
          <p class="error">{errorMessage(check.error)}</p>
        </section>
      );
  }

  const stale = isStale(session);
  const advice = check.phase === "done" ? check.advice : undefined;
  return (
    <section class={stale ? "results stale" : "results"}>
      {stale && (
        <p class="notice">
          The text or context has changed since this check. Check again to
          update the result.
        </p>
      )}
      <Summary result={check.result} />
      <Metrics result={check.result} />
      <Tone result={check.result} />
      <Issues result={check.result} advice={advice} />
      {check.phase === "advising"
        ? <p class="pending">Generating advice…</p>
        : (
          <Advice
            controller={controller}
            result={check.result}
            advice={advice}
            stale={stale}
          />
        )}
    </section>
  );
}

function Summary({ result }: { readonly result: LintResult }) {
  return (
    <div class="score">
      <span class="value">{result.overallScore}</span>
      <span class={`badge ${result.status}`}>
        {STATUS_LABELS[result.status]}
      </span>
    </div>
  );
}

function Metrics({ result }: { readonly result: LintResult }) {
  return (
    <>
      <h2>Metrics</h2>
      {METRIC_DEFINITIONS.map(({ id, label }) => {
        const metric = result.metrics.find((candidate) => candidate.id === id);
        if (metric === undefined) return null;
        return (
          <div key={id} class="metric">
            <span>{label}</span>
            <span class="bar">
              <span style={{ width: `${metric.score}%` }} />
            </span>
            <span class="number">{metric.score}</span>
            <LowConfidence confidence={metric.confidence} />
          </div>
        );
      })}
    </>
  );
}

function Tone({ result }: { readonly result: LintResult }) {
  const tone = result.classifications.find(({ id }) => id === "tone");
  if (tone === undefined) return null;
  const probabilities = tone.probabilities;
  return (
    <>
      <h2>Tone</h2>
      <div>
        {tone.value} <LowConfidence confidence={tone.confidence} />
      </div>
      {probabilities !== undefined && (
        <details>
          <summary>Distribution</summary>
          <ul>
            {TONE_VALUES.map((value) => (
              <li key={value}>
                {value}: {Math.round(probabilities[value] * 100)}%
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

function Issues(
  { result, advice }: {
    readonly result: LintResult;
    readonly advice: AdviceReport | undefined;
  },
) {
  const explanations = new Map(
    advice !== undefined && "outcome" in advice
      ? advice.outcome.explanations.map((
        { issueIndex, explanation },
      ) => [issueIndex, explanation])
      : [],
  );
  return (
    <>
      <h2>Issues</h2>
      {result.issues.length === 0 ? <p class="placeholder">None</p> : (
        <ul>
          {result.issues.map((issue, index) => (
            <li key={index}>
              <span class={`severity ${issue.severity}`}>
                {issue.severity}
              </span>{" "}
              {issue.category}: {issue.detail}
              {explanations.has(index) && (
                <div class="explanation">{explanations.get(index)}</div>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Advice(
  { controller, result, advice, stale }: {
    readonly controller: SessionController;
    readonly result: LintResult;
    readonly advice: AdviceReport | undefined;
    readonly stale: boolean;
  },
) {
  if (advice === undefined) return null;
  if ("error" in advice) {
    return <p class="error">{errorMessage(advice.error)}</p>;
  }
  if (advice.kind === "explain") return null;

  const { candidates } = advice.outcome;
  return (
    <>
      <h2>Suggestions</h2>
      {candidates.length === 0
        ? <p class="placeholder">No rewrite suggested.</p>
        : candidates.map((candidate, index) => (
          <Candidate
            key={index}
            controller={controller}
            original={result.text}
            candidate={candidate}
            stale={stale}
          />
        ))}
    </>
  );
}

function LowConfidence(
  { confidence }: { readonly confidence: number | undefined },
) {
  return isLowConfidence(confidence)
    ? (
      <span
        class="low-confidence"
        title="The evaluator's judgement was split; treat this value with care."
      >
        ⚠
      </span>
    )
    : <span />;
}
