import type React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { CalendarEvent } from '../native/WakeMeUpBridge';

interface Props {
  events: CalendarEvent[];
  onRefresh: () => void;
  onGeneratePlan: (event: CalendarEvent) => void;
}

export const CalendarList: React.FC<Props> = ({ events, onRefresh, onGeneratePlan }) => {
  const formatEventTime = (millis: number) => {
    return new Date(millis).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>UPCOMING COMMITMENTS</Text>
        <TouchableOpacity onPress={onRefresh}>
          <Text style={styles.refreshText}>↻ Refresh</Text>
        </TouchableOpacity>
      </View>

      {events.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>No upcoming morning commitments detected.</Text>
          <Text style={styles.emptySub}>
            Make sure calendar permission is granted or add an event to your Google Calendar.
          </Text>
        </View>
      ) : (
        events.map((event) => (
          <View key={event.id} style={styles.eventItem}>
            <View style={styles.eventLeft}>
              <Text style={styles.eventTime}>{formatEventTime(event.startMillis)}</Text>
              <Text style={styles.eventTitle}>{event.title}</Text>
              {event.location ? <Text style={styles.eventLoc}>📍 {event.location}</Text> : null}
            </View>

            <TouchableOpacity style={styles.planBtn} onPress={() => onGeneratePlan(event)}>
              <Text style={styles.planBtnText}>Plan Wake</Text>
            </TouchableOpacity>
          </View>
        ))
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  refreshText: {
    color: '#38BDF8',
    fontSize: 13,
    fontWeight: '600',
  },
  emptyBox: {
    backgroundColor: '#131C2E',
    borderRadius: 14,
    padding: 18,
    alignItems: 'center',
  },
  emptyText: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  emptySub: {
    color: '#64748B',
    fontSize: 12,
    textAlign: 'center',
  },
  eventItem: {
    backgroundColor: '#131C2E',
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  eventLeft: {
    flex: 1,
    marginRight: 12,
  },
  eventTime: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  eventTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  eventLoc: {
    color: '#94A3B8',
    fontSize: 12,
  },
  planBtn: {
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#38BDF8',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  planBtnText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '700',
  },
});
