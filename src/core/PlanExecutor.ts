/**
 * AI Agent Assistant (AiAgentAssistant)
 * Plan Executor — DAG-aware parallel step execution with judge + refinement
 *
 * Executes a plan whose steps carry explicit `dependsOn` edges.
 * Steps with no unsatisfied dependencies fire in parallel; dependent steps
 * wait. After each step completes the optional judge evaluates the output —
 * if the judge rejects it the step is re-run with feedback up to
 * `maxRefinements` times before being marked done anyway.
 *
 * @author Jose Rodriguez Arroyo
 * @email jrpcone@gmail.com
 * @github https://github.com/jorodriguezpr/
 */

import logger from '../utils/logger';

// ─── Types ───────────────────────────────────────────────────────────────────

export type StepStatus = 'pending' | 'running' | 'done' | 'failed';

export interface PlanStep {
  id: string;
  description: string;
  /** IDs of steps that must complete before this one can start */
  dependsOn: string[];
  status: StepStatus;
  result?: string;
  error?: string;
  /** How many refinement passes were needed (0 = judge approved first time) */
  refinements?: number;
}

export interface DagPlan {
  steps: PlanStep[];
  risks: string[];
}

export interface JudgeResult {
  ok: boolean;
  issues: string[];
  suggestions: string;
}

/**
 * Called to execute a step. Receives dep results and optional refinement
 * feedback from a previous failed judge pass.
 */
export type StepRunner = (
  step: PlanStep,
  depResults: Record<string, string>,
  refinementFeedback?: string
) => Promise<string>;

/**
 * Called after a step completes to verify its output.
 * Returns JudgeResult — if ok is false the executor retries the step.
 */
export type JudgeRunner = (
  step: PlanStep,
  stepOutput: string
) => Promise<JudgeResult>;

export interface DagExecutionOptions {
  onProgress?: (step: PlanStep) => void;
  /** If provided, each completed step is evaluated. Rejected steps are retried. */
  judgeRunner?: JudgeRunner;
  /** Max refinement passes per step when judge rejects. Default: 1 */
  maxRefinements?: number;
  /**
   * Predicate to decide whether a given step should be judged.
   * Default: always judge (return true for every step).
   */
  shouldJudge?: (step: PlanStep) => boolean;
}

// ─── DAG executor ────────────────────────────────────────────────────────────

/**
 * Execute a DAG plan.
 * Repeatedly finds steps whose dependencies are all `done` and fires them in
 * parallel. Returns a map of stepId → final result string.
 */
export async function executeDagPlan(
  plan: DagPlan,
  runner: StepRunner,
  options: DagExecutionOptions = {}
): Promise<Record<string, string>> {
  const { onProgress, judgeRunner, maxRefinements = 1, shouldJudge = () => true } = options;
  const results: Record<string, string> = {};

  while (true) {
    // Cascade failures — steps whose deps failed can never run
    for (const step of plan.steps.filter(s => s.status === 'pending')) {
      const hasFailedDep = step.dependsOn.some(
        depId => plan.steps.find(x => x.id === depId)?.status === 'failed'
      );
      if (hasFailedDep) {
        step.status = 'failed';
        step.error = 'Skipped — a required earlier step failed';
        onProgress?.(step);
      }
    }

    // Find all steps whose dependencies are all done
    const ready = plan.steps.filter(
      s =>
        s.status === 'pending' &&
        s.dependsOn.every(depId => plan.steps.find(x => x.id === depId)?.status === 'done')
    );

    if (ready.length === 0) break; // all done, all failed, or deadlock

    logger.info(
      { readyCount: ready.length, stepIds: ready.map(s => s.id) },
      '📋 DAG: firing parallel batch'
    );

    await Promise.allSettled(
      ready.map(async step => {
        step.status = 'running';
        step.refinements = 0;
        onProgress?.(step);

        try {
          // Initial execution
          let output = await runner(step, { ...results });

          // ── Verify + Refine ──────────────────────────────────────────────
          if (judgeRunner && shouldJudge(step)) {
            let passesLeft = maxRefinements;
            while (passesLeft > 0) {
              const judgment = await judgeRunner(step, output);

              if (judgment.ok) {
                logger.debug({ stepId: step.id }, '⚖️ Judge approved step output');
                break;
              }

              passesLeft--;
              step.refinements = (step.refinements ?? 0) + 1;
              logger.info(
                { stepId: step.id, passesLeft, issues: judgment.issues },
                '⚖️ Judge rejected — refining step'
              );

              output = await runner(step, { ...results }, judgment.suggestions || judgment.issues.join('; '));

              // If no passes left, accept the refined output regardless
              if (passesLeft === 0) {
                logger.info({ stepId: step.id }, '⚖️ Max refinements reached — accepting latest output');
              }
            }
          }

          step.result = output;
          step.status = 'done';
          results[step.id] = output;
        } catch (err: any) {
          step.status = 'failed';
          step.error = String(err?.message ?? err);
          logger.warn({ stepId: step.id, error: step.error }, '📋 DAG: step failed');
        }

        onProgress?.(step);
      })
    );
  }

  return results;
}

// ─── Plan validation ─────────────────────────────────────────────────────────

/**
 * Validate a DAG plan for correctness.
 * Checks for unknown dependency references and circular dependencies.
 * Returns an error message string, or null if the plan is valid.
 */
export function validatePlanDag(steps: PlanStep[]): string | null {
  const ids = new Set(steps.map(s => s.id));

  for (const step of steps) {
    for (const dep of step.dependsOn) {
      if (!ids.has(dep)) {
        return `Step "${step.id}" references unknown step "${dep}"`;
      }
    }
  }

  // DFS cycle detection
  const visited = new Set<string>();
  const inStack = new Set<string>();

  const hasCycle = (id: string): boolean => {
    if (inStack.has(id)) return true;
    if (visited.has(id)) return false;
    visited.add(id);
    inStack.add(id);
    const step = steps.find(s => s.id === id);
    for (const dep of step?.dependsOn ?? []) {
      if (hasCycle(dep)) return true;
    }
    inStack.delete(id);
    return false;
  };

  for (const step of steps) {
    if (hasCycle(step.id)) {
      return `Circular dependency detected at step "${step.id}"`;
    }
  }

  return null;
}
