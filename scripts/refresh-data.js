const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const { ExternalDataManager } = require('./ExternalDataManager.js');

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
    await ExternalDataManager.init();
    const collectionsToFetch = ["Races", "Classes"];
    
    // 3. Create an array of promises for each Firebase fetch
    const fetchPromises = collectionsToFetch.map(key => getAll(key));
    // 4. Await all promises to resolve in parallel
    const firebaseDataArray = await Promise.all(fetchPromises);

    // 5. Loop through the resolved data and merge
    firebaseDataArray.forEach(firebaseObject => {
      // Use Object.keys to iterate over the collection IDs
      Object.keys(firebaseObject).forEach(key => {
        const dataFromFirebase = firebaseObject[key];

        if (ExternalDataManager._data[key] && dataFromFirebase) {
          ExternalDataManager._data[key] = {
            ...dataFromFirebase,
            ...ExternalDataManager._data[key]
          };
        } else {
          ExternalDataManager._data[key] = dataFromFirebase;
        }
      });
    });

    refreshData(ExternalDataManager._data, "test3");
  } catch (error) {
    console.error('Error in fetchDataAndSave:', error);
    process.exit(1);
  }
}

fetchDataAndSave();