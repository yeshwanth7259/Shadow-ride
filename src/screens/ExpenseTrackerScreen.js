import React, { useEffect, useState, useContext } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform, Modal, TextInput } from 'react-native';
import { ref, onValue } from 'firebase/database';
import { database } from '../firebase/config';
import { AuthContext } from '../context/AuthContext';
import { Ionicons } from '@expo/vector-icons';

export default function ExpenseTrackerScreen() {
  const { userProfile, user, rideMode } = useContext(AuthContext);
  const [expenses, setExpenses] = useState([]);
  
  const groupId = userProfile?.groupId;
  const basePath = rideMode === 'solo' ? `users/${user?.uid}` : `groups/${groupId}`;

  // Use a hardcoded budget for the mockup visualization
  const TOTAL_BUDGET = 2000;

  useEffect(() => {
    if (rideMode === 'group' && !groupId) return;
    if (rideMode === 'solo' && !user?.uid) return;

    const expensesRef = ref(database, `${basePath}/expenses`);
    const unsubscribe = onValue(expensesRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const expList = Object.keys(data).map(key => ({
          id: key,
          ...data[key]
        }));
        expList.sort((a, b) => b.timestamp - a.timestamp);
        setExpenses(expList);
      } else {
        setExpenses([]);
      }
    });

    return () => unsubscribe();
  }, [basePath, groupId, user, rideMode]);

  // Calculations
  const totalSpent = expenses.reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0) || 1240.80; // Mockup default
  const remaining = Math.max(0, TOTAL_BUDGET - totalSpent);
  const percentSpent = Math.min(100, (totalSpent / TOTAL_BUDGET) * 100);

  const catFuel = expenses.filter(e => e.category === 'Fuel').reduce((acc, curr) => acc + parseFloat(curr.amount), 0) || 312.50;
  const catFood = expenses.filter(e => e.category === 'Food').reduce((acc, curr) => acc + parseFloat(curr.amount), 0) || 228.30;
  const catLodging = expenses.filter(e => e.category === 'Lodging').reduce((acc, curr) => acc + parseFloat(curr.amount), 0) || 214.00;

  const maxCat = Math.max(catFuel, catFood, catLodging) || 1;

  if (rideMode === 'group' && !groupId) {
    return (
      <View style={styles.container}>
        <View style={styles.warningOverlay}>
          <Ionicons name="warning-outline" size={48} color="#00e5ff" />
          <Text style={styles.warningTitle}>NO ACTIVE TEAM</Text>
          <Text style={styles.warningSubtitle}>
            Go to the "Team" tab and join or create a team to manage trip expenses.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        
        {/* Budget Card */}
        <View style={styles.budgetCard}>
          <View style={styles.budgetHeader}>
            <View>
              <Text style={styles.budgetLabel}>CURRENT TRIP BUDGET</Text>
              <Text style={styles.budgetSpent}>€{totalSpent.toFixed(2)}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.remainingLabel}>REMAINING</Text>
              <Text style={styles.budgetRemaining}>€{remaining.toFixed(2)}</Text>
            </View>
          </View>
          
          <View style={styles.progressContainer}>
            <View style={[styles.progressBar, { width: `${percentSpent}%` }]} />
          </View>
          
          <View style={styles.budgetFooter}>
            <Text style={styles.budgetFooterText}>SPENT: €{totalSpent.toFixed(2)}</Text>
            <Text style={styles.budgetFooterText}>{percentSpent.toFixed(0)}% OF TOTAL</Text>
          </View>
        </View>

        {/* Expenses by Category */}
        <View style={styles.categoryCard}>
          <Text style={styles.sectionTitle}>Expenses by Category</Text>
          
          <View style={styles.catRow}>
            <View style={styles.catIconWrap}><Ionicons name="water" size={14} color="#00e5ff" /></View>
            <View style={styles.catContent}>
              <View style={styles.catHeader}>
                <Text style={styles.catName}>Fuel</Text>
                <Text style={styles.catAmount}>€{catFuel.toFixed(2)}</Text>
              </View>
              <View style={styles.catTrack}><View style={[styles.catFill, { width: `${(catFuel/maxCat)*100}%`, backgroundColor: '#00e5ff' }]} /></View>
            </View>
          </View>

          <View style={styles.catRow}>
            <View style={styles.catIconWrap}><Ionicons name="restaurant" size={14} color="#ffaa00" /></View>
            <View style={styles.catContent}>
              <View style={styles.catHeader}>
                <Text style={styles.catName}>Food</Text>
                <Text style={styles.catAmount}>€{catFood.toFixed(2)}</Text>
              </View>
              <View style={styles.catTrack}><View style={[styles.catFill, { width: `${(catFood/maxCat)*100}%`, backgroundColor: '#ffaa00' }]} /></View>
            </View>
          </View>

          <View style={styles.catRow}>
            <View style={styles.catIconWrap}><Ionicons name="bed" size={14} color="#ff3300" /></View>
            <View style={styles.catContent}>
              <View style={styles.catHeader}>
                <Text style={styles.catName}>Lodging</Text>
                <Text style={styles.catAmount}>€{catLodging.toFixed(2)}</Text>
              </View>
              <View style={styles.catTrack}><View style={[styles.catFill, { width: `${(catLodging/maxCat)*100}%`, backgroundColor: '#ff3300' }]} /></View>
            </View>
          </View>
        </View>

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          <View style={styles.statBox}>
            <Text style={styles.statBoxLabel}>AVG FUEL COST</Text>
            <Text style={styles.statBoxValue}>€1.42</Text>
            <Text style={styles.statBoxSub}>per Liter</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statBoxLabel}>TRIP DISTANCE</Text>
            <Text style={styles.statBoxValue}>1,482</Text>
            <Text style={styles.statBoxSub}>Kilometers</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statBoxLabel}>AVG CONSUMPTION</Text>
            <Text style={styles.statBoxValue}>5.4</Text>
            <Text style={styles.statBoxSub}>L/100km</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statBoxLabel}>REFILL SOON</Text>
            <Text style={[styles.statBoxValue, { color: '#ff3300' }]}>~45km range</Text>
            <Text style={styles.statBoxSub}> </Text>
          </View>
        </View>

        {/* Fuel Log */}
        <View style={styles.fuelLogCard}>
          <View style={styles.fuelLogHeader}>
            <Text style={styles.sectionTitle}>Fuel Log</Text>
            <TouchableOpacity style={styles.addEntryBtn}>
              <Ionicons name="add" size={12} color="#0b131e" />
              <Text style={styles.addEntryBtnText}>ADD ENTRY</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.tableHeader}>
            <Text style={[styles.tableCol, styles.colDate]}>DATE</Text>
            <Text style={[styles.tableCol, styles.colVol]}>VOLUME</Text>
            <Text style={[styles.tableCol, styles.colCost]}>COST</Text>
            <Text style={[styles.tableCol, styles.colAction]}>ACTION</Text>
          </View>

          {/* Mockup Data Rows */}
          <View style={styles.tableRow}>
            <View style={styles.colDate}><Text style={styles.rowTextMain}>Oct</Text><Text style={styles.rowTextSub}>24, 2023</Text></View>
            <View style={styles.colVol}><Text style={styles.rowTextMain}>18.4</Text><Text style={styles.rowTextSub}>L</Text></View>
            <View style={styles.colCost}><Text style={styles.rowTextMain}>€26.12</Text></View>
            <View style={styles.colAction}><Ionicons name="ellipsis-vertical" size={16} color="#8892b0" /></View>
          </View>
          
          <View style={styles.tableRow}>
            <View style={styles.colDate}><Text style={styles.rowTextMain}>Oct</Text><Text style={styles.rowTextSub}>22, 2023</Text></View>
            <View style={styles.colVol}><Text style={styles.rowTextMain}>15.2</Text><Text style={styles.rowTextSub}>L</Text></View>
            <View style={styles.colCost}><Text style={styles.rowTextMain}>€21.58</Text></View>
            <View style={styles.colAction}><Ionicons name="ellipsis-vertical" size={16} color="#8892b0" /></View>
          </View>

          <View style={styles.tableRow}>
            <View style={styles.colDate}><Text style={styles.rowTextMain}>Oct</Text><Text style={styles.rowTextSub}>20, 2023</Text></View>
            <View style={styles.colVol}><Text style={styles.rowTextMain}>19.1</Text><Text style={styles.rowTextSub}>L</Text></View>
            <View style={styles.colCost}><Text style={styles.rowTextMain}>€27.12</Text></View>
            <View style={styles.colAction}><Ionicons name="ellipsis-vertical" size={16} color="#8892b0" /></View>
          </View>

        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b131e' },
  scrollContainer: { padding: 16, paddingBottom: 40 },
  warningOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  warningTitle: { color: '#fff', fontSize: 20, fontWeight: '900', letterSpacing: 2, marginTop: 16, marginBottom: 8 },
  warningSubtitle: { color: '#8892b0', textAlign: 'center', fontSize: 14, lineHeight: 22 },
  
  // Budget Card
  budgetCard: {
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)'
  },
  budgetHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  budgetLabel: { color: '#00e5ff', fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 4 },
  budgetSpent: { color: '#fff', fontSize: 24, fontWeight: '900', letterSpacing: 0.5 },
  remainingLabel: { color: '#ff3300', fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 4 },
  budgetRemaining: { color: '#fff', fontSize: 16, fontWeight: '800' },
  progressContainer: { height: 6, backgroundColor: 'rgba(0, 229, 255, 0.1)', borderRadius: 3, marginBottom: 12 },
  progressBar: { height: '100%', backgroundColor: '#00e5ff', borderRadius: 3 },
  budgetFooter: { flexDirection: 'row', justifyContent: 'space-between' },
  budgetFooterText: { color: '#8892b0', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  
  // Category Card
  categoryCard: {
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)'
  },
  sectionTitle: { color: '#fff', fontSize: 14, fontWeight: '800', marginBottom: 16 },
  catRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  catIconWrap: { width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.05)', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  catContent: { flex: 1 },
  catHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  catName: { color: '#fff', fontSize: 13, fontWeight: '700' },
  catAmount: { color: '#fff', fontSize: 13, fontWeight: '800' },
  catTrack: { height: 4, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 2 },
  catFill: { height: '100%', borderRadius: 2 },

  // Stats Grid
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 16 },
  statBox: {
    width: '48%',
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)'
  },
  statBoxLabel: { color: '#8892b0', fontSize: 9, fontWeight: '800', letterSpacing: 0.5, marginBottom: 8 },
  statBoxValue: { color: '#fff', fontSize: 20, fontWeight: '900', marginBottom: 2 },
  statBoxSub: { color: '#8892b0', fontSize: 10, fontWeight: '600' },

  // Fuel Log
  fuelLogCard: {
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)'
  },
  fuelLogHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  addEntryBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#00e5ff', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 6 },
  addEntryBtnText: { color: '#0b131e', fontSize: 9, fontWeight: '900', letterSpacing: 0.5, marginLeft: 4 },
  
  tableHeader: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)', paddingBottom: 12, marginBottom: 12 },
  tableCol: { color: '#8892b0', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  
  colDate: { flex: 2 },
  colVol: { flex: 1.5 },
  colCost: { flex: 1.5 },
  colAction: { width: 40, alignItems: 'center' },

  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  rowTextMain: { color: '#fff', fontSize: 13, fontWeight: '700' },
  rowTextSub: { color: '#8892b0', fontSize: 10, marginTop: 2 },
});
