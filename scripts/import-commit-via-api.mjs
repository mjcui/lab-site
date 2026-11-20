#!/usr/bin/env node
/**
 * 通过 GitHub REST API 把远端 commit 链导入本地 git 对象库。
 *
 * 背景：某些网络环境下 github.com:443 不可达（git 协议走不通），
 * 但 api.github.com:443 正常。此时可用 API 把 commit/tree/blob 逐层
 * 拉下来，用 git hash-object / git mktree / git commit-tree 在本地重建，
 * 重建出的 commit sha 与远端完全一致（tree/parent/message/时间戳都相同）。
 *
 * 用法：node scripts/import-commit-via-api.mjs <owner/repo> <branch>
 */
import { execFileSync } from 'node:child_process';
import { execSync } from 'node:child_process';

const [, , repo, branch = 'main'] = process.argv;
if (!repo) {
  console.error('用法: node scripts/import-commit-via-api.mjs <owner/repo> [branch]');
  process.exit(1);
}

const API = `https://api.github.com/repos/${repo}`;

function api(path) {
  const out = execFileSync(
    'curl',
    ['-s', '--max-time', '30', '-H', 'Accept: application/vnd.github+json', `${API}${path}`],
    { maxBuffer: 64 * 1024 * 1024 }
  );
  return JSON.parse(out.toString());
}

function git(args, input) {
  const out = execSync(`git ${args}`, {
    input,
    maxBuffer: 256 * 1024 * 1024,
  });
  return Buffer.isBuffer(out) ? out.toString('utf8') : String(out);
}

function hasObject(sha) {
  try {
    execSync(`git cat-file -e ${sha}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** 把远端 blob 导入本地对象库 */
function importBlob(sha) {
  if (hasObject(sha)) return true;
  const res = api(`/git/blobs/${sha}`);
  const content = Buffer.from(res.content, 'base64');
  const local = git('hash-object -w --stdin', content).trim();
  if (local !== sha) {
    throw new Error(`blob sha 不一致: 期望 ${sha}，实际 ${local}`);
  }
  return true;
}

/**
 * 把远端 tree 导入本地对象库。
 * 用非递归 API 逐层处理：recursive 模式返回的是扁平路径（含斜杠），
 * 不能直接喂给 mktree。非递归模式返回该层直接子项，且已是 git 的树序。
 */
function importTree(sha) {
  if (hasObject(sha)) return true;
  const tree = api(`/git/trees/${sha}`);
  const entries = [];

  for (const e of tree.tree) {
    const mode = e.mode || (e.type === 'tree' ? '040000' : '100644');
    const name = e.path ?? e.name;
    if (e.type === 'blob') {
      importBlob(e.sha);
    } else if (e.type === 'tree') {
      importTree(e.sha);
    }
    entries.push(`${mode} ${e.type} ${e.sha}\t${name}`);
  }

  const local = git('mktree', entries.join('\n') + '\n').trim();
  if (local !== sha) {
    throw new Error(`tree sha 不一致: 期望 ${sha}，实际 ${local}`);
  }
  return true;
}

/** 用远端的元数据在本地重建 commit */
function importCommit(sha) {
  if (hasObject(sha)) return true;
  const c = api(`/git/commits/${sha}`);

  importTree(c.tree.sha);
  const parentShas = c.parents.map((p) => p.sha);
  parentShas.forEach(importCommit);

  // commit-tree 需要 author/committer 的原始时间戳与时区
  const authorDate = toGitDate(c.author.date);
  const committerDate = toGitDate(c.committer.date);
  const env = {
    GIT_AUTHOR_NAME: c.author.name,
    GIT_AUTHOR_EMAIL: c.author.email,
    GIT_AUTHOR_DATE: authorDate,
    GIT_COMMITTER_NAME: c.committer.name,
    GIT_COMMITTER_EMAIL: c.committer.email,
    GIT_COMMITTER_DATE: committerDate,
  };
  // Windows 下 execSync 默认走 cmd.exe，不支持 `VAR=value cmd` 前缀语法，
  // 必须通过 env 选项传递环境变量。
  const local = execSync(
    `git commit-tree ${c.tree.sha} ${parentShas.length ? `-p ${parentShas[0]}` : ''} -F -`,
    {
      // GitHub 的 message 字段不含尾换行，git 对象里也不含——原样传入即可。
      input: Buffer.from(c.message),
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
      env: { ...process.env, ...env },
    }
  ).trim();
  if (local !== sha) {
    throw new Error(`commit sha 不一致: 期望 ${sha}，实际 ${local}`);
  }
  return true;
}

/**
 * ISO 时间 → git 时间戳格式 "<unix秒> <+HHMM>"。
 *
 * 坑：GitHub API 一律把时间返回成 UTC（Z 后缀），原始 commit 里的时区
 * 信息会丢失。若直接按 +0000 重建，commit sha 必然对不上。
 * 实测本站 commit 的原始时区是 +0800，因此这里按东八区还原：
 * unix 秒数取 UTC 时刻不变，时区固定写 +0800。
 * 换用别的时区时需相应调整，否则重建出的 sha 与远端不一致。
 */
const COMMIT_TZ = '+0800';

function toGitDate(iso) {
  const unix = Math.floor(Date.parse(iso) / 1000);
  return `${unix} ${COMMIT_TZ}`;
}

const head = api(`/git/ref/heads/${branch}`);
const headSha = head.object.sha;
console.log(`远端 ${repo}@${branch} = ${headSha}`);

importCommit(headSha);

if (!hasObject(headSha)) {
  console.error('导入失败');
  process.exit(1);
}

// 更新本地远端引用
git(`update-ref refs/remotes/origin/${branch} ${headSha}`);
console.log(`已导入并更新 refs/remotes/origin/${branch} -> ${headSha}`);
