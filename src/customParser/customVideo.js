import { $inputRule, $node, $remark } from '@milkdown/utils';
import { InputRule } from '@milkdown/prose/inputrules';
import { visit } from 'unist-util-visit';

const videoNode = $node('video', () => ({
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,
  attrs: { src: { default: '' }, },
  parseDOM: [
    {
      tag: 'video[src]',
      getAttrs: (dom) => {
        if (!(dom instanceof HTMLVideoElement)) return false;
        return { src: dom.getAttribute('src') };
      },
    },
  ],
  toDOM: (node) => [
    'video',
    {
      controls: 'true',
      style: 'display: block; width: 60%; margin: 0 auto; height: auto;',
      src: node.attrs.src,
    },
  ],
  parseMarkdown: {
    match: (node) => node.type === 'video',
    runner: (state, node) => {
      state.openNode('video', { src: node.data?.src });
      state.closeNode();
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'video',
    runner: (state, node) => {
      node.content.forEach(child => state.next(child));
    },
  },
}));

const videoInputRule = $inputRule(() => {
  return new InputRule(/::video\{src="([^"]+)"\}$/, (state, match, start, end) => {
    const [matched, src] = match;
    const { tr } = state;
    const nodeType = state.schema.nodes['video'];

    if (!nodeType) return null;

    const node = nodeType.create({ src });
    tr.replaceWith(start, end, node);

    return tr;
  });
});

const remarkVideo = $remark('remark-video', () => () => (tree) => {
  visit(tree, 'text', (node, index, parent) => {
    if (typeof node.value !== 'string') return;

    const regex = /::video\{src="([^"]+)"\}/g;
    const matches = [...node.value.matchAll(regex)];
    if (matches.length === 0) return;

    const newChildren = [];
    let lastIndex = 0;

    for (const match of matches) {
      const [full, src] = match;
      const start = match.index ?? 0;

      if (start > lastIndex) {
        newChildren.push({
          type: 'text',
          value: node.value.slice(lastIndex, start),
          children: [],
        });
      }

      newChildren.push({
        type: 'video',
        data: { src },
        children: [],
      });

      lastIndex = start + full.length;
    }

    if (lastIndex < node.value.length) {
      newChildren.push({
        type: 'text',
        value: node.value.slice(lastIndex),
      });
    }

    if (parent && Array.isArray(parent.children)) {
      parent.children.splice(index, 1, ...newChildren);
    }
  });
});


export const video = [videoNode, videoInputRule, remarkVideo];
