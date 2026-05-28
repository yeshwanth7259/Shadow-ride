import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase/config';

/**
 * Uploads an image URI to Firebase Storage and returns the download URL.
 * @param {string} localUri   - The local file URI from expo-image-picker
 * @param {string} groupId    - The group this memory belongs to
 * @param {Function} onProgress - Optional callback(progress: 0–100)
 * @returns {Promise<string>} Download URL
 */
export async function uploadImageToStorage(localUri, groupId, onProgress) {
  // Convert local URI to Blob
  const response = await fetch(localUri);
  const blob = await response.blob();

  const filename = `${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
  const storageRef = ref(storage, `groups/${groupId}/memories/${filename}`);

  return new Promise((resolve, reject) => {
    const uploadTask = uploadBytesResumable(storageRef, blob);

    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const progress = Math.round(
          (snapshot.bytesTransferred / snapshot.totalBytes) * 100
        );
        if (onProgress) onProgress(progress);
      },
      (error) => reject(error),
      async () => {
        const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
        resolve(downloadURL);
      }
    );
  });
}
