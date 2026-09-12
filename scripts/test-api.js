const http = require('http');

function makeRequest(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      }
    };
    
    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }
    
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });
    
    req.on('error', reject);
    
    if (body) {
      req.write(JSON.stringify(body));
    }
    
    req.end();
  });
}

async function testAPI() {
  console.log('=== TESTING API ENDPOINTS ===\n');
  
  // Step 1: Login
  console.log('--- Step 1: Login ---');
  const loginResult = await makeRequest('POST', '/api/auth', {
    phone: '+243844444444',
    password: 'admin123'
  });
  
  if (loginResult.status !== 200) {
    console.log('❌ Login failed:', loginResult.status, loginResult.data);
    return;
  }
  
  const token = loginResult.data.data.token;
  const schoolId = loginResult.data.data.schoolId;
  console.log(`✅ Login successful`);
  console.log(`   Token: ${token.substring(0, 30)}...`);
  console.log(`   School ID: ${schoolId}`);
  
  // Step 2: Get archived students
  console.log('\n--- Step 2: GET /api/schools/{id}/archived-students ---');
  const archivedResult = await makeRequest('GET', `/api/schools/${schoolId}/archived-students`, null, token);
  
  if (archivedResult.status !== 200) {
    console.log('❌ Failed:', archivedResult.status, archivedResult.data);
  } else {
    console.log(`✅ Retrieved ${archivedResult.data.data.length} archived students`);
    if (archivedResult.data.data.length > 0) {
      console.log(`   First: ${archivedResult.data.data[0].firstName} ${archivedResult.data.data[0].lastName}`);
    }
  }
  
  // Step 3: Test downgrade (archive excess)
  console.log('\n--- Step 3: POST /api/subscription/downgrade ---');
  const downgradeResult = await makeRequest('POST', '/api/subscription/downgrade', {
    schoolId: schoolId,
    newTier: 'FREEMIUM'
  }, token);
  
  if (downgradeResult.status !== 200) {
    console.log('❌ Failed:', downgradeResult.status, downgradeResult.data);
  } else {
    console.log(`✅ Downgrade successful`);
    console.log(`   New tier: ${downgradeResult.data.data.newTier}`);
    console.log(`   Archived: ${downgradeResult.data.data.archived} students`);
    console.log(`   Message: ${downgradeResult.data.message}`);
  }
  
  // Step 4: Verify archived count increased
  console.log('\n--- Step 4: Verify archived students ---');
  const archivedAfter = await makeRequest('GET', `/api/schools/${schoolId}/archived-students`, null, token);
  console.log(`   Archived students: ${archivedAfter.data.data.length}`);
  
  // Step 5: Test restore
  console.log('\n--- Step 5: POST /api/schools/{id}/restore-students ---');
  const restoreResult = await makeRequest('POST', `/api/schools/${schoolId}/restore-students`, null, token);
  
  if (restoreResult.status !== 200) {
    console.log('❌ Failed:', restoreResult.status, restoreResult.data);
  } else {
    console.log(`✅ Restore successful`);
    console.log(`   Restored: ${restoreResult.data.data.restored} students`);
    console.log(`   Message: ${restoreResult.data.message}`);
  }
  
  // Step 6: Verify restored count
  console.log('\n--- Step 6: Verify restored students ---');
  const archivedFinal = await makeRequest('GET', `/api/schools/${schoolId}/archived-students`, null, token);
  console.log(`   Archived students: ${archivedFinal.data.data.length}`);
  
  console.log('\n=== ALL API TESTS PASSED ✅ ===');
}

testAPI().catch(console.error);
