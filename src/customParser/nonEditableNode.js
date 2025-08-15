import { $node, $command, $prose } from '@milkdown/utils';
import { parserCtx, schemaCtx, serializerCtx } from '@milkdown/core';
import { Plugin, PluginKey, TextSelection } from '@milkdown/prose/state';

// 定义不可编辑节点(div)
export const nonEditableNode = $node('nonEditable', () => ({
  group: 'block',
  content: 'block+',
  atom: true,
  selectable: true,
  draggable: false,
  attrs: {
    user: { default: null },
    key: { default: null },
    nodeType: { default: null }
  },
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
    const classes = ['non-editable'];
    if (node.attrs.nodeType) classes.push(`non-editable-${node.attrs.nodeType}`);
    return [
      'div',
      {
        'data-type': 'non-editable',
        'data-user': node.attrs.user,
        'data-key': node.attrs.key,
        'data-nodeType': node.attrs.nodeType,
        class: classes.join(' '),
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
        if (['nonEditable'].includes(node?.type.name)) {
          return true; // 阻止输入
        }
        return false;
      },
      // 键盘快捷操作：ctrl + v、ctrl + x、backspace、delete
      handleKeyDown (view, event) {
        const { state } = view;
        const { from, to, empty } = state.selection;
        const { doc } = state;

        // 存在选区，检查范围内是否有 nonEditable
        if (!empty) {
          let hasNonEditable = false;
          doc.nodesBetween(from, to, (node) => {
            if (['nonEditable'].includes(node.type.name)) {
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
            if (['nonEditable'].includes(doc.resolve(from - 1)?.nodeBefore?.type.name)) {
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
            if (['nonEditable'].includes(targetNode?.type.name)) {
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
export const InsertNonEditableCommand = $command('InsertNonEditable', (ctx) => ({ user, editorId }) => {
  return (state, dispatch) => {
    // 是否存在选中内容
    const { from, to } = state.selection;
    if (from === to) return false;

    const schema = ctx.get(schemaCtx);
    const nodeType = schema.nodes['nonEditable'];
    const listNode = schema.nodes['bullet_list'];
    if (!nodeType) return false;

    const nodeKey = new Date().getTime() + Math.random().toString(36).substring(2, 15);
    let wrappedContent = null;

    const slice = state.doc.slice(from, to);
    const fragment = slice.content;
    wrappedContent = fragment.childCount === 1
      ? [fragment.firstChild]
      : fragment.content;

    // === 检测是否选中列表节点 ===
    const isLisNode = wrappedContent.some(el => el.type.name === 'list_item');

    if (isLisNode) {
      wrappedContent = listNode.create({}, wrappedContent);
    }

    const wrappedNode = nodeType.create(
      { user, key: nodeKey, nodeType: 'draft' },
      wrappedContent
    );

    if (!wrappedNode) return false;

    const serializer = ctx.get(serializerCtx);
    const docNode = schema.nodes.doc.create(null, wrappedNode.content);

    // 锁定内容
    window.parent.postMessage({
      action: 'lockData',
      roomCode: editorId,
      nodeKey,
      selectedMarkdown: serializer(docNode),
    }, '*')

    const tr = state.tr.replaceRangeWith(from, to, wrappedNode);
    const resolvedPos = tr.doc.resolve(from + 1);
    tr.setSelection(TextSelection.create(tr.doc, resolvedPos.pos));

    dispatch?.(tr);
    return true;
  };
});

// 去掉不可编辑节点
export const UnwrapNonEditableCommand = $command('UnwrapNonEditable', (ctx) => ({ user, editorId }) => {
  return (state, dispatch) => {
    const { selection } = state;
    const { from, to } = selection;
    const schema = ctx.get(schemaCtx);
    const nodeType = schema.nodes['nonEditable'];
    if (!nodeType) return false;
    // 向上查找是否在 nonEditable 节点中
    if (selection.node && ['nonEditable'].includes(selection.node.type.name)) {
      const lockUser = selection.node.attrs.user;
      const nodeKey = selection.node.attrs.key;
      // if (lockUser && lockUser !== user) {
      //   window.parent.postMessage({
      //     action: 'throwError',
      //     roomCode: editorId,
      //     error: `此内容已锁定，如需编辑，请联系${lockUser}`
      //   }, '*')
      //   return false;
      // }
      const tableContent = selection.node.content;
      // 解锁内容
      window.parent.postMessage({
        action: 'unlockData',
        roomCode: editorId,
        nodeKey,
      }, '*')
      let transaction = state.tr.replaceRangeWith(from, to, tableContent);
      dispatch?.(transaction);
      return true;
    }
    return false;
  };
});

// 更新 nonEditable 节点属性
export const UpdateNonEditableCommand = $command('UpdateNonEditable', (ctx) => ({ user, editorId, attrs = {}, markdownContent }) => {
  return (state, dispatch) => {
    const { selection } = state;
    const { from, to } = selection;
    const schema = ctx.get(schemaCtx);
    const parser = ctx.get(parserCtx);

    const nodeType = schema.nodes['nonEditable'];

    if (!nodeType) return false;

    let targetNode = null;
    let pos = null;

    // 找到选中的 nonEditable 节点
    state.doc.nodesBetween(from, to, (node, nodePos) => {
      if (['nonEditable'].includes(node.type.name)) {
        targetNode = node;
        pos = nodePos;
        return false; // 停止遍历
      }
      return true;
    });

    if (!targetNode || pos === null) return false;

    // 权限检查（如果 user 不同则不允许修改）
    // const lockUser = targetNode.attrs?.user;
    // if (lockUser && lockUser !== user && attrs.nodeType === 'import') {
    //   window.parent.postMessage({
    //     action: 'throwError',
    //     roomCode: editorId,
    //     error: `如需导入，请联系 ${lockUser}`
    //   }, '*');
    //   return false;
    // }

    const newAttrs = { ...targetNode.attrs, ...attrs };
    let updatedNode = targetNode;
    // 处理 markdownContent
    if (markdownContent) {
      try {
        const docNode = parser(markdownContent);
        const fragment = docNode.content;
        const content = fragment.childCount === 1
          ? [fragment.firstChild]
          : fragment.content;
        updatedNode = nodeType.create(newAttrs, content);
      } catch (err) {
        console.error('Markdown 解析失败:', err);
        return false;
      }
    } else {
      updatedNode = targetNode.type.create(newAttrs, targetNode.content, targetNode.marks);
    }

    // 创建更新后的节点
    const tr = state.tr.replaceWith(pos, pos + targetNode.nodeSize, updatedNode);

    // 保持光标在节点上
    tr.setSelection(TextSelection.create(tr.doc, pos + 1));

    dispatch?.(tr);
    return true;
  };
});

export const nonEditable = [nonEditableNode, nonEditablePlugin, InsertNonEditableCommand, UnwrapNonEditableCommand, UpdateNonEditableCommand];