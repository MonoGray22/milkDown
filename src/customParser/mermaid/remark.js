import { $remark } from '@milkdown/kit/utils';
import { visit } from 'unist-util-visit';

function visitMermaidBlock (ast) {
  return visit(
    ast,
    'mermaid',
    (node, index, parent) => {
      const { value } = node;
      const newNode = {
        type: 'code',
        lang: 'mermaid',
        value,
      };
      parent.children.splice(index, 1, newNode);
    }
  );
}

/**
 * 将Mermaid块转换为代码块的remark插件
 */
export const remarkMermaidBlockPlugin = $remark(
  'remarkMermaidBlock',
  () => () => visitMermaidBlock
);