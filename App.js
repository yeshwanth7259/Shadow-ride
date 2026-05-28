import 'react-native-gesture-handler';
import { vexo } from 'vexo-analytics';
vexo('518dcd32-58f9-419b-a779-34914f758c90');

import React, { useContext } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import './src/services/LocationService'; // REQUIRED: Global TaskManager registration for background tracking
import { AuthProvider, AuthContext } from './src/context/AuthContext';
import LoginScreen from './src/screens/LoginScreen';
import TripMemoriesScreen from './src/screens/TripMemoriesScreen';
import LiveLocationScreen from './src/screens/LiveLocationScreen';
import GroupStatusScreen from './src/screens/GroupStatusScreen';
import TripPlannerScreen from './src/screens/TripPlannerScreen';
import ExpenseTrackerScreen from './src/screens/ExpenseTrackerScreen';
import CustomDrawerContent from './src/navigation/DrawerContent';

// No placeholders needed anymore

const Drawer = createDrawerNavigator();
const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

import { Image } from 'react-native';

function HeaderLogo() {
  return (
    <View style={styles.logoRow}>
      <Image source={require('./assets/logo.png')} style={{ width: 140, height: 40 }} resizeMode="contain" />
    </View>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: '#00e5ff', // Cyan
        tabBarInactiveTintColor: '#4a5568',
        tabBarLabelStyle: styles.tabLabel,
        tabBarIcon: ({ focused, color, size }) => {
          const icons = {
            Radar:    focused ? 'navigate' : 'navigate-outline',
            Team:     focused ? 'people'   : 'people-outline',
            Planner:  focused ? 'map'      : 'map-outline',
            Wallet:   focused ? 'wallet'   : 'wallet-outline',
          };
          return <Ionicons name={icons[route.name]} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Radar"   component={LiveLocationScreen} />
      <Tab.Screen name="Team"    component={GroupStatusScreen} />
      <Tab.Screen name="Planner" component={TripPlannerScreen} />
      <Tab.Screen name="Wallet"  component={ExpenseTrackerScreen} />
    </Tab.Navigator>
  );
}

function MainStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MainTabs" component={MainTabs} />
    </Stack.Navigator>
  );
}

function drawerScreenOptions(navigation) {
  return {
    headerStyle:      { backgroundColor: '#0b131e', elevation: 0, shadowOpacity: 0 },
    headerTintColor:  '#00e5ff',
    headerTitleAlign: 'center',
    headerTitle:      () => <HeaderLogo />,
    headerLeft:       () => (
      <TouchableOpacity
        onPress={() => navigation.toggleDrawer()}
        style={styles.menuBtn}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons name="menu" size={26} color="#fff" />
      </TouchableOpacity>
    ),
  };
}

function DrawerNavigator() {
  return (
    <Drawer.Navigator
      drawerContent={(props) => <CustomDrawerContent {...props} />}
      screenOptions={({ navigation }) => ({
        ...drawerScreenOptions(navigation),
        drawerStyle:  { backgroundColor: '#0b131e', width: 280 },
        drawerType:   'slide',
        overlayColor: 'rgba(0,0,0,0.6)',
        swipeEdgeWidth: 60,
      })}
    >
      <Drawer.Screen
        name="Dashboard"
        component={MainStack}
        options={{ title: 'TravelMate' }}
      />
      <Drawer.Screen
        name="TripMemories"
        component={TripMemoriesScreen}
        options={{ title: 'Trip Memories' }}
      />
      <Drawer.Screen
        name="LiveLocation"
        component={LiveLocationScreen}
        options={{ title: 'Live Location' }}
      />
    </Drawer.Navigator>
  );
}

function Navigation() {
  const { user, loading } = useContext(AuthContext);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0b131e' }}>
        <ActivityIndicator size="large" color="#00e5ff" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {user ? (
            <Stack.Screen name="Root" component={DrawerNavigator} />
          ) : (
            <Stack.Screen name="Login" component={LoginScreen} />
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Navigation />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoText: {
    color: '#fff',
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  menuBtn: {
    marginLeft: 16,
    padding: 4,
  },
  tabBar: {
    backgroundColor: '#0b131e',
    borderTopColor: 'rgba(255,255,255,0.05)',
    borderTopWidth: 1,
    height: Platform.OS === 'ios' ? 80 : 65,
    paddingBottom: Platform.OS === 'ios' ? 20 : 10,
    paddingTop: 8,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: -2,
  },
});
