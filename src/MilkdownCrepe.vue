<script setup>
import { collab, collabServiceCtx } from "@milkdown/plugin-collab";
import { LanguageDescription } from '@codemirror/language'
import { getMarkdown, getHTML, insert, replaceAll } from '@milkdown/utils';
import { parserCtx } from '@milkdown/core';
import { commandsCtx, defaultValueCtx, editorViewCtx } from "@milkdown/kit/core";
import { TextSelection } from 'prosemirror-state'
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { blockPlugin } from './customParser/blockAction.js';
import { block } from '@milkdown/plugin-block'
import { lockTableListener, unlockTableListener, updateLockListener } from './customParser/listener.js';
import { nonEditable, nonEditablePlugin, InsertNonEditableCommand, UnwrapNonEditableCommand, UpdateNonEditableCommand } from './customParser/nonEditableNode.js';
import { nonEditLabel } from './customParser/labelNode.js';
import { customLinkPlugin } from './customParser/customLink.js';
import { selectionTooltipPlugin } from './customParser/selectAction.js';
import { underline } from './customParser/customUnderline.js';
import { video } from './customParser/customVideo';
import { defineFeature } from './customParser/mermaid/index.js';
import { remarkPreserveEmptyLinePlugin } from "@milkdown/preset-commonmark";
import { commonmark, syncHeadingIdPlugin } from "@milkdown/kit/preset/commonmark";
import { imageBlockComponent } from '@milkdown/kit/component/image-block'
import { upload, uploadConfig } from '@milkdown/kit/plugin/upload';
import { languages } from '@codemirror/language-data'
import { Doc } from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { Crepe } from "@milkdown/crepe";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';

// -------------------- 基本状态 --------------------
const editorRoot = ref(null);
let currCrepe = null;
let wsProvider = null;
let collabService = null;
let syncedHandler = null;  // 缓存监听器函数
const processedTokens = new Set();

// 目录相关状态
const tableOfContents = ref([]);
const isTocVisible = ref(true);
const tocExpanded = ref(true);

const myLanguages = [
  LanguageDescription.of({
    name: 'Mermaid',
    alias: ['mermaid', 'graph', 'flow'],
    load: () => import('@codemirror/lang-javascript').then((m) => m.javascript())
  })
];

const defaultValue = ref('# markdown');
const uploadParams = ref(null);
const userInfo = ref({ name: '用户' });
const websocketParams = ref({ url: 'ws://113.57.121.225:8713', room: 'markdown' });
const isHaveLock = ref(true);
const isHaveLine = ref(true);
const canModifySystemData = ref(false); // 是否能对系统数据做更改

let doc = new Doc();
const randomColor = () => Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');

// -------------------- 编辑器创建 --------------------
function createEditor (callback) {
  const crepe = new Crepe({
    root: editorRoot.value,
    features: {
      [Crepe.Feature.Toolbar]: false,
      [Crepe.Feature.Placeholder]: false,
      [Crepe.Feature.BlockEdit]: false
    },
    featureConfigs: {
      "code-mirror": { languages: [...languages, ...myLanguages] }
    },
  });
  currCrepe = crepe;

  const editor = crepe.editor;

  // 监听器注册
  editor.config((ctx) => {
    // 锁定
    ctx.get(listenerCtx).lockTable = (params) => {
      requestAnimationFrame(() => {
        editor.action((ctx) => {
          ctx.get(commandsCtx).call(InsertNonEditableCommand.key, {
            user: userInfo.value.name,
            editorId: websocketParams.value.room,
            ...params
          });
        });
      });
    };
    // 解锁
    ctx.get(listenerCtx).unlockTable = (params) => {
      requestAnimationFrame(() => {
        editor.action((ctx) => {
          ctx.get(commandsCtx).call(UnwrapNonEditableCommand.key, {
            user: userInfo.value.name,
            editorId: websocketParams.value.room,
            ...params
          });
        });
      });
    };
    // 更新锁定属性
    ctx.get(listenerCtx).updateLock = (params = { infoParams: {} }) => {
      requestAnimationFrame(() => {
        editor.action((ctx) => {
          ctx.get(commandsCtx).call(UpdateNonEditableCommand.key, {
            user: userInfo.value.name,
            editorId: websocketParams.value.room,
            attrs: { nodeType: params.dataLabel, ...params.infoParams },
            markdownContent: params.markdownContent
          });
        });
      });
    };
    // 图片上传
    ctx.update(uploadConfig.key, (defaultConfig) => {
      if (!uploadParams.value) return defaultConfig;
      return {
        ...defaultConfig,
        uploader: async (files, schema) => {
          const { url, config, imagePrefix } = uploadParams.value;
          const images = [];
          for (let i = 0; i < files.length; i++) {
            const file = files.item(i);
            if (!file) {
              continue;
            }
            // 仅处理图片类型文件
            if (!file.type.includes('image')) {
              continue;
            }
            images.push(file);
          }
          const nodes = await Promise.all(
            images.map(async (image) => {
              const formdata = new FormData();
              formdata.append('image', image);
              const res = await fetch(url, {
                method: 'POST',
                mode: 'cors',
                headers: { 'Accept': 'application/json', ...config.headers },
                body: formdata
              });
              const src = await res.json();
              return schema.nodes.image.createAndFill({ src: imagePrefix + src.url });
            })
          );
          return nodes;
        }
      };
    });
  }).use(listener)
    .use(collab)
    .use(imageBlockComponent)
    .use(underline)
    .use(video)
    .use(nonEditablePlugin(() => websocketParams.value.room))
    .use(nonEditable)
    .use(nonEditLabel)
    .use(customLinkPlugin)
    .use(block)
    .use(blockPlugin)
    .use(commonmark)
    .use(selectionTooltipPlugin(() => websocketParams.value.room, () => isHaveLock.value, () => canModifySystemData.value))
    .use(unlockTableListener)
    .use(lockTableListener)
    .use(updateLockListener)
    .use(upload);

  // 添加流程图支持
  defineFeature(editor);

  editor.remove(syncHeadingIdPlugin);
  editor.remove(remarkPreserveEmptyLinePlugin);

  currCrepe.create().then(() => {
    setupTocListener();
    callback?.();
  });
}

// -------------------- 工具方法 --------------------
function getCurrMarkdown () {
  if (!currCrepe) return;
  window.parent.postMessage({
    action: 'getMarkdown',
    roomCode: websocketParams.value.room,
    html: currCrepe.editor.action(getHTML()),
    markdown: currCrepe.editor.action(getMarkdown())
  }, '*');
}

// 生成目录
function generateTableOfContents () {
  if (!currCrepe) return;
  const toc = [];
  let idCounter = 1;
  let needsUpdate = false;
  let transactions = [];

  currCrepe.editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    if (!view) {
      return;
    }

    const { state } = view;
    const { doc } = state;

    // 遍历文档结构，提取标题节点
    doc.descendants((node, pos) => {
      if (node.type.name === 'heading') {
        const level = node.attrs.level;
        const text = node.textContent;
        const id = `heading-${idCounter++}`;

        // 为标题节点添加 id 属性
        if (!node.attrs.id) {
          needsUpdate = true;
          transactions.push({
            pos,
            attrs: {
              ...node.attrs,
              id
            }
          });
        }

        toc.push({
          id: node.attrs.id || id,
          text,
          level,
          pos
        });
      }
    });

    // 统一应用所有事务
    if (needsUpdate) {
      let tr = state.tr;
      transactions.forEach(({ pos, attrs }) => {
        tr = tr.setNodeMarkup(pos, null, attrs);
      });
      view.dispatch(tr);
    }
  });

  tableOfContents.value = toc;
}
// 监听编辑器内容变化，更新目录
function setupTocListener () {
  if (!currCrepe) return;

  currCrepe.editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    if (!view) {
      return;
    }

    // 初始生成目录
    generateTableOfContents();

    // 使用 ProseMirror 的方式监听文档变化
    const originalDispatch = view.dispatch;
    view.dispatch = (tr) => {
      const result = originalDispatch.call(view, tr);
      // 当文档内容发生变化时，更新目录
      if (tr.docChanged) {
        generateTableOfContents();
      }
      return result;
    };
  });
}

// 滚动到指定标题
function scrollToHeading (id) {
  if (!currCrepe) {
    return;
  }

  currCrepe.editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    if (!view) {
      return;
    }

    const { state } = view;
    const { doc } = state;

    let targetPos = null;
    let targetNode = null;

    doc.descendants((node, pos) => {
      if (node.type.name === 'heading' && node.attrs.id === id) {
        targetPos = pos;
        targetNode = node;
        return false; // 停止遍历
      }
    });

    if (targetPos !== null && targetNode) {
      // 创建一个选择并滚动到该位置
      const tr = state.tr.setSelection(TextSelection.create(state.doc, targetPos));
      view.dispatch(tr);
      view.focus();

      // 滚动到视图可见区域
      try {
        // 获取标题节点的 DOM 元素
        const domAtPos = view.domAtPos(targetPos);

        if (domAtPos.node) {
          // 找到实际的标题元素
          let headingElement = domAtPos.node;

          // 向上查找，直到找到标题元素或到达根元素
          while (headingElement && headingElement.nodeType !== 1) {
            headingElement = headingElement.parentElement;
          }

          // 如果找到的元素不是标题元素，继续向上查找
          while (headingElement && headingElement.tagName && !headingElement.tagName.match(/^H[1-6]$/)) {
            headingElement = headingElement.parentElement;
          }

          if (headingElement) {
            // 使用 scrollIntoView 方法，确保标题滚动到页面中央
            headingElement.scrollIntoView({
              behavior: 'smooth',
              block: 'center',
              inline: 'nearest'
            });
          } else {
            // 尝试使用 view.nodeDOM 获取节点
            const nodeDom = view.nodeDOM(targetPos);
            if (nodeDom) {
              nodeDom.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
                inline: 'nearest'
              });
            }
          }
        } else {
          // 尝试使用 view.nodeDOM 获取节点
          const nodeDom = view.nodeDOM(targetPos);
          if (nodeDom) {
            nodeDom.scrollIntoView({
              behavior: 'smooth',
              block: 'center',
              inline: 'nearest'
            });
          }
        }
      } catch (error) {
        // 忽略错误
      }
    }
  });
}

function setDefaultData (propData) {
  defaultValue.value = propData.defaultValue;
  uploadParams.value = propData.uploadParams;
  userInfo.value = propData.userInfo;
  isHaveLock.value = propData.isHaveLock ?? true;
  isHaveLine.value = propData.isHaveLine ?? true;
  canModifySystemData.value = propData.canModifySystemData ?? false;
  websocketParams.value = propData.websocketParams;

  nextTick(() => {
    createEditor(() => {
      setMarkdownValue(Boolean(propData.readonly))
    })
  }
  );
}

// 设置编辑器内容并初始化协同
async function setMarkdownValue (readonly) {
  if (wsProvider) {
    syncedHandler && wsProvider.off("synced", syncedHandler)
    wsProvider.disconnect();
    wsProvider.destroy();
  };
  if (collabService) collabService.disconnect()

  if (!currCrepe) return;

  currCrepe.setReadonly(readonly);

  syncedHandler = (isSynced) => {
    if (isSynced) {
      wsProvider.awareness.on('change', ({ added, updated, removed }) => {
        const states = wsProvider.awareness.getStates();
        for (const [clientId, state] of states) {
          if (clientId === wsProvider.awareness.clientID) continue;
          if (state.paste && typeof state.paste === 'object') {
            const { markdown, editorId, token } = state.paste;

            const allClients = Array.from(states.keys()).sort((a, b) => a - b);
            const executor = allClients[0];
            if (wsProvider.awareness.clientID !== executor) continue;

            if (editorId !== websocketParams.value.room) continue;

            if (processedTokens.has(token)) return;
            processedTokens.add(token);

            const match = markdown.match(/^:::noneditable(?:\[([^\]]*)\])?\s*([\s\S]*?)\s*:::/m);
            if (!match) return true;

            const rawAttr = (match[1] || '').trim();
            const markdownBody = match[2].trim();

            if (!markdownBody) return true;

            // 解析属性
            const attrs = {
              lockType: 'transition',
              nodeType: null,
              user: null,
              key: new Date().getTime() + Math.random().toString(36).substring(2, 15),
              sourceId: null,
              sourceType: null,
              editStatus: 'checkIn',
            };

            rawAttr.split(/\s+/).forEach(part => {
              if (!part.includes('=')) return;
              const [k, ...v] = part.split('=');
              const value = v.join('='); // 支持 value 中包含 =
              if (k && attrs.hasOwnProperty(k)) {
                attrs[k] = value;
              }
            });

            currCrepe.editor.action((ctx) => {
              ctx.get(commandsCtx).call(InsertNonEditableCommand.key, {
                editorId,
                markdownContent: markdownBody,
                attrs
              });
            });
            // 防止重复触发（清理）
            const localState = wsProvider.awareness.getLocalState();
            if (localState && localState.paste === markdown) {
              wsProvider.awareness.setLocalState({ ...localState, paste: null });
            }
          }
        }
      });
      collabService.applyTemplate(defaultValue.value, (remoteNode) => {
        return !remoteNode || !Boolean(remoteNode.textContent);
      }).connect();
    }
  };

  if (isHaveLine.value) {
    wsProvider = new WebsocketProvider(websocketParams.value.url, websocketParams.value.room, doc);
    wsProvider.awareness.setLocalStateField('user', {
      color: `#${randomColor()}`,
      name: `${userInfo.value.name}`
    });

    currCrepe.editor.action((ctx) => {
      collabService = ctx.get(collabServiceCtx);
      collabService.bindDoc(doc).setAwareness(wsProvider.awareness);
      wsProvider.once("synced", syncedHandler);
    });
  } else {
    currCrepe.editor.action(replaceAll(defaultValue.value));
  }
}

// -------------------- 消息通信 --------------------
function receiveMessage (event) {
  if (event.origin !== window.location.origin) return;


  const { data } = event;

  // 初始化
  if (data.action === 'init') {
    websocketParams.value.room === 'markdown' && setDefaultData(data);
    return;
  }
  if (!currCrepe) return;

  // 非当前房间的消息忽略
  if (data.roomCode !== websocketParams.value.room) return;

  if (data.action === 'getMarkdown') {
    getCurrMarkdown();
    return;
  }
  if (data.action === 'replaceEditor') {
    currCrepe.editor.action(replaceAll(data.markdownValue));
    return;
  }
  if (data.action === 'insertMarkdown') {
    currCrepe.editor.action(insert(data.markdownValue, true));
    return;
  }
  if (data.action === 'insertNonEditable') {
    const { markdownValue = '', attrs = {} } = data;
    currCrepe.editor.action((ctx) => {
      ctx.get(commandsCtx).call(InsertNonEditableCommand.key, {
        user: userInfo.value.name,
        editorId: websocketParams.value.room,
        markdownContent: markdownValue,
        attrs
      });
    });
    return;
  }
  if (data.action === 'unlockByKey') {
    currCrepe.editor.action((ctx) => {
      ctx.get(commandsCtx).call(UnwrapNonEditableCommand.key, {
        user: userInfo.value.name,
        editorId: websocketParams.value.room,
        targetKey: data.targetKey
      });
    });
    return;
  }
  if (data.action === 'updateAttrByKey') {
    currCrepe.editor.action((ctx) => {
      ctx.get(commandsCtx).call(UpdateNonEditableCommand.key, {
        user: userInfo.value.name,
        editorId: websocketParams.value.room,
        targetKey: data.targetKey,
        attrs: data.infoParams,
        markdownContent: data.markdownContent
      });
    });
    return;
  }
  if (data.action === 'clearSelection') {
    currCrepe.editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const { state } = view;
      const tr = state.tr.setSelection(TextSelection.create(state.doc, 0));
      view.dispatch(tr);
      view.focus();
    });
    return;
  }
}

// -------------------- 清理 --------------------
function clearData () {
  if (wsProvider) {
    wsProvider.disconnect();
    wsProvider.destroy();
    syncedHandler && wsProvider.off("synced", syncedHandler)
  };
  if (collabService) collabService.disconnect();
  if (currCrepe) currCrepe.destroy(true);
  window.removeEventListener('message', receiveMessage);
}

// -------------------- 生命周期 --------------------
onMounted(() => {
  nextTick(() => {
    // createEditor(() => {
    window.addEventListener('message', receiveMessage);
    // 直接 ready
    window.parent.postMessage({
      action: 'ready',
      roomCode: websocketParams.value.room
    }, '*');
  });
  // });
});

onBeforeUnmount(clearData);
</script>

<template>
  <div class="milkdown-editor-container">
    <!-- 编辑器 -->
    <div class="milkdown-editor-style" ref="editorRoot"></div>
    <!-- 目录 -->
    <div v-if="isTocVisible" :class="['milkdown-toc', {'toc-expanded': tocExpanded}]">
      <div class="toc-header">
        <h3>目录</h3>
        <button class="toc-toggle" @click="tocExpanded = !tocExpanded">
          <i v-show="tocExpanded" class="iconfont icon-shouqi" title="收起目录"></i>
          <i v-show="!tocExpanded" class="iconfont icon-zhankai" title="展开目录"></i>
        </button>
      </div>
      <div v-if="tocExpanded" class="toc-content">
        <ul v-if="tableOfContents.length > 0" class="toc-list">
          <li v-for="item in tableOfContents" :key="item.id" :class="`toc-item toc-level-${item.level}`"
            @click="scrollToHeading(item.id)">
            <a-tooltip :title="item.text">
              {{ item.text }}
            </a-tooltip>
          </li>
        </ul>
        <div v-else class="toc-empty"> 无标题内容 </div>
      </div>
    </div>
  </div>
</template>

<style lang="less" scoped>
.milkdown-editor-container {
  display: flex;
  width: 100%;
  height: 100%;
  overflow: hidden;
}
.toc-expanded {
  width: 250px;
}
.milkdown-toc {
  // width: 250px;
  height: 100%;
  background-color: #f8f9fa;
  border-right: 1px solid #e9ecef;
  overflow-y: auto;
  padding: 20px;
  box-sizing: border-box;

  .toc-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 15px;

    h3 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      color: #333;
    }

    .toc-toggle {
      background: none;
      border: none;
      font-size: 12px;
      cursor: pointer;
      color: #666;
      padding: 0;
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
  }

  .toc-content {
    .toc-list {
      list-style: none;
      padding: 0;
      margin: 0;

      .toc-item {
        padding: 6px 0;
        cursor: pointer;
        font-size: 14px;
        color: #333;
        transition: all 0.2s ease;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;

        &:hover {
          color: #37618e;
          background-color: #e3f2fd;
          padding-left: 8px;
          border-radius: 4px;
        }

        &.toc-level-1 {
          font-weight: 600;
          padding-left: 0;
        }

        &.toc-level-2 {
          padding-left: 15px;
        }

        &.toc-level-3 {
          padding-left: 30px;
        }

        &.toc-level-4 {
          padding-left: 45px;
        }

        &.toc-level-5 {
          padding-left: 60px;
        }

        &.toc-level-6 {
          padding-left: 75px;
        }
      }
    }

    .toc-empty {
      font-size: 14px;
      color: #999;
      text-align: center;
      padding: 20px 0;
    }
  }
}

.milkdown-editor-style {
  flex: 1;
  height: 100%;
  overflow: auto;
  :deep(.milkdown) {
    min-height: 100%;
    width: 100%;
    .ProseMirror {
      height: 100%;
      width: 100%;
      padding: 50px 40px;
      a {
        color: #37618e;
      }
    }
  }
  :deep(.milkdown-theme-nord) {
    width: 100%;
    height: 100%;
  }
}
:deep(.ProseMirror-yjs-cursor) {
  position: relative;
  margin-left: -1px;
  margin-right: -1px;
  border-left: 1px solid black;
  border-right: 1px solid black;
  word-break: normal;
  pointer-events: none;
  & > div {
    position: absolute;
    top: -1.05em;
    left: -1px;
    font-size: 13px;
    background-color: rgb(250, 129, 0);
    font-family: serif;
    font-style: normal;
    font-weight: normal;
    line-height: normal;
    user-select: none;
    color: white;
    padding-left: 2px;
    padding-right: 2px;
    white-space: nowrap;
  }
}
:deep(.non-editable) {
  position: relative;
  user-select: none !important;
  padding: 30px 20px 20px;
  border-radius: 4px;
  margin: 10px 0;
  :not(.non-editable-right-action, .non-editable-left-action) * {
    pointer-events: none !important;
    user-select: none !important;
  }
  .non-editable-left-action {
    position: absolute;
    top: 6px;
    left: 8px;
    font-size: 12px;
    padding: 2px 6px;
    font-weight: 400;
    border-radius: 4px;
    color: #ffffff;
  }
  .non-editable-right-action {
    position: absolute;
    top: 6px;
    right: 8px;
    display: flex;
    align-items: center;
    z-index: 222;
    .non-editable-link-btn,
    .non-editable-discuss-btn,
    .non-editable-vote-btn {
      padding: 2px 6px;
      font-size: 16px;
      cursor: pointer;
    }
  }
  &[data-lock-type='transition'] {
    .non-editable-left-action {
      background-color: #ff9800;
    }
  }
  &[data-lock-type='frozen'] {
    .non-editable-left-action {
      background-color: #4caf50;
    }
  }
  &:after {
    position: absolute;
    visibility: hidden;
    padding: 4px;
    border-radius: 4px;
  }
  &:hover {
    &:after {
      visibility: visible;
      top: -36px;
      left: 50%;
      transform: translateX(-50%);
    }
  }
}
:deep(.editor-quote-style) {
  display: inline-block;
  background: #fafafa;
  border-radius: 4px 4px 4px 4px;
  border: 1px solid #d9d9d9;
  padding: 2px 8px;
  margin: 0 2px;
  font-size: 12px;
  vertical-align: middle;
  line-height: normal;
  margin-bottom: 2px;
  &[data-category='{complete}'] {
    background-color: #e3f2fd;
    color: #0d47a1;
  }
}
:deep(.non-editable-draft) {
  background-color: var(--bg-draft);
  &:after {
    content: '当前状态：草拟';
    background-color: var(--bg-draft);
  }
}
:deep(.non-editable-optimize) {
  background-color: var(--bg-optimizing);
  &:after {
    content: '当前状态：优化中';
    background-color: var(--bg-optimizing);
  }
}
:deep(.non-editable-verify) {
  background-color: var(--bg-confirmed);
  &:after {
    content: '当前状态：已确认';
    background-color: var(--bg-confirmed);
  }
}
:deep(.non-editable-import) {
  background-color: var(--bg-imported);
  &:after {
    content: '当前状态：已导入';
    background-color: var(--bg-imported);
  }
}
:deep(.custom-ai-style) {
  padding: 10px 20px;
  cursor: pointer;
  font-size: 14px;
  border-radius: 8px;
  &:hover {
    background-color: #f0f0f0;
  }
}
:deep(.custom-toolbar) {
  overflow: visible;
}
:deep(.custom-ai-style-wrapper) {
  position: relative;
  display: inline-block;
  margin: 0 4px;
  .custom-dropdown {
    display: none;
    position: absolute;
    top: 100%;
    left: 0;
    width: 100%;
    font-size: 14px;
    // min-width: 60px;
    background-color: white;
    border: 1px solid #ccc;
    z-index: 1000;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
    border-radius: 0 0 8px 8px;
  }
  .dropdown-item {
    padding: 4px 0;
    text-align: center;
    cursor: pointer;
    white-space: nowrap;
  }
  .dropdown-item:hover {
    background-color: #f0f0f0;
  }
  &:hover {
    .custom-dropdown {
      display: block;
    }
  }
}
:deep(.custom-block-handle) {
  top: 0;
  left: 2px !important;
}
</style>