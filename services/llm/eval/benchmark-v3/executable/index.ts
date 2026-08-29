import { V3_ARTIFACT_CASES } from "./packs/artifactCases.js";
import { V3_COMPILE_CASES } from "./packs/compileCases.js";
import { V3_CONTENT_CASES } from "./packs/contentCases.js";
import { V3_INTERACTION_CASES } from "./packs/interactionCases.js";
import type { V3ExecutableCase } from "./types.js";

export const V3_EXECUTABLE_CASES: V3ExecutableCase[] = [
  ...V3_CONTENT_CASES,
  ...V3_COMPILE_CASES,
  ...V3_ARTIFACT_CASES,
  ...V3_INTERACTION_CASES,
];
