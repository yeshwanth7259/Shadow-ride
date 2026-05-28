// src/navigation/DrawerContent.js
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
} from 'react-native';
import { DrawerContentScrollView } from '@react-navigation/drawer';
import { Ionicons } from '@expo/vector-icons';
import { getAuth, signOut } from 'firebase/auth';

const MENU_ITEMS = [
  { label: 'Dashboard',    icon: 'home-outline',        screen: 'Dashboard'     },
  { label: 'Trip Memories',icon: 'images-outline',      screen: 'TripMemories'  },
  { label: 'Live Location', icon: 'navigate-outline',   screen: 'LiveLocation'  },
];

export default function CustomDrawerContent(props) {
  const { navigation, state } = props;
  const auth = getAuth();
  const user = auth.currentUser;

  const activeRouteName = state.routeNames[state.index];

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (e) {
      console.error('Logout error:', e);
    }
  };

  return (
    <View style={styles.root}>
      {/* ── Profile Header ── */}
      <View style={styles.header}>
        <View style={styles.avatarWrap}>
          {user?.photoURL ? (
            <Image source={{ uri: user.photoURL }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarInitial}>
                {(user?.displayName || user?.email || 'U')[0].toUpperCase()}
              </Text>
            </View>
          )}
        </View>
        <Text style={styles.userName} numberOfLines={1}>
          {user?.displayName || 'Traveller'}
        </Text>
        <Text style={styles.userEmail} numberOfLines={1}>
          {user?.email || ''}
        </Text>
      </View>

      {/* ── Nav Items ── */}
      <DrawerContentScrollView
        {...props}
        contentContainerStyle={styles.scrollContent}
        scrollEnabled={false}
      >
        <Text style={styles.sectionLabel}>NAVIGATION</Text>
        {MENU_ITEMS.map((item) => {
          const isActive = activeRouteName === item.screen;
          return (
            <TouchableOpacity
              key={item.screen}
              style={[styles.menuItem, isActive && styles.menuItemActive]}
              onPress={() => navigation.navigate(item.screen)}
              activeOpacity={0.75}
            >
              <Ionicons
                name={item.icon}
                size={22}
                color={isActive ? '#e94560' : '#8892b0'}
              />
              <Text style={[styles.menuLabel, isActive && styles.menuLabelActive]}>
                {item.label}
              </Text>
              {isActive && <View style={styles.activeIndicator} />}
            </TouchableOpacity>
          );
        })}
      </DrawerContentScrollView>

      {/* ── Bottom Actions ── */}
      <View style={styles.footer}>
        <View style={styles.divider} />
        <TouchableOpacity style={styles.menuItem} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={22} color="#e94560" />
          <Text style={[styles.menuLabel, { color: '#e94560' }]}>Sign Out</Text>
        </TouchableOpacity>
        <Text style={styles.version}>TravelMate v1.0.0</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#16213e',
  },
  header: {
    paddingTop: 56,
    paddingBottom: 24,
    paddingHorizontal: 20,
    backgroundColor: '#0f3460',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  avatarWrap: { marginBottom: 12 },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: '#e94560',
  },
  avatarFallback: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#e94560',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { color: '#fff', fontSize: 28, fontWeight: '700' },
  userName: { color: '#fff', fontSize: 17, fontWeight: '700', marginBottom: 2 },
  userEmail: { color: '#8892b0', fontSize: 12 },

  scrollContent: { paddingTop: 16 },
  sectionLabel: {
    color: '#4a5568',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginLeft: 20,
    marginBottom: 8,
    marginTop: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 20,
    marginHorizontal: 8,
    borderRadius: 10,
    marginBottom: 2,
    position: 'relative',
  },
  menuItemActive: { backgroundColor: 'rgba(233,69,96,0.12)' },
  menuLabel: { color: '#8892b0', fontSize: 15, fontWeight: '600', marginLeft: 14, flex: 1 },
  menuLabelActive: { color: '#fff' },
  activeIndicator: {
    width: 4,
    height: 20,
    borderRadius: 2,
    backgroundColor: '#e94560',
    position: 'absolute',
    right: 0,
    top: '50%',
    marginTop: -10,
  },

  footer: { paddingBottom: 24, paddingHorizontal: 8 },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginBottom: 8 },
  version: { color: '#4a5568', fontSize: 11, textAlign: 'center', marginTop: 8 },
});
