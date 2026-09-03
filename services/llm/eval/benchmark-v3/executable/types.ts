import type { ReplacementHunk } from "../../headless/replacementPatch.js";
import type {
  CompileMode,
  PilotCase,
  PilotGradeContext,
} from "../../pilot/types.js";

export interface V3GraderMutation {
  mutation_id: string;
  description: string;
  patches?: ReplacementHunk[];
  responses?: string[];
  first_response_had_patch?: boolean;
  patch_count?: number;
  patch_rejection_count?: number;
  user_turn_count?: number;
  compile?: PilotGradeContext["compile"];
}

export type V3ExecutableCase = PilotCase & {
  source_candidate_id: string;
  validation_oracle: PilotCase["validation_oracle"] & {
    grader_mutations: V3GraderMutation[];
  };
};

export interface V3CaseInput {
  candidateId: string;
  caseSlug: string;
  category: string;
  capabilities: PilotCase["capabilities"];
  difficulty: PilotCase["difficulty"]["level"];
  factors: string[];
  files: PilotCase["fixture"]["files"];
  mainFile?: string;
  currentFile?: string;
  scale?: PilotCase["project_complexity"]["scale"];
  pressure?: PilotCase["project_complexity"]["context_pressure"];
  interactionFacts?: string[];
  action: PilotCase["expected_behavior"]["action"];
  maxUserTurns?: number;
  dynamicUser?: boolean;
  continueAfterPatch?: boolean;
  evalUserFollowups?: Array<{ user_turn: number; fact_groups: string[][] }>;
  initialCompile?: PilotCase["initial_state"]["compile_status"];
  compileMode?: CompileMode;
  semanticGrading?: PilotCase["semantic_grading"];
  protectedInvariants?: NonNullable<
    PilotCase["initial_state"]["protected_invariants"]
  >;
  graders: PilotCase["graders"];
  oraclePatches?: NonNullable<PilotCase["validation_oracle"]["patches"]>;
  oracleResponse?: string;
  oracleResponses?: string[];
  graderMutations: V3GraderMutation[];
  tags: string[];
  promptForm?: string;
}
