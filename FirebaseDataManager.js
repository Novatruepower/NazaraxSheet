// Import the functions you need from the SDKs you need
import { initializeApp } from "./firebase/app";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCk-ePlbywdGnyTGaR-z1TnHcf3uHEcTyc",
  authDomain: "nazarax-sheet-13ee4.firebaseapp.com",
  projectId: "nazarax-sheet-13ee4",
  storageBucket: "nazarax-sheet-13ee4.firebasestorage.app",
  messagingSenderId: "968516970050",
  appId: "1:968516970050:web:e17281d88228aff2486fdb"
};

export const FireBaseDataManager = {
  app: initializeApp(firebaseConfig),
  auth: null,
  db: null,

  async init() {
    this.auth = firebase.auth();
    this.db = firebase.firestore();
    const docRef = db.collection("Classes").doc("Archer");

    // Check if the document exists
    docRef.get().then((doc) => {
        if (doc.exists) {
            console.log("Document data:", doc.data());
        } else {
            // doc.data() will be undefined in this case
            console.log("No such document!");
        }
    }).catch((error) => {
        console.log("Error getting document:", error);
    });
  }
}