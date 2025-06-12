import { $inputRule } from '@milkdown/kit/utils';
import { InputRule } from '@milkdown/kit/prose/inputrules';

const customLinkInputRule = $inputRule((ctx) => {
  const reg = /\[([^\]]+)\]\(([^)]+)\)$/;
  return new InputRule(reg, (state, match, start, end) => {
    const [, text, href] = match;
    const { tr, schema } = state;
    const linkMark = schema.marks.link;
    if (!linkMark) return null;

    const $start = tr.doc.resolve(start);
    const parent = $start.parent;

    if (!parent.type.isTextblock) return null;

    const node = schema.text(text, [linkMark.create({ href })]);
    tr.replaceWith(start, end, [node]);
    tr.removeStoredMark(linkMark)
    return tr;
  })
});
// 最终导出插件组合
export const customLinkPlugin = [customLinkInputRule];
