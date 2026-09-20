// SchemaGuard-Validator - Production JSON Schema REST Server
const http = require('http');
const fs = require('fs');
const path = require('path');
const { SchemaValidator, SchemaRegistry } = require('./engine');

const registry = new SchemaRegistry();
const PORT = parseInt(process.env.PORT, 10) || 6000;
const publicDir = path.join(__dirname, '..', 'public');
const startTime = Date.now();

// Register standard pre-built schemas
registry.register('user-registration', {
  type: 'object',
  required: ['username', 'email', 'age'],
  properties: {
    username: { type: 'string', minLength: 3, maxLength: 30, pattern: '^[a-zA-Z0-9_]+$' },
    email: { type: 'string', format: 'email' },
    age: { type: 'integer', minimum: 18, maximum: 120 },
    roles: {
      type: 'array',
      items: { type: 'string' },
      uniqueItems: true
    }
  },
  additionalProperties: false
});

registry.register('order-checkout', {
  type: 'object',
  required: ['orderId', 'totalAmount', 'items'],
  properties: {
    orderId: { type: 'string', format: 'uuid' },
    totalAmount: { type: 'number', minimum: 0.01 },
    items: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['sku', 'quantity', 'unitPrice'],
        properties: {
          sku: { type: 'string', minLength: 4 },
          quantity: { type: 'integer', minimum: 1 },
          unitPrice: { type: 'number', minimum: 0 }
        }
      }
    }
  }
});

function requestHandler(req, res) {
  const parsed = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsed.pathname;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }

  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    // 1. Health
    if (pathname === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      return res.end(JSON.stringify({
        status: 'UP',
        service: 'SchemaGuard-Validator',
        uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
        timestamp: new Date().toISOString()
      }));
    }

    // 2. Stats
    if (pathname === '/api/stats') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      return res.end(JSON.stringify({
        success: true,
        service: 'SchemaGuard-Validator',
        stats: registry.getStats()
      }));
    }

    // 3. Ad-Hoc Validate Payload against Schema
    if (req.method === 'POST' && pathname === '/api/schema/validate') {
      try {
        const payload = JSON.parse(body || '{}');
        const { data, schema, options } = payload;
        if (!schema) {
          res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          return res.end(JSON.stringify({ success: false, error: 'Missing schema definition' }));
        }

        registry.metrics.totalValidations++;
        const validation = SchemaValidator.validate(data, schema, options || {});
        if (validation.valid) registry.metrics.totalPassed++;
        else registry.metrics.totalFailed++;

        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        return res.end(JSON.stringify({ success: true, validation }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        return res.end(JSON.stringify({ success: false, error: err.message }));
      }
    }

    // 4. Sanitize Payload (Strip unallowed properties)
    if (req.method === 'POST' && pathname === '/api/schema/sanitize') {
      try {
        const payload = JSON.parse(body || '{}');
        const { data, schema } = payload;
        const sanitized = SchemaValidator.sanitize(data, schema);
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        return res.end(JSON.stringify({ success: true, sanitized }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        return res.end(JSON.stringify({ success: false, error: err.message }));
      }
    }

    // 5. List Registered Schemas
    if (req.method === 'GET' && pathname === '/api/schema/list') {
      const list = [];
      for (const [id, s] of registry.schemas.entries()) {
        list.push({ id, schema: s });
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      return res.end(JSON.stringify({ success: true, count: list.length, schemas: list }));
    }

    // 6. Register New Schema
    if (req.method === 'POST' && pathname === '/api/schema/register') {
      try {
        const payload = JSON.parse(body || '{}');
        const { id, schema } = payload;
        const reg = registry.register(id, schema);
        res.writeHead(201, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        return res.end(JSON.stringify({ success: true, registered: reg }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        return res.end(JSON.stringify({ success: false, error: err.message }));
      }
    }

    // 7. Validate Against Registered Schema
    if (req.method === 'POST' && pathname === '/api/schema/validate-registered') {
      try {
        const payload = JSON.parse(body || '{}');
        const { id, data } = payload;
        const validation = registry.validate(id, data);
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        return res.end(JSON.stringify({ success: true, id, validation }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        return res.end(JSON.stringify({ success: false, error: err.message }));
      }
    }

    // 8. Static Web UI Files
    let filePath = path.join(publicDir, pathname === '/' ? 'index.html' : pathname);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes = {
        '.html': 'text/html; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.json': 'application/json; charset=utf-8'
      };
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
      return res.end(fs.readFileSync(filePath));
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Endpoint Not Found', path: pathname }));
  });
}

function startServer(portToUse = PORT, callback) {
  const server = http.createServer(requestHandler);
  server.listen(portToUse, () => {
    if (callback) callback(server);
  });
  return server;
}

if (require.main === module) {
  startServer(PORT, () => {
    console.log('⚡ SchemaGuard-Validator live on port ' + PORT);
  });
}

module.exports = { startServer, requestHandler, registry };
