// SchemaGuard-Validator Client Application
document.addEventListener('DOMContentLoaded', () => {
  const statSchemas = document.getElementById('statSchemas');
  const statValidations = document.getElementById('statValidations');
  const statPassRate = document.getElementById('statPassRate');
  const statPassedSub = document.getElementById('statPassedSub');

  const schemaPresetSelect = document.getElementById('schemaPresetSelect');
  const schemaTextarea = document.getElementById('schemaTextarea');
  const dataTextarea = document.getElementById('dataTextarea');

  const validateBtn = document.getElementById('validateBtn');
  const sanitizeBtn = document.getElementById('sanitizeBtn');

  const verdictBadge = document.getElementById('verdictBadge');
  const verdictBanner = document.getElementById('verdictBanner');
  const errorsTableWrap = document.getElementById('errorsTableWrap');
  const errorsTableBody = document.getElementById('errorsTableBody');
  const sanitizedResultWrap = document.getElementById('sanitizedResultWrap');
  const sanitizedJsonOutput = document.getElementById('sanitizedJsonOutput');

  // Pre-configured schema presets
  const presets = {
    user: {
      schema: {
        type: 'object',
        required: ['username', 'email', 'age', 'roles'],
        properties: {
          username: { type: 'string', minLength: 3, maxLength: 20, pattern: '^[a-z0-9_]+$' },
          email: { type: 'string', format: 'email' },
          age: { type: 'integer', minimum: 18, maximum: 100 },
          roles: {
            type: 'array',
            minItems: 1,
            uniqueItems: true,
            items: { type: 'string' }
          }
        },
        additionalProperties: false
      },
      data: {
        username: 'antigravity_dev',
        email: 'engineer@deepmind.internal',
        age: 28,
        roles: ['admin', 'maintainer'],
        _untrustedHeader: 'attacker_value'
      }
    },
    order: {
      schema: {
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
              },
              additionalProperties: false
            }
          }
        },
        additionalProperties: false
      },
      data: {
        orderId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        totalAmount: 149.95,
        items: [
          { sku: 'SKU-9921', quantity: 2, unitPrice: 49.99 },
          { sku: 'SKU-1044', quantity: 1, unitPrice: 49.97 }
        ]
      }
    },
    strict: {
      schema: {
        type: 'object',
        required: ['apiKey', 'clientIp', 'action'],
        properties: {
          apiKey: { type: 'string', minLength: 32, maxLength: 32 },
          clientIp: { type: 'string', format: 'ipv4' },
          action: { type: 'string', pattern: '^(read|write|delete)$' }
        },
        additionalProperties: false
      },
      data: {
        apiKey: '1234567890abcdef1234567890abcdef',
        clientIp: '192.168.1.100',
        action: 'write'
      }
    }
  };

  function loadPreset(key) {
    const p = presets[key];
    if (p) {
      schemaTextarea.value = JSON.stringify(p.schema, null, 2);
      dataTextarea.value = JSON.stringify(p.data, null, 2);
    }
  }

  // Load telemetry stats
  async function loadStats() {
    try {
      const res = await fetch('/api/stats');
      const data = await res.json();
      if (data.success && data.stats) {
        const s = data.stats;
        statSchemas.textContent = s.registeredSchemasCount;
        statValidations.textContent = s.totalValidations.toLocaleString();
        statPassRate.textContent = `${s.passRatePct}%`;
        statPassedSub.textContent = `${s.totalPassed} passed / ${s.totalFailed} failed`;
      }
    } catch (e) {
      console.error('Failed to load stats', e);
    }
  }

  // Validate Action
  validateBtn.addEventListener('click', async () => {
    sanitizedResultWrap.style.display = 'none';

    let schemaObj, dataObj;
    try {
      schemaObj = JSON.parse(schemaTextarea.value);
    } catch (e) {
      alert('Invalid JSON in Schema Editor: ' + e.message);
      return;
    }

    try {
      dataObj = JSON.parse(dataTextarea.value);
    } catch (e) {
      alert('Invalid JSON in Data Editor: ' + e.message);
      return;
    }

    try {
      const res = await fetch('/api/schema/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: dataObj, schema: schemaObj })
      });
      const resJson = await res.json();
      if (resJson.success && resJson.validation) {
        const v = resJson.validation;
        if (v.valid) {
          verdictBadge.className = 'verdict-badge valid';
          verdictBadge.textContent = 'PASSED (0 Errors)';
          verdictBanner.className = 'verdict-banner valid';
          verdictBanner.innerHTML = '✓ <strong>PAYLOAD FULLY VALID:</strong> All structural properties, types, boundaries, and formats satisfied.';
          errorsTableWrap.style.display = 'none';
        } else {
          verdictBadge.className = 'verdict-badge invalid';
          verdictBadge.textContent = `FAILED (${v.errorsCount} Violations)`;
          verdictBanner.className = 'verdict-banner invalid';
          verdictBanner.innerHTML = `⚠️ <strong>SCHEMA VIOLATION DETECTED:</strong> ${v.errorsCount} constraint failure(s) identified. Inspect the RFC 6901 diagnostic paths below:`;

          errorsTableBody.innerHTML = '';
          v.errors.forEach(err => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
              <td><span class="pointer-badge">${err.path}</span></td>
              <td><span class="keyword-badge">${err.keyword}</span></td>
              <td>${err.message}</td>
              <td style="font-family:monospace; color:#94a3b8;">
                ${err.expected !== undefined ? `Expected: ${JSON.stringify(err.expected)}` : ''}
                ${err.actual !== undefined ? ` | Actual: ${JSON.stringify(err.actual)}` : ''}
              </td>
            `;
            errorsTableBody.appendChild(tr);
          });
          errorsTableWrap.style.display = 'block';
        }

        await loadStats();
      } else {
        alert('Validation API error: ' + resJson.error);
      }
    } catch (err) {
      alert('Network error: ' + err.message);
    }
  });

  // Sanitize Action
  sanitizeBtn.addEventListener('click', async () => {
    let schemaObj, dataObj;
    try {
      schemaObj = JSON.parse(schemaTextarea.value);
      dataObj = JSON.parse(dataTextarea.value);
    } catch (e) {
      alert('Syntax error in JSON: ' + e.message);
      return;
    }

    try {
      const res = await fetch('/api/schema/sanitize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: dataObj, schema: schemaObj })
      });
      const data = await res.json();
      if (data.success) {
        sanitizedJsonOutput.textContent = JSON.stringify(data.sanitized, null, 2);
        sanitizedResultWrap.style.display = 'block';
      }
    } catch (err) {
      alert('Sanitize failed: ' + err.message);
    }
  });

  schemaPresetSelect.addEventListener('change', (e) => {
    loadPreset(e.target.value);
  });

  // Init
  loadPreset('user');
  loadStats();
  setInterval(loadStats, 5000);
});
