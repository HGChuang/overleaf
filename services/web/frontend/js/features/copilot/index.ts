// Overleaf Copilot frontend feature.
//
// Public surface consumed by the rest of the app:
//   <CopilotProvider>          — wrap the editor (react-context-root)
//   <CopilotPane />            — render once in main-layout (native panel)
//   <CopilotToggleButton />    — render in the editor navigation toolbar
//   useCopilotContext()        — read/trigger Copilot state (e.g. from llm-toolbar)
//   insertIntoEditor(text)     — insert generated text at the editor cursor
//   extractLatexFromMarkdown   — shared LaTeX-extraction helper

export { CopilotProvider, useCopilotContext } from './context/copilot-context'
export type { CopilotContextValue } from './context/copilot-context'
export { CopilotPane } from './components/copilot-pane'
export { CopilotToggleButton } from './components/copilot-toggle-button'
export { insertIntoEditor } from './utils/editor-bridge'
export { extractLatexFromMarkdown } from './utils/markdown'
export type {
  CopilotMessage,
  MessageBlock,
} from './utils/types'
