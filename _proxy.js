/**
 * Adapter: convert Vercel (req/res) ↔ Netlify (event/result)
 * Cho phép dùng lại Netlify handler format trên Vercel
 */
async function netlifyToVercel(handler, req, res) {
  // Parse URL + query params
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  const queryParams = {};
  url.searchParams.forEach((v, k) => { queryParams[k] = v; });

  // Read body
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const body = chunks.length ? Buffer.concat(chunks).toString('utf8') : null;

  // Build Netlify-style event
  const event = {
    httpMethod:            req.method || 'GET',
    path:                  url.pathname,
    queryStringParameters: queryParams,
    headers:               req.headers || {},
    body:                  body || null,
    isBase64Encoded:       false,
  };

  // Call handler
  let result;
  try {
    result = await handler(event);
  } catch(err) {
    result = {
      statusCode: 500,
      headers:    { 'Content-Type': 'application/json' },
      body:       JSON.stringify({ error: err.message }),
    };
  }

  // Send response
  const status = result.statusCode || 200;
  res.status(status);

  if (result.headers) {
    Object.entries(result.headers).forEach(([k, v]) => {
      try { res.setHeader(k, v); } catch(_) {}
    });
  }

  // Ensure CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

  res.send(result.body || '');
}

module.exports = { netlifyToVercel };
