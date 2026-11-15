// OWNER: B (task B7). Real OcrPort: Google ML Kit text recognition, on the phone, no network.
// Native module: tests never import this file (they use a fake OcrPort).
import TextRecognition, { TextRecognitionScript } from '@react-native-ml-kit/text-recognition';
import type { OcrPort } from './meetup-capture';

export const mlKitOcr: OcrPort = {
  async recognize(imageUri) {
    const result = await TextRecognition.recognize(imageUri, TextRecognitionScript.LATIN);
    return result.text;
  },
};
