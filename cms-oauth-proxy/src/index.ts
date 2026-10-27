/**
 * Decap CMS 的 GitHub OAuth 代理（Cloudflare Worker）
 *
 * 为什么需要它
 * ------------
 * Decap CMS 跑在浏览器里，属于「公开客户端」，无法安全地持有 GitHub OAuth 的
 * client_secret（GitHub 明确禁止公开客户端持有密钥）。
 * 因此需要一个服务端代理：浏览器把用户跳到代理的 /auth，代理带着 client_secret
 * 去 GitHub 换取 access_token，再通过 postMessage 把 token 交回浏览器。
 *
 * 请求流程
 * --------
 *   浏览器                    代理(Worker)                 GitHub
 *    |  GET /auth?provider=...  |                            |
 *    |-------------------------->| 302 /login/oauth/authorize |
 *    |                           |--------------------------->|
 *    |                           |   <--- ?code=xxx&state=xxx  |
 *    |                           | POST /login/oauth/access_token
 *    |                           |--------------------------->|
 *    |                           |   <--- {access_token}       |
 *    |  <-- postMessage(token)   |  (HTML 脚本回传并关闭窗口)   |
 *
 * 安全要点
 * --------
 * 1. state 参数随机生成并写入 HttpOnly Cookie，回调时比对，
 *    防止 CSRF（第三方伪造回调注入 token）。
 * 2. client_secret 只存在于 Worker 的环境变量中，不下发到浏览器。
 * 3. 回调地址严格取自当前请求的 origin，不接受外部传入。
 */

interface Env {
  GITHUB_OAUTH_ID: string;
  GITHUB_OAUTH_SECRET: string;
}

/** 允许访问的站点域名，与 config.yml 的 site_domain 保持一致 */
const ALLOWED_SITE_DOMAINS = new Set(['mjcui.github.io']);

const AUTH_PATH = '/auth';
const CALLBACK_PATH = '/callback';

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === AUTH_PATH) {
      return handleAuth(request, url, env);
    }

    if (url.pathname === CALLBACK_PATH) {
      return handleCallback(request, url, env);
    }

    if (url.pathname === '/') {
      return html(
        '<!doctype html><html><body style="font-family:system-ui;padding:40px">' +
          '<h1>Decap OAuth Proxy</h1>' +
          '<p>运行正常。此地址由 Cloudflare Worker 提供，用于 Decap CMS 的 GitHub 登录授权。</p>' +
          '</body></html>'
      );
    }

    return json({ error: 'Not Found' }, 404);
  },
};

/** 第一步：把用户重定向到 GitHub 的授权页 */
async function handleAuth(request: Request, url: URL, env: Env): Promise<Response> {
  if (!env.GITHUB_OAUTH_ID || !env.GITHUB_OAUTH_SECRET) {
    return json(
      {
        error: 'OAuth not configured',
        detail:
          '请在 Cloudflare Workers 中为该 Worker 设置 GITHUB_OAUTH_ID 与 GITHUB_OAUTH_SECRET 两个加密变量。',
      },
      500
    );
  }

  const provider = url.searchParams.get('provider') || 'github';
  if (provider !== 'github') {
    return json({ error: `Unsupported provider: ${provider}` }, 400);
  }

  const siteDomain = url.searchParams.get('site_id') || '';
  if (siteDomain && !ALLOWED_SITE_DOMAINS.has(siteDomain)) {
    return json({ error: `site_id not allowed: ${siteDomain}` }, 400);
  }

  // state 用于防CSRF，回调时与 Cookie 中的值比对
  const state = randomHex(16);

  const githubAuthUrl = new URL('https://github.com/login/oauth/authorize');
  githubAuthUrl.searchParams.set('client_id', env.GITHUB_OAUTH_ID);
  githubAuthUrl.searchParams.set('redirect_uri', `${url.origin}${CALLBACK_PATH}`);
  githubAuthUrl.searchParams.set('scope', 'repo');
  githubAuthUrl.searchParams.set('state', state);
  githubAuthUrl.searchParams.set('allow_signup', 'false');

  return new Response(null, {
    status: 302,
    headers: {
      Location: githubAuthUrl.toString(),
      'Set-Cookie': `decap_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
    },
  });
}

/** 第二步：GitHub 回调，用 code 换 token，再回传给浏览器 */
async function handleCallback(request: Request, url: URL, env: Env): Promise<Response> {
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error) {
    return html(
      `<!doctype html><html><body style="font-family:system-ui;padding:40px">
       <h2>授权失败</h2><p>GitHub 返回：${escapeHtml(error)}</p>
       <p>请关闭此窗口并重试。</p></body></html>`,
      400
    );
  }

  if (!code) {
    return json({ error: 'Missing code parameter' }, 400);
  }

  // 校验 state，防 CSRF
  const cookieHeader = request.headers.get('Cookie') || '';
  const cookieState = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith('decap_state='))
    ?.slice('decap_state='.length);

  if (!cookieState || cookieState !== state) {
    return html(
      `<!doctype html><html><body style="font-family:system-ui;padding:40px">
       <h2>会话校验失败</h2>
       <p>state 校验未通过，可能是授权超时或使用了非授权入口。请关闭此窗口，从
       <code>/admin/</code> 页面重新发起登录。</p></body></html>`,
      400
    );
  }

  // 用 code 换 access_token
  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      client_id: env.GITHUB_OAUTH_ID,
      client_secret: env.GITHUB_OAUTH_SECRET,
      code,
      redirect_uri: `${url.origin}${CALLBACK_PATH}`,
    }),
  });

  const tokenJson = (await tokenRes.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!tokenJson.access_token) {
    return html(
      `<!doctype html><html><body style="font-family:system-ui;padding:40px">
       <h2>获取令牌失败</h2>
       <p>${escapeHtml(tokenJson.error_description || tokenJson.error || '未知错误')}</p>
       <p>请关闭此窗口并重试，或联系管理员检查 OAuth App 配置。</p></body></html>`,
      500
    );
  }

  // 通过 postMessage 把 token 交回打开本窗口的 Decap CMS 页面
  const payload = JSON.stringify({
    provider: 'github',
    access_token: tokenJson.access_token,
    token_type: 'bearer',
  });

  return html(`<!doctype html>
<html>
<head><meta charset="utf-8"><title>授权成功</title></head>
<body style="font-family:system-ui;padding:40px">
  <p>授权成功，正在关闭窗口…</p>
  <script>
    (function () {
      var payload = ${payload};
      try {
        if (window.opener) {
          window.opener.postMessage(payload, '*');
          window.close();
          return;
        }
      } catch (e) {}
      // 兜底：若 opener 不可用，至少提示用户手动关闭
      document.body.innerHTML =
        '<p>授权成功。请关闭此窗口并返回内容管理页面。</p>';
    })();
  </script>
</body>
</html>`);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}