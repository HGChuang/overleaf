import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { BENCHMARK_V3_CANDIDATE_SEEDS } from "./candidateSeeds.js";
import { V3_SUPPLEMENTAL_SEEDS } from "./supplementalSeeds.js";

const EXPECTED_SOURCE_COUNTS: Record<string, number> = {
  v3_user_content_structure: 38,
  v3_user_compile_reference: 38,
  v3_user_artifact_project: 37,
  v3_user_interaction_long: 37,
};

test("v3 candidate corpus contains exactly 150 eval_user generated seeds", () => {
  assert.equal(BENCHMARK_V3_CANDIDATE_SEEDS.length, 150);
  const counts: Record<string, number> = {};
  for (const seed of BENCHMARK_V3_CANDIDATE_SEEDS) {
    counts[seed.source_session] = (counts[seed.source_session] || 0) + 1;
  }
  assert.deepEqual(counts, EXPECTED_SOURCE_COUNTS);
});

test("non-edit supplement contains 9 unique Chinese eval_user seeds", () => {
  assert.equal(V3_SUPPLEMENTAL_SEEDS.length, 9);
  assert.equal(
    new Set(V3_SUPPLEMENTAL_SEEDS.map((seed) => seed.candidate_id)).size,
    9,
  );
  assert.equal(
    new Set(V3_SUPPLEMENTAL_SEEDS.map((seed) => seed.initial_user_message))
      .size,
    9,
  );
  assert.ok(
    V3_SUPPLEMENTAL_SEEDS.every(
      (seed) =>
        seed.source_session === "non_edit_eval_user" &&
        /\p{Script=Han}/u.test(seed.initial_user_message),
    ),
  );
});

test("v3 candidate ids and user messages are unique", () => {
  const ids = BENCHMARK_V3_CANDIDATE_SEEDS.map((seed) => seed.candidate_id);
  const messages = BENCHMARK_V3_CANDIDATE_SEEDS.map(
    (seed) => seed.initial_user_message,
  );
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(new Set(messages).size, messages.length);
});

test("every user-visible seed message is Chinese and remains non-executable", () => {
  for (const seed of BENCHMARK_V3_CANDIDATE_SEEDS) {
    assert.equal(seed.language, "zh-CN");
    assert.equal(seed.lifecycle, "candidate");
    assert.match(seed.initial_user_message, /\p{Script=Han}/u);
    assert.ok(seed.initial_user_message.length >= 8);
    assert.ok(seed.initial_user_message.length <= 240);
  }
});

test("candidate corpus cannot accidentally carry grader or oracle fields", () => {
  for (const seed of BENCHMARK_V3_CANDIDATE_SEEDS) {
    const keys = Object.keys(seed);
    assert.ok(!keys.includes("graders"));
    assert.ok(!keys.includes("oracle"));
    assert.ok(!keys.includes("expected_answer"));
    assert.ok(!keys.includes("split"));
  }
});

const EXPECTED_BRIEF_COLUMNS = [
  "scenario_no",
  "项目摘要",
  "后续事实摘要",
  "必须保留摘要",
  "不可接受摘要",
];

const BRIEF_FILES: Array<{
  file: string;
  sourceSession: string;
  expectedCount: number;
}> = [
  {
    file: "content.tsv",
    sourceSession: "v3_user_content_structure",
    expectedCount: 38,
  },
  {
    file: "compile.tsv",
    sourceSession: "v3_user_compile_reference",
    expectedCount: 38,
  },
  {
    file: "artifact.tsv",
    sourceSession: "v3_user_artifact_project",
    expectedCount: 37,
  },
  {
    file: "interaction.tsv",
    sourceSession: "v3_user_interaction_long",
    expectedCount: 37,
  },
];

test("eval_user briefs cover every candidate with structured Chinese context", () => {
  let totalRows = 0;

  for (const brief of BRIEF_FILES) {
    const content = readFileSync(
      new URL(`briefs/${brief.file}`, import.meta.url),
      "utf8",
    ).trimEnd();
    const [header, ...rows] = content.split("\n");
    assert.deepEqual(header.split("\t"), EXPECTED_BRIEF_COLUMNS);
    assert.equal(rows.length, brief.expectedCount);

    const sourceSeeds = BENCHMARK_V3_CANDIDATE_SEEDS.filter(
      (seed) => seed.source_session === brief.sourceSession,
    );
    assert.equal(sourceSeeds.length, rows.length);

    rows.forEach((row, index) => {
      const columns = row.split("\t");
      assert.equal(columns.length, EXPECTED_BRIEF_COLUMNS.length);
      assert.equal(Number(columns[0]), index + 1);
      assert.equal(sourceSeeds[index]?.source_ordinal, index + 1);
      for (const value of columns.slice(1)) {
        assert.match(value, /\p{Script=Han}/u);
      }
    });

    totalRows += rows.length;
  }

  assert.equal(totalRows, BENCHMARK_V3_CANDIDATE_SEEDS.length);
});

test("manifest separates the immutable candidate pool from the executable tranche", () => {
  const manifest = JSON.parse(
    readFileSync(new URL("manifest.json", import.meta.url), "utf8"),
  );
  assert.equal(
    manifest.lifecycle,
    "candidate-pool-with-executable-and-blocked-conformance",
  );
  assert.equal(manifest.language, "zh-CN");
  assert.equal(
    manifest.counts.source_candidates,
    BENCHMARK_V3_CANDIDATE_SEEDS.length + V3_SUPPLEMENTAL_SEEDS.length,
  );
  assert.equal(manifest.counts.base_source_candidates, 150);
  assert.equal(manifest.counts.supplemental_non_edit_candidates, 9);
  assert.equal(manifest.counts.materialized_candidates, 79);
  assert.equal(manifest.counts.unmaterialized_candidates, 80);
  assert.equal(manifest.counts.executable_cases, 73);
  assert.equal(manifest.counts.conformance_blocked_h3_cases, 6);
  assert.equal(manifest.split_status, "three-tranches-dev-only");
  assert.equal(manifest.validation.candidate_pool.brief_coverage, true);
  assert.equal(manifest.validation.executable_tranche.oracle_apply, true);
  assert.equal(manifest.validation.executable_tranche.final_compile, true);
  assert.equal(manifest.validation.executable_tranche.grader_mutation, true);
  assert.equal(manifest.validation.conformance.h2, "blocked-product-semantics");
  assert.equal(
    manifest.validation.conformance.h3,
    "blocked-missing-agent-protocol",
  );
  assert.equal(manifest.validation.hidden_sealed, false);
});
