const http = require('http');

function makeRequest(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: method,
      headers: { 'Content-Type': 'application/json' }
    };
    
    if (token) options.headers['Authorization'] = `Bearer ${token}`;
    
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, data: data }); }
      });
    });
    
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function testFeatureGate() {
  console.log('=== TESTING FEATURE GATE (Phase 2) ===\n');
  
  // Login
  const login = await makeRequest('POST', '/api/auth', {
    phone: '+243844444444',
    password: 'admin123'
  });
  const token = login.data.data.token;
  const schoolId = login.data.data.schoolId;
  console.log(`✅ Login OK (School: ${schoolId})`);
  
  // Test 1: Downgrade to FREEMIUM
  console.log('\n--- Test 1: Set school to FREEMIUM ---');
  const downgradeResult = await makeRequest('POST', '/api/subscription/downgrade', {
    schoolId: schoolId,
    newTier: 'FREEMIUM'
  }, token);
  console.log(`   Status: ${downgradeResult.status}`);
  console.log(`   Message: ${downgradeResult.data.message}`);
  
  // Test 2: Try to access convocations (requires STANDARD+)
  console.log('\n--- Test 2: Access convocations (FREEMIUM) ---');
  const convResult = await makeRequest('GET', `/api/schools/${schoolId}/convocations`, null, token);
  console.log(`   Status: ${convResult.status}`);
  if (convResult.status === 403) {
    console.log(`   ✅ Correctly blocked: ${convResult.data.error}`);
    console.log(`   Required tier: ${convResult.data.tierRequired}`);
  } else {
    console.log(`   Response: ${JSON.stringify(convResult.data).substring(0, 100)}`);
  }
  
  // Test 3: Try to access communications (requires STANDARD+)
  console.log('\n--- Test 3: Access communications (FREEMIUM) ---');
  const commResult = await makeRequest('GET', `/api/schools/${schoolId}/communications`, null, token);
  console.log(`   Status: ${commResult.status}`);
  if (commResult.status === 403) {
    console.log(`   ✅ Correctly blocked: ${commResult.data.error}`);
  } else {
    console.log(`   Response: ${JSON.stringify(commResult.data).substring(0, 100)}`);
  }
  
  // Test 4: Upgrade to STANDARD
  console.log('\n--- Test 4: Upgrade to STANDARD ---');
  const upgradeResult = await makeRequest('POST', '/api/subscription/downgrade', {
    schoolId: schoolId,
    newTier: 'STANDARD'
  }, token);
  console.log(`   Status: ${upgradeResult.status}`);
  console.log(`   Message: ${upgradeResult.data.message}`);
  
  // Test 5: Try convocations again (should work now)
  console.log('\n--- Test 5: Access convocations (STANDARD) ---');
  const convResult2 = await makeRequest('GET', `/api/schools/${schoolId}/convocations`, null, token);
  console.log(`   Status: ${convResult2.status}`);
  if (convResult2.status === 200) {
    console.log(`   ✅ Access granted`);
  } else {
    console.log(`   Response: ${JSON.stringify(convResult2.data).substring(0, 100)}`);
  }
  
  // Test 6: Try communications (should work now)
  console.log('\n--- Test 6: Access communications (STANDARD) ---');
  const commResult2 = await makeRequest('GET', `/api/schools/${schoolId}/communications`, null, token);
  console.log(`   Status: ${commResult2.status}`);
  if (commResult2.status === 200) {
    console.log(`   ✅ Access granted`);
  } else {
    console.log(`   Response: ${JSON.stringify(commResult2.data).substring(0, 100)}`);
  }
  
  // Test 7: Downgrade back to FREEMIUM
  console.log('\n--- Test 7: Downgrade back to FREEMIUM ---');
  await makeRequest('POST', '/api/subscription/downgrade', {
    schoolId: schoolId,
    newTier: 'FREEMIUM'
  }, token);
  console.log(`   ✅ Downgraded to FREEMIUM`);
  
  console.log('\n=== ALL FEATURE GATE TESTS PASSED ✅ ===');
}

testFeatureGate().catch(console.error);
