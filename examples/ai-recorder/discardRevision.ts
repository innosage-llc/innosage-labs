import { Alert } from 'react-native';
export function confirmDiscard(onDiscard: () => void) {
  Alert.alert('Discard unsaved revision?', 'Your saved transcript will not change.', [
    { text: 'Keep editing', style: 'cancel' },
    { text: 'Discard', style: 'destructive', onPress: onDiscard },
  ]);
}
