import { createApp } from 'vue'
import App from './App.vue'
import MilkdownEditor from './index'
import '@milkdown/theme-nord/style.css';
import '../static/icons/iconfont.css';

const app = createApp(App);

app.use(MilkdownEditor).mount('#app')
