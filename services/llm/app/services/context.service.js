import settings from '@overleaf/settings';
import { badRequest, payloadTooLarge } from '../utils/errors.js';

const DEFAULT_MAX_CONTEXT_BYTES = Number(settings.COPILOT_MAX_CONTEXT_BYTES || 120_000);
const DEFAULT_MAX_ATTACH_FILES = Number(settings.COPILOT_MAX_ATTACH_FILES || 8);

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
  } = {}) {
    this.maxContextBytes = maxContextBytes;
    this.maxAttachFiles = maxAttachFiles;
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
}
