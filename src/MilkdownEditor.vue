<script setup>
import { collab, collabServiceCtx } from "@milkdown/plugin-collab";
import { getMarkdown, getHTML } from '@milkdown/utils';
import { commandsCtx, Editor, rootCtx } from "@milkdown/kit/core";
import { clipboard } from '@milkdown/plugin-clipboard'
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { blockPlugin } from './customParser/blockAction.js'; // 自定义块级插件
import { lockTableListener, unlockTableListener } from './customParser/listener.js'; // 自定义监听插件
import { nonEditable, InsertNonEditableCommand, UnwrapNonEditableCommand } from './customParser/nonEditableNode.js'; // 不可编辑节点
import { customLinkPlugin } from './customParser/customLink.js'; // 自定义链接
import { selectionTooltipPlugin } from './customParser/selectAction.js'; // 自定义悬浮插件
import { underline } from './customParser/customUnderline.js'; // 下划线
import { video } from './customParser/customVideo'; // 视频
import { block } from '@milkdown/kit/plugin/block';
import { upload, uploadConfig } from '@milkdown/kit/plugin/upload';
import { history } from '@milkdown/kit/plugin/history'
import { listItemBlockComponent } from '@milkdown/kit/component/list-item-block'
import { codeBlockComponent, codeBlockConfig } from '@milkdown/kit/component/code-block'
import { imageBlockComponent } from '@milkdown/kit/component/image-block'
import { tableBlock } from '@milkdown/kit/component/table-block'
import { defaultKeymap } from '@codemirror/commands'
import { languages } from '@codemirror/language-data'
import { oneDark } from '@codemirror/theme-one-dark'
import { keymap } from '@codemirror/view'
import { basicSetup } from 'codemirror'
import { gfm } from '@milkdown/kit/preset/gfm';
import { commonmark, syncHeadingIdPlugin } from "@milkdown/kit/preset/commonmark";
import { nord } from "@milkdown/theme-nord";
import { Doc } from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';

const editorRoot = ref(null);
let editor = null;
let wsProvider = null;
let collabService = null;

const defaultValue = ref('# markdown') // 默认值
const uploadParams = ref(null) // 上传图片参数
const userInfo = ref({ name: '用户' }) // 用户信息
const websocketParams = ref({ // websocket参数
  url: 'ws://113.57.121.225:8713', // 服务端地址
  room: 'markdown', // 房间号
})

async function createEditor () {
  await wsProvider && wsProvider.disconnect();
  await collabService && collabService.disconnect();
  await editor && editor.destroy(true);

  const doc = new Doc();
  wsProvider = new WebsocketProvider(websocketParams.value.url, websocketParams.value.room, doc);
  const randomColor = () => Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');

  wsProvider.awareness.setLocalStateField('user', {
    color: `#${randomColor()}`,
    name: `${userInfo.value.name}`
  });

  editor = Editor.make().config((ctx) => {
    ctx.set(rootCtx, editorRoot.value);
    // 锁定
    ctx.get(listenerCtx).lockTable = () => {
      requestAnimationFrame(() => {
        editor.action((ctx) => {
          const commandManager = ctx.get(commandsCtx);
          commandManager.call(InsertNonEditableCommand.key, userInfo.value.name);
        });
      });
    };
    // 解锁
    ctx.get(listenerCtx).unlockTable = () => {
      requestAnimationFrame(() => {
        editor.action((ctx) => {
          const commandManager = ctx.get(commandsCtx);
          commandManager.call(UnwrapNonEditableCommand.key, userInfo.value.name);
        });
      });
    };
    // code 
    ctx.update(codeBlockConfig.key, (defaultConfig) => ({
      ...defaultConfig,
      languages,
      extensions: [basicSetup, oneDark, keymap.of(defaultKeymap)],
      renderLanguage: (language, selected) => {
        return `${language} ${selected ? "✅" : ""}`;
      },
    }))
    ctx.update(uploadConfig.key, (defaultConfig) => {
      if (!uploadParams.value) return defaultConfig;
      return {
        ...defaultConfig,
        uploadWidgetFactory: () => {
          return '<span>正在上传中...</span>'
        },
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
  }).config(nord)
    .use(listener)
    .use(commonmark.filter(x => x !== syncHeadingIdPlugin))
    .use(history)
    .use(collab)
    .use(imageBlockComponent) // 图片
    .use(underline)
    .use(video)
    .use(nonEditable)
    .use(customLinkPlugin)
    .use(selectionTooltipPlugin).use(blockPlugin)
    .use(unlockTableListener).use(lockTableListener)
    .use(clipboard)
    .use(gfm)
    .use(block)
    .use(upload)
    .use(codeBlockComponent)
  // .use(tableBlock) // 表格
  // .use(listItemBlockComponent) // 列表

  editor.create().then(() => {
    editor.action((ctx) => {
      collabService = ctx.get(collabServiceCtx);
      collabService.bindDoc(doc).setAwareness(wsProvider.awareness).connect();
      wsProvider.once("synced", (isSynced) => {
        if (isSynced) {
          collabService.applyTemplate(defaultValue.value, (remoteNode) => {
            // 线上没数据时展示默认数据
            return !Boolean(remoteNode.textContent)
          }).connect();
        }
      });
    });
  });
}
function getCurrMarkdown () {
  window.parent.postMessage({
    action: 'getMarkdown',
    html: editor.action(getHTML()),
    markdown: editor.action(getMarkdown())
  }, '*')
}
function setDefaultDara (propData) {
  // defaultValue(默认值) uploadParams(上传) userInfo(当前编辑用户) websocketParams(ws信息)
  console.log(propData)
  defaultValue.value = propData.defaultValue;
  uploadParams.value = propData.uploadParams;
  userInfo.value = propData.userInfo;
  websocketParams.value = propData.websocketParams;
  nextTick(() => {
    createEditor();
  })
}
function receiveMessage (event) {
  if (event.origin !== window.location.origin) return;
  const { data } = event;
  if (data.action === 'init') {
    setDefaultDara(data);
  }
  if (data.action === 'getMarkdown') {
    getCurrMarkdown();
  }
}
function clearData () {
  wsProvider && wsProvider.disconnect();
  collabService && collabService.disconnect();
  editor && editor.destroy(true);
  window.removeEventListener('message', receiveMessage);
}
onMounted(() => {
  nextTick(() => {
    createEditor();
  })
  window.addEventListener('message', receiveMessage);
  window.addEventListener('DOMContentLoaded', () => {
    window.parent.postMessage({ action: 'ready' }, '*')
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
  // height: 40%;
  height: 100%;
  overflow: auto;
  :deep(.milkdown) {
    height: 100%;
    width: 100%;
    .ProseMirror {
      height: 100%;
      width: 100%;
      padding: 20px 40px 30px;
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