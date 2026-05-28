import React, { useEffect, useState, useContext } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, ScrollView, Clipboard } from 'react-native';
import { ref, onValue } from 'firebase/database';
import { database } from '../firebase/config';
import { AuthContext } from '../context/AuthContext';
import { Ionicons } from '@expo/vector-icons';

// Haversine formula to calculate distance
const getDistanceInKm = (lat1, lon1, lat2, lon2) => {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
  const R = 6371; 
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return (R * c).toFixed(1); // 1 decimal point like mockup
};

export default function GroupStatusScreen({ navigation }) {
  const { user, userProfile, logout, createGroup, joinGroup, leaveGroup, rideMode, setRideMode } = useContext(AuthContext);
  const [riders, setRiders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [groupNameInput, setGroupNameInput] = useState('');
  const [groupCodeInput, setGroupCodeInput] = useState('');
  const [groupDetails, setGroupDetails] = useState(null);

  // Fetch group details and riders if user is in a group
  useEffect(() => {
    if (!userProfile || !userProfile.groupId) {
      return;
    }

    const groupCode = userProfile.groupId;
    
    // Fetch group details
    const groupInfoRef = ref(database, `groups/${groupCode}/info`);
    const unsubscribeGroupInfo = onValue(groupInfoRef, (snapshot) => {
      if (snapshot.exists()) {
        setGroupDetails(snapshot.val());
      }
    });

    // Fetch live locations of members
    const groupLocationsRef = ref(database, `groups/${groupCode}/locations`);
    const unsubscribeLocations = onValue(groupLocationsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        
        let myLocation = data[user?.uid] || null;

        const riderList = Object.keys(data).map(key => {
          const rider = data[key];
          let distance = '0.0';
          if (myLocation && key !== user?.uid) {
            distance = getDistanceInKm(myLocation.latitude, myLocation.longitude, rider.latitude, rider.longitude);
          }
          const isStale = (Date.now() - (rider.updatedAt || rider.timestamp || Date.now())) > 5 * 60 * 1000; // 5 mins

          return {
            id: key,
            isMe: key === user?.uid,
            distance: distance,
            isStale: isStale,
            name: rider.name || rider.email?.split('@')[0] || `Rider ${key.substring(0,4)}`,
            speed: rider.speed ? Math.round(rider.speed * 3.6) : 0, // convert m/s to km/h
            ...rider
          };
        });
        
        // Sort: Me first, then closest
        riderList.sort((a, b) => {
          if (a.isMe) return -1;
          if (b.isMe) return 1;
          return parseFloat(a.distance) - parseFloat(b.distance);
        });

        setRiders(riderList);
      } else {
        setRiders([]);
      }
    });

    return () => {
      unsubscribeGroupInfo();
      unsubscribeLocations();
    };
  }, [user, userProfile]);

  const handleCreateGroup = async () => {
    if (!groupNameInput.trim()) {
      Alert.alert("Error", "Please enter a team name");
      return;
    }
    setLoading(true);
    try {
      const code = await createGroup(groupNameInput.trim());
      Alert.alert("Success", `Team "${groupNameInput.trim()}" created!\n\nShare code: ${code}`);
      setGroupNameInput('');
    } catch (error) {
      Alert.alert("Creation Failed", error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinGroup = async () => {
    if (!groupCodeInput.trim()) {
      Alert.alert("Error", "Please enter an invite code");
      return;
    }
    setLoading(true);
    try {
      await joinGroup(groupCodeInput.trim());
      Alert.alert("Success", `Joined team successfully!`);
      setGroupCodeInput('');
    } catch (error) {
      Alert.alert("Join Failed", error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLeaveGroup = () => {
    Alert.alert(
      "Leave Team",
      "Are you sure you want to leave this team? You will stop sharing your location.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Leave", style: "destructive", onPress: () => leaveGroup() }
      ]
    );
  };

  const copyToClipboard = () => {
    Clipboard.setString(userProfile.groupId);
    Alert.alert("Copied", "Join code copied to clipboard!");
  };

  const renderRiderItem = ({ item }) => (
    <View style={styles.riderRow}>
      <View style={styles.riderAvatar}>
        <Ionicons name="person" size={20} color="#00e5ff" />
      </View>
      <View style={styles.riderInfo}>
        <Text style={styles.riderName}>{item.isMe ? "You" : item.name}</Text>
        <Text style={styles.riderStatus}>
          {item.isStale ? "● OFFLINE" : (item.speed > 0 ? `● MOVING - ${item.speed} KM/H` : "● STOPPED")}
        </Text>
      </View>
      {!item.isMe && (
        <View style={styles.riderDistanceWrap}>
          <Text style={styles.riderDistanceValue}>{item.distance} KM</Text>
          <Text style={styles.riderDistanceLabel}>AWAY</Text>
        </View>
      )}
    </View>
  );

  // VIEW: User is not in a group
  if (!userProfile?.groupId) {
    return (
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        style={styles.container}
      >
        <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
          
          {/* Mode Toggle */}
          <View style={styles.modeToggleContainer}>
            <TouchableOpacity 
              style={[styles.modeToggleButton, rideMode === 'solo' && styles.modeToggleButtonActive]}
              onPress={() => setRideMode('solo')}
            >
              <Text style={[styles.modeToggleText, rideMode === 'solo' && styles.modeToggleTextActive]}>SOLO RIDE</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.modeToggleButton, rideMode === 'group' && styles.modeToggleButtonActive]}
              onPress={() => setRideMode('group')}
            >
              <Text style={[styles.modeToggleText, rideMode === 'group' && styles.modeToggleTextActive]}>GROUP RIDE</Text>
            </TouchableOpacity>
          </View>
          
          {rideMode === 'solo' ? (
            <View style={styles.soloDashboardContainer}>
               <Ionicons name="bicycle" size={48} color="#00e5ff" />
               <Text style={styles.soloTitle}>SOLO RIDE ACTIVE</Text>
               <Text style={styles.soloSubtitle}>You are currently planning and tracking your solo adventure. Head over to Planner to set your stops and Radar to view your route.</Text>
            </View>
          ) : (
            <>
          <View style={styles.actionCard}>
            <Text style={styles.cardTitle}>CREATE A TEAM</Text>
            <Text style={styles.cardSubtitle}>Start a new group and invite your friends</Text>
            <TextInput
              style={styles.input}
              placeholder="Team Name (e.g. Mountain Devils)"
              placeholderTextColor="#4a5568"
              value={groupNameInput}
              onChangeText={setGroupNameInput}
            />
            <TouchableOpacity style={styles.button} onPress={handleCreateGroup} disabled={loading}>
              <Text style={styles.buttonText}>CREATE TEAM</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.actionCard}>
            <Text style={styles.cardTitle}>JOIN A TEAM</Text>
            <Text style={styles.cardSubtitle}>Enter code provided by your teammate</Text>
            <TextInput
              style={[styles.input, styles.codeInput]}
              placeholder="6-CHAR CODE"
              placeholderTextColor="#4a5568"
              autoCapitalize="characters"
              value={groupCodeInput}
              onChangeText={setGroupCodeInput}
              maxLength={6}
            />
            <TouchableOpacity style={[styles.button, styles.joinButton]} onPress={handleJoinGroup} disabled={loading}>
              <Text style={styles.buttonText}>JOIN TEAM</Text>
            </TouchableOpacity>
          </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // VIEW: User is in a group (Death Riders mockup style)
  return (
    <View style={styles.container}>
      <View style={styles.teamCard}>
        {/* Header */}
        <View style={styles.teamCardHeader}>
          <Text style={styles.activeTeamLabel}>ACTIVE TEAM</Text>
          <Text style={styles.activeTeamName}>{groupDetails?.name || 'Loading...'}</Text>
        </View>

        {/* Join Code */}
        <View style={styles.joinCodeContainer}>
          <Text style={styles.joinCodeLabel}>JOIN CODE</Text>
          <Text style={styles.joinCodeText}>{userProfile.groupId}</Text>
        </View>
        <TouchableOpacity style={styles.copyLinkBtn} onPress={copyToClipboard}>
          <Ionicons name="copy-outline" size={16} color="#00e5ff" />
          <Text style={styles.copyLinkText}>COPY INVITE LINK</Text>
        </TouchableOpacity>

        {/* Roster Header */}
        <View style={styles.rosterHeader}>
          <Text style={styles.rosterLabel}>GROUP ROSTER ({riders.length}/8)</Text>
          <Text style={styles.liveSyncLabel}>LIVE SYNC</Text>
        </View>

        {/* Roster List */}
        <FlatList
          data={riders}
          keyExtractor={(item) => item.id}
          renderItem={renderRiderItem}
          style={styles.rosterList}
          showsVerticalScrollIndicator={false}
        />

        {/* Action Buttons */}
        <TouchableOpacity 
          style={styles.liveMapBtn} 
          onPress={() => navigation.navigate('Radar')}
        >
          <Ionicons name="map-outline" size={18} color="#0b131e" />
          <Text style={styles.liveMapBtnText}>VIEW LIVE MAP</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.leaveTeamBtn} onPress={handleLeaveGroup}>
          <Ionicons name="exit-outline" size={18} color="#ff3300" />
          <Text style={styles.leaveTeamBtnText}>LEAVE TEAM</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b131e',
    padding: 16,
  },
  scrollContainer: {
    paddingBottom: 32,
    paddingTop: 16,
  },
  // Mode Toggle
  modeToggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#16213e',
    borderRadius: 8,
    padding: 4,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  modeToggleButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 6,
  },
  modeToggleButtonActive: {
    backgroundColor: '#00e5ff',
  },
  modeToggleText: {
    color: '#8892b0',
    fontSize: 13,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  modeToggleTextActive: {
    color: '#0b131e',
  },
  // Solo Dashboard
  soloDashboardContainer: {
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    marginTop: 20,
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.2)',
  },
  soloTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 1,
    marginTop: 16,
    marginBottom: 12,
  },
  soloSubtitle: {
    color: '#8892b0',
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 22,
  },
  // Action Cards (No group)
  actionCard: {
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 1,
  },
  cardSubtitle: {
    fontSize: 12,
    color: '#8892b0',
    marginTop: 4,
    marginBottom: 16,
  },
  input: {
    backgroundColor: '#0b131e',
    color: '#fff',
    padding: 14,
    borderRadius: 8,
    fontSize: 15,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginBottom: 14,
  },
  codeInput: {
    textAlign: 'center',
    fontSize: 20,
    fontWeight: 'bold',
    letterSpacing: 4,
  },
  button: {
    backgroundColor: '#00e5ff',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  joinButton: {
    backgroundColor: '#ff3300',
  },
  buttonText: {
    color: '#0b131e',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1,
  },
  
  // Team Card (Group active)
  teamCard: {
    backgroundColor: '#16213e',
    borderRadius: 12,
    flex: 1,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  teamCardHeader: {
    marginBottom: 20,
  },
  activeTeamLabel: {
    color: '#00e5ff',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 4,
  },
  activeTeamName: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  joinCodeContainer: {
    marginBottom: 12,
  },
  joinCodeLabel: {
    color: '#8892b0',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 4,
  },
  joinCodeText: {
    color: '#00e5ff',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 2,
  },
  copyLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 30,
  },
  copyLinkText: {
    color: '#8892b0',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginLeft: 6,
  },
  rosterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  rosterLabel: {
    color: '#8892b0',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  liveSyncLabel: {
    color: '#00e5ff',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  rosterList: {
    flex: 1,
    marginBottom: 16,
  },
  riderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(11,19,30,0.5)',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.02)',
  },
  riderAvatar: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: 'rgba(0, 229, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  riderInfo: {
    flex: 1,
  },
  riderName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 2,
  },
  riderStatus: {
    color: '#8892b0',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  riderDistanceWrap: {
    alignItems: 'flex-end',
  },
  riderDistanceValue: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
  riderDistanceLabel: {
    color: '#8892b0',
    fontSize: 9,
    fontWeight: '700',
  },
  liveMapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00e5ff',
    paddingVertical: 14,
    borderRadius: 8,
    marginBottom: 12,
  },
  liveMapBtnText: {
    color: '#0b131e',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1,
    marginLeft: 8,
  },
  leaveTeamBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ff3300',
  },
  leaveTeamBtnText: {
    color: '#ff3300',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1,
    marginLeft: 8,
  },
});
