import { getCollection } from './mongodb.js';

async function checkUserHistory() {
  try {
    console.log('Checking UserChatHistory collection...\n');
    
    const collection = await getCollection('UserChatHistory');
    
    // Check for user hb114956
    const userData = await collection.findOne({ username: 'hb114956' });
    
    if (userData) {
      console.log('✅ Found user: hb114956');
      console.log('Total conversations:', userData.conversations?.length || 0);
      console.log('Last activity:', userData.lastActivity);
      console.log('\nConversations:');
      
      userData.conversations?.forEach((conv, index) => {
        console.log(`\n${index + 1}. Session: ${conv.sessionId}`);
        console.log(`   User: ${conv.userMessage.substring(0, 50)}...`);
        console.log(`   Time: ${conv.timestamp}`);
      });
    } else {
      console.log('❌ No data found for user: hb114956');
      console.log('\nChecking all users in collection...');
      
      const allUsers = await collection.find({}).limit(5).toArray();
      console.log(`Found ${allUsers.length} users:`);
      allUsers.forEach(user => {
        console.log(`- ${user.username} (${user.conversations?.length || 0} conversations)`);
      });
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkUserHistory();
