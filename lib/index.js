import MilkdownEditor from '@/MilkdownEditor.vue'

export default {
  install (app) {
    // 配置此应用
    app.component('MilkdownEditor', MilkdownEditor)
  },
}
