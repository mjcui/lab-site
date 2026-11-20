#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { loadEnv } from 'vite';

// 校验时需要知道 CMS 是否配置完整。Astro 构建会把 .env 注入 import.meta.env，
// 但本脚本以 Node 直接运行，因此显式加载 .env，避免"明明配了却判定未配置"。
const localEnv = loadEnv(process.env.MODE || 'production', process.cwd(), '');

const cmsRepo = (process.env.CMS_GITHUB_REPO || localEnv.CMS_GITHUB_REPO || '').trim();
const cmsOauthBaseUrl = (process.env.CMS_OAUTH_BASE_URL || localEnv.CMS_OAUTH_BASE_URL || '').trim();
const publicSiteUrl = (process.env.PUBLIC_SITE_URL || localEnv.PUBLIC_SITE_URL || '').trim();
const cmsBranch = (process.env.CMS_BRANCH || localEnv.CMS_BRANCH || 'main').trim() || 'main';

function normalizeUrl(value) {
  const raw = (value || '').trim().replace(/^['"]|['"]$/g, '');
  if (!raw) {
    return '';
  }

  const candidate = /^[a-z][a-z\d+\-.]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(candidate);
    if (!['http:', 'https:'].includes(url.protocol)) {
      return '';
    }

    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}

function getUrlHostname(value) {
  if (!value) {
    return '';
  }

  try {
    return new URL(value).hostname;
  } catch {
    return '';
  }
}

function listProjectSlugs() {
  const projectsDir = path.resolve('src/content/projects');
  if (!fs.existsSync(projectsDir)) {
    return [];
  }

  return fs
    .readdirSync(projectsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

const normalizedPublicSiteUrl = normalizeUrl(publicSiteUrl);
const cmsSiteDomain = getUrlHostname(normalizedPublicSiteUrl);
const projectCmsConfigNeedles = listProjectSlugs().map(
  (slug) => `file: "src/content/projects/${slug}/overview_cn.md"`,
);

function getExpectedMissingCmsVars() {
  const missing = [];

  if (!cmsRepo) {
    missing.push('CMS_GITHUB_REPO');
  }

  if (!cmsOauthBaseUrl) {
    missing.push('CMS_OAUTH_BASE_URL');
  }

  if (!normalizedPublicSiteUrl || !cmsSiteDomain) {
    missing.push('PUBLIC_SITE_URL');
  }

  return missing;
}

const expectedMissingCmsVars = getExpectedMissingCmsVars();
const cmsConfigured = expectedMissingCmsVars.length === 0;
const hasProjects = listProjectSlugs().length > 0;
const unexpectedMissingCmsVars = ['CMS_GITHUB_REPO', 'CMS_OAUTH_BASE_URL', 'PUBLIC_SITE_URL'].filter(
  (item) => !expectedMissingCmsVars.includes(item),
);

const checks = [
  {
    file: 'dist/index.html',
    includes: ['崔明建课题组', '研究方向', '查看论文'],
  },
  {
    file: 'dist/en/index.html',
    includes: ["Cui Mingjian's Lab", 'Research Directions', 'View Papers'],
  },
  {
    file: 'dist/members/index.html',
    includes: ['成员列表', '搜索成员'],
  },
  {
    // 项目页已改为展示导师主页 projects 字段中的已公开项目（与「主持科研项目」板块同源）。
    // 若以后重建 src/content/projects 集合并启用项目搜索，再切回 hasProjects 分支。
    file: 'dist/projects/index.html',
    includes: hasProjects ? ['项目', '搜索项目'] : ['项目', '已公开科研项目'],
  },
  {
    file: 'dist/en/projects/index.html',
    includes: ['Projects', 'Publicly Disclosed Projects'],
  },
  {
    file: 'dist/papers/index.html',
    includes: ['论文', '搜索标题'],
  },
  {
    file: 'dist/activities/index.html',
    includes: ['课题组活动', '搜索活动'],
  },
  {
    file: 'dist/en/activities/index.html',
    includes: ['Lab Activities', 'Search activities'],
  },
  {
    file: 'dist/news/index.html',
    includes: ['新闻动态', '搜索新闻标题'],
  },
  cmsConfigured
    ? {
        file: 'dist/admin/index.html',
        includes: ['Loading Decap CMS', 'Decap CMS', 'https://unpkg.com/decap-cms@3.10.1/dist/decap-cms.js'],
      }
    : {
        file: 'dist/admin/index.html',
        includes: ['CMS setup required', ...expectedMissingCmsVars],
        excludes: [...unexpectedMissingCmsVars, 'https://unpkg.com/decap-cms@3.10.1/dist/decap-cms.js'],
      },
  cmsConfigured
    ? {
        file: 'dist/admin/config.yml',
        includes: [
          'name: github',
          `repo: "${cmsRepo}"`,
          `branch: "${cmsBranch}"`,
          `base_url: "${normalizeUrl(cmsOauthBaseUrl)}"`,
          `site_domain: "${cmsSiteDomain}"`,
          'publish_mode: editorial_workflow',
          'media_folder: public/uploads',
          'public_folder: /uploads',
          'Start with a lowercase letter',
          '^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$',
          'structure: multiple_files',
          '  - name: news',
          '  - name: members',
          '    folder: src/content/members',
          '  - name: activities',
          '    folder: src/content/activities',
          '  - name: papers',
          '    folder: src/content/papers',
          '  - name: join',
          '    delete: false',
          '    file: src/content/join/recruitment/overview_cn.md',
          // members collection 需暴露 grade / order：
          // grade 决定列表页的入学年级排序，order 决定同年级内的自定义次序。
          '    name: grade',
          '    name: order',
          '    widget: number',
          // 项目数据已改由成员档案的 projects 字段承载，
          // 不再有独立的 projects collection，故此处不检查它。
          ...(listProjectSlugs().length > 0 ? ['  - name: projects'] : []),
          ...projectCmsConfigNeedles,
        ],
      }
    : {
        file: 'dist/admin/config.yml',
        includes: ['Decap CMS is not configured', ...expectedMissingCmsVars],
        excludes: unexpectedMissingCmsVars,
      },
];

function assert(cond, message) {
  if (!cond) {
    throw new Error(message);
  }
}

try {
  checks.forEach(({ file, includes, excludes = [] }) => {
    const filePath = path.resolve(file);
    assert(fs.existsSync(filePath), `Missing build output: ${file}`);

    const html = fs.readFileSync(filePath, 'utf8');
    includes.forEach((needle) => {
      assert(html.includes(needle), `Missing "${needle}" in ${file}`);
    });
    excludes.forEach((needle) => {
      assert(!html.includes(needle), `Unexpected "${needle}" in ${file}`);
    });
  });

  console.log('Smoke checks passed');
} catch (error) {
  console.error(`Smoke checks failed: ${error.message}`);
  process.exit(1);
}
