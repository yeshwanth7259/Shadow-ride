// src/screens/TripMemoriesScreen.js
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Dimensions,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { ref as dbRef, push, onValue, off, serverTimestamp } from 'firebase/database';
import { getAuth } from 'firebase/auth';
import { db } from '../firebase/config';
import { uploadImageToStorage } from '../utils/uploadImage';

const { width: SCREEN_W } = Dimensions.get('window');
const COLUMN_COUNT = 3;
const GAP = 3;
const CELL_SIZE = (SCREEN_W - GAP * (COLUMN_COUNT + 1)) / COLUMN_COUNT;

// ─────────────────────────────────────────────────────────────────────────────
//  CHANGE THIS to your real group ID, or pass it as a route param:
//  const { groupId } = route.params;
const DEFAULT_GROUP_ID = 'group_001';
// ─────────────────────────────────────────────────────────────────────────────

export default function TripMemoriesScreen({ route }) {
  const groupId = route?.params?.groupId || DEFAULT_GROUP_ID;
  const auth = getAuth();
  const user = auth.currentUser;

  const [memories, setMemories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [captionModal, setCaptionModal] = useState(false);
  const [pendingUri, setPendingUri] = useState(null);
  const [caption, setCaption] = useState('');
  const [selectedMemory, setSelectedMemory] = useState(null); // for fullscreen
  const [refreshing, setRefreshing] = useState(false);

  // ── Fetch memories from Firebase ─────────────────────────────────────────
  useEffect(() => {
    const memoriesRef = dbRef(db, `groups/${groupId}/memories`);

    const listener = onValue(memoriesRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const list = Object.entries(data)
          .map(([id, item]) => ({ id, ...item }))
          .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        setMemories(list);
      } else {
        setMemories([]);
      }
      setLoading(false);
      setRefreshing(false);
    });

    return () => off(memoriesRef, 'value', listener);
  }, [groupId]);

  // ── Pick image from gallery ───────────────────────────────────────────────
  const pickImage = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission Required',
        'Please allow access to your photo library in Settings to upload memories.'
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
      allowsMultipleSelection: false,
    });

    if (!result.canceled && result.assets?.length > 0) {
      setPendingUri(result.assets[0].uri);
      setCaption('');
      setCaptionModal(true);
    }
  }, []);

  // ── Upload image & save metadata ──────────────────────────────────────────
  const handleUpload = useCallback(async () => {
    if (!pendingUri || !user) return;
    setCaptionModal(false);
    setUploading(true);
    setUploadProgress(0);

    try {
      // 1. Upload to Firebase Storage
      const downloadURL = await uploadImageToStorage(
        pendingUri,
        groupId,
        (progress) => setUploadProgress(progress)
      );

      // 2. Save metadata to Realtime Database
      const memoriesRef = dbRef(db, `groups/${groupId}/memories`);
      await push(memoriesRef, {
        url: downloadURL,
        caption: caption.trim(),
        uploaderName: user.displayName || user.email?.split('@')[0] || 'Traveller',
        uploaderUid: user.uid,
        createdAt: serverTimestamp(),
      });

      Alert.alert('✓ Uploaded', 'Your memory has been added!');
    } catch (error) {
      console.error('Upload error:', error);
      Alert.alert('Upload Failed', error.message || 'Please check your connection and try again.');
    } finally {
      setUploading(false);
      setPendingUri(null);
      setCaption('');
      setUploadProgress(0);
    }
  }, [pendingUri, caption, groupId, user]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    // onValue listener auto-refreshes; just reset flag after short delay
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  // ── Render each photo cell ────────────────────────────────────────────────
  const renderCell = useCallback(({ item, index }) => {
    const isFirst = index === 0;
    return (
      <TouchableOpacity
        style={[styles.cell, isFirst && styles.cellLarge]}
        onPress={() => setSelectedMemory(item)}
        activeOpacity={0.85}
      >
        <Image
          source={{ uri: item.url }}
          style={[styles.cellImage, isFirst && styles.cellImageLarge]}
          resizeMode="cover"
        />
        <View style={styles.cellOverlay}>
          <Text style={styles.cellUploader} numberOfLines={1}>
            by {item.uploaderName}
          </Text>
          {item.caption ? (
            <Text style={styles.cellCaption} numberOfLines={1}>
              {item.caption}
            </Text>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  }, []);

  // ── Header component (above grid) ────────────────────────────────────────
  const ListHeader = () => (
    <View style={styles.listHeader}>
      <Text style={styles.listHeaderTitle}>
        {memories.length} {memories.length === 1 ? 'Memory' : 'Memories'}
      </Text>
    </View>
  );

  const EmptyState = () => (
    <View style={styles.empty}>
      <Ionicons name="images-outline" size={72} color="#4a5568" />
      <Text style={styles.emptyTitle}>No Memories Yet</Text>
      <Text style={styles.emptySubtitle}>
        Tap the + button to add your first trip photo!
      </Text>
    </View>
  );

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      {/* ── Photo Grid ── */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#e94560" />
          <Text style={styles.loadingText}>Loading memories…</Text>
        </View>
      ) : (
        <FlatList
          data={memories}
          keyExtractor={(item) => item.id}
          renderItem={renderCell}
          numColumns={COLUMN_COUNT}
          contentContainerStyle={styles.grid}
          ListHeaderComponent={memories.length > 0 ? <ListHeader /> : null}
          ListEmptyComponent={<EmptyState />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#e94560"
            />
          }
          columnWrapperStyle={styles.row}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* ── Upload Progress Overlay ── */}
      {uploading && (
        <View style={styles.uploadOverlay}>
          <View style={styles.uploadCard}>
            <ActivityIndicator size="large" color="#e94560" style={{ marginBottom: 14 }} />
            <Text style={styles.uploadLabel}>Uploading… {uploadProgress}%</Text>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${uploadProgress}%` }]} />
            </View>
          </View>
        </View>
      )}

      {/* ── FAB ── */}
      {!uploading && (
        <TouchableOpacity style={styles.fab} onPress={pickImage} activeOpacity={0.85}>
          <Ionicons name="add" size={30} color="#fff" />
        </TouchableOpacity>
      )}

      {/* ── Caption Modal ── */}
      <Modal
        visible={captionModal}
        animationType="slide"
        transparent
        onRequestClose={() => setCaptionModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalBackdrop}
        >
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Add a Caption</Text>
            {pendingUri && (
              <Image
                source={{ uri: pendingUri }}
                style={styles.previewImage}
                resizeMode="cover"
              />
            )}
            <TextInput
              style={styles.captionInput}
              placeholder="Write a caption… (optional)"
              placeholderTextColor="#4a5568"
              value={caption}
              onChangeText={setCaption}
              maxLength={120}
              multiline
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => { setCaptionModal(false); setPendingUri(null); }}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.uploadBtn} onPress={handleUpload}>
                <Ionicons name="cloud-upload-outline" size={18} color="#fff" />
                <Text style={styles.uploadBtnText}>Upload</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Fullscreen Image Viewer ── */}
      <Modal
        visible={!!selectedMemory}
        animationType="fade"
        transparent
        onRequestClose={() => setSelectedMemory(null)}
      >
        <View style={styles.fullscreenBg}>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={() => setSelectedMemory(null)}
          >
            <Ionicons name="close-circle" size={36} color="#fff" />
          </TouchableOpacity>
          {selectedMemory && (
            <>
              <Image
                source={{ uri: selectedMemory.url }}
                style={styles.fullscreenImage}
                resizeMode="contain"
              />
              <View style={styles.fullscreenMeta}>
                <Text style={styles.fullscreenUploader}>
                  📸 by {selectedMemory.uploaderName}
                </Text>
                {selectedMemory.caption ? (
                  <Text style={styles.fullscreenCaption}>{selectedMemory.caption}</Text>
                ) : null}
              </View>
            </>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0f3460' },

  // ── Grid ──
  grid: { padding: GAP, paddingBottom: 100 },
  row:  { gap: GAP, marginBottom: GAP },
  cell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#16213e',
  },
  cellLarge: {
    // First photo spans full width for a featured look
    width: SCREEN_W - GAP * 2,
    height: SCREEN_W * 0.6,
  },
  cellImage: { width: '100%', height: '100%' },
  cellImageLarge: { width: '100%', height: '100%' },
  cellOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 6,
    paddingVertical: 5,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  cellUploader: { color: '#fff', fontSize: 10, fontWeight: '700' },
  cellCaption:  { color: '#ccc', fontSize: 9, marginTop: 1 },

  // ── Header ──
  listHeader: { marginBottom: 10, paddingHorizontal: 4 },
  listHeaderTitle: { color: '#8892b0', fontSize: 13, fontWeight: '600' },

  // ── Empty ──
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 120,
    paddingHorizontal: 40,
  },
  emptyTitle: { color: '#fff', fontSize: 22, fontWeight: '700', marginTop: 20, marginBottom: 8 },
  emptySubtitle: { color: '#8892b0', fontSize: 14, textAlign: 'center', lineHeight: 20 },

  // ── Loader ──
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: '#8892b0', marginTop: 12, fontSize: 14 },

  // ── FAB ──
  fab: {
    position: 'absolute',
    bottom: 28,
    right: 24,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#e94560',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#e94560',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 8,
  },

  // ── Upload overlay ──
  uploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 28,
    width: '70%',
    alignItems: 'center',
  },
  uploadLabel: { color: '#fff', fontSize: 15, fontWeight: '600', marginBottom: 12 },
  progressBar: {
    width: '100%',
    height: 6,
    backgroundColor: '#16213e',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: '#e94560', borderRadius: 3 },

  // ── Caption Modal ──
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#1a1a2e',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 16, textAlign: 'center' },
  previewImage: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    marginBottom: 16,
  },
  captionInput: {
    backgroundColor: '#16213e',
    borderRadius: 10,
    padding: 14,
    color: '#fff',
    fontSize: 14,
    minHeight: 70,
    textAlignVertical: 'top',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  modalActions: { flexDirection: 'row', gap: 12 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#4a5568',
    alignItems: 'center',
  },
  cancelBtnText: { color: '#8892b0', fontSize: 15, fontWeight: '600' },
  uploadBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#e94560',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  uploadBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // ── Fullscreen ──
  fullscreenBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtn: { position: 'absolute', top: 50, right: 20, zIndex: 10 },
  fullscreenImage: { width: SCREEN_W, height: SCREEN_W * 1.1 },
  fullscreenMeta: { position: 'absolute', bottom: 50, left: 20, right: 20 },
  fullscreenUploader: { color: '#e94560', fontSize: 14, fontWeight: '700', marginBottom: 4 },
  fullscreenCaption: { color: '#ccc', fontSize: 15 },
});
