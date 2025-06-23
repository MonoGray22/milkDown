import { $node, $command, $prose } from '@milkdown/utils';
import { schemaCtx, serializerCtx } from '@milkdown/core';
import { Plugin, PluginKey, TextSelection } from '@milkdown/prose/state';

// 定义不可编辑节点(div)
export const nonEditableNode = $node('nonEditable', () => ({
  group: 'block',
  content: 'block+',
  atom: true,
  selectable: true,
  draggable: false,
  attrs: { user: { default: null }, key: { default: null } },
  parseDOM: [
    {
      tag: 'div[data-type="non-editable"]',
      getAttrs: (dom) => {
        if (dom instanceof HTMLElement) {
          return { user: dom.getAttribute('data-user'), key: dom.getAttribute('data-key') };
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
        'data-key': node.attrs.key,
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
      state.openNode('nonEditable');
      node.content.forEach(child => state.next(child));
      state.closeNode();
    }
  },
  toMarkdown: {
    match: (node) => node.type.name === 'nonEditable',
    runner: (state, node) => {
      node.content.forEach(child => state.next(child));
    },
  },
}));

export const nonEditableList = $node('nonEditableList', () => ({
  group: 'block',
  content: 'list_item+',
  atom: true,
  selectable: true,
  draggable: false,
  attrs: {
    listType: { default: 'ul' }, // 可选 'ul' 或 'ol'
    user: { default: null },
    key: { default: null },
  },
  parseDOM: [
    {
      tag: 'ul[data-type="non-editable"]',
      getAttrs: (dom) => {
        if (dom instanceof HTMLElement) {
          return {
            listType: 'ul',
            user: dom.getAttribute('data-user'),
            key: dom.getAttribute('data-key'),
          };
        }
        return false;
      },
    },
    {
      tag: 'ol[data-type="non-editable"]',
      getAttrs: (dom) => {
        if (dom instanceof HTMLElement) {
          return {
            listType: 'ol',
            user: dom.getAttribute('data-user'),
            key: dom.getAttribute('data-key'),
          };
        }
        return false;
      },
    },
  ],
  toDOM: (node) => {
    const tagName = node.attrs.listType === 'ol' ? 'ol' : 'ul';
    return [
      tagName,
      {
        'data-type': 'non-editable',
        'data-user': node.attrs.user,
        'data-key': node.attrs.key,
        class: 'non-editable',
        contentEditable: 'false',
        tabindex: '-1',
      },
      0,
    ];
  },
  parseMarkdown: {
    match: (node) => node.type.name === 'nonEditableList',
    runner: (state, node) => {
      state.openNode('nonEditable');
      node.content.forEach(child => state.next(child));
      state.closeNode();
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'nonEditableList',
    runner: (state, node) => {
      node.content.forEach(child => state.next(child));
    },
  },
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
        if (['nonEditableList', 'nonEditable'].includes(node?.type.name)) {
          return true; // 阻止输入
        }
        return false;
      },
      // 键盘快捷操作：ctrl + v、ctrl + x、backspace、delete
      handleKeyDown (view, event) {
        const { state } = view;
        const { from, to, empty } = state.selection;
        const { doc } = state;

        // 存在选区，检查范围内是否有 nonEditable/nonEditableList
        if (!empty) {
          let hasNonEditable = false;
          doc.nodesBetween(from, to, (node) => {
            if (['nonEditableList', 'nonEditable'].includes(node.type.name)) {
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
          // 无选区，检查删除方向对应节点是否为 nonEditable/nonEditableList
          let targetNode = null;
          const $pos = doc.resolve(from);

          if (event.key === 'Backspace' && from > 0) {
            if (['nonEditableList', 'nonEditable'].includes(doc.resolve(from - 1)?.nodeBefore?.type.name)) {
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
            if (['nonEditableList', 'nonEditable'].includes(targetNode?.type.name)) {
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

    // 判断选中的是一个节点还是多个
    const content = fragment.childCount === 1
      ? [fragment.firstChild]
      : fragment.content;
    // 只允许锁定表格
    // if (content.some(node => node.type.name !== 'table')) {
    //   return false;
    // }
    let wrappedNode = null;
    const nodeKey = new Date().getTime() + Math.random().toString(36).substring(2, 15);
    if (content.some(node => node.type.name === 'list_item')) {
      wrappedNode = schema.nodes['nonEditableList'].create({ user, listType: 'ol', key: nodeKey }, content);
    } else {
      wrappedNode = nodeType.create({ user, key: nodeKey }, content);
    }
    if (!wrappedNode) return false;
    const serializer = ctx.get(serializerCtx);
    const docNode = schema.nodes.doc.create(null, fragment);
    // 锁定内容
    window.parent.postMessage({
      action: 'lockData',
      nodeKey,
      selectedMarkdown: serializer(docNode),
    }, '*')
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
    const nodeListType = schema.nodes['nonEditableList'];
    if (!nodeType || !nodeListType) return false;
    // 向上查找是否在 nonEditable/nonEditableList 节点中
    if (selection.node && ['nonEditableList', 'nonEditable'].includes(selection.node.type.name)) {
      const lockUser = selection.node.attrs.user;
      const nodeKey = selection.node.attrs.key;
      if (lockUser && lockUser !== user) {
        window.parent.postMessage({
          action: 'throwError',
          error: `此内容已锁定，如需编辑，请联系${lockUser}`
        }, '*')
        return false;
      }
      const tableContent = selection.node.content;
      // 解锁内容
      window.parent.postMessage({
        action: 'unlockData',
        nodeKey,
      }, '*')
      let transaction = state.tr.replaceRangeWith(from, to, tableContent.firstChild);
      dispatch?.(transaction);
      return true;
    }
    return false;
  };
});

export const nonEditable = [nonEditableNode, nonEditableList, nonEditablePlugin, InsertNonEditableCommand, UnwrapNonEditableCommand];