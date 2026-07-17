import settings from '@overleaf/settings';
import { badRequest, payloadTooLarge } from '../utils/errors.js';

const DEFAULT_MAX_CONTEXT_BYTES = Number(settings.COPILOT_MAX_CONTEXT_BYTES || 120_000);
const DEFAULT_MAX_ATTACH_FILES = Number(settings.COPILOT_MAX_ATTACH_FILES || 8);
const DEFAULT_MAX_COMPILE_LOG_CHARS = Number(settings.COPILOT_MAX_COMPILE_LOG_CHARS || 12_000);
const DEFAULT_MAX_CHECK_FILES = Number(settings.COPILOT_CHECKS_MAX_FILES || 50);

function jsonSize(value) {
  return Buffer.byteLength(JSON.stringify(value || {}), 'utf8');
}

function ensureWithinSize(value, maxBytes, message) {
  if (jsonSize(value) > maxBytes) {
    throw payloadTooLarge(message);
  }
}

function normalizeConversation(conversation = {}, defaults = {}) {
  return {
    conversationId: conversation.conversationId || defaults.conversationId || null,
    source: conversation.source || defaults.source || 'panel',
    tab: conversation.tab || defaults.tab || 'ask',
  };
}

function normalizeProject(project = {}) {
  if (!project.projectId) {
    throw badRequest('project.projectId is required');
  }
  return {
    projectId: project.projectId,
    rootDocId: project.rootDocId || null,
    fileList: Array.isArray(project.fileList) ? project.fileList : [],
    outline: Array.isArray(project.outline) ? project.outline : [],
    files: Array.isArray(project.files) ? project.files : [],
  };
}

export class ContextService {
  constructor({
    maxContextBytes = DEFAULT_MAX_CONTEXT_BYTES,
    maxAttachFiles = DEFAULT_MAX_ATTACH_FILES,
    maxCompileLogChars = DEFAULT_MAX_COMPILE_LOG_CHARS,
    maxCheckFiles = DEFAULT_MAX_CHECK_FILES,
  } = {}) {
    this.maxContextBytes = maxContextBytes;
    this.maxAttachFiles = maxAttachFiles;
    this.maxCompileLogChars = maxCompileLogChars;
    this.maxCheckFiles = maxCheckFiles;
  }

  normalizeChatContext(payload = {}) {
    const project = normalizeProject(payload.project || {});
    const context = {
      currentFile: payload.context?.currentFile || null,
      selectedText: payload.context?.selectedText || '',
      attachedFiles: Array.isArray(payload.context?.attachedFiles)
        ? payload.context.attachedFiles.slice(0, this.maxAttachFiles)
        : [],
      recentCompileErrorId: payload.context?.recentCompileErrorId || null,
    };
    const conversation = normalizeConversation(payload.conversation, {
      source: 'panel',
      tab: 'ask',
    });
    const message = payload.message || {};
    if (message.role !== 'user' || !message.content) {
      throw badRequest('message.role=user and message.content are required');
    }

    const normalized = {
      conversation,
      project,
      context,
      message: {
        role: 'user',
        content: message.content,
      },
    };
    ensureWithinSize(normalized, this.maxContextBytes, 'chat context is too large');
    return normalized;
  }

  normalizeCompileContext(payload = {}) {
    const project = normalizeProject(payload.project || {});
    const compile = payload.compile || {};
    // Tolerant of an empty log (e.g. the latest compile produced no parseable
    // output): don't 400 — let the agent respond that no errors were found.

    const normalized = {
      conversation: normalizeConversation(payload.conversation, {
        source: 'compile',
        tab: 'fix',
      }),
      project,
      editor: {
        currentFile: payload.editor?.currentFile || null,
      },
      compile: {
        compileId: compile.compileId || null,
        status: compile.status || 'failed',
        logText: String(compile.logText || '').slice(0, this.maxCompileLogChars),
        annotations: Array.isArray(compile.annotations) ? compile.annotations : [],
      },
    };
    ensureWithinSize(normalized, this.maxContextBytes, 'compile context is too large');
    return normalized;
  }

  normalizeChecksRunContext(payload = {}) {
    const project = normalizeProject(payload.project || {});
    const checks = Array.isArray(payload.checks) ? payload.checks : [];
    if (checks.length === 0) {
      throw badRequest('checks array is required');
    }

    const normalizedProject = {
      ...project,
      files: project.files.slice(0, this.maxCheckFiles),
    };

    const normalized = {
      conversation: normalizeConversation(payload.conversation, {
        source: 'checks',
        tab: 'check',
      }),
      project: normalizedProject,
      checks,
      options: {
        includeSuggestions: Boolean(payload.options?.includeSuggestions),
      },
    };
    ensureWithinSize(normalized, this.maxContextBytes, 'checks context is too large');
    return normalized;
  }

  normalizeCheckExplainContext(payload = {}) {
    const project = normalizeProject(payload.project || {});
    const issue = payload.issue || {};
    if (!issue.id || !issue.type || !issue.title) {
      throw badRequest('issue.id, issue.type, and issue.title are required');
    }
    const normalized = {
      conversation: normalizeConversation(payload.conversation, {
        source: 'checks',
        tab: 'check',
      }),
      project,
      issue,
    };
    ensureWithinSize(normalized, this.maxContextBytes, 'check explain context is too large');
    return normalized;
  }
}
