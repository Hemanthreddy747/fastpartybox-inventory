import { initializeApp } from "firebase/app";
import { getAuth, setPersistence, browserSessionPersistence } from "firebase/auth";
import { getFirestore, enableIndexedDbPersistence } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: process.env.REACT_APP_API_KEY,
  authDomain: process.env.REACT_APP_AUTH_DOMAIN,
  databaseURL: process.env.REACT_APP_DATABASE_URL,
  projectId: process.env.REACT_APP_PROJECT_ID,
  storageBucket: process.env.REACT_APP_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_APP_ID,
  measurementId: process.env.REACT_APP_MEASUREMENT_ID
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const analytics = getAnalytics(app);

// Set authentication persistence to session
setPersistence(auth, browserSessionPersistence);

// Enable offline persistence with security settings
enableIndexedDbPersistence(db, {
  synchronizeTabs: true,
  experimentalForceOwningTab: true
}).catch((err) => {
  console.error("Offline persistence error:", err);
});

// For secure storage operations, use the following pattern in your upload/download functions:
// Example usage in your components/services:
/*
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

const uploadFile = async (file, path) => {
  const storageRef = ref(storage, path);
  const metadata = {
    customMetadata: {
      'auth-token': await auth.currentUser?.getIdToken()
    }
  };
  await uploadBytes(storageRef, file, metadata);
  return getDownloadURL(storageRef);
};
*/

export { auth, db, storage, analytics };
