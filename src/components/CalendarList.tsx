import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { CalendarEvent } from '../native/WakeMeUpBridge';

interface Props {
  events: CalendarEvent[];
  onRefresh: () => void;
  onGeneratePlan: (event: CalendarEvent) => void;
}

export function CalendarList({ events, onRefresh, onGeneratePlan }: Props) {
  const entrance = useRef(new Animated.Value(0)).current;
  const event = events[0];

  useEffect(() => {
    entrance.setValue(0);
    Animated.timing(entrance, {
      toValue: 1,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [entrance, event?.id]);

  if (!event) {
    return (
      <TouchableOpacity style={styles.empty} onPress={onRefresh} accessibilityRole="button">
        <Text style={styles.emptyTitle}>Nothing to wake for yet</Text>
        <Text style={styles.emptyAction}>Refresh calendar</Text>
      </TouchableOpacity>
    );
  }

  const start = new Date(event.startMillis);
  return (
    <Animated.View
      style={[
        styles.card,
        {
          opacity: entrance,
          transform: [
            {
              translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }),
            },
          ],
        },
      ]}
    >
      <View style={styles.topLine}>
        <Text style={styles.date}>{start.toLocaleDateString([], { weekday: 'long' })}</Text>
        <TouchableOpacity onPress={onRefresh} accessibilityLabel="Refresh calendar">
          <Text style={styles.refresh}>↻</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.time} adjustsFontSizeToFit numberOfLines={1}>
        {start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </Text>
      <Text style={styles.title} numberOfLines={2}>
        {event.title}
      </Text>
      {event.location ? (
        <Text style={styles.location} numberOfLines={1}>
          {event.location}
        </Text>
      ) : null}
      <TouchableOpacity
        style={styles.action}
        onPress={() => onGeneratePlan(event)}
        accessibilityRole="button"
      >
        <Text style={styles.actionText}>Plan my wake-up</Text>
        <Text style={styles.arrow}>→</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#f5efe6',
    borderRadius: 28,
    padding: 24,
    marginBottom: 18,
    width: '100%',
  },
  topLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  date: { color: '#776f65', fontSize: 13, fontWeight: '700' },
  refresh: { color: '#1f2621', fontSize: 22, fontWeight: '700' },
  time: {
    color: '#1f2621',
    fontSize: 48,
    fontWeight: '800',
    fontFamily: 'serif',
    letterSpacing: -2,
  },
  title: { color: '#1f2621', fontSize: 22, fontWeight: '700', marginTop: 3, flexShrink: 1 },
  location: { color: '#776f65', fontSize: 14, marginTop: 5, flexShrink: 1 },
  action: {
    backgroundColor: '#e5583d',
    borderRadius: 17,
    paddingHorizontal: 18,
    paddingVertical: 15,
    marginTop: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  actionText: { color: '#fff9f0', fontSize: 16, fontWeight: '800' },
  arrow: { color: '#fff9f0', fontSize: 22, fontWeight: '700' },
  empty: {
    borderWidth: 1,
    borderColor: '#3a443b',
    borderRadius: 22,
    padding: 22,
    marginBottom: 18,
  },
  emptyTitle: { color: '#f5efe6', fontSize: 17, fontWeight: '700' },
  emptyAction: { color: '#f0a36d', fontSize: 14, marginTop: 6 },
});
