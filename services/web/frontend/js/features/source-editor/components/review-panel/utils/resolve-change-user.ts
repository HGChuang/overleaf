import ColorManager from '@/ide/colors/ColorManager'
import { COPILOT_USER_ID } from '@/features/copilot/utils/editor-bridge'
import {
  ReviewPanelUser,
  ReviewPanelUsers,
} from '../../../../../../../types/review-panel/review-panel'
import { UserId } from '../../../../../../../types/user'

// The legacy panel resolves change authors via /project/:id/changes/users,
// which does not exist in CE (404) — so the Copilot pseudo-user injected
// into that refresh path never lands in `users`. Resolve it locally at
// render time so AI-submitted revisions still show a name and color.
const COPILOT_REVIEW_USER: ReviewPanelUser = {
  id: COPILOT_USER_ID as UserId,
  email: '',
  name: 'Copilot',
  isSelf: false,
  hue: ColorManager.getHueForUserId(COPILOT_USER_ID),
  avatar_text: 'C',
}

export function resolveChangeUser(
  users: ReviewPanelUsers,
  userId: UserId
): ReviewPanelUser | undefined {
  return (
    users[userId] ??
    (userId === COPILOT_USER_ID ? COPILOT_REVIEW_USER : undefined)
  )
}
