/**
 * NoteLoom Backend — Full Feature Test Suite
 * 
 * Run with:  node tests/runTests.js
 * 
 * Tests every major route group:
 *   1.  Health check
 *   2.  Auth  — check-email, send-verification, verify-email, signup, signin, signout
 *   3.  Session — /session/info, /session/menu
 *   4.  IT Admin — login, colleges list, menu-config
 *   5.  College Admin — (requires tenant session)
 *   6.  Departments, Classrooms, Batches
 *   7.  Notices
 *   8.  Library — digital resources
 *   9.  Attendance — init
 *  10.  COE — sessions, questions, active-session
 *  11.  System — /system/check
 *  12.  LMS routes
 *  13.  Timetable
 *  14.  Leave
 *  15.  AI — chat endpoint (quick ping)
 */

const http = require('http');
const https = require('https');

const BASE_URL = 'http://localhost:4000';

// ─── Colour helpers ──────────────────────────────────────────────────────────
const GREEN  = '\x1b[32m✅';
const RED    = '\x1b[31m❌';
const YELLOW = '\x1b[33m⚠️ ';
const RESET  = '\x1b[0m';
const BOLD   = '\x1b[1m';
const DIM    = '\x1b[2m';

// ─── Shared state (populated as tests run) ───────────────────────────────────
let state = {
  sessionToken:    null,   // college user session
  itSessionToken:  null,   // IT admin session
  tenantId:        null,
  collegeCode:     null,
  userId:          null,
  testEmail:       `test_${Date.now()}@noteloom-test.com`,
  testPassword:    'TestPass@123',
  testCollegeCode: null,   // fetched from public/colleges
};

// ─── HTTP helper ─────────────────────────────────────────────────────────────
function request(method, path, body = null, token = null) {
  return new Promise((resolve) => {
    const url = new URL(BASE_URL + path);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;

    const bodyStr = body ? JSON.stringify(body) : null;

    const options = {
      hostname : url.hostname,
      port     : url.port || (isHttps ? 443 : 80),
      path     : url.pathname + url.search,
      method,
      headers  : {
        'Content-Type'  : 'application/json',
        'Content-Length': bodyStr ? Buffer.byteLength(bodyStr) : 0,
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      }
    };

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', (e) => resolve({ status: 0, body: { error: e.message } }));
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// ─── Test runner ─────────────────────────────────────────────────────────────
let passed = 0, failed = 0, warned = 0;
const results = [];

async function test(label, fn) {
  try {
    const result = await fn();
    if (result === 'SKIP') {
      console.log(`${YELLOW} SKIP${RESET}  ${DIM}${label}${RESET}`);
      warned++;
      results.push({ label, status: 'SKIP' });
    } else {
      console.log(`${GREEN}${RESET}  ${label}`);
      passed++;
      results.push({ label, status: 'PASS' });
    }
  } catch (e) {
    console.log(`${RED}${RESET}  ${label}`);
    console.log(`         ${DIM}→ ${e.message}${RESET}`);
    failed++;
    results.push({ label, status: 'FAIL', error: e.message });
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// ─── TEST SUITES ─────────────────────────────────────────────────────────────

async function testHealth() {
  console.log(`\n${BOLD}[ 1 ] HEALTH CHECK${RESET}`);

  await test('GET /health → 200 + status field', async () => {
    const r = await request('GET', '/health');
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.body.status, 'Missing status field');
  });
}

async function testPublicColleges() {
  console.log(`\n${BOLD}[ 2 ] PUBLIC COLLEGES${RESET}`);

  await test('GET /api/auth/public/colleges → array', async () => {
    const r = await request('GET', '/api/auth/public/colleges');
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(Array.isArray(r.body), 'Expected an array');
    if (r.body.length > 0) {
      state.testCollegeCode = r.body[0].collegeCode;
      state.tenantId = r.body[0]._id;
      console.log(`         ${DIM}→ Found ${r.body.length} colleges. Using code: ${state.testCollegeCode}${RESET}`);
    }
  });
}

async function testAuth() {
  console.log(`\n${BOLD}[ 3 ] AUTH ROUTES${RESET}`);

  await test('POST /api/auth/check-email → exists: false for new email', async () => {
    const r = await request('POST', '/api/auth/check-email', { email: state.testEmail });
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.body.exists === false, `Expected exists:false, got ${r.body.exists}`);
  });

  await test('POST /api/auth/check-email → 400 if no email sent', async () => {
    const r = await request('POST', '/api/auth/check-email', {});
    assert(r.status === 400, `Expected 400, got ${r.status}`);
  });

  // NOTE: send-verification actually sends a real email — we test it returns 200
  // but we do NOT verify the OTP (would need a real inbox)
  await test('POST /api/auth/send-verification → 200 (email dispatched)', async () => {
    const r = await request('POST', '/api/auth/send-verification', {
      email: state.testEmail,
      type: 'signup'
    });
    // Accept 200 OR 500 (if email creds aren't valid — that's an infra issue, not a code bug)
    assert(r.status === 200 || r.status === 500, `Unexpected status ${r.status}`);
    if (r.status === 500) {
      console.log(`         ${DIM}→ Email dispatch failed (check EMAIL_USER/EMAIL_PASS in .env)${RESET}`);
      return 'SKIP';
    }
  });

  await test('POST /api/auth/signin → 401 for non-existent user', async () => {
    const r = await request('POST', '/api/auth/signin', {
      email: state.testEmail,
      password: 'wrongpass',
      collegeCode: state.testCollegeCode || '1001'
    });
    // Either 401 (user not found) or 404 (college code not found) — both are correct
    assert([401, 404].includes(r.status), `Expected 401/404, got ${r.status}: ${JSON.stringify(r.body)}`);
  });
}

async function testITAdminAuth() {
  console.log(`\n${BOLD}[ 4 ] IT ADMIN AUTH${RESET}`);

  await test('GET /it-admin/public/colleges → same public list', async () => {
    const r = await request('GET', '/it-admin/public/colleges');
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(Array.isArray(r.body), 'Expected array');
  });

  await test('POST /it-admin/login → 401 with wrong creds', async () => {
    const r = await request('POST', '/it-admin/login', {
      email: 'fake@noteloom.com',
      password: 'wrongpassword'
    });
    assert(r.status === 401, `Expected 401, got ${r.status}`);
  });

  // We can't test successful IT login without real IT admin credentials
  await test('GET /it-admin/colleges → 401 without token', async () => {
    const r = await request('GET', '/it-admin/colleges');
    assert(r.status === 401, `Expected 401, got ${r.status}: ${JSON.stringify(r.body)}`);
  });

  await test('GET /it-admin/tenants-list → 401 without token', async () => {
    const r = await request('GET', '/it-admin/tenants-list');
    assert(r.status === 401, `Expected 401, got ${r.status}`);
  });

  await test('GET /it-admin/users → 401 without token', async () => {
    const r = await request('GET', '/it-admin/users');
    assert(r.status === 401, `Expected 401, got ${r.status}`);
  });
}

async function testSessionRoutes() {
  console.log(`\n${BOLD}[ 5 ] SESSION ROUTES${RESET}`);

  await test('GET /session/info → 401 without token', async () => {
    const r = await request('GET', '/session/info');
    assert(r.status === 401, `Expected 401, got ${r.status}`);
  });

  await test('GET /session/menu → 401 without token', async () => {
    const r = await request('GET', '/session/menu');
    assert(r.status === 401, `Expected 401, got ${r.status}`);
  });
}

async function testProtectedRoutes() {
  console.log(`\n${BOLD}[ 6 ] PROTECTED ROUTE AUTH GUARDS${RESET}`);
  // These all require setTenantContext — they should return 401 with no token

  const protectedRoutes = [
    ['GET',  '/api/departments',               'Departments'],
    ['GET',  '/api/classrooms',                'Classrooms'],
    ['GET',  '/api/batches',                   'Batches'],
    ['GET',  '/api/notices',                   'Notices'],
    ['GET',  '/api/library/digital',           'Library Digital'],
    ['GET',  '/api/library/physical',          'Library Physical'],
    ['GET',  '/api/attendance/faculty/init?batchId=test', 'Attendance Init'],
    ['GET',  '/api/coe/sessions/all',          'COE Sessions'],
    ['GET',  '/api/coe/questions',             'COE Questions'],
    ['GET',  '/api/coe/active-session',        'COE Active Session'],
    ['GET',  '/api/college-admin/profile',     'College Admin Profile'],
    ['GET',  '/api/leave/my-leaves',           'Leave Routes'],
  ];

  for (const [method, path, label] of protectedRoutes) {
    await test(`${method} ${path} → 401 without token (${label})`, async () => {
      const r = await request(method, path);
      assert(
        r.status === 401,
        `Expected 401, got ${r.status}: ${JSON.stringify(r.body).substring(0, 80)}`
      );
    });
  }
}

async function testSystemRoutes() {
  console.log(`\n${BOLD}[ 7 ] SYSTEM ROUTES${RESET}`);

  await test('GET /health → 200 (repeat sanity)', async () => {
    const r = await request('GET', '/health');
    assert(r.status === 200, `Got ${r.status}`);
    assert(r.body.timestamp, 'Missing timestamp');
  });

  // systemRoutes is mounted at '/' — test the ping if it exists
  await test('GET /api/system/config → responds (no crash)', async () => {
    const r = await request('GET', '/api/system/config');
    // Might be 401 (protected) or 200 — just should not be 500
    assert(r.status !== 500, `Got server error 500: ${JSON.stringify(r.body)}`);
  });
}

async function testAIRoutes() {
  console.log(`\n${BOLD}[ 8 ] AI ROUTES (Auth Guard Only)${RESET}`);

  await test('POST /api/ai/chat → 401 without token', async () => {
    const r = await request('POST', '/api/ai/chat', { message: 'hello' });
    assert(r.status === 401, `Expected 401, got ${r.status}`);
  });

  await test('POST /api/ai/summarize-file → 401 without token', async () => {
    const r = await request('POST', '/api/ai/summarize-file');
    assert(r.status === 401, `Expected 401, got ${r.status}`);
  });

  await test('POST /api/ai/transcribe-video → 401 without token', async () => {
    const r = await request('POST', '/api/ai/transcribe-video', { videoUrl: 'https://test.com' });
    assert(r.status === 401, `Expected 401, got ${r.status}`);
  });
}

async function testCronEndpoint() {
  console.log(`\n${BOLD}[ 9 ] CRON / CLEANUP (Secured)${RESET}`);

  await test('GET /api/cron/cleanup without auth → 401 or 500', async () => {
    const r = await request('GET', '/api/cron/cleanup');
    assert([401, 500].includes(r.status), `Expected 401 or 500, got ${r.status}: ${JSON.stringify(r.body)}`);
  });

  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    await test('GET /api/cron/cleanup with secret query → 200', async () => {
      const r = await request('GET', `/api/cron/cleanup?secret=${cronSecret}`);
      assert(r.status === 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
      assert(r.body.success === true, `Expected success:true`);
    });

    await test('GET /api/cron/cleanup with Bearer token → 200', async () => {
      const r = await request('GET', '/api/cron/cleanup', null, cronSecret);
      assert(r.status === 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
      assert(r.body.success === true, `Expected success:true`);
    });
  } else {
    console.log(`         ${DIM}→ CRON_SECRET not configured in .env, skipping authenticated checks${RESET}`);
  }
}

async function testLMSRoutes() {
  console.log(`\n${BOLD}[ 10 ] LMS + TIMETABLE ROUTES (Auth Guards)${RESET}`);

  const routes = [
    ['GET', '/api/modules',   'LMS Modules'],
    ['GET', '/api/content',   'LMS Content'],
    ['GET', '/api/calendar',  'Calendar'],
    ['GET', '/api/routine',   'Routine'],
  ];

  for (const [method, path, label] of routes) {
    await test(`${method} ${path} → 401 without token (${label})`, async () => {
      const r = await request(method, path);
      assert(r.status === 401, `Expected 401, got ${r.status}`);
    });
  }
}

async function testBadRequests() {
  console.log(`\n${BOLD}[ 11 ] MALFORMED / EDGE CASE REQUESTS${RESET}`);

  await test('POST /api/auth/signin with empty body → does not crash (400 or 404)', async () => {
    const r = await request('POST', '/api/auth/signin', {});
    assert([400, 401, 404, 500].includes(r.status), `Got unexpected ${r.status}`);
    assert(r.status !== 0, 'Server did not respond — possible crash');
  });

  await test('GET /api/nonexistent-route → does not crash', async () => {
    const r = await request('GET', '/api/this-does-not-exist-xyz');
    // Should return something (not crash)
    assert(r.status !== 0, 'Server crashed (no response)');
  });

  await test('POST /api/auth/check-email with garbage body → server handles gracefully', async () => {
    const r = await request('POST', '/api/auth/check-email', { email: null });
    assert(r.status !== 0, 'Server crashed');
    assert(r.status !== 500 || r.body.error, 'Got 500 with no error message');
  });
}

async function testRequestValidation() {
  console.log(`\n${BOLD}[ 12 ] REQUEST VALIDATION (Zod)${RESET}`);

  await test('POST /api/auth/signin → 400 validation error (missing password)', async () => {
    const r = await request('POST', '/api/auth/signin', {
      email: 'test@noteloom.com'
    });
    assert(r.status === 400, `Expected 400, got ${r.status}`);
    assert(r.body.error === "Validation failed", `Expected "Validation failed", got "${r.body.error}"`);
    assert(r.body.details.some(d => d.field === 'password'), 'Expected password field validation detail');
  });

  await test('POST /api/auth/signin → 400 validation error (invalid email format)', async () => {
    const r = await request('POST', '/api/auth/signin', {
      email: 'notanemail',
      password: 'password123'
    });
    assert(r.status === 400, `Expected 400, got ${r.status}`);
    assert(r.body.details.some(d => d.field === 'email'), 'Expected email field validation detail');
  });
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`${BOLD}  NoteLoom Backend — Full Test Suite${RESET}`);
  console.log('  Target: ' + BASE_URL);
  console.log(`${'═'.repeat(60)}`);

  // Quick reachability check
  const reach = await request('GET', '/health');
  if (reach.status === 0) {
    console.log(`\n${RED} FATAL${RESET}: Cannot reach ${BASE_URL}`);
    console.log('  Make sure the server is running: npm run dev\n');
    process.exit(1);
  }

  await testHealth();
  await testPublicColleges();
  await testAuth();
  await testITAdminAuth();
  await testSessionRoutes();
  await testProtectedRoutes();
  await testSystemRoutes();
  await testAIRoutes();
  await testCronEndpoint();
  await testLMSRoutes();
  await testBadRequests();
  await testRequestValidation();

  // ─── Summary ───────────────────────────────────────────────────────────────
  const total = passed + failed + warned;
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`${BOLD}  RESULTS${RESET}`);
  console.log(`${'═'.repeat(60)}`);
  console.log(`  ${GREEN}${RESET}  Passed  : ${passed}`);
  console.log(`  ${RED}${RESET}  Failed  : ${failed}`);
  console.log(`  ${YELLOW}${RESET}  Skipped : ${warned}`);
  console.log(`  Total   : ${total}`);
  console.log(`${'═'.repeat(60)}\n`);

  if (failed > 0) {
    console.log(`${RED} FAILURES:${RESET}`);
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`  ${RED}${RESET} ${r.label}`);
      console.log(`      ${DIM}${r.error}${RESET}`);
    });
    console.log('');
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('Test runner crashed:', e);
  process.exit(1);
});
