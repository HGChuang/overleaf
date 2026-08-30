import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { V3_EXECUTABLE_CASES } from "../executable/index.js";
import type { V3ExecutableCase } from "../executable/types.js";
import { BENCHMARK_V3_CANDIDATE_SEEDS } from "../candidateSeeds.js";

/**
 * Deterministic lineage/leakage audit for the materialized v3 benchmark.
 *
 * This intentionally does not treat a shared LaTeX document wrapper as a
 * duplicated fixture.  Exact workspace hashes, case/family/candidate identity,
 * meaningful file bodies, and prompt similarity are reported separately so a
 * reviewer can distinguish boilerplate reuse from data leakage.
 */

const BENCHMARK_ID = "overleaf-agent-benchmark-v3";
const REPORT_PATH = new URL("./lineage-audit.json", import.meta.url);
const PROMPT_REVIEW_THRESHOLD = 0.72;
const FIXTURE_REVIEW_THRESHOLD = 0.72;
const NGRAM_SIZE = 2;

type CaseId = string;

interface Group<T> {
  key: string;
  items: T[];
}

interface SimilarityPair {
  left_case_id: CaseId;
  right_case_id: CaseId;
  similarity: number;
  disposition: "review" | "boilerplate-only" | "below-threshold";
}

interface SharedFileGroup {
  content_sha256: string;
  occurrences: Array<{
    case_id: CaseId;
    file: string;
  }>;
  disposition: "review" | "shared-latex-boilerplate";
  reason: string;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalWorkspace(caseDefinition: V3ExecutableCase): string {
  return JSON.stringify(
    caseDefinition.fixture.files
      .map(({ path, content }) => ({ path, content }))
      .sort((left, right) => left.path.localeCompare(right.path)),
  );
}

function exactKey(value: string): string {
  return value.replace(/\r\n?/g, "\n");
}

function normalizePrompt(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/[“”"'‘’`]/g, "")
    .replace(/[，。！？、；：,.!?;:()（）【】\[\]《》<>\-—]/g, "")
    .replace(/\s+/g, "")
    .trim();
}

function promptFeatures(value: string): Set<string> {
  const normalized = normalizePrompt(value);
  const features = new Set<string>();
  for (let index = 0; index < normalized.length - NGRAM_SIZE + 1; index += 1) {
    features.add(normalized.slice(index, index + NGRAM_SIZE));
  }
  return features;
}

function jaccard(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 && right.size === 0) return 1;
  let intersection = 0;
  for (const item of left) if (right.has(item)) intersection += 1;
  return intersection / (left.size + right.size - intersection);
}

/** Remove document scaffolding before measuring fixture content similarity. */
function meaningfulTex(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/%.*$/gm, "")
    .replace(/\\documentclass(?:\[[^\]]*\])?\{[^}]*\}/g, "")
    .replace(/\\usepackage(?:\[[^\]]*\])?\{[^}]*\}/g, "")
    .replace(/\\(?:begin|end)\{document\}/g, "")
    .replace(/\\(?:title|author|date)\{[^}]*\}/g, "")
    .replace(/\s+/g, "")
    .trim();
}

function texBodyNgrams(value: string): Set<string> {
  const normalized = meaningfulTex(value);
  const features = new Set<string>();
  for (let index = 0; index < normalized.length - NGRAM_SIZE + 1; index += 1) {
    features.add(normalized.slice(index, index + NGRAM_SIZE));
  }
  return features;
}

function groupBy<T>(items: T[], keyFn: (item: T) => string): Group<T>[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const group = groups.get(key) || [];
    group.push(item);
    groups.set(key, group);
  }
  return [...groups.entries()]
    .filter(([, group]) => group.length > 1)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, itemsInGroup]) => ({ key, items: itemsInGroup }));
}

function rounded(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function caseIds(cases: V3ExecutableCase[]): CaseId[] {
  return cases.map((item) => item.case_id).sort();
}

function collectPromptPairs(
  cases: V3ExecutableCase[],
  threshold = PROMPT_REVIEW_THRESHOLD,
): SimilarityPair[] {
  const pairs: SimilarityPair[] = [];
  const features = new Map(
    cases.map((item) => [
      item.case_id,
      promptFeatures(item.user_goal.public_brief),
    ]),
  );
  for (let leftIndex = 0; leftIndex < cases.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < cases.length;
      rightIndex += 1
    ) {
      const left = cases[leftIndex];
      const right = cases[rightIndex];
      const similarity = jaccard(
        features.get(left.case_id)!,
        features.get(right.case_id)!,
      );
      if (similarity >= threshold) {
        pairs.push({
          left_case_id: left.case_id,
          right_case_id: right.case_id,
          similarity: rounded(similarity),
          disposition:
            similarity >= PROMPT_REVIEW_THRESHOLD
              ? "review"
              : "below-threshold",
        });
      }
    }
  }
  return pairs.sort(
    (left, right) =>
      right.similarity - left.similarity ||
      `${left.left_case_id}:${left.right_case_id}`.localeCompare(
        `${right.left_case_id}:${right.right_case_id}`,
      ),
  );
}

function collectFixturePairs(
  cases: V3ExecutableCase[],
  threshold = FIXTURE_REVIEW_THRESHOLD,
): SimilarityPair[] {
  const bodies = new Map(
    cases.map((item) => [
      item.case_id,
      new Set(
        item.fixture.files.flatMap((file) => [...texBodyNgrams(file.content)]),
      ),
    ]),
  );
  const pairs: SimilarityPair[] = [];
  for (let leftIndex = 0; leftIndex < cases.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < cases.length;
      rightIndex += 1
    ) {
      const left = cases[leftIndex];
      const right = cases[rightIndex];
      const similarity = jaccard(
        bodies.get(left.case_id)!,
        bodies.get(right.case_id)!,
      );
      if (similarity >= threshold) {
        const meaningfulLength = Math.min(
          left.fixture.files.reduce(
            (sum, file) => sum + meaningfulTex(file.content).length,
            0,
          ),
          right.fixture.files.reduce(
            (sum, file) => sum + meaningfulTex(file.content).length,
            0,
          ),
        );
        pairs.push({
          left_case_id: left.case_id,
          right_case_id: right.case_id,
          similarity: rounded(similarity),
          disposition:
            similarity < FIXTURE_REVIEW_THRESHOLD
              ? "below-threshold"
              : meaningfulLength <= 180
                ? "boilerplate-only"
                : "review",
        });
      }
    }
  }
  return pairs.sort(
    (left, right) =>
      right.similarity - left.similarity ||
      `${left.left_case_id}:${left.right_case_id}`.localeCompare(
        `${right.left_case_id}:${right.right_case_id}`,
      ),
  );
}

function buildSharedFileGroups(cases: V3ExecutableCase[]): SharedFileGroup[] {
  const occurrences = cases.flatMap((item) =>
    item.fixture.files.map((file) => ({
      case_id: item.case_id,
      file: file.path,
      content_sha256: sha256(exactKey(file.content)),
      meaningful_length: meaningfulTex(file.content).length,
    })),
  );
  return groupBy(occurrences, (item) => item.content_sha256).map((group) => {
    const meaningfulLength = Math.min(
      ...group.items.map((item) => item.meaningful_length),
    );
    const boilerplateOnly = meaningfulLength <= 180;
    return {
      content_sha256: group.key,
      occurrences: group.items
        .map(({ case_id, file }) => ({ case_id, file }))
        .sort((left, right) =>
          `${left.case_id}:${left.file}`.localeCompare(
            `${right.case_id}:${right.file}`,
          ),
        ),
      disposition: boilerplateOnly ? "shared-latex-boilerplate" : "review",
      reason: boilerplateOnly
        ? "内容去除 LaTeX 文档外壳后不超过 180 个字符，视为可接受的共享 boilerplate；不单独判定为数据泄漏。"
        : "跨 case 复用了有实质内容的完全相同文件，应人工确认是否为 fixture 泄漏。",
    };
  });
}

// Iteration 14 explicitly audits the frozen first-two-tranche 64-case corpus.
// Supplemental non-edit cases have their own source/validation gates and must
// not silently change the historical audit scope.
const cases = V3_EXECUTABLE_CASES.filter(
  (item) => !item.source_candidate_id.startsWith("v3.nonedit."),
).sort((left, right) => left.case_id.localeCompare(right.case_id));
const promptExactGroups = groupBy(cases, (item) =>
  normalizePrompt(item.user_goal.public_brief),
).map((group) => ({
  normalized_prompt: group.key,
  case_ids: caseIds(group.items),
}));
const fixtureExactGroups = groupBy(cases, (item) =>
  sha256(canonicalWorkspace(item)),
).map((group) => ({
  workspace_sha256: group.key,
  case_ids: caseIds(group.items),
}));
const caseIdGroups = groupBy(cases, (item) => item.case_id).map((group) => ({
  key: group.key,
  case_ids: caseIds(group.items),
}));
const familyGroups = groupBy(cases, (item) => item.case_family_id).map(
  (group) => ({ key: group.key, case_ids: caseIds(group.items) }),
);
const candidateGroups = groupBy(cases, (item) => item.source_candidate_id).map(
  (group) => ({ key: group.key, case_ids: caseIds(group.items) }),
);
const fixtureIdGroups = groupBy(cases, (item) => item.fixture.fixture_id).map(
  (group) => ({ key: group.key, case_ids: caseIds(group.items) }),
);
const fixtureLineageGroups = groupBy(
  cases,
  (item) => item.fixture.fixture_lineage,
).map((group) => ({ key: group.key, case_ids: caseIds(group.items) }));
const crossSplitCandidateGroups = groupBy(
  cases,
  (item) => item.source_candidate_id,
)
  .map((group) => ({
    source_candidate_id: group.key,
    splits: [...new Set(group.items.map((item) => item.split))].sort(),
    case_ids: caseIds(group.items),
  }))
  .filter((group) => group.splits.length > 1);
const knownCandidates = new Map(
  BENCHMARK_V3_CANDIDATE_SEEDS.map((candidate) => [
    candidate.candidate_id,
    candidate,
  ]),
);
const missingCandidateLinks = cases
  .filter((item) => !knownCandidates.has(item.source_candidate_id))
  .map((item) => item.case_id)
  .sort();
const candidateBriefMismatches = cases
  .filter(
    (item) =>
      knownCandidates.get(item.source_candidate_id)?.initial_user_message !==
      item.user_goal.public_brief,
  )
  .map((item) => item.case_id)
  .sort();
const fixtureLineageMismatches = cases
  .filter((item) => item.fixture.fixture_lineage !== item.source_candidate_id)
  .map((item) => item.case_id)
  .sort();
const promptAllPairs = collectPromptPairs(cases, 0);
const fixtureAllPairs = collectFixturePairs(cases, 0);
const promptNearPairs = promptAllPairs.filter(
  (item) => item.similarity >= PROMPT_REVIEW_THRESHOLD,
);
const fixtureNearPairs = fixtureAllPairs.filter(
  (item) => item.similarity >= FIXTURE_REVIEW_THRESHOLD,
);
const sharedFileGroups = buildSharedFileGroups(cases);

const report = {
  schema_version: 1,
  benchmark_id: BENCHMARK_ID,
  audit: "lineage",
  deterministic: true,
  source: {
    registry: "executable/index.ts",
    case_count: cases.length,
    case_ids_sha256: sha256(caseIds(cases).join("\n")),
    all_cases_split: [...new Set(cases.map((item) => item.split))].sort(),
  },
  method: {
    exact_identity: [
      "case_id",
      "case_family_id",
      "source_candidate_id",
      "fixture.fixture_id",
      "fixture.fixture_lineage",
      "canonical workspace sha256",
      "exact normalized public prompt",
    ],
    prompt_normalization: "NFKC + lowercase + punctuation/whitespace removal",
    fixture_normalization:
      "NFKC + remove comments/document wrappers/title metadata + whitespace removal",
    fuzzy_metric: `character ${NGRAM_SIZE}-gram Jaccard`,
    thresholds: {
      prompt_review: PROMPT_REVIEW_THRESHOLD,
      fixture_review: FIXTURE_REVIEW_THRESHOLD,
      boilerplate_meaningful_length: 180,
    },
  },
  summary: {
    duplicate_identity: {
      case_id: caseIdGroups,
      case_family_id: familyGroups,
      source_candidate_id: candidateGroups,
      fixture_id: fixtureIdGroups,
      fixture_lineage: fixtureLineageGroups,
      workspace: fixtureExactGroups,
      normalized_prompt: promptExactGroups,
    },
    shared_file_content_groups: sharedFileGroups,
    prompt_near_duplicate_pairs: promptNearPairs,
    fixture_near_duplicate_pairs: fixtureNearPairs,
    top_prompt_similarity_pairs: promptAllPairs.slice(0, 10),
    top_fixture_similarity_pairs: fixtureAllPairs.slice(0, 10),
    linkage: {
      missing_source_candidates: missingCandidateLinks,
      candidate_brief_mismatches: candidateBriefMismatches,
      fixture_lineage_mismatches: fixtureLineageMismatches,
    },
    counts: {
      duplicate_identity_groups:
        caseIdGroups.length +
        familyGroups.length +
        candidateGroups.length +
        fixtureIdGroups.length +
        fixtureLineageGroups.length +
        fixtureExactGroups.length +
        promptExactGroups.length,
      shared_file_groups: sharedFileGroups.length,
      prompt_near_pairs: promptNearPairs.length,
      fixture_near_pairs: fixtureNearPairs.length,
      prompt_near_review_pairs: promptNearPairs.filter(
        (item) => item.disposition === "review",
      ).length,
      fixture_near_review_pairs: fixtureNearPairs.filter(
        (item) => item.disposition === "review",
      ).length,
    },
  },
  case_lineage: cases.map((item) => ({
    case_id: item.case_id,
    case_family_id: item.case_family_id,
    source_candidate_id: item.source_candidate_id,
    source_lineage: {
      fixture_id: item.fixture.fixture_id,
      fixture_lineage: item.fixture.fixture_lineage,
      workspace_sha256: sha256(canonicalWorkspace(item)),
    },
    split: item.split,
  })),
  conclusions: {
    exact_identity_collision_free:
      caseIdGroups.length === 0 &&
      familyGroups.length === 0 &&
      candidateGroups.length === 0 &&
      fixtureIdGroups.length === 0 &&
      fixtureLineageGroups.length === 0 &&
      fixtureExactGroups.length === 0 &&
      promptExactGroups.length === 0,
    prompt_near_duplicates_require_review: promptNearPairs.some(
      (item) => item.disposition === "review",
    ),
    fixture_near_duplicates_require_review: fixtureNearPairs.some(
      (item) => item.disposition === "review",
    ),
    linkage_consistent:
      missingCandidateLinks.length === 0 &&
      candidateBriefMismatches.length === 0 &&
      fixtureLineageMismatches.length === 0,
    shared_latex_boilerplate_is_not_leakage: sharedFileGroups.every(
      (item) => item.disposition === "shared-latex-boilerplate",
    ),
    split_leakage_detected: crossSplitCandidateGroups.length > 0,
    cross_split_candidate_groups: crossSplitCandidateGroups,
    note: "本报告只审计当前 executable 64 case；它们全部属于 dev，不能据此证明与未来 hidden holdout 没有 family-level 泄漏。",
  },
};

if (process.argv.includes("--write")) {
  mkdirSync(new URL(".", REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
}

console.log(JSON.stringify(report, null, 2));
