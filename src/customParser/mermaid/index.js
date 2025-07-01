import mermaid from 'mermaid';
import { codeBlockConfig } from '@milkdown/kit/component/code-block';
import { createSlice } from '@milkdown/kit/ctx'
import { blockMermaidSchema } from './block-mermaid';
import { mermaidBlockInputRule } from './input-rule';
import { remarkMermaidBlockPlugin } from './remark';

const FeaturesCtx = createSlice([], 'FeaturesCtx');
const CrepeFeature = {
  CodeMirror: 'code-mirror',
  ListItem: 'list-item',
  LinkTooltip: 'link-tooltip',
  Cursor: 'cursor',
  ImageBlock: 'image-block',
  BlockEdit: 'block-edit',
  Toolbar: 'toolbar',
  Placeholder: 'placeholder',
  Table: 'table',
  Latex: 'latex',
  Mermaid: 'mermaid',
}
const defaultFeatures = {
  [CrepeFeature.Cursor]: true,
  [CrepeFeature.ListItem]: true,
  [CrepeFeature.LinkTooltip]: true,
  [CrepeFeature.ImageBlock]: true,
  [CrepeFeature.BlockEdit]: true,
  [CrepeFeature.Placeholder]: true,
  [CrepeFeature.Toolbar]: true,
  [CrepeFeature.CodeMirror]: true,
  [CrepeFeature.Table]: true,
  [CrepeFeature.Latex]: true,
  [CrepeFeature.Mermaid]: true,
};


function uuid () {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export const defineFeature = (editor, config) => {
  editor.config((ctx) => {
    ctx.inject(FeaturesCtx, defaultFeatures)
    const flags = ctx.get(FeaturesCtx);
    const isCodeMirrorEnabled = flags[CrepeFeature.CodeMirror];
    if (!isCodeMirrorEnabled) {
      throw new Error('You need to enable CodeMirror to use Mermaid feature');
    }

    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'loose',
      suppressErrorRendering: true,
      ...config
    });
    // 关闭全局错误解析
    mermaid.parseError = () => { };

    ctx.update(codeBlockConfig.key, (prev) => ({
      ...prev,
      renderLanguage: (language, selected) => {
        return `${language} ${selected ? "✅" : ""}`;
      },
      renderPreview: (language, content) => {
        if (language.toLowerCase() === 'mermaid' && content.length > 0) {
          return renderMermaid(content);
        }
        const renderPreview = prev.renderPreview;
        return renderPreview ? renderPreview(language, content) : null;
      },
    }));

  }).use(remarkMermaidBlockPlugin)
    .use(mermaidBlockInputRule)
    .use(blockMermaidSchema);

  return editor;
};


function renderMermaid (content) {
  const graphId = 'mermaid-' + uuid();
  let dom = document.createElement('div');
  dom.className = 'milkdown-mermaid-preview-panel';
  dom.id = graphId;

  (function (divId) {
    try {
      mermaid.parse(content, { suppressErrors: false })
        .then(() => { renderSvg(divId, content); })
        .catch((err) => {
          const previewDiv = document.getElementById(divId);
          if (previewDiv) {
            const svgDiv = previewDiv.querySelector('div.milkdown-mermaid-svg');
            if (!svgDiv) {
              previewDiv.innerHTML = `<span style="color:#DC362E">语法错误: ${err.message}</span>`;
            }
          } else {
            console.error('渲染错误:', err);
          }
        });
    } catch (e) {
      console.error(e);
    }
  })(graphId);

  return dom;
}

function renderSvg (divId, svgContent) {
  const svgId = 'mermaid-svg-' + divId;
  mermaid.render(svgId, svgContent).then((output) => {
    let sTime = Date.now();
    let previewPanel = null;
    while (!(previewPanel = document.getElementById(divId))) {
      if (Date.now() - sTime > 2000) {
        break;
      }
    }
    if (!previewPanel) {
      console.error('Mermaid渲染失败，没有找到渲染节点: div#' + divId);
      return;
    }

    previewPanel.innerHTML = `<div class="milkdown-mermaid-svg"></div>`;

    const svgCode = output.svg;
    const svgPanel = previewPanel.querySelector('.milkdown-mermaid-svg');
    if (!svgPanel) {
      console.error('Mermaid渲染失败，没有找到渲染节点: .milkdown-mermaid-svg');
      return;
    }
    svgPanel.innerHTML = svgCode;
  });
}