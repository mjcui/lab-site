const DEFAULT_SITE_URL = 'https://mjcui.github.io/lab-site/';

export type LocaleAlternates = {
  zh?: string;
  en?: string;
  xDefault?: string;
};

export function normalizeSitePath(pathname: string | undefined) {
  let value = (pathname || '/').trim();

  if (!value.startsWith('/')) {
    value = `/${value}`;
  }

  value = value.replace(/\/index\.html$/i, '/');
  value = value.replace(/\/{2,}/g, '/');

  if (value !== '/' && !value.endsWith('/')) {
    value = `${value}/`;
  }

  return value;
}

export function buildLocalePath(pathname: string, lang: 'zh' | 'en') {
  const normalized = normalizeSitePath(pathname);
  const basePath =
    normalized === '/en/' ? '/' : normalized.startsWith('/en/') ? `/${normalized.slice(4)}` : normalized;
  const zhPath = normalizeSitePath(basePath);

  if (lang === 'zh') {
    return zhPath;
  }

  if (zhPath === '/') {
    return '/en/';
  }

  return normalizeSitePath(`/en${zhPath}`);
}

export function buildDefaultLocaleAlternates(pathname: string): LocaleAlternates {
  const normalized = normalizeSitePath(pathname);
  const zh = buildLocalePath(normalized, 'zh');
  const en = buildLocalePath(normalized, 'en');

  return {
    zh,
    en,
    xDefault: zh,
  };
}

export function toAbsoluteUrl(pathname: string, site: URL | string | undefined) {
  const siteUrl = normalizeSiteUrl(site);
  return new URL(joinPathWithBase(pathname, siteUrl.pathname), siteUrl.origin).toString();
}

/**
 * 站点可能部署在子路径下（如 https://user.github.io/lab-site/）。
 * URL 以 / 开头的路径会丢弃 base，因此这里需要手动拼接。
 */
export function joinPathWithBase(pathname: string, basePathname: string) {
  const base = (basePathname || '/').replace(/\/+$/, '');
  const path = (pathname || '/').startsWith('/') ? pathname : `/${pathname}`;
  const joined = `${base}${path}`;
  return joined.replace(/\/{2,}/g, '/') || '/';
}

/**
 * 去掉 base 前缀，得到「站内逻辑路径」。
 * Astro 在设置 base 后，Astro.url.pathname 会带上 /lab-site，
 * 而站内链接与路径比较都应基于不含 base 的路径。
 */
export function stripBasePath(pathname: string, base: string) {
  const normalizedBase = (base || '/').replace(/\/+$/, '');
  const path = (pathname || '/').startsWith('/') ? pathname : `/${pathname}`;

  if (normalizedBase && (path === normalizedBase || path.startsWith(`${normalizedBase}/`))) {
    const stripped = path.slice(normalizedBase.length);
    return stripped === '' ? '/' : stripped;
  }

  return path;
}

/** 给站内逻辑路径补上 base，用于生成实际可访问的 href。 */
export function withBasePath(pathname: string, base: string) {
  return normalizeSitePath(joinPathWithBase(pathname, base || '/'));
}

/**
 * 站内链接助手（可在任意 .astro 的 frontmatter 里直接用）。
 *
 * 站点部署在子路径（如 https://user.github.io/lab-site/）时，
 * 模板里写死的 '/members/' 这类绝对路径不会自动补 base，
 * 会指向域名根目录。统一改用 b('/members/') 即可。
 *
 * base 优先取 import.meta.env.BASE_URL（由 astro.config 的 base 提供）；
 * 若取不到则回退到 PUBLIC_SITE_URL 的 pathname 自行推导。
 */
function resolveBase(): string {
  const fromAstro = import.meta.env?.BASE_URL;
  if (fromAstro && fromAstro !== '/') {
    return fromAstro.replace(/\/$/, '');
  }

  const site = import.meta.env?.PUBLIC_SITE_URL || import.meta.env?.SITE_URL;
  if (site) {
    try {
      const { pathname } = new URL(site);
      return pathname.replace(/\/+$/, '');
    } catch {
      /* 非法 URL，忽略 */
    }
  }

  return '';
}

export const BASE = resolveBase();

export function b(pathname: string) {
  return normalizeSitePath(joinPathWithBase(pathname || '/', BASE || '/'));
}

/**
 * 静态资源路径（图片、字体等）。
 * 与 b() 的区别：不补尾斜杠，否则服务器会按目录解析导致 404。
 */
export function asset(pathname: string) {
  const base = BASE || '';
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${base}${path}`.replace(/([^:])\/{2,}/g, '$1/');
}

export function normalizeSiteUrl(site: URL | string | undefined) {
  if (site instanceof URL) {
    // URL 对象同样可能丢失子路径，这里补回 pathname
    return new URL(`${site.origin}${joinPathWithBase('/', site.pathname)}`);
  }

  const raw = `${site || DEFAULT_SITE_URL}`.trim().replace(/^['"]|['"]$/g, '');
  const candidate = /^[a-z][a-z\d+\-.]*:\/\//i.test(raw) ? raw : `https://${raw}`;

  try {
    const url = new URL(candidate);
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error(`Unsupported site URL protocol: ${url.protocol}`);
    }

    url.search = '';
    url.hash = '';
    // 保证以 / 结尾，否则 joinPathWithBase 里的 replace 会误判
    if (!url.pathname.endsWith('/')) {
      url.pathname = `${url.pathname}/`;
    }
    return url;
  } catch {
    return new URL(DEFAULT_SITE_URL);
  }
}

export function summarizeText(value: string | undefined, maxLength = 160) {
  const plain = (value || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[*_>#~-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!plain) {
    return '';
  }

  if (plain.length <= maxLength) {
    return plain;
  }

  return `${plain.slice(0, maxLength - 1).trim()}…`;
}

export function summarizeParts(parts: Array<string | number | null | undefined>, maxLength = 160) {
  return summarizeText(
    parts
      .filter((item) => item !== null && item !== undefined && `${item}`.trim())
      .map((item) => `${item}`.trim())
      .join(' '),
    maxLength,
  );
}
