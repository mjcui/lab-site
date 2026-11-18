#!/usr/bin/env node
/**
 * 构建后处理：为产物中遗漏 base 前缀的资源引用补上前缀。
 *
 * 背景：站点部署在 https://<user>.github.io/<repo>/ 子路径下。
 * Astro 的 `base` 只影响路由（页面 URL），**不会**改写打包产物里的
 * 静态资源引用，例如 CSS 里通过 `import '../styles/x.css'` 引入的
 * <link href="/_astro/index.abc.css"> 与 <script src="/_astro/x.js">。
 * 这些路径以 / 开头，浏览器会解析到域名根目录，导致样式和脚本全部 404，
 * 页面以无样式的裸 HTML 呈现。
 *
 * 这里做一次兜底改写，把 dist 中 HTML/CSS 里的
 * href|src="/_astro/..." 改成 href|src="<base>/_astro/..."。
 *
 * 只改以 /_astro/ 开头的路径 —— 打包产物的目录名是固定的，
 * 而站内页面链接已在构建阶段由 b() 正确处理过，不应重复加前缀。
 */
import fs from 'node:fs';
import path from 'node:path';
import { resolveConfiguredBasePath } from './site-url.mjs';

const distDir = path.resolve('dist');

// base 的判定必须与 astro.config.mjs 保持一致，否则会出现「Astro 按根路径构建、
// postbuild 却按 /lab-site 补前缀」的不匹配，导致本地预览裂图。
// astro.config.mjs 用 NODE_ENV 判断，这里同样以 NODE_ENV 为准，
// MODE 仅作为 Astro CLI 显式指定模式时的补充。
const isDev =
  process.env.NODE_ENV === 'development' ||
  (process.env.NODE_ENV !== 'production' && process.env.MODE === 'development');
const base = resolveConfiguredBasePath(isDev ? 'development' : 'production').replace(/\/+$/, '');

if (!base) {
  console.log('[postbuild] base为空（部署在域名根目录），无需处理');
  process.exit(0);
}

if (!fs.existsSync(distDir)) {
  console.error('[postbuild] 未找到 dist 目录，跳过');
  process.exit(0);
}

/**
 * 需要补前缀的属性。
 * 只处理以 / 开头、且尚未带 base 前缀的路径。
 */
const ASSET_ATTR = new RegExp(
  `\\b(href|src|poster|data-src)="(?!${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/)(/[^"]*)"`,
  'g'
);

let fileCount = 0;
let replaceCount = 0;

function patchFile(file) {
  const content = fs.readFileSync(file, 'utf8');
  const next = content.replace(ASSET_ATTR, (_, attr, path) => `${attr}="${base}${path}"`);

  if (next !== content) {
    fs.writeFileSync(file, next, 'utf8');
    fileCount += 1;
    replaceCount += (content.match(ASSET_ATTR) || []).length;
  }
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else if (entry.name.endsWith('.html') || entry.name.endsWith('.css')) {
      patchFile(full);
    }
  }
}

walk(distDir);

console.log(`[postbuild] base=${base}，已修正 ${replaceCount} 处资源引用（${fileCount} 个文件）`);