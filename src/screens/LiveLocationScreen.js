import React, { useState, useEffect, useRef, useCallback, useContext } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
  Dimensions,
  Platform,
  Switch,
  Animated,
} from 'react-native';
import MapView, { Marker, Circle, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { ref, set, onValue, off, remove } from 'firebase/database';
import { getAuth } from 'firebase/auth';
import { db } from '../firebase/config';
import { AuthContext } from '../context/AuthContext';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const MAP_HEIGHT = SCREEN_H * 0.58;

const DEFAULT_GROUP_ID = 'group_001';
const LOCATION_UPDATE_INTERVAL_MS = 8000;
const STALE_THRESHOLD_MS = 60000;

const MARKER_COLOURS = [
  '#e94560', '#00d4aa', '#f7971e', '#a855f7',
  '#3b82f6', '#10b981', '#f43f5e', '#8b5cf6',
];
function colourForIndex(i) { return MARKER_COLOURS[i % MARKER_COLOURS.length]; }

function timeAgo(ts) {
  if (!ts) return 'unknown';
  const diff = Date.now() - ts;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return `${Math.floor(diff / 3600000)}h ago`;
}

export default function LiveLocationScreen({ route }) {
  const { userProfile, rideMode } = useContext(AuthContext);
  const auth = getAuth();
  const user = auth.currentUser;

  const contextGroupId = rideMode === 'solo' ? `users/${user?.uid}` : `groups/${userProfile?.groupId}`;
  const groupIdPath = route?.params?.groupId ? `groups/${route.params.groupId}` : (userProfile?.groupId || user?.uid ? contextGroupId : `groups/${DEFAULT_GROUP_ID}`);

  const mapRef = useRef(null);
  const watchRef = useRef(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const [sharing, setSharing] = useState(false);
  const [myLocation, setMyLocation] = useState(null);
  const [teammates, setTeammates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [selectedTeammate, setSelectedTeammate] = useState(null);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        setPermissionGranted(true);
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        setMyLocation(loc.coords);
      } else {
        Alert.alert(
          'Location Permission Required',
          'TravelMate needs location access to show your position on the map.',
          [{ text: 'OK' }]
        );
      }
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!sharing) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.6, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,   duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [sharing]);

  const startSharingLocation = useCallback(async () => {
    if (!permissionGranted || !user) return;

    watchRef.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: LOCATION_UPDATE_INTERVAL_MS,
        distanceInterval: 10,
      },
      async (location) => {
        const { latitude, longitude, accuracy, heading, speed } = location.coords;
        setMyLocation(location.coords);

        const locRef = ref(db, `${groupIdPath}/locations/${user.uid}`);
        await set(locRef, {
          lat: latitude,
          lng: longitude,
          accuracy: accuracy || 0,
          heading: heading || 0,
          speed: speed || 0,
          name: user.displayName || user.email?.split('@')[0] || 'Me',
          uid: user.uid,
          updatedAt: Date.now(),
        });
      }
    );

    setSharing(true);
  }, [permissionGranted, user, groupIdPath]);

  const stopSharingLocation = useCallback(async () => {
    if (watchRef.current) {
      watchRef.current.remove();
      watchRef.current = null;
    }
    if (user) {
      const locRef = ref(db, `${groupIdPath}/locations/${user.uid}`);
      await remove(locRef);
    }
    setSharing(false);
  }, [user, groupIdPath]);

  useEffect(() => {
    return () => {
      if (watchRef.current) watchRef.current.remove();
    };
  }, []);

  useEffect(() => {
    const locationsRef = ref(db, `${groupIdPath}/locations`);
    let colourMap = {};
    let colourIdx = 0;

    const listener = onValue(locationsRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) { setTeammates([]); return; }

      const now = Date.now();
      const list = Object.entries(data)
        .filter(([uid]) => uid !== user?.uid)
        .map(([uid, info]) => {
          if (!colourMap[uid]) {
            colourMap[uid] = colourForIndex(colourIdx++);
          }
          const isStale = now - (info.updatedAt || 0) > STALE_THRESHOLD_MS;
          return {
            uid,
            name: info.name || 'Teammate',
            lat: info.lat,
            lng: info.lng,
            accuracy: info.accuracy,
            heading: info.heading,
            speed: info.speed,
            updatedAt: info.updatedAt,
            colour: colourMap[uid],
            online: !isStale,
          };
        });

      setTeammates(list);
    });

    return () => off(locationsRef, 'value', listener);
  }, [groupIdPath, user]);

  const fitAllMarkers = useCallback(() => {
    if (!mapRef.current || !myLocation) return;
    const coords = [
      { latitude: myLocation.latitude, longitude: myLocation.longitude },
      ...teammates.map((t) => ({ latitude: t.lat, longitude: t.lng })),
    ];
    if (coords.length === 1) {
      mapRef.current.animateToRegion({
        latitude: coords[0].latitude,
        longitude: coords[0].longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }, 800);
    } else {
      mapRef.current.fitToCoordinates(coords, {
        edgePadding: { top: 60, right: 60, bottom: 60, left: 60 },
        animated: true,
      });
    }
  }, [myLocation, teammates]);

  const toggleSharing = useCallback(() => {
    if (sharing) {
      stopSharingLocation();
    } else {
      startSharingLocation();
    }
  }, [sharing, startSharingLocation, stopSharingLocation]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#e94560" />
        <Text style={styles.loadingText}>Getting location…</Text>
      </View>
    );
  }

  if (!permissionGranted) {
    return (
      <View style={styles.centered}>
        <Ionicons name="location-outline" size={64} color="#4a5568" />
        <Text style={styles.permTitle}>Location Access Needed</Text>
        <Text style={styles.permSubtitle}>
          Enable location permissions in your device Settings to use Live Location.
        </Text>
      </View>
    );
  }

  const onlineCount = teammates.filter((t) => t.online).length;

  return (
    <View style={styles.root}>
      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          style={styles.map}
          provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
          onMapReady={() => setMapReady(true)}
          showsUserLocation={false}
          showsCompass
          showsScale
          initialRegion={
            myLocation
              ? {
                  latitude: myLocation.latitude,
                  longitude: myLocation.longitude,
                  latitudeDelta: 0.015,
                  longitudeDelta: 0.015,
                }
              : {
                  latitude: 20.5937,
                  longitude: 78.9629,
                  latitudeDelta: 20,
                  longitudeDelta: 20,
                }
          }
          customMapStyle={darkMapStyle}
        >
          {myLocation && (
            <>
              <Circle
                center={{ latitude: myLocation.latitude, longitude: myLocation.longitude }}
                radius={myLocation.accuracy || 20}
                fillColor="rgba(233,69,96,0.12)"
                strokeColor="rgba(233,69,96,0.3)"
                strokeWidth={1}
              />
              <Marker
                coordinate={{ latitude: myLocation.latitude, longitude: myLocation.longitude }}
                anchor={{ x: 0.5, y: 0.5 }}
                zIndex={10}
              >
                <View style={styles.myMarkerWrap}>
                  {sharing && (
                    <Animated.View
                      style={[
                        styles.myMarkerPulse,
                        { transform: [{ scale: pulseAnim }] },
                      ]}
                    />
                  )}
                  <View style={styles.myMarkerDot}>
                    <Ionicons name="person" size={12} color="#fff" />
                  </View>
                </View>
              </Marker>
            </>
          )}

          {teammates.map((tm) => (
            <Marker
              key={tm.uid}
              coordinate={{ latitude: tm.lat, longitude: tm.lng }}
              anchor={{ x: 0.5, y: 0.5 }}
              onPress={() => setSelectedTeammate(tm)}
              zIndex={5}
            >
              <View
                style={[
                  styles.tmMarkerWrap,
                  { borderColor: tm.colour },
                  !tm.online && styles.tmMarkerStale,
                ]}
              >
                <Text style={styles.tmMarkerInitial}>
                  {(tm.name || 'T')[0].toUpperCase()}
                </Text>
              </View>
            </Marker>
          ))}
        </MapView>

        <TouchableOpacity style={styles.fitBtn} onPress={fitAllMarkers}>
          <Ionicons name="scan-outline" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.panel}>
        <View style={styles.membersHeader}>
          <Text style={styles.sectionTitle}>Members Online</Text>
          <Text style={styles.nearbyLabel}>& NEARBY</Text>
        </View>

        {teammates.length === 0 ? (
          <View style={styles.noTeammates}>
            <Ionicons name="people-outline" size={32} color="#4a5568" />
            <Text style={styles.noTeammatesText}>
              No teammates are sharing their location yet.
            </Text>
          </View>
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.teammateGrid}
          >
            {teammates.map((tm) => (
              <TouchableOpacity
                key={tm.uid}
                style={[
                  styles.teammateRow,
                  selectedTeammate?.uid === tm.uid && styles.teammateRowSelected,
                ]}
                onPress={() => {
                  setSelectedTeammate(tm);
                  if (mapRef.current) {
                    mapRef.current.animateToRegion(
                      {
                        latitude: tm.lat,
                        longitude: tm.lng,
                        latitudeDelta: 0.005,
                        longitudeDelta: 0.005,
                      },
                      600
                    );
                  }
                }}
              >
                <View style={[styles.tmAvatar, { backgroundColor: tm.colour }]}>
                  <Text style={styles.tmAvatarText}>
                    {(tm.name || 'T')[0].toUpperCase()}
                  </Text>
                </View>

                <View style={styles.tmInfo}>
                  <Text style={styles.tmName} numberOfLines={1}>{tm.name}</Text>
                  <Text style={styles.tmTime}>
                    {tm.online ? 'Online' : 'Offline'}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Big Tracking Button */}
        <TouchableOpacity 
          style={[styles.trackBtn, sharing && styles.trackBtnActive]} 
          onPress={toggleSharing}
        >
          <Ionicons name={sharing ? "stop-circle" : "play-circle"} size={20} color="#fff" />
          <Text style={styles.trackBtnText}>
            {sharing ? 'STOP TRACKING' : 'START TRACKING'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const darkMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#1a1a2e' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#16213e' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8892b0' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#0f3460' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#212a37' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#9ca3af' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#e94560' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#16213e' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#17263c' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#515c6d' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#6b7280' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#163f2e' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#2f3948' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#757575' }] },
  { featureType: 'administrative.country', elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] },
  { featureType: 'administrative.land_parcel', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#bdbdbd' }] },
];

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0f3460' },
  mapContainer: { height: MAP_HEIGHT, position: 'relative' },
  map: { ...StyleSheet.absoluteFillObject },
  fitBtn: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1a1a2e',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 5,
  },
  myMarkerWrap: { alignItems: 'center', justifyContent: 'center', width: 36, height: 36 },
  myMarkerPulse: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(233,69,96,0.3)',
  },
  myMarkerDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#e94560',
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#e94560',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 5,
  },
  tmMarkerWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#1a1a2e',
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 4,
  },
  tmMarkerStale: { opacity: 0.5 },
  tmMarkerInitial: { color: '#fff', fontWeight: '800', fontSize: 13 },
  panel: {
    flex: 1,
    backgroundColor: '#0b131e',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    marginTop: -18,
    paddingTop: 24,
    paddingHorizontal: 20,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.2)',
  },
  membersHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },
  nearbyLabel: { color: '#00e5ff', fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  noTeammates: { alignItems: 'center', paddingVertical: 24, gap: 10 },
  noTeammatesText: { color: '#4a5568', fontSize: 13, textAlign: 'center' },
  teammateGrid: { 
    flexDirection: 'row', 
    flexWrap: 'wrap', 
    justifyContent: 'space-between',
    paddingBottom: 20,
  },
  teammateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    width: '48%',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  teammateRowSelected: { borderColor: '#00e5ff', backgroundColor: 'rgba(0, 229, 255, 0.1)' },
  tmAvatar: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  tmAvatarText: { color: '#0b131e', fontWeight: '900', fontSize: 14 },
  tmInfo: { flex: 1 },
  tmName:  { color: '#fff', fontSize: 13, fontWeight: '700' },
  tmTime:  { color: '#8892b0', fontSize: 10, marginTop: 2 },
  trackBtn: {
    flexDirection: 'row',
    backgroundColor: '#ff3300',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 'auto',
  },
  trackBtnActive: {
    backgroundColor: '#2C2C2C',
    borderWidth: 1,
    borderColor: '#ff3300',
  },
  trackBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1,
    marginLeft: 8,
  },
  centered: { flex: 1, backgroundColor: '#0f3460', alignItems: 'center', justifyContent: 'center', padding: 32 },
  loadingText: { color: '#8892b0', marginTop: 12, fontSize: 14 },
  permTitle: { color: '#fff', fontSize: 20, fontWeight: '700', marginTop: 20, marginBottom: 8, textAlign: 'center' },
  permSubtitle: { color: '#8892b0', fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
