import fs from 'node:fs';
import path from 'node:path';

import { asset } from './seo';

const DEFAULT_AVATAR = () => asset('/images/avatar-default.png');
const AVATAR_EXTS = ['png', 'jpg', 'jpeg', 'svg'] as const;

type MemberLike = {
  name: string | { zh?: string; en?: string };
  avatar?: string;
  id?: string;
};

export function resolveMemberAvatar(member: MemberLike): string {
  if (member.avatar && member.avatar.trim()) {
    return member.avatar.trim();
  }

  const rawNames = typeof member.name === 'string'
    ? [member.name]
    : [member.name.zh || '', member.name.en || ''];
  const candidateNames = Array.from(
    new Set([
      ...(member.id ? [member.id] : []),
      ...rawNames.map((item) => item.trim()).filter(Boolean),
    ])
  );

  if (!candidateNames.length) {
    return DEFAULT_AVATAR();
  }

  const avatarDir = path.join(process.cwd(), 'public', 'member', 'images');

  for (const candidate of candidateNames) {
    // 先按约定命名精确匹配（成员名.jpg / 成员名.png ...）
    for (const ext of AVATAR_EXTS) {
      const fileName = `${candidate}.${ext}`;
      if (fs.existsSync(path.join(avatarDir, fileName))) {
        return encodeURI(asset(`/member/images/${fileName}`));
      }
    }

    // 兜底：扫描目录，忽略扩展名大小写与多余空格。
    // 避免「崔明建.JPG」「崔明建 .jpg」这类不匹配导致回退到默认头像。
    const match = listDirSafe(avatarDir).find((fileName) => {
      const ext = path.extname(fileName).replace(/^\./, '').toLowerCase();
      const stem = path.basename(fileName, path.extname(fileName)).trim();
      return AVATAR_EXTS.includes(ext as (typeof AVATAR_EXTS)[number]) && stem === candidate;
    });

    if (match) {
      return encodeURI(asset(`/member/images/${match}`));
    }
  }

  return DEFAULT_AVATAR();
}

function listDirSafe(dir: string): string[] {
  try {
    return fs.readdirSync(dir);
  } catch {
    // 目录不存在（首次使用、CI 环境等）时返回空列表，走默认头像
    return [];
  }
}