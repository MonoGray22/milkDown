import { $prose } from '@milkdown/utils';
import { Plugin, TextSelection, } from 'prosemirror-state';
import { TooltipProvider } from '@milkdown/kit/plugin/tooltip'

let currEditorView = null;
function findParent (predicate) {
  return ($pos) => {
    for (let depth = $pos.depth; depth > 0; depth -= 1) {
      const node = $pos.node(depth)

      if (predicate(node)) {
        const from = $pos.before(depth)
        const to = $pos.after(depth)
        return { from, to, node, }
      }
    }

    return undefined
  }
}

function isInList (selection) {
  const type = selection.$from.node(selection.$from.depth - 1)?.type
  return type?.name === 'list_item'
}

function isInTable (selection) {
  const $pos = selection.$anchor
  return findParent((node) => node.type.name === 'table')($pos);
}

// 清除选取
function clearSelection (view) {
  const { state, dispatch } = view;
  const tr = state.tr.setSelection(TextSelection.create(state.doc, state.selection.from));
  dispatch(tr);
}

// 获取选中内容
const getSelectedText = (editorView) => {
  if (!editorView) return '';
  const { state } = editorView;
  const { from, to } = state.selection;
  return state.doc.textBetween(from, to);
};

// 获取选中节点类型
const getSelectedNodeType = (state) => {
  const { selection } = state;
  const { $from } = selection;
  // 如果是节点选中
  if (selection.node) {
    return selection.node.type.name;
  }
  // 如果是文本选中，尝试返回封装它的块级节点名
  for (let depth = $from.depth; depth >= 0; depth--) {
    const node = $from.node(depth);
    if (node.type.isBlock) {
      return node.type.name;
    }
  }
  return null;
};

const createTooltipContent = (type, selection, isHaveLock) => {
  const base = `
    <div class="custom-ai-style" data-label="syntaxCheck">语法检查</div>
    <div class="custom-ai-style" data-label="logicVerification">逻辑验证</div>
    <div class="custom-ai-style" data-label="sumUp">总结</div>
    <div class="custom-ai-style" data-label="expandOn">扩写</div>
    <div class="custom-ai-style" data-label="abbreviate">缩写</div>`;
  const map = {
    nonEditable: `<div class="custom-ai-style" data-label="unlockTable">解锁</div>`,
    nonEditableList: `<div class="custom-ai-style" data-label="unlockTable">解锁</div>`,
    code_block: ' ',
    hr: ' ',
    customLink: ' ',
    image: ' ',
    blockquote: '<div class="custom-ai-style" data-label="lockTable">锁定</div>',
    heading: '<div class="custom-ai-style" data-label="lockTable">锁定</div>',
    ordered_list: '<div class="custom-ai-style" data-label="lockTable">锁定</div>',
    bullet_list: '<div class="custom-ai-style" data-label="lockTable">锁定</div>',
    paragraph: `<div class="custom-ai-style" data-label="lockTable">锁定</div>`,
    table: `<div class="custom-ai-style" data-label="lockTable">锁定</div>`,
    default: base
  };
  if (!isHaveLock) {
    if (map[type].trim()) {
      return map.default;
    } else {
      return '';
    }
  };
  // 表格单元格非文本
  if (isInTable(selection) && !(selection instanceof TextSelection)) {
    return ' ';
  }
  // 是否纯文本
  if (selection instanceof TextSelection) {
    // 是否列表类型文本
    if (!isInList(selection) && ['ordered_list', 'bullet_list'].includes(type)) {
      return map[type] || ' ';
    }
    return map.default
  }
  return map[type] || ' ';
};

const replaceSelectedText = (editorView, newText) => {
  if (!editorView || !newText) return;
  const { state } = editorView;
  const transaction = state.tr.replaceSelectionWith(
    state.schema.text(newText)
  );
  editorView.dispatch(transaction);
  clearSelection(currEditorView);
};

// 创建最简单的选区监听插件
export const selectionTooltipPlugin = (editorId, isHaveLock) => $prose((ctx) => {
  let tooltip = document.createElement('div');
  tooltip.classList = 'milkdown-toolbar'

  const provider = new TooltipProvider({
    content: tooltip,
    offset: 10
  });

  tooltip.onmousedown = (e) => {
    e.preventDefault()
  }

  tooltip.onclick = (e) => {
    e.preventDefault();
    if (e.target.classList.contains('custom-ai-style')) {
      const dataLabel = e.target.getAttribute('data-label');
      if (dataLabel === 'lockTable' || dataLabel === 'unlockTable') {
        provider.hide();
        const tr = currEditorView.state.tr.setMeta(dataLabel, true);
        currEditorView.dispatch(tr);
        return;
      }
      window.parent.postMessage({
        action: 'tooltipClick',
        roomCode: editorId,
        actionLabel: dataLabel, // 传递点击的文本作为 actionLabel 的值
        selectedText: getSelectedText(currEditorView),
      }, '*');
    }
  }

  window.addEventListener('message', (event) => {
    if (event.data.action === 'replaceText' && event.data.roomCode === editorId) {
      const newText = event.data.newText;
      if (currEditorView && newText) {
        provider.hide()
        replaceSelectedText(currEditorView, newText);
      }
    }
  });

  return new Plugin({
    view: (EditorView) => {
      currEditorView = EditorView;
      const container = EditorView.dom.parentElement;
      if (container) {
        container.appendChild(tooltip);
      }
      return {
        update (view) {
          const type = getSelectedNodeType(view.state);
          const { state } = view;
          const { selection } = state;

          //避免空选区触发
          if (selection.empty) {
            provider.hide();
            return;
          }
          tooltip.innerHTML = createTooltipContent(type, selection, isHaveLock);
          provider.update(view);
        },
        destroy: provider.destroy,
      }
    },
  });
});