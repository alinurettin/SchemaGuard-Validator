// SchemaGuard-Validator Comprehensive Verification Suite
// Author: Ali Nurettin Demir (@alinurettin)
const assert = require('assert');
const http = require('http');
const { SchemaValidator, SchemaRegistry } = require('../src/engine');
const { startServer } = require('../src/index');

console.log('====================================================');
console.log('🧪 Running Verification Suite: SchemaGuard-Validator (v2.0.0)');
console.log('====================================================');

let passedAssertions = 0;
function check(description, condition) {
  assert.ok(condition, description);
  passedAssertions++;
  console.log(`  ✓ [Assertion ${passedAssertions}] ${description}`);
}

// ----------------------------------------------------
// SECTION 1: Type Validation & Primitives
// ----------------------------------------------------
console.log('\n[SECTION 1: Type Validation & Primitives]');

check('String type validates string', SchemaValidator.validate('hello', { type: 'string' }).valid);
check('Number type validates integer and float', SchemaValidator.validate(42.5, { type: 'number' }).valid);
check('Integer type accepts 42', SchemaValidator.validate(42, { type: 'integer' }).valid);
check('Integer type rejects 42.5', !SchemaValidator.validate(42.5, { type: 'integer' }).valid);
check('Boolean type accepts true', SchemaValidator.validate(true, { type: 'boolean' }).valid);
check('Null type accepts null', SchemaValidator.validate(null, { type: 'null' }).valid);

const typeFail = SchemaValidator.validate(123, { type: 'string' });
check('Type mismatch reports valid false', typeFail.valid === false);
check('Type mismatch keyword is type', typeFail.errors[0].keyword === 'type');
check('Type mismatch path is root /', typeFail.errors[0].path === '/');

// ----------------------------------------------------
// SECTION 2: String Constraints & Formats
// ----------------------------------------------------
console.log('\n[SECTION 2: String Constraints & Semantic Formats]');

const strSchema = {
  type: 'string',
  minLength: 5,
  maxLength: 10,
  pattern: '^[a-z0-9_]+$'
};

check('Valid string passes length and regex', SchemaValidator.validate('valid_123', strSchema).valid);
check('Too short string fails minLength', !SchemaValidator.validate('abc', strSchema).valid);
check('Too long string fails maxLength', !SchemaValidator.validate('very_long_string_123', strSchema).valid);
check('Special character fails pattern regex', !SchemaValidator.validate('hello@world', strSchema).valid);

// Semantic formats
check('Valid email passes format check', SchemaValidator.validate('user@domain.com', { type: 'string', format: 'email' }).valid);
check('Invalid email rejected', !SchemaValidator.validate('not-an-email', { type: 'string', format: 'email' }).valid);

check('Valid IPv4 passes format check', SchemaValidator.validate('192.168.1.1', { type: 'string', format: 'ipv4' }).valid);
check('Invalid IPv4 rejected (256.0.0.1)', !SchemaValidator.validate('256.0.0.1', { type: 'string', format: 'ipv4' }).valid);

check('Valid UUID passes format check', SchemaValidator.validate('123e4567-e89b-12d3-a456-426614174000', { type: 'string', format: 'uuid' }).valid);
check('Invalid UUID rejected', !SchemaValidator.validate('not-a-uuid-1234', { type: 'string', format: 'uuid' }).valid);

// ----------------------------------------------------
// SECTION 3: Numeric Constraints
// ----------------------------------------------------
console.log('\n[SECTION 3: Numeric Boundaries & Multiples]');

const numSchema = {
  type: 'number',
  minimum: 10,
  maximum: 100,
  multipleOf: 5
};

check('25 satisfies minimum, maximum, and multipleOf 5', SchemaValidator.validate(25, numSchema).valid);
check('5 fails minimum bound 10', !SchemaValidator.validate(5, numSchema).valid);
check('105 fails maximum bound 100', !SchemaValidator.validate(105, numSchema).valid);
check('27 fails multipleOf 5', !SchemaValidator.validate(27, numSchema).valid);

const exclSchema = { type: 'number', exclusiveMinimum: 0, exclusiveMaximum: 10 };
check('0 fails exclusiveMinimum 0', !SchemaValidator.validate(0, exclSchema).valid);
check('5 passes exclusive range (0, 10)', SchemaValidator.validate(5, exclSchema).valid);
check('10 fails exclusiveMaximum 10', !SchemaValidator.validate(10, exclSchema).valid);

// ----------------------------------------------------
// SECTION 4: Array Constraints & Items
// ----------------------------------------------------
console.log('\n[SECTION 4: Array Constraints & Items]');

const arrSchema = {
  type: 'array',
  minItems: 2,
  maxItems: 4,
  uniqueItems: true,
  items: { type: 'integer' }
};

check('[1, 2, 3] satisfies array constraints', SchemaValidator.validate([1, 2, 3], arrSchema).valid);
check('Array with 1 item fails minItems 2', !SchemaValidator.validate([1], arrSchema).valid);
check('Array with 5 items fails maxItems 4', !SchemaValidator.validate([1, 2, 3, 4, 5], arrSchema).valid);
check('Array with duplicate [1, 2, 2] fails uniqueItems', !SchemaValidator.validate([1, 2, 2], arrSchema).valid);

const itemTypeFail = SchemaValidator.validate([1, 'two', 3], arrSchema);
check('Array item type violation detected', itemTypeFail.valid === false);
check('Error path points to exact index /1', itemTypeFail.errors[0].path === '/1');

// ----------------------------------------------------
// SECTION 5: Object Constraints & RFC 6901 Pointers
// ----------------------------------------------------
console.log('\n[SECTION 5: Object Constraints & RFC 6901 Pointers]');

const userSchema = {
  type: 'object',
  required: ['id', 'username', 'email'],
  properties: {
    id: { type: 'integer' },
    username: { type: 'string', minLength: 3 },
    email: { type: 'string', format: 'email' },
    profile: {
      type: 'object',
      required: ['bio'],
      properties: {
        bio: { type: 'string', minLength: 10 }
      }
    }
  },
  additionalProperties: false
};

const validUser = {
  id: 1,
  username: 'antigravity',
  email: 'team@antigravity.dev',
  profile: { bio: 'Deep systems engineering in Node.js' }
};
check('Valid nested user object passes', SchemaValidator.validate(validUser, userSchema).valid);

// Missing required field
const missingId = { username: 'test', email: 't@t.com' };
const resReq = SchemaValidator.validate(missingId, userSchema);
check('Missing required field reported', resReq.valid === false);
check('Pointer accurately targets /id', resReq.errors[0].path === '/id');

// Nested pointer check
const invalidNested = {
  id: 1,
  username: 'test',
  email: 't@t.com',
  profile: { bio: 'short' } // < 10 chars
};
const resNested = SchemaValidator.validate(invalidNested, userSchema);
check('Nested error detected', resNested.valid === false);
check('Nested pointer targets /profile/bio', resNested.errors[0].path === '/profile/bio');

// Disallowed additionalProperties check
const extraProps = { ...validUser, maliciousKey: 'injected' };
const resExtra = SchemaValidator.validate(extraProps, userSchema);
check('Disallowed additional property caught', resExtra.valid === false);
check('Additional property pointer targets /maliciousKey', resExtra.errors[0].path === '/maliciousKey');

// ----------------------------------------------------
// SECTION 6: Combinators & Sanitization
// ----------------------------------------------------
console.log('\n[SECTION 6: Combinators & Data Sanitization]');

// oneOf
const oneOfSchema = {
  oneOf: [
    { type: 'number', multipleOf: 3 },
    { type: 'number', multipleOf: 5 }
  ]
};
check('9 matches only multiple of 3 (passes oneOf)', SchemaValidator.validate(9, oneOfSchema).valid);
check('10 matches only multiple of 5 (passes oneOf)', SchemaValidator.validate(10, oneOfSchema).valid);
check('15 matches both 3 and 5 (fails oneOf)', !SchemaValidator.validate(15, oneOfSchema).valid);
check('7 matches neither 3 nor 5 (fails oneOf)', !SchemaValidator.validate(7, oneOfSchema).valid);

// Sanitization: strip unallowed properties
const dirtyData = {
  id: 101,
  username: 'clean_user',
  email: 'clean@dev.local',
  _secretToken: 'hack123',
  __isAdmin: true
};
const cleanData = SchemaValidator.sanitize(dirtyData, userSchema, { stripAdditional: true });
check('Sanitizer preserves allowed id', cleanData.id === 101);
check('Sanitizer preserves allowed username', cleanData.username === 'clean_user');
check('Sanitizer strips unallowed _secretToken', cleanData._secretToken === undefined);
check('Sanitizer strips unallowed __isAdmin', cleanData.__isAdmin === undefined);

// ----------------------------------------------------
// SECTION 7: Schema Registry & Ephemeral HTTP Server
// ----------------------------------------------------
console.log('\n[SECTION 7: Schema Registry & Ephemeral HTTP Endpoints]');

const server = startServer(0, () => {
  const port = server.address().port;
  console.log(`  [HTTP] Ephemeral server running on port ${port}`);

  function api(method, path, body, cb) {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
      }
    }, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try {
          cb(res.statusCode, JSON.parse(raw));
        } catch (e) {
          cb(res.statusCode, raw);
        }
      });
    });
    if (payload) req.write(payload);
    req.end();
  }

  // 1. GET /api/health
  api('GET', '/api/health', null, (status, health) => {
    check('GET /api/health returns HTTP 200', status === 200);
    check('Health reports SchemaGuard-Validator', health.service === 'SchemaGuard-Validator');
    check('Health status is UP', health.status === 'UP');

    // 2. GET /api/stats
    api('GET', '/api/stats', null, (status, resStats) => {
      check('GET /api/stats returns HTTP 200', status === 200);
      check('Registry stats contains registeredSchemasCount', typeof resStats.stats.registeredSchemasCount === 'number');

      // 3. POST /api/schema/validate
      api('POST', '/api/schema/validate', {
        data: { name: 'Ali', score: 98 },
        schema: {
          type: 'object',
          required: ['name', 'score'],
          properties: {
            name: { type: 'string' },
            score: { type: 'number', minimum: 0, maximum: 100 }
          }
        }
      }, (status, resVal) => {
        check('POST /api/schema/validate returns HTTP 200', status === 200);
        check('Validation outcome valid is true', resVal.validation.valid === true);

        // 4. POST /api/schema/sanitize
        api('POST', '/api/schema/sanitize', {
          data: { name: 'Bob', extraField: 'unwanted' },
          schema: {
            type: 'object',
            properties: { name: { type: 'string' } },
            additionalProperties: false
          }
        }, (status, resSan) => {
          check('POST /api/schema/sanitize returns HTTP 200', status === 200);
          check('Sanitized data omits extraField', resSan.sanitized.extraField === undefined);

          // 5. GET /api/schema/list
          api('GET', '/api/schema/list', null, (status, resList) => {
            check('GET /api/schema/list returns HTTP 200', status === 200);
            check('List contains user-registration schema', resList.schemas.some(s => s.id === 'user-registration'));

            // 6. POST /api/schema/validate-registered
            api('POST', '/api/schema/validate-registered', {
              id: 'user-registration',
              data: { username: 'alinu', email: 'ali@example.com', age: 25 }
            }, (status, resRegVal) => {
              check('POST /api/schema/validate-registered returns HTTP 200', status === 200);
              check('Valid data passes registered schema', resRegVal.validation.valid === true);

              // 7. 404 Route
              api('GET', '/api/non-existent-route', null, (status) => {
                check('Invalid path returns 404', status === 404);

                server.close(() => {
                  console.log('\n====================================================');
                  console.log(`🎉 ALL ${passedAssertions} ASSERTIONS PASSED (100% Non-Mocked Coverage)`);
                  console.log('====================================================');
                  process.exit(0);
                });
              });
            });
          });
        });
      });
    });
  });
});
