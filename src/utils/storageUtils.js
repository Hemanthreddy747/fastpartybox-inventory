import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { storage, auth } from "../firebase/firebase";

export const storageUtils = {
  uploadFile: async (file, path) => {
    try {
      const storageRef = ref(storage, path);
      const token = await auth.currentUser?.getIdToken();
      
      const metadata = {
        customMetadata: {
          'auth-token': token
        }
      };
      
      await uploadBytes(storageRef, file, metadata);
      return await getDownloadURL(storageRef);
    } catch (error) {
      console.error("Upload error:", error);
      throw new Error("Failed to upload file");
    }
  },

  deleteFile: async (path) => {
    try {
      const storageRef = ref(storage, path);
      await deleteObject(storageRef);
    } catch (error) {
      console.error("Delete error:", error);
      throw new Error("Failed to delete file");
    }
  },

  getFileUrl: async (path) => {
    try {
      const storageRef = ref(storage, path);
      return await getDownloadURL(storageRef);
    } catch (error) {
      console.error("Download URL error:", error);
      throw new Error("Failed to get file URL");
    }
  }
};