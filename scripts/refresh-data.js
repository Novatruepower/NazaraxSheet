const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK first using the secret
const serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// Now that the SDK is initialized, import your manager file.
// The db object is a new instance created by the Admin SDK.
const db = admin.firestore();

function refreshData(data, fileName) {
  const filePath = path.join(__dirname, '..', fileName + '.json');
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

async function getAllClasses() {
  const snapshot = await db.collection("Classes").get();
  // If you want all documents as an array:
  return snapshot.docs.map(doc => doc.data());
}

async function fetchDataAndSave() {
  try {
    // Pass the db instance to your getClasses function
    const data = await getAllClasses();
    
    if (data) {
      refreshData(data, "test");
      console.log("Successfully refreshed data and saved to test.json");
    }
  } catch (error) {
    console.error('Error in fetchDataAndSave:', error);
    process.exit(1);
  }
}

fetchDataAndSave();