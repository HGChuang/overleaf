import { randomUUID } from 'crypto';

export function createIssue({
  id = randomUUID(),
  type,
  severity = 'warning',
  title,
  description,
  location = null,
  metadata = {},
  actions = ['view_details', 'jump_to_file', 'explain_with_copilot', 'suggest_fix'],
}) {
  return {
    id,
    type,
    severity,
    title,
    description,
    location,
    metadata,
    actions,
  };
}
