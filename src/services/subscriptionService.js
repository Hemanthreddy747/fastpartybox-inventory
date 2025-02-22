import { db } from "../firebase/firebase";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { SUBSCRIPTION_TIERS } from "../config/constants";

export class SubscriptionService {
  static async getUserTier(userId) {
    try {
      const userDoc = await getDoc(doc(db, "users", userId));
      const userData = userDoc.data();
      
      if (!userData) return "FREE";

      // Remove expiry check since trial is unlimited
      return userData.subscriptionTier || "FREE";
    } catch (error) {
      console.error("Error getting user tier:", error);
      return "FREE";
    }
  }

  static async revertToFreeTier(userId) {
    try {
      await updateDoc(doc(db, "users", userId), {
        subscriptionTier: "FREE",
        subscriptionStatus: "expired",
        lastBillingDate: null
      });
    } catch (error) {
      console.error("Error reverting to free tier:", error);
    }
  }

  static async initializeFreeTrial(userId) {
    const createdAt = new Date();
    
    await setDoc(doc(db, "users", userId), {
      subscriptionTier: "FREE",
      subscriptionStatus: "trial",
      createdAt: createdAt,
      subscriptionExpiry: null, // Remove expiry for free trial
      lastBillingDate: null,
      trialStartDate: createdAt
    }, { merge: true });
  }

  static async checkLimit(userId, limitType) {
    try {
      const tier = await this.getUserTier(userId);
      const limits = SUBSCRIPTION_TIERS[tier];
      
      if (!limits) return false;

      switch (limitType) {
        case 'products':
          const userDoc = await getDoc(doc(db, "users", userId));
          const productCount = userDoc.data()?.productCount || 0;
          return productCount < limits.maxProducts;
          
        case 'orders':
          return true; // Always allow orders
          
        default:
          return false;
      }
    } catch (error) {
      console.error("Error checking limit:", error);
      return false;
    }
  }

  static async updateUsageCount(userId, type, increment = 1) {
    try {
      const field = `${type}Count`;
      await updateDoc(doc(db, "users", userId), {
        [field]: increment
      });
    } catch (error) {
      console.error(`Error updating ${type} count:`, error);
    }
  }
}
