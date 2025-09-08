import fs from "fs";
import path from "path";

function deleteFolderContents (folderPath) {
  if (!fs.existsSync(folderPath)) return;

  for (const file of fs.readdirSync(folderPath)) {
    const curPath = path.join(folderPath, file);
    if (fs.lstatSync(curPath).isDirectory()) {
      fs.rmSync(curPath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(curPath);
    }
  }
}

function moveFolderContents (src, dest) {
  if (!fs.existsSync(src)) {
    console.error("源文件夹不存在:", src);
    return;
  }
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  // 1. 清空目标文件夹
  console.log("正在清空目标文件夹内容...");
  deleteFolderContents(dest);

  // 2. 移动内容
  console.log("正在迁移文件...");
  for (const file of fs.readdirSync(src)) {
    const srcPath = path.join(src, file);
    const destPath = path.join(dest, file);
    fs.renameSync(srcPath, destPath);
  }

  console.log("操作完成！");
}

// 示例调用
moveFolderContents("D:/codes/customCode/milkdown-vue3/dist", "D:/codes/study/B2020931-PX-GWC-App/static/milkdownEditor");
