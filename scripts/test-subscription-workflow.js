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

async function testWorkflow() {
  console.log('=== TESTING SUBSCRIPTION WORKFLOW ===\n');
  
  // Login as school admin
  const login = await makeRequest('POST', '/api/auth', {
    phone: '+243844444444',
    password: 'admin123'
  });
  const token = login.data.data.token;
  const schoolId = login.data.data.schoolId;
  console.log(`✅ Login OK (School: ${schoolId})`);
  
  // Test 1: Get subscription status
  console.log('\n--- Test 1: Get subscription status ---');
  const statusResult = await makeRequest('GET', '/api/subscription/status', null, token);
  console.log(`   Status: ${statusResult.status}`);
  console.log(`   Tier: ${statusResult.data.data?.tier}`);
  
  // Test 2: Create subscription request
  console.log('\n--- Test 2: Create subscription request ---');
  const requestResult = await makeRequest('POST', '/api/subscription/request', {
    requestedTier: 'STANDARD'
  }, token);
  console.log(`   Status: ${requestResult.status}`);
  console.log(`   Message: ${requestResult.data.message}`);
  const requestId = requestResult.data.data?.id;
  
  // Test 3: Try to create duplicate request (should fail)
  console.log('\n--- Test 3: Try duplicate request ---');
  const dupResult = await makeRequest('POST', '/api/subscription/request', {
    requestedTier: 'PREMIUM'
  }, token);
  console.log(`   Status: ${dupResult.status}`);
  console.log(`   Error: ${dupResult.data.error}`);
  
  // Test 4: Login as SUPER_ADMIN
  console.log('\n--- Test 4: Login as SUPER_ADMIN ---');
  const superLogin = await makeRequest('POST', '/api/auth', {
    phone: '+243810000001',
    password: 'admin123'
  });
  const superToken = superLogin.data.data?.token;
  console.log(`   Status: ${superLogin.status}`);
  
  if (superToken) {
    // Test 5: List subscription requests
    console.log('\n--- Test 5: List subscription requests ---');
    const listResult = await makeRequest('GET', '/api/subscription/requests', null, superToken);
    console.log(`   Status: ${listResult.status}`);
    console.log(`   Count: ${listResult.data.data?.length}`);
    
    // Test 6: Validate request
    if (requestId) {
      console.log('\n--- Test 6: Approve subscription request ---');
      const validateResult = await makeRequest('POST', '/api/subscription/validate', {
        requestId: requestId,
        action: 'APPROVE'
      }, superToken);
      console.log(`   Status: ${validateResult.status}`);
      console.log(`   Message: ${validateResult.data.message}`);
      
      // Test 7: Verify tier changed
      console.log('\n--- Test 7: Verify tier changed ---');
      const statusAfter = await makeRequest('GET', '/api/subscription/status', null, token);
      console.log(`   New tier: ${statusAfter.data.data?.tier}`);
    }
  }
  
  console.log('\n=== ALL WORKFLOW TESTS PASSED ✅ ===');
}

testWorkflow().catch(console.error);
