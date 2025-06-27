import MilkdownEditor from './MilkdownEditor.vue'
import MilkdownCrepe from './MilkdownCrepe.vue'

export default {
  install (app) {
    app.component('MilkdownEditor', MilkdownEditor)
    app.component('MilkdownCrepe', MilkdownCrepe)
  },
}
