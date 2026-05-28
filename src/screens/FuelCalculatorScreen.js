import React, { useEffect, useState, useContext } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { ref, onValue } from 'firebase/database';
import { database } from '../firebase/config';
import { AuthContext } from '../context/AuthContext';

export default function FuelCalculatorScreen() {
  const { user, userProfile } = useContext(AuthContext);

  const [groupMembers, setGroupMembers] = useState({});
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);

  // Calculator states
  const [distance, setDistance] = useState(420);
  const [mileage, setMileage] = useState(35);
  const [price, setPrice] = useState(102);

  const groupId = userProfile?.groupId;

  // Sync database state for calculations
  useEffect(() => {
    if (!groupId) {

      return;
    }

    // Fetch trips to find the active route distance
    const tripsRef = ref(database, `groups/${groupId}/trips`);
    const unsubscribeTrips = onValue(tripsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const tripsArray = Object.keys(data).map(key => ({ id: key, ...data[key] }));


        // Auto-set calculator distance to active trip distance
        const active = tripsArray.find(t => t.isActive);
        if (active && active.distance) {
          const distVal = parseInt(active.distance);
          if (!isNaN(distVal)) {
            setDistance(distVal);
          }
        }
      }
    });

    // Fetch members count
    const membersRef = ref(database, `groups/${groupId}/members`);
    const unsubscribeMembers = onValue(membersRef, (snapshot) => {
      if (snapshot.exists()) {
        setGroupMembers(snapshot.val());
      }
    });

    // Fetch expenses to get actual logged fuel cost
    const expensesRef = ref(database, `groups/${groupId}/expenses`);
    const unsubscribeExpenses = onValue(expensesRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const expList = Object.keys(data).map(key => data[key]);
        setExpenses(expList);
      }
      setLoading(false);
    });

    return () => {
      unsubscribeTrips();
      unsubscribeMembers();
      unsubscribeExpenses();
    };
  }, [groupId]);

  if (!groupId) {
    return (
      <View style={styles.container}>
        <View style={styles.warningOverlay}>
          <Text style={styles.warningTitle}>NO ACTIVE TEAM</Text>
          <Text style={styles.warningSubtitle}>
            Go to the &quot;Group HUD&quot; tab and join or create a team to access the Fuel Calculator.
          </Text>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#e53935" />
      </View>
    );
  }

  // Math Calculations
  const memberList = Object.entries(groupMembers);
  const memberCount = memberList.length || 1;

  const fuelNeeded = distance / mileage;
  const estimatedCost = fuelNeeded * price;
  const perPersonCost = estimatedCost / memberCount;

  // Actual logged Fuel costs from budget
  const actualFuelCost = expenses
    .filter(exp => exp.category?.toLowerCase() === 'fuel')
    .reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContainer}>
      
      {/* Steppers Card */}
      <View style={styles.card}>
        <Text style={styles.cardHeaderTitle}>TRIP PARAMETERS</Text>
        <Text style={styles.cardHeaderSubtitle}>Adjust sliders or tap buttons to calculate</Text>

        {/* Stepper: Distance */}
        <View style={styles.stepperContainer}>
          <View style={styles.stepperLabelRow}>
            <Text style={styles.stepperLabel}>Distance (KM)</Text>
            <Text style={styles.stepperValue}>{distance} km</Text>
          </View>
          <View style={styles.stepperControls}>
            <TouchableOpacity 
              style={styles.stepperBtn} 
              onPress={() => setDistance(prev => Math.max(10, prev - 50))}
            >
              <Text style={styles.stepperBtnText}>-50</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.stepperBtn} 
              onPress={() => setDistance(prev => Math.max(10, prev - 10))}
            >
              <Text style={styles.stepperBtnText}>-10</Text>
            </TouchableOpacity>
            <TextInput
              style={styles.stepperInput}
              keyboardType="numeric"
              value={String(distance)}
              onChangeText={val => {
                const parsed = parseInt(val);
                setDistance(isNaN(parsed) ? 0 : parsed);
              }}
            />
            <TouchableOpacity 
              style={styles.stepperBtn} 
              onPress={() => setDistance(prev => prev + 10)}
            >
              <Text style={styles.stepperBtnText}>+10</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.stepperBtn} 
              onPress={() => setDistance(prev => prev + 50)}
            >
              <Text style={styles.stepperBtnText}>+50</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Stepper: Mileage */}
        <View style={styles.stepperContainer}>
          <View style={styles.stepperLabelRow}>
            <Text style={styles.stepperLabel}>Average Mileage (KM/L)</Text>
            <Text style={styles.stepperValue}>{mileage} km/L</Text>
          </View>
          <View style={styles.stepperControls}>
            <TouchableOpacity 
              style={styles.stepperBtn} 
              onPress={() => setMileage(prev => Math.max(5, prev - 5))}
            >
              <Text style={styles.stepperBtnText}>-5</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.stepperBtn} 
              onPress={() => setMileage(prev => Math.max(5, prev - 1))}
            >
              <Text style={styles.stepperBtnText}>-1</Text>
            </TouchableOpacity>
            <TextInput
              style={styles.stepperInput}
              keyboardType="numeric"
              value={String(mileage)}
              onChangeText={val => {
                const parsed = parseInt(val);
                setMileage(isNaN(parsed) ? 0 : parsed);
              }}
            />
            <TouchableOpacity 
              style={styles.stepperBtn} 
              onPress={() => setMileage(prev => prev + 1)}
            >
              <Text style={styles.stepperBtnText}>+1</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.stepperBtn} 
              onPress={() => setMileage(prev => prev + 5)}
            >
              <Text style={styles.stepperBtnText}>+5</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Stepper: Fuel Price */}
        <View style={styles.stepperContainer}>
          <View style={styles.stepperLabelRow}>
            <Text style={styles.stepperLabel}>Fuel Price (₹/L)</Text>
            <Text style={styles.stepperValue}>₹{price}/L</Text>
          </View>
          <View style={styles.stepperControls}>
            <TouchableOpacity 
              style={styles.stepperBtn} 
              onPress={() => setPrice(prev => Math.max(50, prev - 5))}
            >
              <Text style={styles.stepperBtnText}>-5</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.stepperBtn} 
              onPress={() => setPrice(prev => Math.max(50, prev - 1))}
            >
              <Text style={styles.stepperBtnText}>-1</Text>
            </TouchableOpacity>
            <TextInput
              style={styles.stepperInput}
              keyboardType="numeric"
              value={String(price)}
              onChangeText={val => {
                const parsed = parseInt(val);
                setPrice(isNaN(parsed) ? 0 : parsed);
              }}
            />
            <TouchableOpacity 
              style={styles.stepperBtn} 
              onPress={() => setPrice(prev => prev + 1)}
            >
              <Text style={styles.stepperBtnText}>+1</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.stepperBtn} 
              onPress={() => setPrice(prev => prev + 5)}
            >
              <Text style={styles.stepperBtnText}>+5</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Calculations Summary Row */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statVal}>{fuelNeeded.toFixed(1)}L</Text>
          <Text style={styles.statLabel}>FUEL NEEDED</Text>
        </View>
        <View style={[styles.statCard, styles.accentBorder]}>
          <Text style={[styles.statVal, styles.accentText]}>₹{Math.round(estimatedCost).toLocaleString()}</Text>
          <Text style={styles.statLabel}>ESTIMATED COST</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statVal}>₹{Math.round(perPersonCost).toLocaleString()}</Text>
          <Text style={styles.statLabel}>PER PERSON</Text>
        </View>
      </View>

      {/* Bike Mileage Breakdown list */}
      <View style={styles.card}>
        <Text style={styles.cardHeaderTitle}>BIKE MILEAGE BREAKDOWN</Text>
        <Text style={styles.cardHeaderSubtitle}>Estimated individual fuel cost based on slightly varying bike mileages</Text>

        {memberList.map(([uid, email], index) => {
          // Simulate slight variations in bike mileage (e.g. 32, 35, 38)
          const milOffsets = [0, 3, -3, 1, -1];
          const riderMileage = mileage + milOffsets[index % milOffsets.length];
          const riderLiters = distance / riderMileage;
          const riderCost = Math.round(riderLiters * price);
          const emailAbbrev = email.split('@')[0];

          return (
            <View key={uid} style={styles.breakdownRow}>
              <View style={styles.avatarContainer}>
                <View style={styles.avatarBox}>
                  <Text style={styles.avatarLetter}>{email.charAt(0).toUpperCase()}</Text>
                </View>
                <Text style={styles.riderLabel}>{uid === user?.uid ? 'You' : emailAbbrev}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.riderCostText}>₹{riderCost}</Text>
                <Text style={styles.riderLitersText}>
                  {riderLiters.toFixed(1)}L @ {riderMileage} km/L
                </Text>
              </View>
            </View>
          );
        })}
      </View>

      {/* Actual vs Estimated Card */}
      <View style={styles.card}>
        <Text style={styles.cardHeaderTitle}>ESTIMATED VS LOGGED FUEL COST</Text>
        <Text style={styles.cardHeaderSubtitle}>Compare fuel predictions against logged expenses in your budget</Text>
        
        <View style={styles.comparisonItem}>
          <Text style={styles.comparisonLabel}>Estimated fuel cost</Text>
          <Text style={[styles.comparisonVal, { color: '#FFD166' }]}>₹{Math.round(estimatedCost)}</Text>
        </View>
        
        <View style={styles.comparisonItem}>
          <Text style={styles.comparisonLabel}>Actual logged fuel cost</Text>
          <Text style={[styles.comparisonVal, { color: '#22D37A' }]}>₹{actualFuelCost}</Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.comparisonSummary}>
          {actualFuelCost > estimatedCost ? (
            <Text style={styles.comparisonWarningText}>
              ⚠️ Budget Alert: You have spent ₹{Math.round(actualFuelCost - estimatedCost)} more than estimated!
            </Text>
          ) : (
            <Text style={styles.comparisonSuccessText}>
              ✓ Budget Status: You are currently ₹{Math.round(estimatedCost - actualFuelCost)} under the estimation limit.
            </Text>
          )}
        </View>
      </View>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111114',
  },
  scrollContainer: {
    padding: 16,
    paddingBottom: 32,
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  warningOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#111114',
    paddingHorizontal: 20,
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
  card: {
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  cardHeaderTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#fff',
    letterSpacing: 0.5,
  },
  cardHeaderSubtitle: {
    fontSize: 11,
    color: '#888',
    marginTop: 2,
    marginBottom: 16,
  },
  stepperContainer: {
    marginBottom: 16,
  },
  stepperLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  stepperLabel: {
    color: '#aaa',
    fontSize: 12,
  },
  stepperValue: {
    color: '#e53935',
    fontSize: 13,
    fontWeight: 'bold',
  },
  stepperControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepperBtn: {
    backgroundColor: '#2C2C2C',
    borderRadius: 6,
    paddingVertical: 8,
    width: 44,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#444',
  },
  stepperBtnText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  stepperInput: {
    flex: 1,
    backgroundColor: '#1E1E1E',
    color: '#fff',
    borderWidth: 1,
    borderColor: '#444',
    borderRadius: 6,
    textAlign: 'center',
    fontSize: 14,
    marginHorizontal: 8,
    paddingVertical: 4,
    fontWeight: 'bold',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  statCard: {
    backgroundColor: '#1E1E1E',
    borderRadius: 10,
    padding: 12,
    flex: 0.31,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2C2C2C',
  },
  accentBorder: {
    borderColor: '#e53935',
  },
  accentText: {
    color: '#e53935',
  },
  statVal: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
  },
  statLabel: {
    color: '#666',
    fontSize: 8,
    fontWeight: 'bold',
    marginTop: 4,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#2C2C2C',
  },
  avatarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarBox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#444',
  },
  avatarLetter: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  riderLabel: {
    color: '#ccc',
    fontSize: 13,
  },
  riderCostText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  riderLitersText: {
    color: '#555',
    fontSize: 10,
    marginTop: 2,
  },
  comparisonItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 4,
  },
  comparisonLabel: {
    color: '#aaa',
    fontSize: 13,
  },
  comparisonVal: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  divider: {
    height: 1,
    backgroundColor: '#2C2C2C',
    marginVertical: 12,
  },
  comparisonSummary: {
    marginTop: 4,
  },
  comparisonWarningText: {
    color: '#FFD166',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '550',
  },
  comparisonSuccessText: {
    color: '#22D37A',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '550',
  }
});
