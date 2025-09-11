import { $prose } from '@milkdown/utils';
import { serializerCtx } from '@milkdown/core';
import { Plugin, TextSelection } from 'prosemirror-state';
import { TooltipProvider } from '@milkdown/kit/plugin/tooltip';

// ====== 配置区 ======
const AI_ACTIONS = [
  { key: 'syntaxCheck', label: '语法检查', icon: 'yufajiancha' },
  { key: 'logicVerification', label: '逻辑验证', icon: 'luojiyanzheng' },
  { key: 'sumUp', label: '总结', icon: 'zongjie' },
  { key: 'expandOn', label: '扩写', icon: 'kuoxie' },
  { key: 'abbreviate', label: '缩写', icon: 'suoxie' },
];
const LOCK_ACTION = {
  // 草拟
  draft: [
    { key: 'optimize', label: '流转至优化中', icon: 'liuzhuan' },
    { key: 'unlockTable', label: '解锁', icon: 'jiesuo' }
  ],
  // 优化中
  optimize: [
    { key: 'reviseRewrite', label: '润色改写', icon: 'runsegaixie' },
    { key: 'verify', label: '流转至已确认', icon: 'liuzhuan' },
    { key: 'unlockTable', label: '解锁', icon: 'jiesuo' }
  ],
  // 已确认
  verify: [{ key: 'unlockTable', label: '解锁', icon: 'jiesuo' }],
  import: [
    { key: 'unlockTable', label: '解锁', icon: 'jiesuo' }
  ]
};

const NODE_ACTION_MAP = {
  nonEditable: singleAction('unlockTable', '解锁'),
  blockquote: singleAction('lockTable', '锁定'),
  heading: singleAction('lockTable', '锁定'),
  ordered_list: singleAction('lockTable', '锁定'),
  bullet_list: singleAction('lockTable', '锁定'),
  list_item: singleAction('lockTable', '锁定'),
  paragraph: singleAction('lockTable', '锁定'),
  table: singleAction('lockTable', '锁定'),
  code_block: ' ',
  hr: ' ',
  customLink: ' ',
  image: ' ',
  default: AI_ACTIONS.map(createDropdownItem).join('')
};

// ====== 工具函数 ======
function createDropdownItem ({ key, label, icon }) {
  return `
    <div class="custom-ai-style-wrapper">
      <div class="custom-ai-style" data-label="${key}"><i class="iconfont icon-${icon}" style="pointer-events: none;"></i> ${label}</div>
      <div class="custom-dropdown">
        <div class="dropdown-item" data-label="${key}-simple">简单</div>
        <div class="dropdown-item" data-label="${key}-full">完整</div>
      </div>
    </div>
  `;
}

function singleAction (key, label, icon = 'suoding') {
  return `<div class="custom-ai-style" data-label="${key}">
  <i class="iconfont icon-${icon}" style="pointer-events: none;"></i> ${label}</div>`;
}

function findParent (predicate) {
  return ($pos) => {
    for (let depth = $pos.depth; depth > 0; depth--) {
      const node = $pos.node(depth);
      if (predicate(node)) {
        return {
          from: $pos.before(depth),
          to: $pos.after(depth),
          node
        };
      }
    }
  };
}

function isInList (selection) {
  const type = selection.$from.node(selection.$from.depth - 1)?.type;
  return type?.name === 'list_item';
}

function isInTable (selection) {
  return findParent((node) => node.type.name === 'table')(selection.$anchor);
}

function clearSelection (view) {
  const { state, dispatch } = view;
  dispatch(state.tr.setSelection(TextSelection.create(state.doc, state.selection.from)));
}

function getSelectedMarkdown (editorView, ctx) {
  if (!editorView) return '';
  const { state } = editorView;
  const { from, to } = state.selection;
  if (from === to) return '';

  const serializer = ctx.get(serializerCtx);
  const slice = state.doc.cut(from, to);
  return serializer(slice);
}

function getSelectedText (editorView) {
  if (!editorView) return '';
  const { state } = editorView;
  return state.doc.textBetween(state.selection.from, state.selection.to);
}

// 获取锁定状态
function getSelectNodeKey (editorView) {
  if (!editorView) return '';
  const { state } = editorView;
  if (state.selection.node) {
    const { key } = state.selection.node.attrs;
    return key;
  }
  return '';
}

function getSelectedNodeType (state) {
  const { selection, selection: { $from } } = state;
  if (selection.node) return selection.node.type.name;

  for (let depth = $from.depth; depth >= 0; depth--) {
    const node = $from.node(depth);
    if (node.type.name === 'list_item') {
      // 返回 list 父级的类型（ordered_list 或 bullet_list）
      const parent = $from.node(depth - 1);
      if (parent) return parent.type.name;
    }
    if (node.type.isBlock) return node.type.name;
  }
  return null;
}


function createTooltipContent (type, selection, isHaveLock, canModifySystemData) {
  if (!isHaveLock) {
    return NODE_ACTION_MAP[type]?.trim() ? NODE_ACTION_MAP.default : '';
  }
  // 选中单元格
  if (isInTable(selection) && !(selection instanceof TextSelection)) return ' ';
  if (selection instanceof TextSelection) {
    return NODE_ACTION_MAP.default;
  }
  // 选中锁定内容需根据状态来展示按钮
  if (['nonEditable'].includes(type)) {
    const { nodeType = 'draft', sourceId, sourceType, editStatus } = selection.node.attrs;
    const list = LOCK_ACTION[nodeType] || LOCK_ACTION.draft;
    if (sourceId && canModifySystemData) {
      if (nodeType === 'verify') {
        if (!['WeightScoringConcept', 'WeightScoringInstance'].includes(sourceType)) {
          return [singleAction('unlockTable', '解锁', 'jiesuo')].join('');
        }
        if (editStatus === 'checkIn') {
          return [
            singleAction('checkout', '检出', 'bianji1'),
            singleAction('unlockTable', '解锁', 'jiesuo')
          ].join('');
        } else {
          return [
            singleAction('checkIn', '撤销检出', 'chexiao'),
            singleAction('update', '更新', 'genghuan'),
            singleAction('unlockTable', '解锁', 'jiesuo')
          ].join('');
        }
      }
      if (editStatus === 'checkout')
        return [{ key: 'checkIn', label: '撤销检出', icon: 'chexiao' }, ...list].map(({ key, label, icon }) => singleAction(key, label, icon || '')).join('');
    }
    if (nodeType === 'verify' && canModifySystemData) {
      return [
        singleAction('import', '创建', 'chuangjian1'),
        singleAction('unlockTable', '解锁', 'jiesuo')
      ].join('');
    }
    return list.map(({ key, label, icon }) => singleAction(key, label, icon || '')).join('');
  }
  return NODE_ACTION_MAP[type] || ' ';
}

function replaceSelectedText (editorView, newText) {
  if (!editorView || !newText) return;
  editorView.dispatch(
    editorView.state.tr.replaceSelectionWith(editorView.state.schema.text(newText))
  );
  clearSelection(editorView);
}

// ====== 插件 ======
export const selectionTooltipPlugin = (editorIdOrGetter, isLockOrGetter, canModifySystemDataGetter) => $prose((ctx) => {
  return new Plugin({
    view: (editorView) => {
      let tooltip = document.createElement('div');
      tooltip.className = 'milkdown-toolbar custom-toolbar';
      const provider = new TooltipProvider({ ctx, content: tooltip, offset: 10 });
      tooltip.onmousedown = (e) => e.preventDefault();

      tooltip.onclick = (e) => {
        e.preventDefault();
        const target = e.target;
        const { selection } = editorView.state;

        if (target.classList.contains('dropdown-item') || target.classList.contains('custom-ai-style')) {
          const dataLabel = target.getAttribute('data-label');
          const editorId = typeof editorIdOrGetter === 'function' ? editorIdOrGetter() : editorIdOrGetter;

          if (['lockTable', 'unlockTable'].includes(dataLabel)) {
            provider.hide();
            editorView.dispatch(editorView.state.tr.setMeta(dataLabel, true));
            return;
          }

          if (['optimize', 'verify'].includes(dataLabel)) {
            editorView.dispatch(editorView.state.tr.setMeta('updateLock', { dataLabel }));
          }
          provider.hide();
          window.parent.postMessage({
            action: 'tooltipClick',
            roomCode: editorId,
            actionLabel: dataLabel,
            key: getSelectNodeKey(editorView),
            infoParams: selection.node?.attrs,
            selectedText: getSelectedText(editorView),
            selectedMarkdown: getSelectedMarkdown(editorView, ctx),
          }, '*');
        }
      };
      const onMessage = (event) => {
        const { data } = event || {};
        if (!data) return;
        const editorId = typeof editorIdOrGetter === 'function' ? editorIdOrGetter() : editorIdOrGetter;
        if (data.roomCode === editorId) {
          if (data.action === 'replaceText') {
            replaceSelectedText(editorView, data.newText);
          }
          if (data.action === 'replaceNode') {
            editorView.dispatch(editorView.state.tr.setMeta('updateLock', { dataLabel: 'optimize', markdownContent: data.newText }));
          }
          // 更新锁定类型属性: 检入/检出；创建/更新
          if (data.action === 'updateLockAttr') {
            editorView.dispatch(editorView.state.tr.setMeta('updateLock', { dataLabel: 'verify', infoParams: data.infoParams, markdownContent: data.markdownContent }));
          }
          provider.hide();
        }
      };
      window.addEventListener('message', onMessage);

      let lastFrom = null;
      let lastTo = null;
      return {
        update (view) {
          const { selection } = view.state;
          if (selection.from === lastFrom && selection.to === lastTo) return;
          lastFrom = selection.from;
          lastTo = selection.to;
          const type = getSelectedNodeType(view.state);
          if (selection.empty) {
            provider.hide();
            return;
          }

          tooltip.innerHTML = createTooltipContent(
            type,
            selection,
            typeof isLockOrGetter === 'function' ? isLockOrGetter() : isLockOrGetter,
            typeof canModifySystemDataGetter === 'function' ? canModifySystemDataGetter() : canModifySystemDataGetter);
          provider.update(view);
        },
        destroy: () => {
          provider.destroy();
          tooltip.remove();
          window.removeEventListener('message', onMessage);
        }
      };
    }
  });
});
