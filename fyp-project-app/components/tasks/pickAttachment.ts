import { Alert } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

export type PickedFile = { uri: string; name: string; mimeType?: string | null };

export async function pickTaskPhoto(fromCamera: boolean): Promise<PickedFile | null> {
  const permission = fromCamera
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (permission.status !== 'granted') {
    Alert.alert('Permission needed', fromCamera ? 'Allow camera access to take a photo.' : 'Allow photo access to attach an image.');
    return null;
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: 'images', quality: 0.8 };
  const result = fromCamera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || !result.assets[0]) return null;
  const asset = result.assets[0];
  const ext = asset.uri.split('.').pop() || 'jpg';
  return { uri: asset.uri, name: asset.fileName || `photo_${Date.now()}.${ext}`, mimeType: asset.mimeType || `image/${ext}` };
}

export async function pickTaskDocument(): Promise<PickedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
  if (result.canceled || !result.assets[0]) return null;
  const asset = result.assets[0];
  return { uri: asset.uri, name: asset.name, mimeType: asset.mimeType };
}

/** Returns a cleaned https URL, or null (after telling the user) when it is not a valid link. */
export function normalizeLink(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  if (!/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(withScheme)) {
    Alert.alert('Invalid link', 'Enter a web address like example.com/page.');
    return null;
  }
  return withScheme;
}
