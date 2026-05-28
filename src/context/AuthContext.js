import React, { createContext, useState, useEffect } from 'react';
import { identifyDevice } from 'vexo-analytics';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut
} from 'firebase/auth';
import { ref, onValue, set, get } from 'firebase/database';
import { auth, database } from '../firebase/config';
import { stopLocationTracking } from '../services/LocationService';

export const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rideMode, setRideMode] = useState('group'); // 'group' or 'solo'

  useEffect(() => {
    let unsubscribeProfile = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (usr) => {
      setUser(usr);
      
      if (usr) {
        identifyDevice(usr.email);
        const profileRef = ref(database, `users/${usr.uid}`);
        
        try {
          const snapshot = await get(profileRef);
          if (!snapshot.exists()) {
            await set(profileRef, {
              uid: usr.uid,
              email: usr.email,
              groupId: null,
              createdAt: Date.now()
            });
          }
        } catch (err) {
          console.error("Error checking/creating user profile in database:", err);
        }

        unsubscribeProfile = onValue(profileRef, (snapshot) => {
          if (snapshot.exists()) {
            setUserProfile(snapshot.val());
          } else {
            setUserProfile(null);
          }
          setLoading(false);
        });
      } else {
        setUserProfile(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) unsubscribeProfile();
    };
  }, []);

  const login = async (email, password) => {
    return signInWithEmailAndPassword(auth, email, password);
  };

  const register = async (email, password) => {
    return createUserWithEmailAndPassword(auth, email, password);
  };

  const logout = async () => {
    await stopLocationTracking(); // Stop background tracking before logout
    return signOut(auth);
  };

  const createGroup = async (groupName) => {
    if (!user) throw new Error("User must be logged in to create a group");
    
    // Generate a 6-character uppercase alphanumeric code
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let groupCode = '';
    for (let i = 0; i < 6; i++) {
      groupCode += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    // Set group info
    const groupInfoRef = ref(database, `groups/${groupCode}/info`);
    await set(groupInfoRef, {
      id: groupCode,
      name: groupName,
      createdBy: user.uid,
      createdAt: Date.now()
    });

    // Add first member
    const memberRef = ref(database, `groups/${groupCode}/members/${user.uid}`);
    await set(memberRef, user.email);

    // Update user profile in RTDB
    const userProfileRef = ref(database, `users/${user.uid}/groupId`);
    await set(userProfileRef, groupCode);

    return groupCode;
  };

  const joinGroup = async (groupCode) => {
    if (!user) throw new Error("User must be logged in to join a group");
    const cleanedCode = groupCode.trim().toUpperCase();
    
    const groupInfoRef = ref(database, `groups/${cleanedCode}/info`);
    const snapshot = await get(groupInfoRef);
    if (!snapshot.exists()) {
      throw new Error("Group not found. Please check the code.");
    }

    // Add user as a member of the group with email
    const memberRef = ref(database, `groups/${cleanedCode}/members/${user.uid}`);
    await set(memberRef, user.email);

    // Update user profile in RTDB
    const userProfileRef = ref(database, `users/${user.uid}/groupId`);
    await set(userProfileRef, cleanedCode);

    return cleanedCode;
  };

  const leaveGroup = async () => {
    if (!user || !userProfile || !userProfile.groupId) return;

    const currentGroupId = userProfile.groupId;
    
    // Stop background location tracking
    await stopLocationTracking();
    
    // Remove user location first
    const locationRef = ref(database, `groups/${currentGroupId}/locations/${user.uid}`);
    await set(locationRef, null);

    // Remove user from group members list
    const memberRef = ref(database, `groups/${currentGroupId}/members/${user.uid}`);
    await set(memberRef, null);


    // Set user's group ID to null
    const userProfileRef = ref(database, `users/${user.uid}/groupId`);
    await set(userProfileRef, null);

    // Check if group is empty now
    const groupMembersRef = ref(database, `groups/${currentGroupId}/members`);
    const snapshot = await get(groupMembersRef);
    if (!snapshot.exists() || Object.keys(snapshot.val()).length === 0) {
      const groupRef = ref(database, `groups/${currentGroupId}`);
      await set(groupRef, null);
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      userProfile, 
      loading,
      rideMode,
      setRideMode,
      login, 
      register, 
      logout,
      createGroup,
      joinGroup,
      leaveGroup
    }}>
      {children}
    </AuthContext.Provider>
  );
};

