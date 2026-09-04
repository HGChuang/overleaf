export interface EvalFile {
  path: string
  content: string
}

export interface EvalTask {
  id: string
  mainFile: string
  currentFile?: string
  files: EvalFile[]
}

export const VERIFY_MESSAGE =
  '[自动验证] 补丁已应用。请调用 compile_project 触发重新编译：若仍有错误，请用 read_file_fragment 定位后继续修复并提交新 patch；若编译通过（errorCount 为 0），请简短确认修复成功。'

export function buildChatPayload(
  task: EvalTask,
  files: readonly EvalFile[],
  conversationId: string,
  message: string
) {
  return {
    conversation: { conversationId, source: 'panel' },
    project: {
      projectId: `eval-${task.id}`,
      rootDocId: task.mainFile,
      fileList: files.map(file => file.path),
      outline: [],
      files,
    },
    context: {
      currentFile: task.currentFile ?? task.mainFile,
      selectedText: '',
      attachedFiles: [],
    },
    message: { role: 'user', content: message },
  }
}
