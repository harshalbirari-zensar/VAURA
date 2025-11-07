import { executeQuery, COLLECTIONS, initializeMongoDB } from '../../mongodb.js';

async function testCMDB() {
  try {
    await initializeMongoDB();
    
    // Test multiple collections
    const collectionsToTest = [
      { name: 'CMDBStore', key: COLLECTIONS.CMDB_STORE },
      { name: 'CIDetails', key: COLLECTIONS.CI_DETAILS },
      { name: 'CI_Inventory', key: COLLECTIONS.CI_INVENTORY }
    ];
    
    for (const coll of collectionsToTest) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Testing ${coll.name} collection...`);
      console.log(`Collection key: ${coll.key}`);
      
      // Search for VINCISTACKCENTOS9
      console.log(`\n🔍 Searching for VINCISTACKCENTOS9 in ${coll.name}...`);
      const searchResults = await executeQuery(coll.key, 'find', {
        $or: [
          { EntityName: /VINCISTACKCENTOS9/i },
          { CIName: /VINCISTACKCENTOS9/i },
          { HostName: /VINCISTACKCENTOS9/i },
          { name: /VINCISTACKCENTOS9/i },
          { ciName: /VINCISTACKCENTOS9/i }
        ]
      }, { limit: 5 });
      
      console.log(`Found: ${searchResults.length} items`);
      searchResults.forEach((item, idx) => {
        console.log(`\n${idx + 1}. Keys:`, Object.keys(item).slice(0, 15));
        console.log('   Sample data:', JSON.stringify(item, null, 2).slice(0, 500));
      });
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

testCMDB();
