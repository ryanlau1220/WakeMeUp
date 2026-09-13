import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { CalendarEvent } from '../native/WakeMeUpBridge';

interface Props {
  events: CalendarEvent[];
  isPlanning: boolean;
  onRefresh: () => void;
  onGeneratePlan: (event: CalendarEvent) => void;
}

const cardColors = ['#f5efe6', '#e2ebe0', '#f0dfce', '#dce7e4'];

export function CalendarList({ events, isPlanning, onRefresh, onGeneratePlan }: Props) {
  const entrance = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    entrance.setValue(0);
    Animated.timing(entrance, {
      toValue: 1,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [entrance, events.length]);

  useEffect(() => {
    if (!isPlanning) return;
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.35, duration: 650, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [isPlanning, pulse]);

  if (isPlanning) {
    return (
      <View style={styles.thinking}>
        <Animated.View style={[styles.thinkingOrb, { opacity: pulse }]} />
        <View>
          <Text style={styles.thinkingTitle}>Making your wake plan</Text>
          <Text style={styles.thinkingDetail}>Finding the right time to get you moving.</Text>
        </View>
      </View>
    );
  }

  if (events.length === 0) {
    return (
      <TouchableOpacity style={styles.empty} onPress={onRefresh} accessibilityRole="button">
        <Text style={styles.emptyTitle}>Nothing to wake for yet</Text>
        <Text style={styles.emptyAction}>Refresh calendar</Text>
      </TouchableOpacity>
    );
  }

  return (
    <Animated.View style={{ opacity: entrance }}>
      <View style={styles.deckHeader}>
        <Text style={styles.deckTitle}>Next seven days</Text>
        <TouchableOpacity onPress={onRefresh} accessibilityLabel="Refresh calendar">
          <Text style={styles.refresh}>↻</Text>
        </TouchableOpacity>
      </View>
      {events.map((event, index) => {
        const start = new Date(event.startMillis);
        return (
          <TouchableOpacity
            key={event.id}
            style={[
              styles.card,
              { backgroundColor: cardColors[index % cardColors.length] },
              index > 0 && styles.stacked,
              { zIndex: events.length - index },
            ]}
            activeOpacity={0.8}
            onPress={() => onGeneratePlan(event)}
            accessibilityLabel={`Plan wake-up for ${event.title}`}
          >
            <View style={styles.topLine}>
              <Text style={styles.date}>{start.toLocaleDateString([], { weekday: 'long' })}</Text>
              <Text style={styles.time}>
                {start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
            <Text style={styles.title} numberOfLines={2}>
              {event.title}
            </Text>
            {event.location ? (
              <Text style={styles.location} numberOfLines={1}>
                {event.location}
              </Text>
            ) : null}
            <Text style={styles.arrow}>→</Text>
          </TouchableOpacity>
        );
      })}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  deckHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  deckTitle: { color: '#8f9a8d', fontSize: 13, fontWeight: '800' },
  refresh: { color: '#f0a36d', fontSize: 22, fontWeight: '700' },
  card: {
    borderRadius: 24,
    padding: 20,
    minHeight: 132,
    width: '100%',
    elevation: 2,
  },
  stacked: { marginTop: -12 },
  topLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  date: { color: '#776f65', fontSize: 13, fontWeight: '700' },
  time: { color: '#1f2621', fontFamily: 'serif', fontSize: 26, fontWeight: '800' },
  title: { color: '#1f2621', fontSize: 21, fontWeight: '800', marginTop: 12, paddingRight: 28 },
  location: { color: '#776f65', fontSize: 14, marginTop: 4, paddingRight: 28 },
  arrow: {
    color: '#e5583d',
    fontSize: 24,
    fontWeight: '800',
    position: 'absolute',
    right: 20,
    bottom: 18,
  },
  empty: {
    borderWidth: 1,
    borderColor: '#3a443b',
    borderRadius: 22,
    padding: 22,
    marginBottom: 18,
  },
  emptyTitle: { color: '#f5efe6', fontSize: 17, fontWeight: '700' },
  emptyAction: { color: '#f0a36d', fontSize: 14, marginTop: 6 },
  thinking: {
    backgroundColor: '#202821',
    borderRadius: 28,
    padding: 24,
    marginBottom: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  thinkingOrb: { width: 15, height: 15, borderRadius: 8, backgroundColor: '#f0a36d' },
  thinkingTitle: { color: '#fff9f0', fontSize: 18, fontWeight: '800' },
  thinkingDetail: { color: '#a6afa3', fontSize: 14, marginTop: 4 },
});
