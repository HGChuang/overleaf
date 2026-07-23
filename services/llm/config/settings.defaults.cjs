const MONGO_URL = process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/sharelatex?directConnection=true'
const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379'
const PORT = 3012
const LISTEN_ADDRESS = process.env.LISTEN_ADDRESS || '0.0.0.0'
const LLM_AGENT_ENABLED = process.env.LLM_AGENT_ENABLED !== 'false'
const LLM_MEMORY_TTL_SECONDS = Number(process.env.LLM_MEMORY_TTL_SECONDS || 60 * 60)
const LLM_MEMORY_MAX_MESSAGES = Number(process.env.LLM_MEMORY_MAX_MESSAGES || 20)
const COPILOT_PANEL_ENABLED = process.env.COPILOT_PANEL_ENABLED !== 'false'
const COPILOT_MAX_CONTEXT_BYTES = Number(process.env.COPILOT_MAX_CONTEXT_BYTES || 120000)
const COPILOT_MAX_ATTACH_FILES = Number(process.env.COPILOT_MAX_ATTACH_FILES || 8)
const COPILOT_AGENT_RECURSION_LIMIT = Number(process.env.COPILOT_AGENT_RECURSION_LIMIT || 25)
const COPILOT_CONTEXT_SNIP_MAX = Number(process.env.COPILOT_CONTEXT_SNIP_MAX || 50)
const COPILOT_CONTEXT_MICRO_KEEP = Number(process.env.COPILOT_CONTEXT_MICRO_KEEP || 3)
const COPILOT_CONTEXT_SUMMARIZE_THRESHOLD = Number(process.env.COPILOT_CONTEXT_SUMMARIZE_THRESHOLD || 60000)
const COPILOT_LTMEM_ENABLED = process.env.COPILOT_LTMEM_ENABLED !== 'false'
// Compile self-healing loop: llm → web private API (service-to-service).
// WEB_API_USER / WEB_API_PASSWORD come straight from dev.env (no defaults —
// when unset the client sends no auth and the endpoint will 401).
const WEB_API_BASE_URL = process.env.WEB_API_BASE_URL || `http://${process.env.WEB_HOST || 'web'}:3000`
const WEB_API_USER = process.env.WEB_API_USER || ''
const WEB_API_PASSWORD = process.env.WEB_API_PASSWORD || ''
// A full LaTeX compile dominates a verification round — generous ceilings.
const COMPILE_TOOL_TIMEOUT_MS = Number(process.env.COMPILE_TOOL_TIMEOUT_MS || 150000)
const COPILOT_TURN_TIMEOUT_MS = Number(process.env.COPILOT_TURN_TIMEOUT_MS || 300000)

module.exports = {
    MONGO_URL,
    REDIS_URL,
    PORT,
    LISTEN_ADDRESS,
    LLM_AGENT_ENABLED,
    LLM_MEMORY_TTL_SECONDS,
    LLM_MEMORY_MAX_MESSAGES,
    COPILOT_PANEL_ENABLED,
    COPILOT_MAX_CONTEXT_BYTES,
    COPILOT_MAX_ATTACH_FILES,
    COPILOT_AGENT_RECURSION_LIMIT,
    COPILOT_CONTEXT_SNIP_MAX,
    COPILOT_CONTEXT_MICRO_KEEP,
    COPILOT_CONTEXT_SUMMARIZE_THRESHOLD,
    COPILOT_LTMEM_ENABLED,
    WEB_API_BASE_URL,
    WEB_API_USER,
    WEB_API_PASSWORD,
    COMPILE_TOOL_TIMEOUT_MS,
    COPILOT_TURN_TIMEOUT_MS
}
