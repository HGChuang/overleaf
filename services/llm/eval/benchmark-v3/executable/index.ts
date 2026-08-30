import { V3_ARTIFACT_CASES } from "./packs/artifactCases.js";
import { V3_ARTIFACT_CASES_2 } from "./packs/artifactCases2.js";
import { V3_COMPILE_CASES } from "./packs/compileCases.js";
import { V3_COMPILE_CASES_2 } from "./packs/compileCases2.js";
import { V3_CONTENT_CASES } from "./packs/contentCases.js";
import { V3_CONTENT_CASES_2 } from "./packs/contentCases2.js";
import { V3_INTERACTION_CASES } from "./packs/interactionCases.js";
import { V3_INTERACTION_CASES_2 } from "./packs/interactionCases2.js";
import { V3_NON_EDIT_CASES } from "./packs/nonEditCases.js";
import type { V3ExecutableCase } from "./types.js";

export const V3_EXECUTABLE_CASES: V3ExecutableCase[] = [
  ...V3_CONTENT_CASES,
  ...V3_CONTENT_CASES_2,
  ...V3_COMPILE_CASES,
  ...V3_COMPILE_CASES_2,
  ...V3_ARTIFACT_CASES,
  ...V3_ARTIFACT_CASES_2,
  ...V3_INTERACTION_CASES,
  ...V3_INTERACTION_CASES_2,
  ...V3_NON_EDIT_CASES,
];
