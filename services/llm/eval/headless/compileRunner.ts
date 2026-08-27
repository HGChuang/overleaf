const clsiUrl = process.env.EVAL_CLSI_URL || 'http://clsi:3013'
const timeoutMs = Number(process.env.EVAL_COMPILE_TIMEOUT_MS || 120_000)
const maxLogChars = 1_000_000

export interface CompileError {
  file: string | null
  line: number | null
  message: string
}

export interface CompileResult {
  status: string
  errorCount: number | null
  errors: CompileError[]
  warningCount: number | null
  log: string | null
  note?: string
}

function parseLog(log: string): Pick<CompileResult, 'errors' | 'warningCount'> {
  const lines = log.split(/\r?\n/)
  const errors: CompileError[] = []
  let warningCount = 0
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (/^(LaTeX|Package|Class) .*Warning:/.test(line)) warningCount += 1
    if (!line.startsWith('! ')) continue
    let sourceLine: number | null = null
    for (let lookahead = index + 1; lookahead < Math.min(index + 5, lines.length); lookahead += 1) {
      const match = lines[lookahead].match(/^l\.(\d+)/)
      if (match) {
        sourceLine = Number(match[1])
        break
      }
    }
    errors.push({ file: null, line: sourceLine, message: line.slice(2).trim() })
  }
  return { errors, warningCount }
}

/** Compile the current in-memory project through the real CLSI service. */
export async function compileFiles(
  files: { path: string; content: string }[],
  mainFile: string
): Promise<CompileResult> {
  const projectId = `eval-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${clsiUrl}/project/${encodeURIComponent(projectId)}/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        compile: {
          options: { compiler: 'pdflatex', timeout: Math.floor(timeoutMs / 1000), flags: ['-g'] },
          rootResourcePath: mainFile,
          resources: files.map(file => ({ path: file.path.replace(/^\//, ''), content: file.content })),
        },
      }),
      signal: controller.signal,
    })
    if (!response.ok) {
      return { status: `http-${response.status}`, errorCount: null, errors: [], warningCount: null, log: null, note: `CLSI returned HTTP ${response.status}` }
    }
    const body = (await response.json()) as { compile?: { status?: string; outputFiles?: { path?: string; url?: string }[] } }
    const compile = body.compile || {}
    const status = compile.status || 'unknown'
    const logFile = compile.outputFiles?.find(file => file.path === 'output.log')
    if (!logFile?.url) {
      return { status, errorCount: null, errors: [], warningCount: null, log: null, note: `CLSI produced no output.log for status '${status}'` }
    }
    const logResponse = await fetch(new URL(logFile.url, clsiUrl), { signal: controller.signal })
    if (!logResponse.ok) {
      return { status, errorCount: null, errors: [], warningCount: null, log: null, note: `output.log returned HTTP ${logResponse.status}` }
    }
    const log = (await logResponse.text()).slice(0, maxLogChars)
    const parsed = parseLog(log)
    return { status, errorCount: parsed.errors.length, errors: parsed.errors.slice(0, 30), warningCount: parsed.warningCount, log }
  } catch (error) {
    return { status: 'unavailable', errorCount: null, errors: [], warningCount: null, log: null, note: `CLSI request failed: ${error instanceof Error ? error.message : String(error)}` }
  } finally {
    clearTimeout(timer)
  }
}
