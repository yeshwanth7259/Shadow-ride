import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { ref, set } from 'firebase/database';
import { database } from '../firebase/config';
import AsyncStorage from '@react-native-async-storage/async-storage';

const LOCATION_TASK_NAME = 'background-location-task';
let currentMemberId = null;
let currentGroupId = null;
let currentUserEmail = null;

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error(error);
    return;
  }
  
  // Retrieve credentials and group details from AsyncStorage if the app was restarted in the background
  let memberId = currentMemberId;
  let groupId = currentGroupId;
  let userEmail = currentUserEmail;

  if (!memberId || !groupId) {
    try {
      memberId = await AsyncStorage.getItem('shadow_ride_member_id');
      groupId = await AsyncStorage.getItem('shadow_ride_group_id');
      userEmail = await AsyncStorage.getItem('shadow_ride_user_email');
    } catch (_e) {
      console.error("Failed to fetch tracking details from AsyncStorage");
    }
  }

  if (data && memberId) {
    const { locations } = data;
    const location = locations[0];
    
    if (location) {
      const locationRef = groupId
        ? ref(database, `groups/${groupId}/locations/${memberId}`)
        : ref(database, `users/${memberId}/location`);
      const speedKmh = location.coords.speed && location.coords.speed > 0 ? Math.round(location.coords.speed * 3.6) : 0;
      // Simulate battery level dynamically between 65% and 95%
      const simulatedBattery = Math.floor(80 + (Math.sin(Date.now() / 600000) * 15));
      try {
        await set(locationRef, {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          speed: speedKmh,
          battery: simulatedBattery,
          timestamp: Date.now(),
          email: userEmail || 'Unknown Rider'
        });
      } catch (err) {
        console.error("Firebase update error:", err);
      }
    }
  }
});

export const startLocationTracking = async (memberId, groupId, userEmail) => {
  const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
  if (foregroundStatus !== 'granted') {
    console.log('Permission to access foreground location was denied');
    return false;
  }

  const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
  if (backgroundStatus !== 'granted') {
    console.log('Permission to access background location was denied');
  }

  currentMemberId = memberId;
  currentGroupId = groupId;
  currentUserEmail = userEmail;

  await AsyncStorage.setItem('shadow_ride_member_id', memberId);
  if (groupId) {
    await AsyncStorage.setItem('shadow_ride_group_id', groupId);
  } else {
    await AsyncStorage.removeItem('shadow_ride_group_id');
  }
  if (userEmail) {
    await AsyncStorage.setItem('shadow_ride_user_email', userEmail);
  }

  await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
    accuracy: Location.Accuracy.High,
    distanceInterval: 10,
    timeInterval: 5000,
    foregroundService: {
      notificationTitle: 'Shadow Ride Tracking',
      notificationBody: 'Tracking your live location for the group.',
      notificationColor: '#e53935',
    },
  });
  
  return true;
};

export const stopLocationTracking = async () => {
  currentMemberId = null;
  currentGroupId = null;
  currentUserEmail = null;
  await AsyncStorage.removeItem('shadow_ride_member_id');
  await AsyncStorage.removeItem('shadow_ride_group_id');
  await AsyncStorage.removeItem('shadow_ride_user_email');
  
  const isRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
  if (isRegistered) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  }
};

export const isLocationTrackingActive = async () => {
  return TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
};


