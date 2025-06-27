import remarkFootnotesExtra from "remark-footnotes-extra";
import rehypeStringify from "rehype-stringify";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";

export const processor = unified()
  .use(remarkParse)
  .use(remarkFootnotesExtra)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeStringify);

console.log(processor.process);
const value = "hello world^[this is footnote]";
const file = await processor.process(value);
console.log(String(file));