import { $prose } from '@milkdown/utils';
import { Plugin } from 'prosemirror-state';
import { BlockProvider } from '@milkdown/kit/plugin/block'

let currEditorView = null;

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

// 块选择
export const blockPlugin = $prose((ctx) => {

  return new Plugin({
    view: (editorView) => {
      let blockDom = document.createElement('div');

      let dragDom = document.createElement('div');
      dragDom.classList = 'operation-item';
      dragDom.innerHTML = `
      <span class="milkdown-icon"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
        <g clip-path="url(#clip0_971_7680)">
          <path d="M11 18C11 19.1 10.1 20 9 20C7.9 20 7 19.1 7 18C7 16.9 7.9 16 9 16C10.1 16 11 16.9 11 18ZM9 10C7.9 10 7 10.9 7 12C7 13.1 7.9 14 9 14C10.1 14 11 13.1 11 12C11 10.9 10.1 10 9 10ZM9 4C7.9 4 7 4.9 7 6C7 7.1 7.9 8 9 8C10.1 8 11 7.1 11 6C11 4.9 10.1 4 9 4ZM15 8C16.1 8 17 7.1 17 6C17 4.9 16.1 4 15 4C13.9 4 13 4.9 13 6C13 7.1 13.9 8 15 8ZM15 10C13.9 10 13 10.9 13 12C13 13.1 13.9 14 15 14C16.1 14 17 13.1 17 12C17 10.9 16.1 10 15 10ZM15 16C13.9 16 13 16.9 13 18C13 19.1 13.9 20 15 20C16.1 20 17 19.1 17 18C17 16.9 16.1 16 15 16Z"></path>
        </g>
        <defs>
          <clipPath id="clip0_971_7680">
            <rect width="24" height="24"></rect>
          </clipPath>
        </defs>
      </svg></span>`;
      blockDom.appendChild(dragDom);
      blockDom.className = 'milkdown-block-handle custom-block-handle'

      const handleMousedown = () => {
        console.log(editorView)
        editorView.focus();
      }

      const provider = new BlockProvider({
        ctx,
        content: blockDom,
        getOffset: () => 6,
        getPlacement: ({ active, blockDom }) => {
          if (active.node.type.name === 'heading') return 'left'

          let totalDescendant = 0
          active.node.descendants((node) => {
            totalDescendant += node.childCount
          })
          const dom = active.el
          const domRect = dom.getBoundingClientRect()
          const handleRect = blockDom.getBoundingClientRect()
          const style = window.getComputedStyle(dom)
          const paddingTop = Number.parseInt(style.paddingTop, 10) || 0
          const paddingBottom = Number.parseInt(style.paddingBottom, 10) || 0
          const height = domRect.height - paddingTop - paddingBottom
          const handleHeight = handleRect.height
          return totalDescendant > 2 || handleHeight < height
            ? 'left-start'
            : 'left'
        }
      });
      blockDom.addEventListener('mousedown', handleMousedown);

      return {
        update (view, prevState) {
          const type = getSelectedNodeType(view.state);
          const isNonEditable = type === 'nonEditable'; // 检查是否是 nonEditable 节点
          if (isNonEditable) {
            blockDom.setAttribute('draggable', 'false');
          } else {
            blockDom.setAttribute('draggable', 'true');
          }
          provider.update(view, prevState);
        },
        destroy: () => {
          provider.destroy();
          blockDom.removeEventListener('mousedown', handleMousedown);
          blockDom.remove();
        }
      }
    },
  });
});    