import React, { useEffect, useState, useContext } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, Alert, FlatList } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { ref, onValue } from 'firebase/database';
import { database } from '../firebase/config';
import { startLocationTracking, stopLocationTracking, isLocationTrackingActive } from '../services/LocationService';
import { AuthContext } from '../context/AuthContext';

const darkMapStyle = [
  {
    "elementType": "geometry",
    "stylers": [
      {
        "color": "#212121"
      }
    ]
  },
  {
    "elementType": "labels.icon",
    "stylers": [
      {
        "visibility": "off"
      }
    ]
  },
  {
    "elementType": "labels.text.fill",
    "stylers": [
      {
        "color": "#757575"
      }
    ]
  },
  {
    "elementType": "labels.text.stroke",
    "stylers": [
      {
        "color": "#212121"
      }
    ]
  },
  {
    "featureType": "administrative",
    "elementType": "geometry",
    "stylers": [
      {
        "color": "#757575"
      }
    ]
  },
  {
    "featureType": "administrative.country",
    "elementType": "labels.text.fill",
    "stylers": [
      {
        "color": "#9e9e9e"
      }
    ]
  },
  {
    "featureType": "administrative.land_parcel",
    "stylers": [
      {
        "visibility": "off"
      }
    ]
  },
  {
    "featureType": "administrative.locality",
    "elementType": "labels.text.fill",
    "stylers": [
      {
        "color": "#bdbdbd"
      }
    ]
  },
  {
    "featureType": "poi",
    "elementType": "labels.text.fill",
    "stylers": [
      {
        "color": "#757575"
      }
    ]
  },
  {
    "featureType": "poi.park",
    "elementType": "geometry",
    "stylers": [
      {
        "color": "#181818"
      }
    ]
  },
  {
    "featureType": "poi.park",
    "elementType": "labels.text.fill",
    "stylers": [
      {
        "color": "#616161"
      }
    ]
  },
  {
    "featureType": "poi.park",
    "elementType": "labels.text.stroke",
    "stylers": [
      {
        "color": "#1b1b1b"
      }
    ]
  },
  {
    "featureType": "road",
    "elementType": "geometry.fill",
    "stylers": [
      {
        "color": "#2c2c2c"
      }
    ]
  },
  {
    "featureType": "road",
    "elementType": "labels.text.fill",
    "stylers": [
      {
        "color": "#8a8a8a"
      }
    ]
  },
  {
    "featureType": "road.arterial",
    "elementType": "geometry",
    "stylers": [
      {
        "color": "#373737"
      }
    ]
  },
  {
    "featureType": "road.highway",
    "elementType": "geometry",
    "stylers": [
      {
        "color": "#3c3c3c"
      }
    ]
  },
  {
    "featureType": "road.highway.controlled_access",
    "elementType": "geometry",
    "stylers": [
      {
        "color": "#4e4e4e"
      }
    ]
  },
  {
    "featureType": "road.local",
    "elementType": "labels.text.fill",
    "stylers": [
      {
        "color": "#616161"
      }
    ]
  },
  {
    "featureType": "transit",
    "elementType": "labels.text.fill",
    "stylers": [
      {
        "color": "#757575"
      }
    ]
  },
  {
    "featureType": "water",
    "elementType": "geometry",
    "stylers": [
      {
        "color": "#000000"
      }
    ]
  },
  {
    "featureType": "water",
    "elementType": "labels.text.fill",
    "stylers": [
      {
        "color": "#3d3d3d"
      }
    ]
  }
];

export default function MapTrackingScreen() {
  const { logout, user, userProfile, rideMode } = useContext(AuthContext);
  const [riders, setRiders] = useState({});
  const [isTracking, setIsTracking] = useState(false);
  const [activeRouteWaypoints, setActiveRouteWaypoints] = useState([]);

  // Sync isTracking status with actual task status on load or focus
  useEffect(() => {
    const syncTrackingState = async () => {
      const active = await isLocationTrackingActive();
      setIsTracking(active);
    };
    syncTrackingState();
  }, []);

  // Listen to locations based on mode
  useEffect(() => {
    if (rideMode === 'group' && !userProfile?.groupId) {
      setRiders({});
      return;
    }
    
    const locationRef = rideMode === 'solo' 
      ? ref(database, `users/${user?.uid}/location`)
      : ref(database, `groups/${userProfile?.groupId}/locations`);

    const unsubscribe = onValue(locationRef, (snapshot) => {
      if (snapshot.exists()) {
        if (rideMode === 'solo') {
          // Wrap single location in an object so riderList can map over it
          setRiders({ [user?.uid]: snapshot.val() });
        } else {
          setRiders(snapshot.val());
        }
      } else {
        setRiders({});
      }
    });

    return () => unsubscribe();
  }, [rideMode, userProfile?.groupId, user?.uid]);

  // Listen to active trip waypoints based on mode
  useEffect(() => {
    const basePath = rideMode === 'solo' ? `users/${user?.uid}` : `groups/${userProfile?.groupId}`;
    if (!basePath || (rideMode === 'group' && !userProfile?.groupId)) {
      setActiveRouteWaypoints([]);
      return;
    }

    const tripsRef = ref(database, `${basePath}/trips`);
    const unsubscribe = onValue(tripsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        // Find active trip
        const activeTrip = Object.values(data).find(t => t.isActive);
        if (activeTrip && activeTrip.waypoints) {
          const wps = Object.values(activeTrip.waypoints)
            .filter(wp => wp.latitude && wp.longitude)
            .sort((a, b) => a.timestamp - b.timestamp);
          setActiveRouteWaypoints(wps);
        } else {
          setActiveRouteWaypoints([]);
        }
      } else {
        setActiveRouteWaypoints([]);
      }
    });

    return () => unsubscribe();
  }, [rideMode, userProfile?.groupId, user?.uid]);

  const toggleTracking = async () => {
    if (isTracking) {
      await stopLocationTracking();
      setIsTracking(false);
    } else {
      if (rideMode === 'group' && !userProfile?.groupId) {
        Alert.alert("No Team", "Please join or create a team in the 'Group HUD' tab first.");
        return;
      }
      const memberId = user?.uid;
      const groupId = rideMode === 'group' ? userProfile?.groupId : null;
      const started = await startLocationTracking(memberId, groupId, user?.email);
      setIsTracking(started);
    }
  };

  const riderList = Object.entries(riders);
  const showWarning = rideMode === 'group' && !userProfile?.groupId;

  return (
    <View style={styles.container}>
      <View style={[styles.mapWrapper, showWarning && { flex: 1 }]}>
        <MapView
          provider={PROVIDER_GOOGLE}
          style={styles.map}
          customMapStyle={darkMapStyle}
          initialRegion={{
            latitude: 15.2993,
            longitude: 74.124,
            latitudeDelta: 0.05,
            longitudeDelta: 0.05,
          }}
        >
          {riderList.map(([id, data]) => {
            if (!data.latitude || !data.longitude) return null;
            const isCurrentUser = id === user?.uid;
            const speed = data.speed || 0;
            const battery = data.battery || 85;
            const isMoving = speed > 5;
            return (
              <Marker
                key={id}
                coordinate={{ latitude: data.latitude, longitude: data.longitude }}
                title={isCurrentUser ? "You" : data.email || `Rider ${id.substring(0,4)}`}
                description={`Speed: ${speed} km/h • Battery: ${battery}%`}
                pinColor={isCurrentUser ? '#e53935' : (isMoving ? '#22D37A' : '#888')}
                zIndex={99}
              />
            );
          })}
          
          {/* Render Route Polyline */}
          {activeRouteWaypoints.length > 1 && (
            <Polyline
              coordinates={activeRouteWaypoints.map(wp => ({
                latitude: wp.latitude,
                longitude: wp.longitude
              }))}
              strokeColor="#4EA8DE"
              strokeWidth={4}
              lineDashPattern={[1]}
            />
          )}

          {/* Render Waypoint Markers */}
          {activeRouteWaypoints.map((wp, index) => (
            <Marker
              key={wp.timestamp.toString()}
              coordinate={{ latitude: wp.latitude, longitude: wp.longitude }}
              title={wp.name}
              description={`Stop ${index + 1}`}
              pinColor="#4EA8DE"
              zIndex={10}
            />
          ))}
        </MapView>

        {showWarning && (
          <View style={styles.warningOverlay}>
            <Text style={styles.warningTitle}>NO ACTIVE TEAM</Text>
            <Text style={styles.warningSubtitle}>
              Go to the &quot;Group HUD&quot; tab and join or create a team to start location tracking.
            </Text>
          </View>
        )}
      </View>

      {!showWarning && (
        <View style={styles.listContainer}>
          <Text style={styles.listTitle}>MEMBERS ONLINE</Text>
          <FlatList
            data={riderList}
            keyExtractor={([id]) => id}
            contentContainerStyle={styles.listScroll}
            renderItem={({ item: [id, data] }) => {
              const isCurrentUser = id === user?.uid;
              const speed = data.speed || 0;
              const battery = data.battery || 85;
              const isMoving = speed > 5;
              const nameAbbrev = (data.email || 'Rider').split('@')[0];
              
              return (
                <View style={styles.riderRow}>
                  <View style={[styles.avatarBox, isCurrentUser && styles.myAvatarBox]}>
                    <Text style={styles.avatarLetter}>
                      {(data.email || 'R').charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.riderName}>
                      {isCurrentUser ? "You (Rahul)" : nameAbbrev}
                    </Text>
                    <Text style={styles.riderCoords}>
                      {data.latitude?.toFixed(4)}°N, {data.longitude?.toFixed(4)}°E
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[styles.speedText, isMoving ? styles.movingText : styles.idleText]}>
                      {isMoving ? `${speed} km/h` : 'Stopped'}
                    </Text>
                    <Text style={styles.batteryText}>🔋 {battery}%</Text>
                  </View>
                </View>
              );
            }}
            ListEmptyComponent={() => (
              <Text style={styles.emptyListText}>No riders currently sharing location.</Text>
            )}
          />
        </View>
      )}
      
      <View style={styles.overlay}>
        {!showWarning && (
          <TouchableOpacity 
            style={[styles.button, isTracking ? styles.stopButton : styles.startButton]} 
            onPress={toggleTracking}
          >
            <Text style={styles.buttonText}>{isTracking ? "STOP TRACKING" : "START TRACKING"}</Text>
          </TouchableOpacity>
        )}
        
        <TouchableOpacity 
          style={[styles.button, styles.logoutButton, showWarning && { flex: 1 }]} 
          onPress={logout}
        >
          <Text style={styles.buttonText}>LOGOUT</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111114',
  },
  mapWrapper: {
    height: '55%',
    width: '100%',
  },
  map: {
    width: '100%',
    height: '100%',
  },
  listContainer: {
    height: '45%',
    backgroundColor: '#111114',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#222',
  },
  listTitle: {
    color: '#888',
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  listScroll: {
    paddingBottom: 85,
  },
  riderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#2C2C2C',
  },
  avatarBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#444',
  },
  myAvatarBox: {
    borderColor: '#e53935',
    backgroundColor: 'rgba(229, 57, 53, 0.1)',
  },
  avatarLetter: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  riderName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  riderCoords: {
    color: '#666',
    fontSize: 11,
    marginTop: 2,
  },
  speedText: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  movingText: {
    color: '#22D37A',
  },
  idleText: {
    color: '#FFD166',
  },
  batteryText: {
    color: '#888',
    fontSize: 11,
    marginTop: 3,
  },
  emptyListText: {
    color: '#555',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 20,
  },
  warningOverlay: {
    position: 'absolute',
    top: '25%',
    left: 20,
    right: 20,
    backgroundColor: 'rgba(30, 30, 30, 0.95)',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e53935',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 8,
  },
  warningTitle: {
    color: '#e53935',
    fontSize: 20,
    fontWeight: '950',
    letterSpacing: 2,
    marginBottom: 8,
  },
  warningSubtitle: {
    color: '#ccc',
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
  },
  overlay: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    zIndex: 99,
  },
  button: {
    padding: 14,
    borderRadius: 8,
    flex: 0.48,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  startButton: {
    backgroundColor: '#e53935', // Death Rides Red
  },
  stopButton: {
    backgroundColor: '#444',
  },
  logoutButton: {
    backgroundColor: '#1E1E1E',
    borderWidth: 1,
    borderColor: '#333'
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
    letterSpacing: 1,
  }
});
