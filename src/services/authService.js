import { getAuth, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase/firebase";
import { toast } from "react-toastify";

export const initializeAuthListener = () => {
  const auth = getAuth();
  
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        const userData = userDoc.data();
        
        if (userData) {
          const expiryDate = userData.subscriptionExpiry?.toDate?.() || new Date(userData.subscriptionExpiry);
          const daysUntilExpiry = Math.ceil((expiryDate - new Date()) / (1000 * 60 * 60 * 24));
          
          // Show notification only if within 5 days of expiry
          if (daysUntilExpiry <= 5 && daysUntilExpiry > 0) {
            toast.info(`Your free trial will expire in ${daysUntilExpiry} days. Upgrade to premium for enhanced features!`, {
              position: "top-right",
              autoClose: 7000,
              hideProgressBar: false,
              closeOnClick: true,
              pauseOnHover: true,
              draggable: true,
            });
          }
        }
      } catch (error) {
        console.error("Error checking subscription status:", error);
      }
    }
  });
};
