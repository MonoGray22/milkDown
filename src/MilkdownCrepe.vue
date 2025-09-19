<script setup>
import { collab, collabServiceCtx } from "@milkdown/plugin-collab";
import { LanguageDescription } from '@codemirror/language'
import { getMarkdown, getHTML, insert, replaceAll } from '@milkdown/utils';
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

const doc = new Doc();
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
    ctx.get(listenerCtx).lockTable = () => {
      requestAnimationFrame(() => {
        editor.action((ctx) => {
          ctx.get(commandsCtx).call(InsertNonEditableCommand.key, {
            user: userInfo.value.name,
            editorId: websocketParams.value.room,
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
        uploader: async (file, schema) => {
          const { url, config, imagePrefix } = uploadParams.value;
          const imgFile = Array.isArray(file) ? file[0] : file;
          const formdata = new FormData();
          formdata.append('image', imgFile);
          try {
            const res = await fetch(url, {
              method: 'POST',
              mode: 'cors',
              headers: { 'Accept': 'application/json', ...config.headers },
              body: formdata
            });
            const json = await res.json();
            return [schema.nodes.image.createAndFill({ src: imagePrefix + json.url })];
          } catch {
            return [];
          }
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

function setDefaultData (propData) {
  defaultValue.value = propData.defaultValue;
  uploadParams.value = propData.uploadParams;
  userInfo.value = propData.userInfo;
  isHaveLock.value = propData.isHaveLock ?? true;
  isHaveLine.value = propData.isHaveLine ?? true;
  canModifySystemData.value = propData.canModifySystemData ?? false;
  websocketParams.value = propData.websocketParams;

  nextTick(() => setMarkdownValue(Boolean(propData.readonly)));
}

// 设置编辑器内容并初始化协同
async function setMarkdownValue (readonly) {
  if (wsProvider) wsProvider.disconnect();
  if (collabService) collabService.disconnect();

  if (!currCrepe) return;

  currCrepe.setReadonly(readonly);
  if (isHaveLine.value) {
    wsProvider = new WebsocketProvider(websocketParams.value.url, websocketParams.value.room, doc);
    wsProvider.awareness.setLocalStateField('user', {
      color: `#${randomColor()}`,
      name: `${userInfo.value.name}`
    });
    currCrepe.editor.action((ctx) => {
      collabService = ctx.get(collabServiceCtx);
      collabService.bindDoc(doc).setAwareness(wsProvider.awareness).connect();
      wsProvider.once("synced", (isSynced) => {
        if (isSynced) {
          collabService.applyTemplate(defaultValue.value, (remoteNode) => {
            return !remoteNode || !Boolean(remoteNode.textContent);
          }).connect();
        }
      });
    });
  } else {
    currCrepe.editor.action(replaceAll(defaultValue.value, true));
  }
}

// -------------------- 消息通信 --------------------
function receiveMessage (event) {
  if (event.origin !== window.location.origin) return;

  if (!currCrepe) return;

  const { data } = event;

  // 初始化
  if (data.action === 'init') {
    setDefaultData(data);
    return;
  }

  // 非当前房间的消息忽略
  if (data.roomCode !== websocketParams.value.room) return;

  if (data.action === 'getMarkdown') {
    getCurrMarkdown();
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
        attrs: data.infoParams
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
  if (wsProvider) wsProvider.disconnect();
  if (collabService) collabService.disconnect();
  if (currCrepe) currCrepe.destroy(true);
  window.removeEventListener('message', receiveMessage);
}

// -------------------- 生命周期 --------------------
onMounted(() => {
  nextTick(() => {
    createEditor(() => {
      window.addEventListener('message', receiveMessage);
      // 直接 ready
      window.parent.postMessage({
        action: 'ready',
        roomCode: websocketParams.value.room
      }, '*');
    });
  });
});

onBeforeUnmount(clearData);
</script>

<template>
  <div class="milkdown-editor-style" ref="editorRoot"></div>
</template>

<style lang="less" scoped>
.milkdown-editor-style {
  width: 100%;
  height: 100%;
  // height: 40%;
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
  padding: 20px;
  border-radius: 4px;
  margin: 10px 0;
  *:not(.non-editable-link-btn) {
    pointer-events: none !important;
    user-select: none !important;
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
:deep(.non-editable[data-source-id]) {
  .non-editable-link-btn {
    position: absolute;
    top: 6px;
    right: 8px;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 12px;
    line-height: 1;
    background: rgba(24, 119, 242, 0.1);
    color: #1877f2;
    cursor: pointer;
    z-index: 222;
    &::before {
      content: '🔗';
    }
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