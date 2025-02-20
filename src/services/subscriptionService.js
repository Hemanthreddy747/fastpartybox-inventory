import { db } from "../firebase/firebase";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { SUBSCRIPTION_TIERS } from "../config/constants";

export class SubscriptionService {
  static async getUserTier(userId) {
    try {
      const userDoc = await getDoc(doc(db, "users", userId));
      const userData = userDoc.data();
      
      if (!userData) return "FREE";

      const expiryDate = userData.subscriptionExpiry?.toDate?.() || new Date(userData.subscriptionExpiry);
      const isExpired = expiryDate < new Date();

      // If subscription is expired, revert to FREE tier
      if (isExpired && userData.subscriptionTier !== "FREE") {
        await this.revertToFreeTier(userId);
        return "FREE";
      }

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
    const expiryDate = new Date(createdAt);
    expiryDate.setDate(expiryDate.getDate() + 90); // 90 days trial

    await setDoc(doc(db, "users", userId), {
      subscriptionTier: "FREE",
      subscriptionStatus: "trial",
      createdAt: createdAt,
      subscriptionExpiry: expiryDate,
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
          const orderCount = userDoc.data()?.orderCount || 0;
          return orderCount < limits.maxOrders;
          
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
