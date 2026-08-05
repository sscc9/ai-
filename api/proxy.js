// api/proxy.js
// Vercel Serverless 流式代理函数 - 用于解决浏览器直连大模型 API 时的 CORS 跨域问题
// 设置 Vercel 函数的最大执行时间为 60 秒（默认为 10-15 秒，改用 60 秒防止思考模型超时）
export const maxDuration = 60;

export default async function handler(req, res) {
  // 1. 处理浏览器的跨域预检请求 (OPTIONS)
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    return res.status(204).end();
  }

  // 2. 从自定义请求头中，提取真正的目标 API 地址和 API Key
  const targetUrl = req.headers['x-target-url'];
  const apiKey = req.headers['x-api-key'];

  if (!targetUrl) {
    return res.status(400).json({ error: 'Missing x-target-url header' });
  }

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    // 3. 服务端发起真正的请求（将客户端传来的 body 原封不动地转发过去）
    const upstream = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(req.body),
    });

    // 4. 将上游接口的响应状态码和 Content-Type 透传回给前端
    res.setHeader('Access-Control-Allow-Origin', '*');
    const ct = upstream.headers.get('Content-Type');
    if (ct) res.setHeader('Content-Type', ct);
    res.status(upstream.status);

    // 5. 关键步骤：以流式（Stream）块的方式读取上游数据并实时写入响应
    const reader = upstream.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
    } finally {
      res.end();
    }
  } catch (err) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(502).json({ error: `Proxy error: ${err.message}` });
  }
}
