import { executeQuery, COLLECTIONS } from '../../mongodb.js';

async function testNoisyCI() {
  try {
    console.log('Testing NoisyCI collection...');
    console.log('Collection name:', COLLECTIONS.NOISY_CI);
    
    // Get one document to see structure
    const sample = await executeQuery(COLLECTIONS.NOISY_CI, 'findOne', {});
    console.log('\n📋 Sample document structure:');
    console.log(JSON.stringify(sample, null, 2));
    
    // Get top 5 by alert count
    const top5 = await executeQuery(COLLECTIONS.NOISY_CI, 'find', {}, {
      limit: 5,
      sort: { AlertCount: -1 }
    });
    
    console.log('\n🔝 Top 5 Noisy CIs:');
    console.log('Count:', top5.length);
    top5.forEach((ci, idx) => {
      console.log(`\n${idx + 1}. Document keys:`, Object.keys(ci));
      console.log('   Raw data:', JSON.stringify(ci, null, 2));
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

testNoisyCI();
