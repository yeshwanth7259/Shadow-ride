import React, { useState, useEffect, useContext } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList, Alert, Modal, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { ref, onValue, push, set, update } from 'firebase/database';
import { database } from '../firebase/config';
import { AuthContext } from '../context/AuthContext';
import { Ionicons } from '@expo/vector-icons';

export default function TripPlannerScreen() {
  const { userProfile, user, rideMode } = useContext(AuthContext);
  const [routeName, setRouteName] = useState('');
  const [distance, setDistance] = useState('');
  const [trips, setTrips] = useState([]);
  const [waypointInput, setWaypointInput] = useState('');
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [isMapModalVisible, setMapModalVisible] = useState(false);
  
  const groupId = userProfile?.groupId;
  const basePath = rideMode === 'solo' ? `users/${user?.uid}` : `groups/${groupId}`;

  useEffect(() => {
    if (rideMode === 'group' && !groupId) {
      setTrips([]);
      return;
    }
    if (rideMode === 'solo' && !user?.uid) {
      setTrips([]);
      return;
    }

    const tripsRef = ref(database, `${basePath}/trips`);
    const unsubscribe = onValue(tripsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const tripsArray = Object.keys(data).map(key => ({
          id: key,
          ...data[key]
        }));
        tripsArray.sort((a, b) => b.timestamp - a.timestamp);
        setTrips(tripsArray);
      } else {
        setTrips([]);
      }
    });

    return () => unsubscribe();
  }, [groupId, basePath]);

  const addTrip = async () => {
    if (rideMode === 'group' && !groupId) {
      Alert.alert("Error", "You must join a team first");
      return;
    }

    if (routeName && distance) {
      const timestamp = Date.now();
      const tripsRef = ref(database, `${basePath}/trips`);
      const newTripRef = push(tripsRef);
      await set(newTripRef, {
        title: routeName,
        distance: distance,
        isActive: false,
        timestamp: timestamp
      });
      setRouteName('');
      setDistance('');
    } else {
      Alert.alert("Error", "Please enter both route name and distance");
    }
  };

  const handleUseTrip = async (id) => {
    if (rideMode === 'group' && !groupId) return;
    
    const updates = {};
    trips.forEach(trip => {
      updates[`${basePath}/trips/${trip.id}/isActive`] = trip.id === id;
    });
    
    try {
      await update(ref(database), updates);
    } catch (error) {
      console.error("Failed to update active trip", error);
    }
  };

  const handleAddWaypoint = async (tripId) => {
    if (!waypointInput.trim()) {
      Alert.alert("Error", "Please enter a stop name");
      return;
    }
    if (!selectedLocation) {
      Alert.alert("Error", "Please tap on the map to set a location for this stop");
      return;
    }

    try {
      const timestamp = Date.now();
      const waypointsRef = ref(database, `${basePath}/trips/${tripId}/waypoints`);
      const newWaypointRef = push(waypointsRef);
      await set(newWaypointRef, {
        name: waypointInput.trim(),
        latitude: selectedLocation.latitude,
        longitude: selectedLocation.longitude,
        timestamp: timestamp
      });
      setWaypointInput('');
      setSelectedLocation(null);
      setMapModalVisible(false);
    } catch (err) {
      Alert.alert("Failed to add stop", err.message);
    }
  };

  const handleDeleteWaypoint = async (tripId, waypointId) => {
    try {
      const waypointRef = ref(database, `${basePath}/trips/${tripId}/waypoints/${waypointId}`);
      await set(waypointRef, null);
    } catch (err) {
      Alert.alert("Failed to delete stop", err.message);
    }
  };

  if (rideMode === 'group' && !groupId) {
    return (
      <View style={styles.container}>
        <View style={styles.warningOverlay}>
          <Ionicons name="warning-outline" size={48} color="#00e5ff" />
          <Text style={styles.warningTitle}>NO ACTIVE TEAM</Text>
          <Text style={styles.warningSubtitle}>
            Go to the "Team" tab and join or create a team to plan routes with your teammates.
          </Text>
        </View>
      </View>
    );
  }

  const activeTrip = trips.find(t => t.isActive);
  const activeTripWaypoints = activeTrip && activeTrip.waypoints
    ? Object.entries(activeTrip.waypoints)
        .map(([id, data]) => ({ id, ...data }))
        .sort((a, b) => a.timestamp - b.timestamp)
    : [];

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        
        {/* Top Header Card */}
        <View style={styles.headerCard}>
          <Text style={styles.headerTitle}>CURRENT VIEW</Text>
          <Text style={styles.headerSubtitle}>Route Visualization</Text>
          <View style={styles.mapIconWrap}>
            <Ionicons name="navigate-circle" size={32} color="#00e5ff" />
          </View>
        </View>

        {/* Configuration Section */}
        <Text style={styles.sectionHeading}>CONFIGURATION</Text>
        <View style={styles.configContainer}>
          <Text style={styles.inputLabel}>ROUTE NAME</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Manali Ride"
            placeholderTextColor="#4a5568"
            value={routeName}
            onChangeText={setRouteName}
          />
          <View style={styles.rowInputs}>
            <View style={styles.flex1}>
              <Text style={styles.inputLabel}>DISTANCE (KM)</Text>
              <TextInput
                style={styles.input}
                placeholder="300"
                placeholderTextColor="#4a5568"
                keyboardType="numeric"
                value={distance}
                onChangeText={setDistance}
              />
            </View>
          </View>
          <TouchableOpacity style={styles.saveBtn} onPress={addTrip}>
            <Ionicons name="save" size={16} color="#fff" />
            <Text style={styles.saveBtnText}>CREATE ROUTE</Text>
          </TouchableOpacity>
        </View>

        {/* Active Route Info */}
        {trips.length > 0 && (
          <View style={styles.savedRoutesContainer}>
            <Text style={styles.sectionHeading}>SAVED ROUTES</Text>
            {trips.map(item => (
              <View key={item.id} style={[styles.tripCard, item.isActive && styles.activeTripCard]}>
                <View style={styles.tripInfo}>
                  <Text style={styles.tripTitle}>{item.title}</Text>
                  <Text style={styles.tripDistance}>{item.distance} KM Total</Text>
                </View>
                {!item.isActive ? (
                  <TouchableOpacity style={styles.useButton} onPress={() => handleUseTrip(item.id)}>
                    <Text style={styles.useButtonText}>SET ACTIVE</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.activeBadge}>
                    <Text style={styles.activeBadgeText}>ACTIVE</Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Stops & Waypoints Timeline */}
        {activeTrip && (
          <View style={styles.timelineSection}>
            <View style={styles.timelineHeaderRow}>
              <Text style={styles.sectionHeading}>Stops & Waypoints</Text>
            </View>

            <View style={styles.timelineContainer}>
              {/* Start Point */}
              <View style={styles.timelineRow}>
                <View style={styles.timelineIconWrap}>
                  <View style={styles.startIcon}><View style={styles.startIconInner}/></View>
                  <View style={styles.timelineLine} />
                </View>
                <View style={styles.timelineContent}>
                  <Text style={styles.pointLabel}>STARTING POINT</Text>
                  <Text style={styles.pointTitle}>{activeTrip.title} Basecamp</Text>
                  <Text style={styles.pointSub}>0.0 KM - 00:00 HR</Text>
                </View>
              </View>

              {/* Waypoints */}
              {activeTripWaypoints.map((stop, index) => (
                <View key={stop.id} style={styles.timelineRow}>
                  <View style={styles.timelineIconWrap}>
                    <View style={styles.waypointIcon}><Ionicons name="flag" size={10} color="#0b131e" /></View>
                    <View style={styles.timelineLine} />
                  </View>
                  <View style={styles.timelineContentBox}>
                    <View style={styles.timelineContentHeader}>
                      <Text style={styles.pointLabel}>NEXT STOP</Text>
                      <TouchableOpacity onPress={() => handleDeleteWaypoint(activeTrip.id, stop.id)}>
                        <Ionicons name="trash-outline" size={14} color="#ff3300" />
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.pointTitle}>{stop.name}</Text>
                    <Text style={styles.pointSub}>~{Math.round(activeTrip.distance / (activeTripWaypoints.length + 1))} KM from previous</Text>
                  </View>
                </View>
              ))}

              {/* Add new stop */}
              <View style={styles.timelineRow}>
                <View style={styles.timelineIconWrap}>
                  <TouchableOpacity 
                    style={styles.addIcon}
                    onPress={() => setMapModalVisible(true)}
                  >
                    <Ionicons name="add" size={14} color="#fff" />
                  </TouchableOpacity>
                  <View style={[styles.timelineLine, { borderStyle: 'dashed' }]} />
                </View>
                <View style={styles.timelineContentAdd}>
                  <TextInput
                    style={styles.addStopInput}
                    placeholder="Enter stop name"
                    placeholderTextColor="#4a5568"
                    value={waypointInput}
                    onChangeText={setWaypointInput}
                  />
                  <TouchableOpacity 
                    style={styles.addStopActionBtn} 
                    onPress={() => handleAddWaypoint(activeTrip.id)}
                  >
                    <Text style={styles.addStopActionText}>ADD STOP</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Final Destination */}
              <View style={styles.timelineRow}>
                <View style={styles.timelineIconWrap}>
                  <View style={styles.endIcon}><Ionicons name="flag" size={12} color="#fff" /></View>
                </View>
                <View style={styles.timelineContentBoxEnd}>
                  <Text style={styles.pointLabel}>FINAL DESTINATION</Text>
                  <Text style={styles.pointTitle}>{activeTrip.title} Peak</Text>
                  <Text style={styles.pointSub}>{activeTrip.distance} KM - ETA Pending</Text>
                </View>
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Map Modal for picking location */}
      <Modal visible={isMapModalVisible} animationType="fade" transparent={true}>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Stop Location</Text>
            <Text style={styles.modalSubtitle}>Tap on the map to place a pin</Text>
            <MapView
              provider={PROVIDER_GOOGLE}
              style={styles.modalMap}
              initialRegion={{
                latitude: 15.2993,
                longitude: 74.124,
                latitudeDelta: 1.5,
                longitudeDelta: 1.5,
              }}
              onPress={(e) => setSelectedLocation(e.nativeEvent.coordinate)}
              customMapStyle={darkMapStyle}
            >
              {selectedLocation && (
                <Marker coordinate={selectedLocation}>
                   <View style={styles.markerPin}>
                      <Ionicons name="location" size={32} color="#00e5ff" />
                   </View>
                </Marker>
              )}
            </MapView>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setMapModalVisible(false)}>
                <Text style={styles.modalBtnCancelText}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalBtnConfirm} onPress={() => setMapModalVisible(false)}>
                <Text style={styles.modalBtnConfirmText}>CONFIRM PIN</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const darkMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#1a1a2e' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#16213e' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8892b0' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#0f3460' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#212a37' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#e94560' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#16213e' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#17263c' }] },
];

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b131e',
  },
  scrollContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  warningOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  warningTitle: { color: '#fff', fontSize: 20, fontWeight: '900', letterSpacing: 2, marginTop: 16, marginBottom: 8 },
  warningSubtitle: { color: '#8892b0', textAlign: 'center', fontSize: 14, lineHeight: 22 },
  
  headerCard: {
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.2)',
    flexDirection: 'column',
    position: 'relative',
  },
  headerTitle: { color: '#00e5ff', fontSize: 10, fontWeight: '900', letterSpacing: 1, marginBottom: 4 },
  headerSubtitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  mapIconWrap: { position: 'absolute', right: 20, top: 20 },
  
  sectionHeading: { color: '#8892b0', fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 12 },
  
  configContainer: { marginBottom: 24 },
  inputLabel: { color: '#8892b0', fontSize: 9, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6 },
  input: {
    backgroundColor: '#16213e',
    color: '#fff',
    padding: 14,
    borderRadius: 8,
    fontSize: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    marginBottom: 16,
  },
  rowInputs: { flexDirection: 'row', gap: 12 },
  flex1: { flex: 1 },
  saveBtn: {
    backgroundColor: '#ff3300',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderRadius: 8,
  },
  saveBtnText: { color: '#fff', fontSize: 13, fontWeight: '900', letterSpacing: 1, marginLeft: 8 },
  
  savedRoutesContainer: { marginBottom: 24 },
  tripCard: {
    flexDirection: 'row',
    backgroundColor: '#16213e',
    padding: 16,
    borderRadius: 8,
    marginBottom: 10,
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  activeTripCard: {
    borderColor: '#00e5ff',
    backgroundColor: 'rgba(0, 229, 255, 0.05)',
  },
  tripInfo: { flex: 1 },
  tripTitle: { color: '#fff', fontSize: 15, fontWeight: '800' },
  tripDistance: { color: '#8892b0', fontSize: 11, marginTop: 4 },
  useButton: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  useButtonText: { color: '#fff', fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  activeBadge: {
    backgroundColor: 'rgba(0, 229, 255, 0.1)',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#00e5ff',
  },
  activeBadgeText: { color: '#00e5ff', fontSize: 10, fontWeight: '900', letterSpacing: 1 },

  timelineSection: { marginTop: 10 },
  timelineHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  timelineContainer: { marginTop: 8 },
  timelineRow: { flexDirection: 'row', marginBottom: 0, minHeight: 60 },
  timelineIconWrap: { width: 40, alignItems: 'center' },
  timelineLine: { flex: 1, width: 2, backgroundColor: '#333', marginVertical: 4 },
  
  startIcon: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#00e5ff', alignItems: 'center', justifyContent: 'center' },
  startIconInner: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#0b131e' },
  waypointIcon: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  endIcon: { width: 24, height: 24, borderRadius: 4, backgroundColor: '#ff3300', alignItems: 'center', justifyContent: 'center' },
  addIcon: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#333', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#555' },
  
  timelineContent: { flex: 1, paddingBottom: 24, paddingTop: -2 },
  timelineContentBox: {
    flex: 1,
    backgroundColor: '#16213e',
    borderRadius: 8,
    padding: 12,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  timelineContentBoxEnd: {
    flex: 1,
    backgroundColor: 'rgba(255, 51, 0, 0.05)',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 51, 0, 0.2)',
  },
  timelineContentAdd: {
    flex: 1,
    flexDirection: 'row',
    marginBottom: 24,
    gap: 8,
  },
  timelineContentHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  
  pointLabel: { color: '#00e5ff', fontSize: 9, fontWeight: '900', letterSpacing: 1, marginBottom: 4 },
  pointTitle: { color: '#fff', fontSize: 14, fontWeight: '800' },
  pointSub: { color: '#8892b0', fontSize: 11, marginTop: 4 },
  
  addStopInput: {
    flex: 1,
    backgroundColor: '#16213e',
    color: '#fff',
    paddingHorizontal: 12,
    borderRadius: 6,
    fontSize: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  addStopActionBtn: {
    backgroundColor: '#00e5ff',
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  addStopActionText: { color: '#0b131e', fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  
  // Modal
  modalContainer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '90%', height: '70%', backgroundColor: '#16213e', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#333' },
  modalTitle: { color: '#fff', fontSize: 16, fontWeight: '900', marginBottom: 4 },
  modalSubtitle: { color: '#8892b0', fontSize: 12, marginBottom: 16 },
  modalMap: { flex: 1, borderRadius: 8, marginBottom: 16 },
  markerPin: { alignItems: 'center', justifyContent: 'center' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  modalBtnCancel: { paddingVertical: 12, paddingHorizontal: 20, borderRadius: 8, backgroundColor: '#333' },
  modalBtnCancelText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  modalBtnConfirm: { paddingVertical: 12, paddingHorizontal: 20, borderRadius: 8, backgroundColor: '#ff3300' },
  modalBtnConfirmText: { color: '#fff', fontSize: 12, fontWeight: '900' },
});
