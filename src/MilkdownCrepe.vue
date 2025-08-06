<script setup>
import { collab, collabServiceCtx } from "@milkdown/plugin-collab";
import { LanguageDescription } from '@codemirror/language'
import { getMarkdown, getHTML, insert, replaceAll } from '@milkdown/utils';
import { commandsCtx, defaultValueCtx } from "@milkdown/kit/core";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { blockPlugin } from './customParser/blockAction.js'; // 自定义块级插件
import { lockTableListener, unlockTableListener } from './customParser/listener.js'; // 自定义监听插件
import { nonEditable, InsertNonEditableCommand, UnwrapNonEditableCommand } from './customParser/nonEditableNode.js'; // 不可编辑节点
import { customLinkPlugin } from './customParser/customLink.js'; // 自定义链接
import { selectionTooltipPlugin } from './customParser/selectAction.js'; // 自定义悬浮插件
import { underline } from './customParser/customUnderline.js'; // 下划线
import { video } from './customParser/customVideo'; // 视频
import { defineFeature } from './customParser/mermaid/index.js'; // 流程图
// import './customParser/footnote/index';
import { remarkPreserveEmptyLinePlugin } from "@milkdown/preset-commonmark"; // 去掉多余 br
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

const editorRoot = ref(null);
let currCrepe = null;
let wsProvider = null;
let collabService = null;
const myLanguages = [
  LanguageDescription.of({
    name: 'Mermaid',
    alias: ['mermaid', 'graph', 'flow'],
    load () {
      return import('@codemirror/lang-javascript').then((m) => m.javascript())
    }
  })
]

const defaultValue = ref('# markdown') // 默认值
const uploadParams = ref(null) // 上传图片参数
const userInfo = ref({ name: '用户' }) // 用户信息
const websocketParams = ref({ // websocket参数
  url: 'ws://113.57.121.225:8713', // 服务端地址
  room: 'markdown', // 房间号
})
const isHaveLock = ref(true); // 是否存在锁定功能
const isHaveLine = ref(true); // 是否存在协同编辑功能

async function createEditor (readonly) {
  await wsProvider && wsProvider.disconnect();
  await collabService && collabService.disconnect();
  await currCrepe && currCrepe.destroy(true);

  const doc = new Doc();
  wsProvider = new WebsocketProvider(websocketParams.value.url, websocketParams.value.room, doc);
  const randomColor = () => Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
  wsProvider.awareness.setLocalStateField('user', {
    color: `#${randomColor()}`,
    name: `${userInfo.value.name}`
  });

  const crepe = new Crepe({
    root: editorRoot.value,
    features: {
      [Crepe.Feature.Toolbar]: false,
      [Crepe.Feature.Placeholder]: false,
    },
    featureConfigs: {
      "code-mirror": { languages: [...languages, ...myLanguages], },
    },
  });
  currCrepe = crepe

  const editor = crepe.editor;
  editor.remove(syncHeadingIdPlugin)
  editor.remove(remarkPreserveEmptyLinePlugin)
  editor.config(ctx => {
    // 锁定
    ctx.get(listenerCtx).lockTable = () => {
      requestAnimationFrame(() => {
        editor.action((ctx) => {
          const commandManager = ctx.get(commandsCtx);
          commandManager.call(InsertNonEditableCommand.key, { user: userInfo.value.name, editorId: websocketParams.value.room });
        });
      });
    };
    // 解锁
    ctx.get(listenerCtx).unlockTable = () => {
      requestAnimationFrame(() => {
        editor.action((ctx) => {
          const commandManager = ctx.get(commandsCtx);
          commandManager.call(UnwrapNonEditableCommand.key, { user: userInfo.value.name, editorId: websocketParams.value.room });
        });
      });
    };
    // 图片上传
    ctx.update(uploadConfig.key, (defaultConfig) => {
      if (!uploadParams.value) return defaultConfig;
      return {
        ...defaultConfig,
        // uploadWidgetFactory: () => {
        //   return '<span>正在上传中...</span'
        // },
        uploader: async (file, schema) => {
          const { url, config, imagePrefix } = uploadParams.value;
          let formdata = new FormData();
          formdata.append('image', file[0]);
          try {
            let res = await fetch(url, {
              method: 'POST',
              mode: 'cors',
              headers: {
                'Accept': 'application/json',
                ...config.headers
              },
              body: formdata
            });
            const json = await res.json();
            return [schema.nodes.image.createAndFill({ src: imagePrefix + json.url })]
          } catch (error) {
            return []
          }
        }
      };
    });
  }).use(listener)
    .use(collab)
    .use(imageBlockComponent)
    .use(underline)
    .use(video)
    .use(nonEditable)
    .use(blockPlugin)
    .use(customLinkPlugin)
    .use(selectionTooltipPlugin(websocketParams.value.room, isHaveLock.value))
    .use(unlockTableListener).use(lockTableListener)
    .use(upload)

  defineFeature(editor) // 添加流程图语法支持

  crepe.create().then(ctx => {
    crepe.setReadonly(readonly)
    if (isHaveLine.value) {
      ctx.action((ctx) => {
        collabService = ctx.get(collabServiceCtx);
        collabService.bindDoc(doc).setAwareness(wsProvider.awareness).connect();
        wsProvider.once("synced", async (isSynced) => {
          if (isSynced) {
            collabService.applyTemplate(defaultValue.value, (remoteNode) => {
              return !remoteNode || !Boolean(remoteNode.textContent);
            }).connect();
          }
        })
      });
    } else {
      currCrepe.editor.action(replaceAll(defaultValue.value, true));
    }
  })
}

function getCurrMarkdown () {
  window.parent.postMessage({
    action: 'getMarkdown',
    roomCode: websocketParams.value.room,
    html: currCrepe.editor.action(getHTML()),
    markdown: currCrepe.editor.action(getMarkdown())
  }, '*')
}

// defaultValue(默认值) uploadParams(上传) userInfo(当前编辑用户) websocketParams(ws信息) readonly(只读)
function setDefaultDara (propData) {
  console.log(propData)
  defaultValue.value = propData.defaultValue;
  uploadParams.value = propData.uploadParams;
  userInfo.value = propData.userInfo;
  isHaveLock.value = propData.hasOwnProperty('isHaveLock') ? propData.isHaveLock : true;
  isHaveLine.value = propData.hasOwnProperty('isHaveLine') ? propData.isHaveLine : true;
  websocketParams.value = propData.websocketParams;
  nextTick(() => {
    createEditor(Boolean(propData.readonly));
  })
}

function receiveMessage (event) {
  if (event.origin !== window.location.origin) return;
  const { data } = event;
  // 房间隔离
  if (websocketParams.value.room !== 'markdown' && data.roomCode !== websocketParams.value.room) return;
  if (data.action === 'init') {
    setDefaultDara(data);
  }
  if (data.roomCode !== websocketParams.value.room) return;
  if (data.action === 'getMarkdown') {
    getCurrMarkdown();
  }
  if (data.action === 'insertMarkdown') {
    currCrepe.editor.action(insert(data.markdownValue, true));
  }
}

function clearData () {
  wsProvider && wsProvider.disconnect();
  collabService && collabService.disconnect();
  currCrepe && currCrepe.destroy(true);
  window.removeEventListener('message', receiveMessage);
}

onMounted(() => {
  nextTick(() => {
    createEditor();
  })
  window.addEventListener('message', receiveMessage);
  window.addEventListener('DOMContentLoaded', () => {
    window.parent.postMessage({ action: 'ready', roomCode: websocketParams.value.room, }, '*')
  })
})
onBeforeUnmount(() => {
  clearData();
})
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
    height: 100%;
    width: 100%;
    .ProseMirror {
      height: 100%;
      width: 100%;
      padding: 50px 40px 50px 84px;
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
  // pointer-events: none;
  user-select: none !important;
  background-color: #f3f4f6;
  padding: 0.75rem;
  border-radius: 0.375rem;
  margin: 10px 0;
  * {
    pointer-events: none !important;
    user-select: none !important;
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
</style>