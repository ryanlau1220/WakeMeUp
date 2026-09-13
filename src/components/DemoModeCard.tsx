import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface Props {
  onTriggerDemo: () => void;
  isTriggering: boolean;
}

export function DemoModeCard({ onTriggerDemo, isTriggering }: Props) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>Test alarm</Text>
      <TouchableOpacity disabled={isTriggering} onPress={onTriggerDemo}>
        <Text style={styles.action}>5 sec</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', marginTop: 4, marginBottom: 20 },
  label: { color: '#8f9a8d', fontSize: 13, marginRight: 'auto' },
  action: { color: '#f0a36d', fontSize: 14, fontWeight: '700' },
});
