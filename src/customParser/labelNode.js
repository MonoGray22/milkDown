// customParser/labelNode.js
import { $node, $inputRule, $prose, $remark } from '@milkdown/utils';
import { Fragment, Slice } from 'prosemirror-model';
import { InputRule } from 'prosemirror-inputrules';
import { Plugin } from '@milkdown/prose/state';
import { keymap } from '@milkdown/prose/keymap';
import { schemaCtx } from '@milkdown/core';
import { visit } from 'unist-util-visit';

// 节点定义
const labelNode = $node('labelNode', () => ({
  inline: true,
  group: 'inline',
  atom: true,          // 让它成为原子节点（可选：如果你希望可编辑内容，可设为 false 并用 content: 'text*'）
  selectable: false,
  draggable: false,
  attrs: {
    name: { default: '' },
    value: { default: '' },
  },
  // 粘贴/导入 HTML -> Node
  parseDOM: [
    {
      tag: 'span.editor-quote-style',
      getAttrs: (dom) => {
        const el = dom;
        return {
          name: el.getAttribute('data-name') || el.textContent || '',
          value: el.getAttribute('data-value') || '',
        };
      },
    },
  ],
  // Node -> DOM 渲染
  toDOM: (node) => {
    const { name, value } = node.attrs;
    return [
      'span',
      {
        class: 'editor-quote-style',
        'data-name': name,
        'data-value': value,
        tabindex: '-1',
        contentEditable: false,
      },
      name || '',
    ];
  },
  parseMarkdown: {
    match: (node) => node.type === 'labelNode',
    runner: (state, node, type) => {
      const name = node.data?.name || '';
      const value = node.data?.value || '';
      state.addNode(type, { name, value });
    },

  },
  toMarkdown: {
    match: (node) => node.type.name === 'labelNode',
    runner: (state, node) => {
      const { name = '', value = '' } = node.attrs || {};
      state.addNode('text', undefined, `[[${name}|${value}]]`);
    },
  },
}));

// 输入规则：[[名称|{值}]]
const LABEL_RE = /\[\[([^|\]]+)\|(\{[^}]*\})\]\]$/;

const labelInputRule = $inputRule((ctx) => {
  const type = labelNode.type(ctx);
  return new InputRule(LABEL_RE, (state, match, start, end) => {
    const [, name, value] = match;
    return state.tr
      .replaceRangeWith(start, end, type.create({ name: name.trim(), value: value.trim() }));
  });
});

// 整体删除
const labelDeleteKeyMap = $prose((ctx) => {
  const type = labelNode.type(ctx);
  return keymap({
    Backspace: (state, dispatch) => {
      const { $from } = state.selection;
      const nodeBefore = $from.nodeBefore;
      if (nodeBefore && nodeBefore.type === type) {
        if (dispatch) {
          const tr = state.tr.deleteRange($from.pos - nodeBefore.nodeSize, $from.pos);
          dispatch(tr);
        }
        return true;
      }
      return false;
    },
    Delete: (state, dispatch) => {
      const { $from } = state.selection;
      const nodeAfter = $from.nodeAfter;
      if (nodeAfter && nodeAfter.type === type) {
        if (dispatch) {
          const tr = state.tr.deleteRange($from.pos, $from.pos + nodeAfter.nodeSize);
          dispatch(tr);
        }
        return true;
      }
      return false;
    },
  });
});

// 全局多次匹配的正则
const LABEL_G = /\[\[([^|\]]+)\|(\{[^}]*\})\]\]/g;

// 直接粘贴[[名称|{值}]]
const labelPasteHandler = $prose((ctx) => {
  const schema = ctx.get(schemaCtx);
  const labelType = labelNode.type(ctx);
  const hardBreakType = schema.nodes.hardbreak;

  const asText = (s) => (s ? schema.text(s) : null);

  // 把单行拆成 [Text, labelNode, Text, ...]
  const lineToInline = (line) => {
    const parts = [];
    LABEL_G.lastIndex = 0;
    let last = 0;
    let m;

    while ((m = LABEL_G.exec(line)) !== null) {
      const full = m[0];
      const name = (m[1] || '').trim();
      const value = (m[2] || '').trim();
      const start = m.index;

      const plain = line.slice(last, start);
      const t = asText(plain);
      if (t) parts.push(t);

      parts.push(labelType.create({ name, value }));
      last = start + full.length;
    }

    const tail = asText(line.slice(last));
    if (tail) parts.push(tail);

    return parts;
  };

  return new Plugin({
    props: {
      handleDOMEvents: {
        paste (view, event) {
          const text = event.clipboardData?.getData('text/plain');
          if (!text) return false;

          // 没有任何 [[...|{...}]] 就交回默认粘贴
          LABEL_G.lastIndex = 0;
          if (!LABEL_G.test(text)) return false;

          event.preventDefault(); // 接管粘贴

          const lines = text.split(/\r?\n/);
          const nodes = [];

          lines.forEach((line, idx) => {
            nodes.push(...lineToInline(line));
            if (idx < lines.length - 1 && hardBreakType) {
              nodes.push(hardBreakType.create());
            }
          });

          const fragment = Fragment.fromArray(nodes);
          const slice = new Slice(fragment, 0, 0);

          const { state } = view;
          const tr = state.tr.replaceSelection(slice).scrollIntoView();
          view.dispatch(tr);
          return true;
        },
      },
    },
  });
});

// 作用：在 remark (mdast) 阶段，把普通 Text 节点里的 [[name|{value}]] 拆成若干节点：Text / labelNode / Text ...

const remarkLabelNode = $remark('remark-video', () => () => (tree) => {
  visit(tree, 'text', (node, index, parent) => {
    if (!parent || typeof node.value !== 'string') return;

    const value = node.value;
    LABEL_G.lastIndex = 0;
    if (!LABEL_G.test(value)) return;

    // 重新开始
    LABEL_G.lastIndex = 0;
    const children = [];
    let last = 0;
    let m;

    while ((m = LABEL_G.exec(value)) !== null) {
      const [full, nameRaw, valueRaw] = m;
      const start = m.index;

      const plain = value.slice(last, start);
      if (plain) children.push({ type: 'text', value: plain });

      children.push({
        type: 'labelNode',
        data: {
          name: (nameRaw || '').trim(),
          value: (valueRaw || '').trim(),
        },
      });
      last = start + full.length;
    }
    const tail = value.slice(last);
    if (tail) children.push({ type: 'text', value: tail });
    parent.children.splice(index, 1, ...children);
    return index + children.length;
  });
});


export const nonEditLabel = [labelNode, labelInputRule, labelDeleteKeyMap, labelPasteHandler, remarkLabelNode];
