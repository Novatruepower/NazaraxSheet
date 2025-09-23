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

async function getAll(collectionId) {
  const snapshot = await db.collection(collectionId).get();

  const allData = {};
  allData[collectionId] = {};

  snapshot.forEach(doc => {
    allData[collectionId][doc.id] = doc.data();
  });
  
  return allData;
}

async function getAllAndRefreshData(collectionId, fileName) {
  const data = await getAll(collectionId);
  if (data) {
    refreshData(data, fileName);
  }
}

async function fetchDataAndSave() {
  try {
    // Pass the db instance to your getClasses function
    await getAllAndRefreshData("Classes", "test");
    await getAllAndRefreshData("Races", "test2");
  } catch (error) {
    console.error('Error in fetchDataAndSave:', error);
    process.exit(1);
  }
}

fetchDataAndSave();