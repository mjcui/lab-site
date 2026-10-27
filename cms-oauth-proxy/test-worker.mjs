/**
 * Worker 逻辑自测（不依赖 wrangler dev，避免沙箱 spawn 限制）
 * 用法：node --experimental-strip-types test-worker.mjs
 */
import worker from './src/index.ts';

const ENV = {
  GITHUB_OAUTH_ID: 'test-client-id',
  GITHUB_OAUTH_SECRET: 'test-client-secret',
};

let pass = 0, fail = 0;

function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} ${extra}`); }
}

console.log('\n[1] 根路径');
{
  const res = await worker.fetch(new Request('https://proxy.example.com/'), ENV);
  check('返回 200', res.status === 200, `got ${res.status}`);
  const body = await res.text();
  check('包含标识文字', body.includes('Decap OAuth Proxy'));
}

console.log('\n[2] 未知路径');
{
  const res = await worker.fetch(new Request('https://proxy.example.com/nope'), ENV);
  check('返回 404', res.status === 404, `got ${res.status}`);
}

console.log('\n[3] /auth 重定向到 GitHub');
{
  const res = await worker.fetch(
    new Request('https://proxy.example.com/auth?provider=github&site_id=mjcui.github.io'),
    ENV
  );
  check('返回 302', res.status === 302, `got ${res.status}`);
  const loc = res.headers.get('Location') || '';
  check('指向 GitHub 授权页', loc.startsWith('https://github.com/login/oauth/authorize'), loc);
  const u = new URL(loc);
  check('带 client_id', u.searchParams.get('client_id') === 'test-client-id');
  check('scope 含 repo', (u.searchParams.get('scope') || '').includes('repo'));
  check('带 state', !!u.searchParams.get('state'));
  check('callback 指向自身 /callback', (u.searchParams.get('redirect_uri') || '').endsWith('/callback'));
  const setCookie = res.headers.get('Set-Cookie') || '';
  check('设置了 state Cookie', setCookie.includes('decap_state='), setCookie);
  check('Cookie 为 HttpOnly', setCookie.includes('HttpOnly'));
  check('Cookie 为 Secure', setCookie.includes('Secure'));
}

console.log('\n[4] /auth 拒绝非法 site_id');
{
  const res = await worker.fetch(
    new Request('https://proxy.example.com/auth?provider=github&site_id=evil.com'),
    ENV
  );
  check('返回 400', res.status === 400, `got ${res.status}`);
}

console.log('\n[5] /auth 拒绝未支持的 provider');
{
  const res = await worker.fetch(
    new Request('https://proxy.example.com/auth?provider=gitlab'),
    ENV
  );
  check('返回 400', res.status === 400, `got ${res.status}`);
}

console.log('\n[6] /auth 缺少密钥时报错');
{
  const res = await worker.fetch(
    new Request('https://proxy.example.com/auth?provider=github'),
    { GITHUB_OAUTH_ID: '', GITHUB_OAUTH_SECRET: '' }
  );
  check('返回 500', res.status === 500, `got ${res.status}`);
}

console.log('\n[7] /callback 缺少 code');
{
  const res = await worker.fetch(new Request('https://proxy.example.com/callback'), ENV);
  check('返回 400', res.status === 400, `got ${res.status}`);
}

console.log('\n[8] /callback state 校验失败（CSRF 防护）');
{
  const res = await worker.fetch(
    new Request('https://proxy.example.com/callback?code=abc&state=xyz', {
      headers: { Cookie: 'decap_state=different' },
    }),
    ENV
  );
  check('返回 400', res.status === 400, `got ${res.status}`);
  const body = await res.text();
  check('提示会话校验失败', body.includes('state'));
}

console.log('\n[9] /callback 缺少 state Cookie');
{
  const res = await worker.fetch(
    new Request('https://proxy.example.com/callback?code=abc&state=xyz'),
    ENV
  );
  check('返回 400', res.status === 400, `got ${res.status}`);
}

console.log('\n[10] /callback GitHub 返回错误');
{
  const res = await worker.fetch(
    new Request('https://proxy.example.com/callback?error=access_denied&state=xyz', {
      headers: { Cookie: 'decap_state=xyz' },
    }),
    ENV
  );
  check('返回 400', res.status === 400, `got ${res.status}`);
  const body = await res.text();
  check('提示授权失败', body.includes('access_denied'));
}

console.log(`\n===== 通过 ${pass} 项，失败 ${fail} 项 =====`);
process.exit(fail === 0 ? 0 : 1);
