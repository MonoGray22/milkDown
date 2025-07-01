import { codeBlockSchema } from '@milkdown/kit/preset/commonmark'
import { textblockTypeInputRule } from '@milkdown/kit/prose/inputrules'
import { $inputRule } from '@milkdown/kit/utils'


export const mermaidBlockInputRule = $inputRule((ctx) =>
  textblockTypeInputRule(/^```mermaid[\s\n]$/, codeBlockSchema.type(ctx), () => ({
    language: 'mermaid',
  }))
)
