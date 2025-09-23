const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const { getFirestore, doc, getDoc } = require('firebase-admin/firestore');

// Initialize Firebase Admin SDK first using the secret
const serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// Now that the SDK is initialized, import your manager file.
// The db object is a new instance created by the Admin SDK.
const db = getFirestore();

function refreshData(data, fileName) {
  const filePath = path.join(__dirname, '..', fileName + '.json');
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

async function getClasses(Class = "*") {
      const docSnap = await getDoc(doc(db, "Classes", Class));

      if (docSnap.exists())
        return docSnap.data();

    return null;
}

async function fetchDataAndSave() {
  try {
    // Pass the db instance to your getClasses function
    const data = await getClasses(db);
    
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