import { getAuth } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase/firebase";
import { rateLimiter, validateInput } from "../middleware/security";

export class SecurityService {
  static async validateUserSession() {
    const auth = getAuth();
    const user = auth.currentUser;
    
    if (!user) {
      throw new Error('No active session');
    }
    
    // Check if user's token is still valid
    try {
      await user.getIdToken(true);
    } catch (error) {
      throw new Error('Invalid session');
    }
    
    return user;
  }
  
  static async checkUserPermissions(userId, operation) {
    const userDoc = await getDoc(doc(db, "users", userId));
    const userData = userDoc.data();
    
    if (!userData) {
      throw new Error('User not found');
    }
    
    const now = new Date();
    const expiryDate = userData.subscriptionExpiry?.toDate?.() || new Date(userData.subscriptionExpiry);
    
    if (expiryDate < now) {
      throw new Error('Subscription expired');
    }
    
    // Check rate limiting
    rateLimiter.checkLimit(userId, operation);
    
    return userData;
  }
  
  static validateProductData(product) {
    return {
      name: validateInput(product.name, 'text'),
      price: validateInput(product.price, 'number'),
      stock: validateInput(product.stock, 'number'),
      description: validateInput(product.description, 'text')
    };
  }
  
  static sanitizeOutput(data) {
    if (typeof data === 'object') {
      return Object.keys(data).reduce((acc, key) => {
        acc[key] = this.sanitizeOutput(data[key]);
        return acc;
      }, {});
    }
    if (typeof data === 'string') {
      return validateInput(data);
    }
    return data;
  }
}