import { $node, $command, $prose } from '@milkdown/utils';
import { schemaCtx } from '@milkdown/core';
import { Plugin, PluginKey, TextSelection } from '@milkdown/prose/state';

// 定义不可编辑节点(div)
export const nonEditableNode = $node('nonEditable', () => ({
  group: 'block',
  content: 'block+',
  atom: true,
  selectable: true,
  draggable: false,
  attrs: { user: { default: null } },
  parseDOM: [
    {
      tag: 'div[data-type="non-editable"]',
      getAttrs: (dom) => {
        if (dom instanceof HTMLElement) {
          return { user: dom.getAttribute('data-user') };
        }
      },
    }
  ],
  toDOM: (node) => {
    return [
      'div',
      {
        'data-type': 'non-editable',
        'data-user': node.attrs.user,
        class: 'non-editable',
        contentEditable: 'false',
        tabindex: '-1',
      },
      0,
    ]
  },
  parseMarkdown: {
    match: (node) => node.type.name === 'nonEditable',
    runner: (state, node) => {
      if (node.type.name !== 'nonEditable') return false;
      state.openNode('nonEditable');
      node.content.forEach(child => state.next(child));
      state.closeNode();
    }
  },
  toMarkdown: {
    match: (node) => node.type.name === 'nonEditable',
    runner: (state, node) => {
      if (node.type.name !== 'nonEditable') return false;
      node.content.forEach(child => state.next(child));
    },
  },
}));

export const nonEditableInline = $node('nonEditableInline', () => ({
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,
  attrs: {
    user: { default: null },
  },
  parseDOM: [{
    tag: 'span[data-type="non-editable-inline"]',
    getAttrs: dom => {
      if (dom instanceof HTMLElement) {
        return { user: dom.getAttribute('data-user') };
      }
    },
  }],
  toDOM: node => [
    'span',
    {
      'data-type': 'non-editable-inline',
      'data-user': node.attrs.user,
      class: 'non-editable-inline',
      contentEditable: 'false',
      style: 'background: #eee; padding: 2px 4px; border-radius: 4px;',
    },
    node.attrs.user || '不可编辑',
  ],
  parseMarkdown: {
    match: (node) => node.type === 'nonEditableInline',
    runner: (state, node) => {
      state.addNode('nonEditableInline', undefined, { user: node.attrs.user });
    }
  },
  toMarkdown: {
    match: node => node.type.name === 'nonEditableInline',
    runner: (state, node) => {
      state.write(`{{nonEditable:${node.attrs.user}}}`);
    }
  }
}));

// 创建阻止编辑的插件
export const nonEditablePlugin = $prose((ctx) => {
  const pluginKey = new PluginKey('nonEditablePlugin');
  return new Plugin({
    key: pluginKey,
    props: {
      // 输入
      handleTextInput (view, from, to, text) {
        if (from === to) return false;
        const node = view.state.doc.nodeAt(from);
        if (node?.type.name === 'nonEditable') {
          return true; // 阻止输入
        }
        return false;
      },
      // 键盘快捷操作：ctrl + v、ctrl + x、backspace、delete
      handleKeyDown (view, event) {
        const { state } = view;
        const { from, to, empty } = state.selection;
        const { doc } = state;

        // ⌨️ 判断删除相关操作
        // const isDeleteKey = event.key === 'Delete' || event.key === 'Backspace';
        // const isPasteOrCut = (event.ctrlKey || event.metaKey) && ['v', 'x'].includes(event.key.toLowerCase());
        // if (!isDeleteKey && !isPasteOrCut) return false;

        // 存在选区，检查范围内是否有 nonEditable
        if (!empty) {
          let hasNonEditable = false;
          doc.nodesBetween(from, to, (node) => {
            if (node.type.name === 'nonEditable') {
              hasNonEditable = true;
              return false; // 停止遍历
            }
            return true;
          });
          if (hasNonEditable) {
            event.preventDefault();
            return true;
          }
        } else {
          // 无选区，检查删除方向对应节点是否为 nonEditable
          let targetNode = null;
          const $pos = doc.resolve(from);

          if (event.key === 'Backspace' && from > 0) {
            if (doc.resolve(from - 1)?.nodeBefore?.type.name === 'nonEditable') {
              event.preventDefault();
              // 🔒 防止跳入 nonEditable：强制恢复 selection
              const safePos = from;
              const newSel = TextSelection.create(state.doc, safePos);
              view.dispatch(state.tr.setSelection(newSel));
              return true;
            }
          }

          if (event.key === 'Delete') {
            // 查找后一个 node
            const afterPos = $pos.after();
            targetNode = doc.nodeAt(afterPos);
            if (targetNode?.type.name === 'nonEditable') {
              event.preventDefault();
              return true;
            }
          }
        }
        return false;
      },
      handleDOMEvents: {
        dragstart (view, event) {
          const target = event.target;
          if (target instanceof HTMLElement && target.closest('[data-type="non-editable"]')) {
            event.preventDefault();
            return true;
          }
          return false;
        }
      }
    }
  });
});

// 创建并注册插入命令（使用 $command 工厂）
export const InsertNonEditableCommand = $command('InsertNonEditable', (ctx) => (user) => {
  return (state, dispatch) => {
    // 是否存在选中内容
    const { from, to } = state.selection;

    if (from === to) return false;

    const schema = ctx.get(schemaCtx);
    const nodeType = schema.nodes['nonEditable'];
    if (!nodeType) return false;

    // 获取选中的片段
    const slice = state.doc.slice(from, to);
    const fragment = slice.content;

    console.log('fragment', fragment)
    // 判断选中的是一个节点还是多个
    const content = fragment.childCount === 1
      ? [fragment.firstChild]
      : fragment.content;
    console.log('content', content)
    // 只允许锁定表格
    // if (content.some(node => node.type.name !== 'table')) {
    //   return false;
    // }
    let wrappedNode = null;
    // if (content.some(node => node.type.name === 'list_item')) {
    if (false) {
      wrappedNode = schema.nodes['nonEditableInline'].create({ user }, content);
    } else {
      wrappedNode = nodeType.create({ user }, content);
    }
    if (!wrappedNode) return false;
    const transaction = state.tr.replaceRangeWith(from, to, wrappedNode);
    dispatch?.(transaction);
    return true;
  };
},);

// 去掉不可编辑节点
export const UnwrapNonEditableCommand = $command('UnwrapNonEditable', (ctx) => (user) => {
  return (state, dispatch) => {
    const { selection } = state;
    const { from, to } = selection;
    const schema = ctx.get(schemaCtx);
    const nodeType = schema.nodes['nonEditable'];
    if (!nodeType) return false;
    // 向上查找是否在 nonEditable 节点中
    if (selection.node && selection.node.type.name === 'nonEditable') {
      const lockUser = selection.node.attrs.user;
      if (lockUser && lockUser !== user) {
        window.parent.postMessage({
          action: 'throwError',
          error: `此内容已锁定，如需编辑，请联系${lockUser}`
        }, '*')
        return false;
      }
      const tableContent = selection.node.content;
      let transaction = state.tr.replaceRangeWith(from, to, tableContent.firstChild);
      dispatch?.(transaction);
      return true;
    }
    return false;
  };
});

export const nonEditable = [nonEditableNode, nonEditableInline, nonEditablePlugin, InsertNonEditableCommand, UnwrapNonEditableCommand];