import { db } from '../firebase/firebase';
import { collection, writeBatch, doc, serverTimestamp } from 'firebase/firestore';
import { APP_CONFIG } from '../config/constants';

export class OfflineSyncService {
  constructor(userUID) {
    this.userUID = userUID;
    this.syncQueue = [];
    this.isSyncing = false;
  }

  addToSyncQueue(operation) {
    this.syncQueue.push({
      ...operation,
      timestamp: Date.now(),
      attempts: 0
    });
    this.persistQueue();
    this.attemptSync();
  }

  async attemptSync() {
    if (this.isSyncing || !navigator.onLine || this.syncQueue.length === 0) return;

    this.isSyncing = true;
    const batch = writeBatch(db);
    const successfulOperations = [];

    try {
      for (const operation of this.syncQueue) {
        if (operation.attempts >= 3) continue;

        switch (operation.type) {
          case 'ADD_PRODUCT':
            const productRef = doc(collection(db, 'users', this.userUID, 'products'));
            batch.set(productRef, {
              ...operation.data,
              syncedAt: serverTimestamp(),
              offlineCreatedAt: operation.timestamp
            });
            break;

          case 'UPDATE_PRODUCT':
            const updateRef = doc(db, 'users', this.userUID, 'products', operation.id);
            batch.update(updateRef, {
              ...operation.data,
              syncedAt: serverTimestamp()
            });
            break;

          case 'ADD_ORDER':
            const orderRef = doc(collection(db, 'users', this.userUID, 'orders'));
            batch.set(orderRef, {
              ...operation.data,
              syncedAt: serverTimestamp(),
              offlineCreatedAt: operation.timestamp
            });
            break;
        }

        successfulOperations.push(operation);
      }

      await batch.commit();
      this.removeFromQueue(successfulOperations);
    } catch (error) {
      this.handleSyncError(error);
    } finally {
      this.isSyncing = false;
    }
  }

  private persistQueue() {
    localStorage.setItem(`syncQueue_${this.userUID}`, JSON.stringify(this.syncQueue));
  }

  private removeFromQueue(operations) {
    this.syncQueue = this.syncQueue.filter(
      op => !operations.find(success => success.timestamp === op.timestamp)
    );
    this.persistQueue();
  }

  private handleSyncError(error) {
    console.error('Sync error:', error);
    this.syncQueue = this.syncQueue.map(op => ({
      ...op,
      attempts: op.attempts + 1
    }));
    this.persistQueue();
  }
}