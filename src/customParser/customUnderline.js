import { $inputRule, $markSchema, $remark } from '@milkdown/utils';
import { InputRule } from '@milkdown/prose/inputrules';

// 1. 自定义 Mark Schema
export const underlineMark = $markSchema('underline', () => ({
  parseDOM: [
    { tag: 'u' },
    {
      style: 'text-decoration',
      getAttrs: (value) => value === 'underline' && null,
    },
  ],
  toDOM: () => ['u', 0],
  parseMarkdown: {
    match: (node) => node.type === 'underline',
    runner: (state, node, markType) => {
      state.openMark(markType);
      state.next(node.children);
      state.closeMark(markType);
    },
  },
  toMarkdown: {
    match: (mark) => mark.type.name === 'underline',
    runner: (state, mark) => {
      state.withMark(mark, 'underline');
    },
  },
}));

// 2. 输入规则：++下划线++
export const underlineInputRule = $inputRule(() => {
  return new InputRule(
    /\+\+([^+]+)\+\+$/, // 匹配 ++text++
    (state, match, start, end) => {
      const [okay, content] = match;
      const { tr } = state;
      if (okay) {
        tr.insertText(content, start, end);
        tr.addMark(start, start + content.length, state.schema.marks['underline'].create());
      }
      return tr;
    }
  );
});

// 3. 粘贴时展示下划线
export const remarkUnderline = $remark('remark-underline', () => () => (tree) => {
  const visit = (node, parent) => {
    if (Array.isArray(node.children)) {
      node.children.forEach((child, i) => visit(child, node));
    }

    if (node.type === 'text' && typeof node.value === 'string') {
      const regex = /\+\+([^+]+)\+\+/g;
      const matches = [...node.value.matchAll(regex)];
      if (matches.length === 0) return;

      const newChildren = [];
      let lastIndex = 0;
      for (const match of matches) {
        const [full, content] = match;
        // 由于非 null 断言只能在 TypeScript 中使用，这里添加一个条件判断确保 match.index 存在
        const start = match.index !== undefined ? match.index : 0;
        if (start > lastIndex) {
          newChildren.push({ type: 'text', value: node.value.slice(lastIndex, start) });
        }
        newChildren.push({
          type: 'underline',
          children: [{ type: 'text', value: content }],
        });
        lastIndex = start + full.length;
      }

      if (lastIndex < node.value.length) {
        newChildren.push({ type: 'text', value: node.value.slice(lastIndex) });
      }

      // 替换原节点内容
      if (parent && Array.isArray(parent.children)) {
        const index = parent.children.indexOf(node);
        parent.children.splice(index, 1, ...newChildren);
      }
    }
  };

  visit(tree);
});

// 4. 注册 Mark 插件
export const underline = [remarkUnderline, underlineMark, underlineInputRule];
