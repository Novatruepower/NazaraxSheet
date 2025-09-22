// Import the functions you need from the SDKs you need
  import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js';
  import { getAuth } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js';
  import { getFirestore, doc, getDoc } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';

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
    this.auth = getAuth();
    this.db = getFirestore();
    //const docRef = doc(this.db, "Classes", "Archer");
    //const docSnap = await getDoc(docRef);

    //if (docSnap.exists()) {
    //  console.log("Document data:", docSnap.data());
   // } else {
    //  // docSnap.data() will be undefined in this case
   //   console.log("No such document!");
    //}
  }
}