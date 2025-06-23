import { listenerCtx } from "@milkdown/kit/plugin/listener";
import { $prose } from '@milkdown/utils';
import { Plugin, PluginKey } from 'prosemirror-state';

// 创建插件键，用于存储锁定状态
const lockTableKey = new PluginKey('lockTable');
// 创建插件键，用于存储解锁状态
const unlockTableKey = new PluginKey('unlockTable');

export const lockTableListener = $prose((ctx) => {
  return new Plugin({
    key: lockTableKey,
    appendTransaction: (transactions) => {
      // 检查是否有任何事务包含lockTable元数据
      const hasLockTableMeta = transactions.some(tr => tr.getMeta('lockTable'));
      if (hasLockTableMeta) {
        const lockTableFn = ctx.get(listenerCtx).lockTable;
        if (typeof lockTableFn === 'function') {
          lockTableFn();
        }
      }
      return null; // 不修改事务
    },
  });
});

export const unlockTableListener = $prose((ctx) => {
  return new Plugin({
    key: unlockTableKey,
    appendTransaction: (transactions) => {
      // 检查是否有任何事务包含lockTable元数据
      const hasLockTableMeta = transactions.some(tr => tr.getMeta('unlockTable'));
      if (hasLockTableMeta) {
        const lockTableFn = ctx.get(listenerCtx).unlockTable;
        if (typeof lockTableFn === 'function') {
          lockTableFn();
        }
      }
      return null; // 不修改事务
    },
  });
});