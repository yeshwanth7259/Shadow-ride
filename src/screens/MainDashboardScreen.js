import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MaterialIcons } from '@expo/vector-icons';

import MapTrackingScreen from './MapTrackingScreen';
import GroupStatusScreen from './GroupStatusScreen';
import TripPlannerScreen from './TripPlannerScreen';
import ExpenseTrackerScreen from './ExpenseTrackerScreen';
import FuelCalculatorScreen from './FuelCalculatorScreen';

const Tab = createBottomTabNavigator();

export default function MainDashboardScreen() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;

          if (route.name === 'Live Radar') {
            iconName = 'radar';
          } else if (route.name === 'Group HUD') {
            iconName = 'group';
          } else if (route.name === 'Planner') {
            iconName = 'map';
          } else if (route.name === 'Budget') {
            iconName = 'payments';
          } else if (route.name === 'Fuel') {
            iconName = 'local-gas-station';
          }

          return <MaterialIcons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#e53935',
        tabBarInactiveTintColor: 'gray',
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#111114',
          borderTopColor: '#333',
        }
      })}
    >
      <Tab.Screen name="Live Radar" component={MapTrackingScreen} />
      <Tab.Screen name="Group HUD" component={GroupStatusScreen} />
      <Tab.Screen name="Planner" component={TripPlannerScreen} />
      <Tab.Screen name="Budget" component={ExpenseTrackerScreen} />
      <Tab.Screen name="Fuel" component={FuelCalculatorScreen} />
    </Tab.Navigator>
  );
}


