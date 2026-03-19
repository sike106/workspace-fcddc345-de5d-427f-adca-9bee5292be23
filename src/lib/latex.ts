import katex from 'katex'

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function trimMathExpression(expr: string): string {
  return expr.trim()
}

export function normalizeMathDelimiters(text: string): string {
  if (!text) return ''

  let normalized = text.replace(/\r\n/g, '\n')

  // Normalize legacy double-escaped LaTeX content from stored JSON/data.
  normalized = normalized
    .replace(/\\\\\(/g, '\\(')
    .replace(/\\\\\)/g, '\\)')
    .replace(/\\\\\[/g, '\\[')
    .replace(/\\\\\]/g, '\\]')
    .replace(/\\\\([a-zA-Z]+)/g, '\\$1')

  // Fix malformed mixed wrappers produced by some model outputs.
  normalized = normalized
    .replace(/\$\s*\\\(([\s\S]+?)\\\)\s*\$/g, (_, expr) => `\\(${trimMathExpression(expr)}\\)`)
    .replace(/\$\s*\\\[([\s\S]+?)\\\]\s*\$/g, (_, expr) => `\\[${trimMathExpression(expr)}\\]`)
    .replace(/\$\$\s*\\\(([\s\S]+?)\\\)\s*\$\$/g, (_, expr) => `$$${trimMathExpression(expr)}$$`)
    .replace(/\$\$\s*\\\[([\s\S]+?)\\\]\s*\$\$/g, (_, expr) => `$$${trimMathExpression(expr)}$$`)
    .replace(/\\\(\s*\\\(([\s\S]+?)\\\)\s*\\\)/g, (_, expr) => `\\(${trimMathExpression(expr)}\\)`)
    .replace(/\\\[\s*\\\[([\s\S]+?)\\\]\s*\\\]/g, (_, expr) => `\\[${trimMathExpression(expr)}\\]`)

  return normalized
}

export function formatLatex(text: string): string {
  if (!text) return ''

  let normalized = normalizeMathDelimiters(text)
  const sectionDivider =
    '<hr style="margin:12px 0;border:0;border-top:1px solid rgba(148,163,184,0.45);" />'

  const renderKatex = (expr: string, displayMode: boolean): string => {
    try {
      return katex.renderToString(trimMathExpression(expr), {
        displayMode,
        throwOnError: false,
      })
    } catch {
      return escapeHtml(expr)
    }
  }

  // Preserve math blocks so later replacements do not corrupt them.
  const mathBlocks: string[] = []
  const stashDisplayBlock = (expr: string): string => {
    const token = `@@MATH_BLOCK_${mathBlocks.length}@@`
    mathBlocks.push(`<div class="my-3 overflow-x-auto">${renderKatex(expr, true)}</div>`)
    return token
  }
  const stashInlineBlock = (expr: string): string => {
    const token = `@@MATH_BLOCK_${mathBlocks.length}@@`
    mathBlocks.push(renderKatex(expr, false))
    return token
  }

  normalized = normalized
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, expr) => stashDisplayBlock(expr))
    .replace(/\\\[((?:.|\n)*?)\\\]/g, (_, expr) => stashDisplayBlock(expr))

  normalized = normalized
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, expr) => stashInlineBlock(expr))
    .replace(/\$([^\n$]+?)\$/g, (_, expr) => stashInlineBlock(expr))

  let formatted = escapeHtml(normalized)

  // Basic markdown-like text formatting used in AI responses.
  formatted = formatted
    .replace(/^\s*---+\s*$/gm, sectionDivider)
    .replace(
      /^\s*(?:\d+\.\s*)?\*\*Method Used:\*\*\s*(.*)$/gim,
      `${sectionDivider}<div style="margin-top:6px;"><strong>Method Used:</strong> $1</div>`
    )
    .replace(
      /^\s*(?:\d+\.\s*)?Method Used\s*[:\-]\s*(.*)$/gim,
      `${sectionDivider}<div style="margin-top:6px;"><strong>Method Used:</strong> $1</div>`
    )
    .replace(
      /^\s*(?:\d+\.\s*)?\*\*Formula Used:\*\*\s*(.*)$/gim,
      '<div style="margin-top:6px;"><strong>Formula Used:</strong> $1</div>'
    )
    .replace(
      /^\s*(?:\d+\.\s*)?Formula Used\s*[:\-]\s*(.*)$/gim,
      '<div style="margin-top:6px;"><strong>Formula Used:</strong> $1</div>'
    )
    .replace(/^### (.*$)/gm, '<h4 class="text-lg font-semibold mt-4 mb-2">$1</h4>')
    .replace(/^## (.*$)/gm, '<h3 class="text-xl font-semibold mt-4 mb-2">$1</h3>')
    .replace(/^# (.*$)/gm, '<h2 class="text-2xl font-bold mt-4 mb-2">$1</h2>')
    .replace(/^- (.*$)/gm, '<li class="ml-4">$1</li>')
    .replace(/^(\d+)\. (.*$)/gm, '<li class="ml-4">$2</li>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')

  formatted = formatted.replace(/\n/g, '<br />')

  for (let i = 0; i < mathBlocks.length; i += 1) {
    formatted = formatted.replace(`@@MATH_BLOCK_${i}@@`, mathBlocks[i])
  }

  return formatted
}
