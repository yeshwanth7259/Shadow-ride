// src/screens/LiveLocationScreen.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
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
import { ref, set, onValue, off, serverTimestamp, remove } from 'firebase/database';
import { getAuth } from 'firebase/auth';
import { db } from '../firebase/config';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const MAP_HEIGHT = SCREEN_H * 0.58;

// ─── Config ──────────────────────────────────────────────────────────────────
const DEFAULT_GROUP_ID = 'group_001'; // change or pass via route.params
const LOCATION_UPDATE_INTERVAL_MS = 8000; // push location every 8 seconds
const STALE_THRESHOLD_MS = 60000;         // mark member offline after 60 seconds

// ── Colour palette for teammates ─────────────────────────────────────────────
const MARKER_COLOURS = [
  '#e94560', '#00d4aa', '#f7971e', '#a855f7',
  '#3b82f6', '#10b981', '#f43f5e', '#8b5cf6',
];
function colourForIndex(i) { return MARKER_COLOURS[i % MARKER_COLOURS.length]; }

// ── Formats timestamp as "X min ago" ─────────────────────────────────────────
function timeAgo(ts) {
  if (!ts) return 'unknown';
  const diff = Date.now() - ts;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return `${Math.floor(diff / 3600000)}h ago`;
}

// ─────────────────────────────────────────────────────────────────────────────
export default function LiveLocationScreen({ route }) {
  const groupId = route?.params?.groupId || DEFAULT_GROUP_ID;
  const auth = getAuth();
  const user = auth.currentUser;

  const mapRef = useRef(null);
  const watchRef = useRef(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const [sharing, setSharing] = useState(false);
  const [myLocation, setMyLocation] = useState(null);
  const [teammates, setTeammates] = useState([]); // [{ uid, name, lat, lng, updatedAt, colour }]
  const [loading, setLoading] = useState(true);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [selectedTeammate, setSelectedTeammate] = useState(null);

  // ── Request location permission ───────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        setPermissionGranted(true);
        // Get one-shot location immediately so map focuses
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

  // ── Pulse animation for "sharing" beacon ─────────────────────────────────
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

  // ── Watch & push own location ─────────────────────────────────────────────
  const startSharingLocation = useCallback(async () => {
    if (!permissionGranted || !user) return;

    watchRef.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: LOCATION_UPDATE_INTERVAL_MS,
        distanceInterval: 10, // min 10 metres movement
      },
      async (location) => {
        const { latitude, longitude, accuracy, heading, speed } = location.coords;
        setMyLocation(location.coords);

        // Push to Firebase
        const locRef = ref(db, `groups/${groupId}/locations/${user.uid}`);
        await set(locRef, {
          lat: latitude,
          lng: longitude,
          accuracy: accuracy || 0,
          heading: heading || 0,
          speed: speed || 0,
          name: user.displayName || user.email?.split('@')[0] || 'Me',
          uid: user.uid,
          updatedAt: Date.now(), // client timestamp (serverTimestamp not queryable)
        });
      }
    );

    setSharing(true);
  }, [permissionGranted, user, groupId]);

  const stopSharingLocation = useCallback(async () => {
    if (watchRef.current) {
      watchRef.current.remove();
      watchRef.current = null;
    }
    // Remove own location from Firebase
    if (user) {
      const locRef = ref(db, `groups/${groupId}/locations/${user.uid}`);
      await remove(locRef);
    }
    setSharing(false);
  }, [user, groupId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (watchRef.current) watchRef.current.remove();
    };
  }, []);

  // ── Listen to all group member locations ─────────────────────────────────
  useEffect(() => {
    const locationsRef = ref(db, `groups/${groupId}/locations`);
    let colourMap = {};
    let colourIdx = 0;

    const listener = onValue(locationsRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) { setTeammates([]); return; }

      const now = Date.now();
      const list = Object.entries(data)
        .filter(([uid]) => uid !== user?.uid) // exclude self
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
  }, [groupId, user]);

  // ── Fly map to fit all markers ────────────────────────────────────────────
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

  // ── Toggle sharing ────────────────────────────────────────────────────────
  const toggleSharing = useCallback(() => {
    if (sharing) {
      stopSharingLocation();
    } else {
      startSharingLocation();
    }
  }, [sharing, startSharingLocation, stopSharingLocation]);

  // ─────────────────────────────────────────────────────────────────────────
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

      {/* ── Map ──────────────────────────────────────────────────────────── */}
      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          style={styles.map}
          provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
          onMapReady={() => setMapReady(true)}
          showsUserLocation={false}   // we draw our own custom marker
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
          {/* ── My marker ── */}
          {myLocation && (
            <>
              {/* Accuracy circle */}
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

          {/* ── Teammate markers ── */}
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

        {/* ── Map FABs ── */}
        <TouchableOpacity style={styles.fitBtn} onPress={fitAllMarkers}>
          <Ionicons name="scan-outline" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* ── Bottom Panel ──────────────────────────────────────────────────── */}
      <View style={styles.panel}>

        {/* ── Share toggle ── */}
        <View style={styles.shareRow}>
          <View>
            <Text style={styles.shareTitle}>Share My Location</Text>
            <Text style={styles.shareSubtitle}>
              {sharing ? '● Broadcasting your position' : 'Your location is hidden'}
            </Text>
          </View>
          <Switch
            value={sharing}
            onValueChange={toggleSharing}
            trackColor={{ false: '#16213e', true: '#e94560' }}
            thumbColor={sharing ? '#fff' : '#8892b0'}
          />
        </View>

        <View style={styles.divider} />

        {/* ── Teammates list ── */}
        <Text style={styles.sectionTitle}>
          Teammates Online ({onlineCount}/{teammates.length})
        </Text>

        {teammates.length === 0 ? (
          <View style={styles.noTeammates}>
            <Ionicons name="people-outline" size={32} color="#4a5568" />
            <Text style={styles.noTeammatesText}>
              No teammates are sharing their location yet.
            </Text>
          </View>
        ) : (
          <ScrollView
            horizontal={false}
            showsVerticalScrollIndicator={false}
            style={styles.teammateList}
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
                {/* Avatar dot */}
                <View style={[styles.tmAvatar, { backgroundColor: tm.colour }]}>
                  <Text style={styles.tmAvatarText}>
                    {(tm.name || 'T')[0].toUpperCase()}
                  </Text>
                </View>

                {/* Info */}
                <View style={{ flex: 1 }}>
                  <Text style={styles.tmName}>{tm.name}</Text>
                  <Text style={styles.tmTime}>
                    {tm.online ? `Updated ${timeAgo(tm.updatedAt)}` : '⚠ Location stale'}
                  </Text>
                </View>

                {/* Online badge */}
                <View style={[styles.badge, { backgroundColor: tm.online ? '#10b981' : '#4a5568' }]}>
                  <Text style={styles.badgeText}>{tm.online ? 'Live' : 'Off'}</Text>
                </View>

                {/* Locate arrow */}
                <Ionicons name="chevron-forward" size={16} color="#4a5568" style={{ marginLeft: 6 }} />
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

// ── Dark map style (Google Maps) ──────────────────────────────────────────────
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

  // ── Map ──
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

  // ── My marker ──
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

  // ── Teammate markers ──
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

  // ── Bottom panel ──
  panel: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    marginTop: -18,
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },

  shareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  shareTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  shareSubtitle: { color: '#8892b0', fontSize: 12, marginTop: 2 },

  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginBottom: 16 },

  sectionTitle: { color: '#8892b0', fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: 12 },

  // ── Teammate rows ──
  noTeammates: { alignItems: 'center', paddingVertical: 24, gap: 10 },
  noTeammatesText: { color: '#4a5568', fontSize: 13, textAlign: 'center' },

  teammateList: { flex: 1 },
  teammateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 6,
    backgroundColor: 'rgba(255,255,255,0.04)',
    gap: 12,
  },
  teammateRowSelected: { backgroundColor: 'rgba(233,69,96,0.1)', borderWidth: 1, borderColor: 'rgba(233,69,96,0.3)' },
  tmAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tmAvatarText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  tmName:  { color: '#fff', fontSize: 14, fontWeight: '600' },
  tmTime:  { color: '#4a5568', fontSize: 11, marginTop: 1 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },

  // ── Loading / permission ──
  centered: { flex: 1, backgroundColor: '#0f3460', alignItems: 'center', justifyContent: 'center', padding: 32 },
  loadingText: { color: '#8892b0', marginTop: 12, fontSize: 14 },
  permTitle: { color: '#fff', fontSize: 20, fontWeight: '700', marginTop: 20, marginBottom: 8, textAlign: 'center' },
  permSubtitle: { color: '#8892b0', fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
