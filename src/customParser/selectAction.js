import { $prose } from '@milkdown/utils';
import { parserCtx, serializerCtx } from '@milkdown/core';
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
    { key: 'unlockTable', label: '解锁', icon: 'jiesuo' },
    { key: 'quoteEditor', label: '引用至对话框', icon: 'yinhao' }
  ],
  // 优化中
  optimize: [
    { key: 'reviseRewrite', label: '润色改写', icon: 'runsegaixie' },
    { key: 'verify', label: '流转至已确认', icon: 'liuzhuan' },
    { key: 'unlockTable', label: '解锁', icon: 'jiesuo' },
    { key: 'quoteEditor', label: '引用至对话框', icon: 'yinhao' }
  ],
  // 已确认
  verify: [
    { key: 'unlockTable', label: '解锁', icon: 'jiesuo' },
    { key: 'quoteEditor', label: '引用至对话框', icon: 'yinhao' }
  ],
  import: [
    { key: 'unlockTable', label: '解锁', icon: 'jiesuo' },
    { key: 'quoteEditor', label: '引用至对话框', icon: 'yinhao' }
  ]
};

const NODE_ACTION_MAP = (canModifySystemData) => {
  return {
    blockquote: singleAction({ key: 'lockTable', label: '锁定', canModifySystemData }),
    heading: singleAction({ key: 'lockTable', label: '锁定', canModifySystemData }),
    ordered_list: singleAction({ key: 'lockTable', label: '锁定', canModifySystemData }),
    bullet_list: singleAction({ key: 'lockTable', label: '锁定', canModifySystemData }),
    list_item: singleAction({ key: 'lockTable', label: '锁定', canModifySystemData }),
    paragraph: singleAction({ key: 'lockTable', label: '锁定', canModifySystemData }),
    table: singleAction({ key: 'lockTable', label: '锁定', canModifySystemData }),
    code_block: ' ',
    hr: ' ',
    customLink: ' ',
    image: ' ',
    default: AI_ACTIONS.map(createDropdownItem).join('')
  }
};

// ====== 工具函数 ======
function createDropdownItem ({ key, label, icon }) {
  return `
    <div class="custom-ai-style-wrapper">
      <div class="custom-ai-style"><i class="iconfont icon-${icon}" style="pointer-events: none;"></i> ${label}</div>
      <div class="custom-dropdown">
        <div class="dropdown-item" data-label="${key}-simple">简单</div>
        <div class="dropdown-item" data-label="${key}-full">完整</div>
      </div>
    </div>
  `;
}

function singleAction ({ key, label, icon = 'suoding', canModifySystemData }) {
  if (key === 'lockTable' && canModifySystemData) {
    return `
        <div class="custom-ai-style-wrapper">
        <div class="custom-ai-style"><i class="iconfont icon-${icon}" style="pointer-events: none;"></i> ${label}</div>
        <div class="custom-dropdown">
          <div class="dropdown-item" data-label="${key}-frozen">固化</div>
          <div class="dropdown-item" data-label="${key}-transition">研讨</div>
        </div>
      </div>
    `;
  }
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
  const actionMap = NODE_ACTION_MAP(canModifySystemData)
  if (!isHaveLock) {
    return actionMap[type]?.trim() ? actionMap.default : '';
  }
  // 选中单元格
  if (isInTable(selection) && !(selection instanceof TextSelection)) return ' ';
  if (selection instanceof TextSelection) {
    return actionMap.default;
  }
  // 选中锁定内容需根据状态来展示按钮
  if (['nonEditable'].includes(type)) {
    const { nodeType = 'draft', lockType = 'transition', sourceId, sourceType, editStatus } = selection.node.attrs;
    const list = LOCK_ACTION[nodeType] || LOCK_ACTION.draft;
    if (sourceId && canModifySystemData) {
      const sourceNum = String(sourceId).split(',').length;
      if (nodeType === 'verify') {
        if (!['WeightScoringConcept', 'WeightScoringInstance'].includes(sourceType)) {
          return [singleAction({ key: 'unlockTable', label: '解锁', icon: 'jiesuo' })].join('');
        }
        if (editStatus === 'checkIn') {
          if (sourceNum > 1) {
            return [
              singleAction({ key: 'checkout', label: '检出', icon: 'bianji1' }),
              singleAction({ key: 'unlockTable', label: '解锁', icon: 'jiesuo' })
            ].join('');
          }
          return [singleAction({ key: 'unlockTable', label: '解锁', icon: 'jiesuo' })].join('');
        } else {
          if (sourceNum > 1) {
            return [
              singleAction({ key: 'checkIn', label: '撤销检出', icon: 'chexiao' }),
              singleAction({ key: 'update', label: '更新', icon: 'genghuan' }),
              singleAction({ key: 'unlockTable', label: '解锁', icon: 'jiesuo' })
            ].join('');
          }
          return [
            singleAction({ key: 'update', label: '更新', icon: 'genghuan' }),
            singleAction({ key: 'unlockTable', label: '解锁', icon: 'jiesuo' })
          ].join('');
        }
      }
      if (editStatus === 'checkout')
        if (sourceNum > 1) {
          return [{ key: 'checkIn', label: '撤销检出', icon: 'chexiao' }, ...list].map(({ key, label, icon }) => singleAction({ key, label, icon: icon || '' })).join('');
        }
      return [...list].map(({ key, label, icon }) => singleAction({ key, label, icon: icon || '' })).join('');
    }
    if (nodeType === 'verify' && canModifySystemData && lockType === 'frozen') {
      return [
        singleAction({ key: 'import', label: '创建', icon: 'chuangjian1' }),
        singleAction({ key: 'unlockTable', label: '解锁', icon: 'jiesuo' })
      ].join('');
    }
    return list.map(({ key, label, icon }) => singleAction({ key, label, icon: icon || '' })).join('');
  }
  return actionMap[type] || ' ';
}

function replaceSelectedText (ctx, editorView, newText) {
  if (!editorView || !newText) return;
  const parser = ctx.get(parserCtx);
  let content;
  let tr;
  try {
    content = parser(newText);
    tr = editorView.state.tr.replaceSelectionWith(content);
  } catch (err) {
    console.error('Markdown 解析失败:', err);
    tr = editorView.state.tr.replaceSelectionWith(editorView.state.schema.text(newText));
    return false;
  }
  editorView.dispatch(tr);
  clearSelection(editorView);
}

// 判断是否能锁定为固化
function checkStandardContent (str) {
  // (?=.*名称:\s*\S+) ：正向预查，确保包含"名称:"且后面有非空值（\s*匹配任意空格，\S+匹配至少一个非空格字符）
  // (?=.*定义:\s*\S+) ：正向预查，确保包含"定义:"且后面有非空值
  // .* ：匹配任意字符，允许其他属性存在
  // s修饰符：让.匹配包括换行在内的所有字符
  const reg = /^(?=.*\s*名称\s*[:：]\s*\S+)(?=.*\s*定义\s*[:：]\s*\S+).*$/s;

  // 边界处理：非字符串、空字符串、纯空格字符串直接返回false
  if (typeof str !== 'string' || str.trim() === '') return false;

  return reg.test(str);
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
          if (!dataLabel) return;
          const editorId = typeof editorIdOrGetter === 'function' ? editorIdOrGetter() : editorIdOrGetter;
          // 锁定/解锁
          if (['lockTable', 'unlockTable'].includes(dataLabel)) {
            provider.hide();
            editorView.dispatch(editorView.state.tr.setMeta(dataLabel, true));
            return;
          }
          // 锁定为固化/研讨
          if (['lockTable-frozen', 'lockTable-transition'].includes(dataLabel)) {
            const lockType = dataLabel.split('-')[1];
            provider.hide();
            if (lockType === 'frozen') {
              if (!checkStandardContent(getSelectedText(editorView)))
                return;
            }
            editorView.dispatch(editorView.state.tr.setMeta('lockTable', { attrs: { lockType } }));
            return;
          }
          // 流转状态至优化中, 'verify'
          if (['optimize'].includes(dataLabel)) {
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
            replaceSelectedText(ctx, editorView, data.newText);
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
