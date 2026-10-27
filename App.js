import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Linking,
  BackHandler,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as ImagePicker from 'expo-image-picker';
import QRCode from 'react-native-qrcode-svg';
import { supabase, isSupabaseConfigured } from './supabase';

// Local Storage Keys for Offline Resilience
const CACHE_KEYS = {
  TREES: '@jagori_trees_cache_v2',
  PENDING_SYNC: '@jagori_pending_sync_v2',
};

// Local storage write helper
const saveTreesToStorage = async (treeList) => {
  try {
    if (!treeList || !Array.isArray(treeList)) return;
    await AsyncStorage.setItem(CACHE_KEYS.TREES, JSON.stringify(treeList));
  } catch (err) {
    console.warn('Local storage write error:', err);
  }
};

// Retrieve offline sync queue
const getPendingSyncQueue = async () => {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEYS.PENDING_SYNC);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

// Add record to offline sync queue
const addToSyncQueue = async (treeItem) => {
  try {
    const queue = await getPendingSyncQueue();
    const filtered = queue.filter((t) => t.treeId !== treeItem.treeId);
    const updated = [treeItem, ...filtered];
    await AsyncStorage.setItem(CACHE_KEYS.PENDING_SYNC, JSON.stringify(updated));
    return updated.length;
  } catch {
    return 0;
  }
};

// Remove record from offline sync queue after successful sync
const removeFromSyncQueue = async (treeId) => {
  try {
    const queue = await getPendingSyncQueue();
    const updated = queue.filter((t) => t.treeId !== treeId);
    await AsyncStorage.setItem(CACHE_KEYS.PENDING_SYNC, JSON.stringify(updated));
    return updated.length;
  } catch {
    return 0;
  }
};

const SURVIVAL_STATUS_OPTIONS = [
  { label: 'Healthy', color: '#2e7d32', bg: '#e8f5e9', icon: '🟢' },
  { label: 'Needs Care', color: '#f57f17', bg: '#fff9c4', icon: '🟡' },
  { label: 'Stunted', color: '#e65100', bg: '#ffe0b2', icon: '🟠' },
  { label: 'Dead', color: '#c62828', bg: '#ffebee', icon: '🔴' },
];

const COMMON_SPECIES = [
  'Neem',
  'Peepal',
  'Banyan',
  'Teak',
  'Mango',
  'Gulmohar',
  'Jamun',
  'Sheesham',
];

// URL Helper to determine if someone scanned a QR code in the browser
const getInitialUrlParam = (param) => {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location) {
    const params = new URLSearchParams(window.location.search);
    const value = params.get(param);
    if (value) return value;

    // Check path like /tree/JGF-2026-1001
    if (param === 'treeId') {
      const match = window.location.pathname.match(/\/tree\/([A-Za-z0-9-_]+)/);
      if (match && match[1]) return match[1];
    }
  }
  return null;
};

// Generates the public read-only verification URL encoded in the QR
const buildPublicTreeUrl = (id) => {
  // If a custom domain is configured in .env (e.g. https://jagori-trees.org)
  const configuredBase = process.env.EXPO_PUBLIC_QR_BASE_URL;
  if (configuredBase && configuredBase.startsWith('http')) {
    return `${configuredBase.replace(/\/+$/, '')}/?treeId=${encodeURIComponent(id)}&view=public`;
  }

  // If in web browser, use current host
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location && window.location.origin) {
    return `${window.location.origin}/?treeId=${encodeURIComponent(id)}&view=public`;
  }

// Fallback to local Wi-Fi IP so mobile cameras can scan and open it on the local network
  return `http://192.168.0.100:8081/?treeId=${encodeURIComponent(id)}&view=public`;
};

// Generates self-contained offline tree details for the QR code
// This works 100% offline with ZERO server, ZERO Wi-Fi, and ZERO internet.
// Any phone camera (iOS / Android) scanning this will immediately display the tree details.
const buildTreeQrText = (tree) => {
  if (!tree) return '';
  const lines = [
    '🌿 JAGORI TREE REGISTRY',
    `🆔 ID: ${tree.treeId}`,
    `🌳 Species: ${tree.species}`,
    `📅 Planted: ${tree.plantationDate}`,
    `🩺 Status: ${tree.survivalStatus || 'Healthy'}`,
    `📍 GPS: ${tree.lat}, ${tree.lng}`,
    `🏡 Village: ${tree.village || 'General Habitat'}`,
    `💚 Donor: ${tree.donorName || 'Jagori Community'}`,
    `📏 Height: ${tree.height || 'N/A'} | Girth: ${tree.girth || 'N/A'}`,
  ];
  if (tree.lat && tree.lng && tree.lat !== 'N/A' && tree.lng !== 'N/A') {
    lines.push(`🗺️ Maps: https://maps.google.com/?q=${tree.lat},${tree.lng}`);
  }
  return lines.join('\n');
};

const INITIAL_TREES = [
  {
    treeId: 'JGF-2026-1001',
    species: 'Neem',
    plantationDate: '2026-03-15',
    lat: '32.219042',
    lng: '76.323404',
    donorName: 'Sunita Sharma',
    village: 'Dharamsala',
    treePhoto: null,
    treePhotoBase64: null,
    height: '5.2 ft',
    girth: '16 cm',
    lastInspection: '2026-10-20',
    survivalStatus: 'Healthy',
    url: buildPublicTreeUrl('JGF-2026-1001'),
    qrText: buildTreeQrText({
      treeId: 'JGF-2026-1001',
      species: 'Neem',
      plantationDate: '2026-03-15',
      lat: '32.219042',
      lng: '76.323404',
      donorName: 'Sunita Sharma',
      village: 'Dharamsala',
      height: '5.2 ft',
      girth: '16 cm',
      survivalStatus: 'Healthy',
    }),
  },
  {
    treeId: 'JGF-2026-1002',
    species: 'Peepal',
    plantationDate: '2026-04-10',
    lat: '32.185200',
    lng: '76.291500',
    donorName: 'Green Earth Initiative',
    village: 'Rait',
    treePhoto: null,
    treePhotoBase64: null,
    height: '6.8 ft',
    girth: '24 cm',
    lastInspection: '2026-10-22',
    survivalStatus: 'Healthy',
    url: buildPublicTreeUrl('JGF-2026-1002'),
    qrText: buildTreeQrText({
      treeId: 'JGF-2026-1002',
      species: 'Peepal',
      plantationDate: '2026-04-10',
      lat: '32.185200',
      lng: '76.291500',
      donorName: 'Green Earth Initiative',
      village: 'Rait',
      height: '6.8 ft',
      girth: '24 cm',
      survivalStatus: 'Healthy',
    }),
  },
  {
    treeId: 'JGF-2026-1003',
    species: 'Banyan',
    plantationDate: '2026-02-01',
    lat: '32.099800',
    lng: '76.269100',
    donorName: 'Kangra Eco Club',
    village: 'Kangra',
    treePhoto: null,
    treePhotoBase64: null,
    height: '4.1 ft',
    girth: '12 cm',
    lastInspection: '2026-10-18',
    survivalStatus: 'Needs Care',
    url: buildPublicTreeUrl('JGF-2026-1003'),
    qrText: buildTreeQrText({
      treeId: 'JGF-2026-1003',
      species: 'Banyan',
      plantationDate: '2026-02-01',
      lat: '32.099800',
      lng: '76.269100',
      donorName: 'Kangra Eco Club',
      village: 'Kangra',
      height: '4.1 ft',
      girth: '12 cm',
      survivalStatus: 'Needs Care',
    }),
  },
  {
    treeId: 'JGF-2026-1004',
    species: 'Teak',
    plantationDate: '2026-02-14',
    lat: '32.112400',
    lng: '76.284100',
    donorName: 'Himachal Eco Trust',
    village: 'Dharamsala',
    treePhoto: null,
    treePhotoBase64: null,
    height: '2.4 ft',
    girth: '8 cm',
    lastInspection: '2026-10-15',
    survivalStatus: 'Stunted',
    url: buildPublicTreeUrl('JGF-2026-1004'),
    qrText: buildTreeQrText({
      treeId: 'JGF-2026-1004',
      species: 'Teak',
      plantationDate: '2026-02-14',
      lat: '32.112400',
      lng: '76.284100',
      donorName: 'Himachal Eco Trust',
      village: 'Dharamsala',
      height: '2.4 ft',
      girth: '8 cm',
      survivalStatus: 'Stunted',
    }),
  },
];

const generateNewTreeId = () => {
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `JGF-2026-${randomSuffix}`;
};

const getStatusBadgeStyle = (status) => {
  switch (status) {
    case 'Healthy':
      return { bg: '#e8f5e9', text: '#2e7d32', border: '#a5d6a7', icon: '🟢' };
    case 'Needs Care':
      return { bg: '#fffde7', text: '#f57f17', border: '#fff59d', icon: '🟡' };
    case 'Stunted':
      return { bg: '#fff3e0', text: '#e65100', border: '#ffcc80', icon: '🟠' };
    case 'Dead':
      return { bg: '#ffebee', text: '#c62828', border: '#ef9a9a', icon: '🔴' };
    default:
      return { bg: '#f5f5f5', text: '#616161', border: '#e0e0e0', icon: '⚪' };
  }
};

export default function App() {
  const todayStr = new Date().toISOString().split('T')[0];

  const initialScannedTreeId = getInitialUrlParam('treeId');

  // Screen Navigation: 'DASHBOARD' | 'ADD_TREE' | 'UPDATE_TREE' | 'PUBLIC_VIEW'
  const [currentScreen, setCurrentScreen] = useState(initialScannedTreeId ? 'PUBLIC_VIEW' : 'DASHBOARD');

  // Shared Registry of Trees
  const [trees, setTrees] = useState(INITIAL_TREES);
  const [isLoadingTrees, setIsLoadingTrees] = useState(false);

  // Dashboard List Filter State
  const [dashboardSearchQuery, setDashboardSearchQuery] = useState('');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('ALL');

  // Single-Date Row Expansion State for Dashboard
  const [expandedDates, setExpandedDates] = useState({});

  // Public Tree View State (Read-only for QR code scanners)
  const [publicTree, setPublicTree] = useState(null);
  const [isLoadingPublicTree, setIsLoadingPublicTree] = useState(Boolean(initialScannedTreeId));
  const [isAdminPreview, setIsAdminPreview] = useState(false);

  // QR Mode: 'OFFLINE' (Self-contained, works everywhere without Wi-Fi/Internet) | 'WEB' (Public URL)
  const [qrCodeType, setQrCodeType] = useState('OFFLINE');

  // Offline & Cloud Sync State
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [cloudSyncStatus, setCloudSyncStatus] = useState('SYNCED'); // 'SYNCED' | 'PENDING' | 'SYNCING' | 'OFFLINE'


  // Batch A4 QR Print State
  const [showBatchPrintModal, setShowBatchPrintModal] = useState(false);
  const [batchSelectedDate, setBatchSelectedDate] = useState('ALL');
  const [batchTagDensity, setBatchTagDensity] = useState(6); // 6 (Standard) or 4 (Large)
  const [batchQrType, setBatchQrType] = useState('OFFLINE'); // 'OFFLINE' | 'WEB'
  const [isBatchPrinting, setIsBatchPrinting] = useState(false);

  // ==========================================
  // ADD TREE FORM STATE (11 categories in sequence)
  // ==========================================
  const [treeId, setTreeId] = useState(generateNewTreeId());
  const [species, setSpecies] = useState('');
  const [plantationDate, setPlantationDate] = useState(todayStr);
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [isLocating, setIsLocating] = useState(false);
  const [donorName, setDonorName] = useState('');
  const [village, setVillage] = useState('');
  const [treePhoto, setTreePhoto] = useState(null);
  const [treePhotoBase64, setTreePhotoBase64] = useState(null);
  const [height, setHeight] = useState('');
  const [girth, setGirth] = useState('');
  const [lastInspection, setLastInspection] = useState(todayStr);
  const [survivalStatus, setSurvivalStatus] = useState('Healthy');
  const [savedTree, setSavedTree] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  // ==========================================
  // UPDATE TREE STATE
  // ==========================================
  const [searchTreeId, setSearchTreeId] = useState('');
  const [selectedTree, setSelectedTree] = useState(null);
  const [updateHeight, setUpdateHeight] = useState('');
  const [updateGirth, setUpdateGirth] = useState('');
  const [updateLastInspection, setUpdateLastInspection] = useState(todayStr);
  const [updateSurvivalStatus, setUpdateSurvivalStatus] = useState('Healthy');
  const [updatePhoto, setUpdatePhoto] = useState(null);
  const [updatePhotoBase64, setUpdatePhotoBase64] = useState(null);
  const [updateSpecies, setUpdateSpecies] = useState('');
  const [updateDonorName, setUpdateDonorName] = useState('');
  const [updateVillage, setUpdateVillage] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  // Monitor keyboard display so scroll view dynamically expands to prevent keypad obstruction
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(e.endCoordinates ? e.endCoordinates.height : 280);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Handle hardware & mobile back button (Android and gesture back)
  useEffect(() => {
    const onBackPress = () => {
      if (currentScreen === 'UPDATE_TREE' && selectedTree) {
        setSelectedTree(null);
        setSearchTreeId('');
        return true; // Return to list of all trees on Update screen
      }
      if (currentScreen !== 'DASHBOARD') {
        setCurrentScreen('DASHBOARD');
        return true; // Handled internally, do not close the app
      }
      return false; // Already on DASHBOARD, let the system perform default action (exit/minimize)
    };

    const backSubscription = BackHandler.addEventListener(
      'hardwareBackPress',
      onBackPress
    );

    return () => backSubscription.remove();
  }, [currentScreen, selectedTree]);

  // Load public tree if launched via QR code (?treeId=...)
  useEffect(() => {
    if (!initialScannedTreeId) return;

    let isMounted = true;
    async function fetchScannedTree() {
      // 1. Check local cache
      const localMatch = trees.find((t) => t.treeId.toLowerCase() === initialScannedTreeId.toLowerCase());
      if (localMatch) {
        if (isMounted) {
          setPublicTree(localMatch);
          setIsLoadingPublicTree(false);
        }
        return;
      }

      // 2. Fetch from Supabase
      if (isSupabaseConfigured && supabase) {
        try {
          const { data, error } = await supabase
            .from('trees')
            .select('*')
            .eq('tree_id', initialScannedTreeId)
            .single();

          if (data && !error) {
            const loaded = {
              treeId: data.tree_id,
              species: data.species,
              plantationDate: data.plantation_date,
              lat: data.latitude,
              lng: data.longitude,
              donorName: data.donor_name || 'Jagori Community',
              village: data.village || 'General Habitat',
              treePhoto: data.tree_photo_url,
              treePhotoBase64: data.tree_photo_url,
              height: data.height || 'Not Measured',
              girth: data.girth || 'Not Measured',
              lastInspection: data.last_inspection || todayStr,
              survivalStatus: data.survival_status || 'Healthy',
              url: data.public_url || buildPublicTreeUrl(data.tree_id),
            };
            if (isMounted) {
              setPublicTree(loaded);
              setIsLoadingPublicTree(false);
            }
            return;
          }
        } catch (err) {
          console.warn('Public tree fetch error:', err);
        }
      }

      // If not found, create fallback display
      if (isMounted) {
        setPublicTree({
          treeId: initialScannedTreeId,
          species: 'Tree Specimen',
          plantationDate: 'Registered Record',
          lat: 'N/A',
          lng: 'N/A',
          donorName: 'Jagori Community',
          village: 'Field Conservation Site',
          treePhoto: null,
          height: 'Standard',
          girth: 'Standard',
          lastInspection: 'Active',
          survivalStatus: 'Healthy',
          url: buildPublicTreeUrl(initialScannedTreeId),
        });
        setIsLoadingPublicTree(false);
      }
    }

    fetchScannedTree();

    return () => {
      isMounted = false;
    };
  }, [initialScannedTreeId, trees, todayStr]);

  // Sync offline queue with Supabase Cloud
  const syncPendingTreesWithCloud = async () => {
    if (!isSupabaseConfigured || !supabase || isSyncing) return;
    try {
      setIsSyncing(true);
      setCloudSyncStatus('SYNCING');
      const queue = await getPendingSyncQueue();
      if (queue.length === 0) {
        setCloudSyncStatus('SYNCED');
        setIsSyncing(false);
        return;
      }

      for (const item of queue) {
        const { error } = await supabase.from('trees').upsert(
          [
            {
              tree_id: item.treeId,
              species: item.species,
              plantation_date: item.plantationDate,
              latitude: item.lat,
              longitude: item.lng,
              donor_name: item.donorName,
              village: item.village,
              tree_photo_url: item.treePhotoBase64 || item.treePhoto,
              height: item.height,
              girth: item.girth,
              last_inspection: item.lastInspection,
              survival_status: item.survivalStatus,
              public_url: item.url,
              updated_at: new Date().toISOString(),
            },
          ],
          { onConflict: 'tree_id' }
        );

        if (!error) {
          await removeFromSyncQueue(item.treeId);
        }
      }

      const remainingQueue = await getPendingSyncQueue();
      setPendingSyncCount(remainingQueue.length);
      setCloudSyncStatus(remainingQueue.length === 0 ? 'SYNCED' : 'PENDING');
      if (remainingQueue.length === 0) {
        Alert.alert('Sync Complete', 'All offline tree records have been successfully synced to the cloud!');
      }
    } catch (err) {
      console.warn('Sync queue error:', err);
      setCloudSyncStatus('OFFLINE');
    } finally {
      setIsSyncing(false);
    }
  };


  // Export Complete Tree Registry to CSV for Donors & Government Audits
  const handleExportCSV = async () => {
    if (!trees || trees.length === 0) {
      Alert.alert('Export Notice', 'No tree records available to export.');
      return;
    }

    const headers = [
      'Tree ID',
      'Species',
      'Plantation Date',
      'Latitude',
      'Longitude',
      'Village',
      'Donor / Caretaker',
      'Height',
      'Girth',
      'Health Status',
      'Last Inspection Date',
      'Public Verification URL',
    ];

    const rows = trees.map((t) => [
      `"${(t.treeId || '').replace(/"/g, '""')}"`,
      `"${(t.species || '').replace(/"/g, '""')}"`,
      `"${(t.plantationDate || '').replace(/"/g, '""')}"`,
      `"${(t.lat || '').replace(/"/g, '""')}"`,
      `"${(t.lng || '').replace(/"/g, '""')}"`,
      `"${(t.village || '').replace(/"/g, '""')}"`,
      `"${(t.donorName || '').replace(/"/g, '""')}"`,
      `"${(t.height || '').replace(/"/g, '""')}"`,
      `"${(t.girth || '').replace(/"/g, '""')}"`,
      `"${(t.survivalStatus || '').replace(/"/g, '""')}"`,
      `"${(t.lastInspection || '').replace(/"/g, '""')}"`,
      `"${(t.url || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');

    if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof document !== 'undefined') {
      try {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `jagori_trees_registry_${todayStr}.csv`);
        document.body.appendChild(link);
        link.click();
        setTimeout(() => {
          if (link.parentNode) document.body.removeChild(link);
          URL.revokeObjectURL(url);
        }, 300);
        Alert.alert('CSV Exported', `Downloaded jagori_trees_registry_${todayStr}.csv`);
      } catch (webErr) {
        console.warn('Web CSV export fallback:', webErr);
        const encoded = encodeURI('data:text/csv;charset=utf-8,' + csvContent);
        window.open(encoded, '_blank');
      }
    } else {
      try {
        const fileName = `jagori_trees_registry_${todayStr}.csv`;
        const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
        await FileSystem.writeAsStringAsync(fileUri, csvContent, {
          encoding: FileSystem.EncodingType.UTF8,
        });

        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri, {
            mimeType: 'text/csv',
            dialogTitle: 'Export Jagori Trees Registry (CSV)',
            UTI: 'public.comma-separated-values-text',
          });
        } else {
          Alert.alert('Export Successful', `CSV file created at: ${fileUri}`);
        }
      } catch (err) {
        console.warn('Mobile CSV export error:', err);
        Alert.alert('Export Notice', `Could not export CSV: ${err.message || err}`);
      }
    }
  };

  // Initialize Registry: Load local cache first, then sync with Supabase Cloud
  useEffect(() => {
    async function initRegistry() {
      // 1. Immediately load local cache (0ms delay offline)
      try {
        const cachedRaw = await AsyncStorage.getItem(CACHE_KEYS.TREES);
        if (cachedRaw) {
          const parsed = JSON.parse(cachedRaw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setTrees(parsed);
          }
        }
        const pending = await getPendingSyncQueue();
        setPendingSyncCount(pending.length);
        if (pending.length > 0) {
          setCloudSyncStatus('PENDING');
        }
      } catch (err) {
        console.warn('Local cache read error:', err);
      }

      // 2. Fetch fresh from Supabase Cloud if configured
      if (!isSupabaseConfigured || !supabase) return;

      try {
        setIsLoadingTrees(true);
        const { data, error } = await supabase
          .from('trees')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) {
          console.warn('Supabase fetch error:', error.message);
          setCloudSyncStatus('OFFLINE');
          return;
        }

        if (data && data.length > 0) {
          const mappedTrees = data.map((t) => ({
            treeId: t.tree_id,
            species: t.species,
            plantationDate: t.plantation_date,
            lat: t.latitude,
            lng: t.longitude,
            donorName: t.donor_name || 'Jagori Community',
            village: t.village || 'General Habitat',
            treePhoto: t.tree_photo_url,
            treePhotoBase64: t.tree_photo_url,
            height: t.height || 'Not Measured',
            girth: t.girth || 'Not Measured',
            lastInspection: t.last_inspection || todayStr,
            survivalStatus: t.survival_status || 'Healthy',
            url: t.public_url || buildPublicTreeUrl(t.tree_id),
            qrText: buildTreeQrText({
              treeId: t.tree_id,
              species: t.species,
              plantationDate: t.plantation_date,
              lat: t.latitude,
              lng: t.longitude,
              donorName: t.donor_name,
              village: t.village,
              height: t.height,
              girth: t.girth,
              survivalStatus: t.survival_status,
            }),
          }));

          // Merge local pending items with cloud data
          const pending = await getPendingSyncQueue();
          const pendingIds = new Set(pending.map((p) => p.treeId));
          const merged = [
            ...pending,
            ...mappedTrees.filter((m) => !pendingIds.has(m.treeId)),
          ];

          setTrees(merged);
          await saveTreesToStorage(merged);
          setCloudSyncStatus(pending.length > 0 ? 'PENDING' : 'SYNCED');

          if (pending.length > 0) {
            syncPendingTreesWithCloud();
          }
        }
      } catch (err) {
        console.warn('Supabase load error:', err);
        setCloudSyncStatus('OFFLINE');
      } finally {
        setIsLoadingTrees(false);
      }
    }

    initRegistry();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayStr]);

  // GPS Fetch for Add Tree
  const fetchLocation = async () => {
    try {
      setIsLocating(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Denied',
          'GPS permission was denied. You can manually enter Latitude and Longitude in the columns below.'
        );
        setIsLocating(false);
        return;
      }

      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      setLatitude(currentLocation.coords.latitude.toFixed(6));
      setLongitude(currentLocation.coords.longitude.toFixed(6));
    } catch (_error) {
      Alert.alert(
        'GPS Notice',
        'Unable to auto-detect GPS. Please manually enter Latitude and Longitude in the columns below.'
      );
    } finally {
      setIsLocating(false);
    }
  };

  // Image Picker Helpers
  const pickPhotoFromCamera = async (onSuccess) => {
    try {
      if (Platform.OS !== 'web') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission Required', 'Camera permission is needed to take a photo.');
          return;
        }
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.4,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        const asset = result.assets[0];
        const uri = asset.uri;
        const b64 = asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : uri;
        onSuccess(uri, b64);
      }
    } catch (_error) {
      Alert.alert('Camera Error', 'Could not open camera on this device.');
    }
  };

  const pickPhotoFromGallery = async (onSuccess) => {
    try {
      if (Platform.OS !== 'web') {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission Required', 'Gallery access is needed to pick a photo.');
          return;
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.4,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        const asset = result.assets[0];
        const uri = asset.uri;
        const b64 = asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : uri;
        onSuccess(uri, b64);
      }
    } catch (_error) {
      Alert.alert('Gallery Error', 'Could not open photo library.');
    }
  };

  // Save New Tree (Add Tree) with Offline Resilience & Validation
  const handleSaveNewTree = async () => {
    const trimmedId = treeId.trim();
    if (!trimmedId) {
      Alert.alert('Validation Error', 'Please specify a Tree ID.');
      return;
    }
    if (!species.trim()) {
      Alert.alert('Validation Error', 'Please enter or select a tree species/name.');
      return;
    }
    if (!latitude.trim() || !longitude.trim()) {
      Alert.alert(
        'Validation Error',
        'Please enter or auto-fetch both Latitude and Longitude coordinates.'
      );
      return;
    }

    // Precise coordinate range validation
    const latNum = parseFloat(latitude.trim());
    const lngNum = parseFloat(longitude.trim());
    if (isNaN(latNum) || latNum < -90 || latNum > 90) {
      Alert.alert('Validation Error', 'Latitude must be a valid coordinate between -90 and 90 degrees.');
      return;
    }
    if (isNaN(lngNum) || lngNum < -180 || lngNum > 180) {
      Alert.alert('Validation Error', 'Longitude must be a valid coordinate between -180 and 180 degrees.');
      return;
    }

    // Date format validation for SQL DATE
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(plantationDate.trim())) {
      Alert.alert('Validation Error', 'Plantation date must be in YYYY-MM-DD format (e.g. 2026-03-15).');
      return;
    }

    // Generate unique public verification URL encoded into QR
    const publicUrl = buildPublicTreeUrl(trimmedId);

    const treeData = {
      treeId: trimmedId,
      species: species.trim(),
      plantationDate: plantationDate.trim(),
      lat: latitude.trim(),
      lng: longitude.trim(),
      donorName: donorName.trim() || 'Jagori Community',
      village: village.trim() || 'General Habitat',
      treePhoto,
      treePhotoBase64,
      height: height.trim() || 'Not Measured',
      girth: girth.trim() || 'Not Measured',
      lastInspection: lastInspection.trim() || todayStr,
      survivalStatus,
      url: publicUrl,
    };
    treeData.qrText = buildTreeQrText(treeData);

    const newTree = treeData;

    setIsSaving(true);

    // 1. Immediately persist locally (Guarantees zero data loss)
    const updatedList = [newTree, ...trees.filter((t) => t.treeId !== trimmedId)];
    setTrees(updatedList);
    await saveTreesToStorage(updatedList);
    setSavedTree(newTree);

    // 2. Sync to Supabase Cloud
    let isCloudSuccess = false;
    if (isSupabaseConfigured && supabase) {
      try {
        const { error } = await supabase.from('trees').upsert(
          [
            {
              tree_id: newTree.treeId,
              species: newTree.species,
              plantation_date: newTree.plantationDate,
              latitude: newTree.lat,
              longitude: newTree.lng,
              donor_name: newTree.donorName,
              village: newTree.village,
              tree_photo_url: newTree.treePhotoBase64 || newTree.treePhoto,
              height: newTree.height,
              girth: newTree.girth,
              last_inspection: newTree.lastInspection,
              survival_status: newTree.survivalStatus,
              public_url: newTree.url,
            },
          ],
          { onConflict: 'tree_id' }
        );

        if (!error) {
          isCloudSuccess = true;
          setCloudSyncStatus('SYNCED');
        } else {
          console.warn('Supabase sync warning:', error.message);
        }
      } catch (err) {
        console.warn('Supabase save error:', err);
      }
    }

    if (!isCloudSuccess) {
      const remainingCount = await addToSyncQueue(newTree);
      setPendingSyncCount(remainingCount);
      setCloudSyncStatus('PENDING');
      Alert.alert(
        'Saved to Device (Offline Mode)',
        `Tree ${trimmedId} has been securely saved to this device!\n\n📶 You are currently offline. This record is queued and will automatically sync to the database once connected.`
      );
    }

    setIsSaving(false);
  };

  // Reset Add Tree Form
  const handleResetAddForm = () => {
    setTreeId(generateNewTreeId());
    setSpecies('');
    setPlantationDate(todayStr);
    setLatitude('');
    setLongitude('');
    setDonorName('');
    setVillage('');
    setTreePhoto(null);
    setTreePhotoBase64(null);
    setHeight('');
    setGirth('');
    setLastInspection(todayStr);
    setSurvivalStatus('Healthy');
    setSavedTree(null);
  };

  const applySelectedTree = (tree) => {
    setSelectedTree(tree);
    setUpdateSpecies(tree.species);
    setUpdateDonorName(tree.donorName);
    setUpdateVillage(tree.village);
    setUpdateHeight(tree.height);
    setUpdateGirth(tree.girth);
    setUpdateLastInspection(todayStr);
    setUpdateSurvivalStatus(tree.survivalStatus);
    setUpdatePhoto(tree.treePhoto);
    setUpdatePhotoBase64(tree.treePhotoBase64);
  };

  // Search Tree for Update (Local + Cloud)
  const handleSearchTree = async (idToSearch) => {
    const query = (idToSearch || searchTreeId).trim();
    if (!query) {
      Alert.alert('Validation Error', 'Please enter a Tree ID to search.');
      return;
    }

    // 1. Try local cache first
    const foundLocal = trees.find((t) => t.treeId.toLowerCase() === query.toLowerCase());
    if (foundLocal) {
      applySelectedTree(foundLocal);
      return;
    }

    // 2. Query Supabase if connected
    if (isSupabaseConfigured && supabase) {
      setIsSearching(true);
      try {
        const { data, error } = await supabase
          .from('trees')
          .select('*')
          .eq('tree_id', query)
          .single();

        if (data && !error) {
          const loadedTree = {
            treeId: data.tree_id,
            species: data.species,
            plantationDate: data.plantation_date,
            lat: data.latitude,
            lng: data.longitude,
            donorName: data.donor_name || 'Jagori Community',
            village: data.village || 'General Habitat',
            treePhoto: data.tree_photo_url,
            treePhotoBase64: data.tree_photo_url,
            height: data.height || 'Not Measured',
            girth: data.girth || 'Not Measured',
            lastInspection: data.last_inspection || todayStr,
            survivalStatus: data.survival_status || 'Healthy',
            url: data.public_url || buildPublicTreeUrl(data.tree_id),
          };
          setTrees((prev) => [loadedTree, ...prev.filter((t) => t.treeId !== loadedTree.treeId)]);
          applySelectedTree(loadedTree);
          setIsSearching(false);
          return;
        }
      } catch (err) {
        console.warn('Supabase lookup error:', err);
      } finally {
        setIsSearching(false);
      }
    }

    Alert.alert('Not Found', `No tree record found with ID "${query}".`);
  };

  // Save Updates to Tree (Supabase & Local)
  const handleSaveTreeUpdate = async () => {
    if (!selectedTree) return;

    setIsUpdating(true);

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (updateLastInspection.trim() && !dateRegex.test(updateLastInspection.trim())) {
      Alert.alert('Validation Error', 'Last inspection date must be in YYYY-MM-DD format (e.g. 2026-10-27).');
      return;
    }

    const updatedTree = {
      ...selectedTree,
      species: updateSpecies.trim() || selectedTree.species,
      donorName: updateDonorName.trim() || selectedTree.donorName,
      village: updateVillage.trim() || selectedTree.village,
      height: updateHeight.trim() || selectedTree.height,
      girth: updateGirth.trim() || selectedTree.girth,
      lastInspection: updateLastInspection.trim() || todayStr,
      survivalStatus: updateSurvivalStatus,
      treePhoto: updatePhoto,
      treePhotoBase64: updatePhotoBase64,
      url: selectedTree.url || buildPublicTreeUrl(selectedTree.treeId),
    };
    updatedTree.qrText = buildTreeQrText(updatedTree);

    // 1. Immediately persist locally
    const updatedList = trees.map((t) => (t.treeId === updatedTree.treeId ? updatedTree : t));
    setTrees(updatedList);
    await saveTreesToStorage(updatedList);
    setSelectedTree(updatedTree);
    setPublicTree(updatedTree);

    // 2. Update in Supabase Cloud
    let isCloudSuccess = false;
    if (isSupabaseConfigured && supabase) {
      try {
        const { error } = await supabase
          .from('trees')
          .update({
            species: updatedTree.species,
            donor_name: updatedTree.donorName,
            village: updatedTree.village,
            tree_photo_url: updatedTree.treePhotoBase64 || updatedTree.treePhoto,
            height: updatedTree.height,
            girth: updatedTree.girth,
            last_inspection: updatedTree.lastInspection,
            survival_status: updatedTree.survivalStatus,
            public_url: updatedTree.url,
            updated_at: new Date().toISOString(),
          })
          .eq('tree_id', updatedTree.treeId);

        if (!error) {
          isCloudSuccess = true;
          setCloudSyncStatus('SYNCED');
        } else {
          console.warn('Supabase update warning:', error.message);
        }
      } catch (err) {
        console.warn('Supabase update error:', err);
      }
    }

    if (!isCloudSuccess) {
      const remainingCount = await addToSyncQueue(updatedTree);
      setPendingSyncCount(remainingCount);
      setCloudSyncStatus('PENDING');
      Alert.alert(
        'Updated Locally (Offline Mode)',
        `Tree ${updatedTree.treeId} updates have been saved to this device!\n\n📶 These changes will sync to the database as soon as you have internet.`
      );
    } else {
      Alert.alert(
        'Tree Updated',
        `Tree ${updatedTree.treeId} information has been successfully updated in the database!\n\n✓ The existing physical QR code on this tree remains active and will now show these latest records.`
      );
    }

    setIsUpdating(false);
  };

  // Delete Tree Record (with strict confirmation)
  const handleDeleteTree = (idToDelete) => {
    if (!idToDelete) return;
    Alert.alert(
      'Confirm Deletion',
      `Are you sure you want to permanently delete Tree ${idToDelete}?\n\nThis will remove it from this device and the cloud database. This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const updated = trees.filter((t) => t.treeId !== idToDelete);
            setTrees(updated);
            await saveTreesToStorage(updated);
            setSelectedTree(null);
            setSearchTreeId('');

            if (isSupabaseConfigured && supabase) {
              try {
                await supabase.from('trees').delete().eq('tree_id', idToDelete);
              } catch (err) {
                console.warn('Supabase delete error:', err);
              }
            }

            Alert.alert('Tree Deleted', `Tree ${idToDelete} has been permanently deleted.`);
          },
        },
      ]
    );
  };

  // Open Google Maps coordinates
  const openGoogleMaps = (lat, lng) => {
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      `${lat},${lng}`
    )}`;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.open(mapsUrl, '_blank');
    } else {
      Linking.openURL(mapsUrl);
    }
  };

  // Export Printable PDF Slip
  const handleExportPDF = async (treeToExport) => {
    if (!treeToExport) return;

    const qrData =
      qrCodeType === 'OFFLINE'
        ? (treeToExport.qrText || buildTreeQrText(treeToExport))
        : treeToExport.url;

    const qrImageSvg = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(
      qrData
    )}`;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <style>
            * { box-sizing: border-box; }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              display: flex;
              justify-content: center;
              padding: 24px;
              background-color: #f7f9f6;
            }
            .badge {
              width: 380px;
              border: 2px solid #2e7d32;
              border-radius: 14px;
              padding: 24px;
              text-align: center;
              background-color: #ffffff;
              box-shadow: 0 4px 12px rgba(0,0,0,0.08);
            }
            .header {
              font-size: 18px;
              font-weight: 800;
              letter-spacing: 0.5px;
              color: #1b5e20;
              margin-bottom: 2px;
            }
            .sub {
              font-size: 11px;
              color: #558b2f;
              font-weight: 600;
              text-transform: uppercase;
              letter-spacing: 1px;
              margin-bottom: 14px;
            }
            .qr-container {
              margin: 12px auto;
              padding: 10px;
              background: #f1f8e9;
              display: inline-block;
              border-radius: 10px;
            }
            .qr-container img {
              width: 150px;
              height: 150px;
              display: block;
            }
            .photo-container {
              margin: 12px 0;
            }
            .photo-container img {
              width: 100%;
              max-height: 180px;
              object-fit: cover;
              border-radius: 8px;
              border: 1px solid #c8e6c9;
            }
            .tree-id {
              font-size: 16px;
              font-weight: bold;
              color: #2e7d32;
              margin: 8px 0 14px 0;
              background: #e8f5e9;
              padding: 6px 12px;
              border-radius: 6px;
              display: inline-block;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 10px;
              text-align: left;
              font-size: 12px;
            }
            th {
              color: #555;
              padding: 6px 4px;
              border-bottom: 1px solid #e0e0e0;
              width: 42%;
              font-weight: 600;
            }
            td {
              color: #111;
              padding: 6px 4px;
              border-bottom: 1px solid #e0e0e0;
              font-weight: 500;
            }
            .status-tag {
              display: inline-block;
              padding: 2px 8px;
              border-radius: 10px;
              font-size: 11px;
              font-weight: bold;
              background: #e8f5e9;
              color: #2e7d32;
            }
            .footer {
              margin-top: 16px;
              font-size: 10px;
              color: #888;
            }
          </style>
        </head>
        <body>
          <div class="badge">
            <div class="header">🌿 JAGORI FOUNDATION</div>
            <div class="sub">Tree Conservation & Tagging Slip</div>

            <div class="qr-container">
              <img src="${qrImageSvg}" alt="Tree QR Code" />
            </div>

            <div style="font-size: 12px; font-family: monospace, monospace; color: #475569; font-weight: 600; margin-top: 6px; letter-spacing: 0.5px;">
              ${escapeHtml(treeToExport.treeId)}
            </div>
            <div style="font-size: 16px; font-weight: 700; color: #15803d; margin-top: 2px; margin-bottom: 12px;">
              ${escapeHtml(treeToExport.species || 'Specimen')}
            </div>

            ${
              treeToExport.treePhotoBase64
                ? `<div class="photo-container"><img src="${treeToExport.treePhotoBase64}" alt="Tree Photograph" /></div>`
                : ''
            }

            <table>
              <tr>
                <th>1. Tree ID</th>
                <td>${treeToExport.treeId}</td>
              </tr>
              <tr>
                <th>2. Species</th>
                <td>${treeToExport.species}</td>
              </tr>
              <tr>
                <th>3. Plantation Date</th>
                <td>${treeToExport.plantationDate}</td>
              </tr>
              <tr>
                <th>4. GPS Location</th>
                <td>${treeToExport.lat}, ${treeToExport.lng}</td>
              </tr>
              <tr>
                <th>5. Donor Name</th>
                <td>${treeToExport.donorName}</td>
              </tr>
              <tr>
                <th>6. Village</th>
                <td>${treeToExport.village}</td>
              </tr>
              <tr>
                <th>7. Tree Photo</th>
                <td>${treeToExport.treePhoto ? 'Captured' : 'No Photo'}</td>
              </tr>
              <tr>
                <th>8. Height</th>
                <td>${treeToExport.height}</td>
              </tr>
              <tr>
                <th>9. Girth</th>
                <td>${treeToExport.girth}</td>
              </tr>
              <tr>
                <th>10. Last Inspection</th>
                <td>${treeToExport.lastInspection}</td>
              </tr>
              <tr>
                <th>11. Survival Status</th>
                <td><span class="status-tag">${treeToExport.survivalStatus}</span></td>
              </tr>
            </table>

            <div class="footer">
              Scan QR code on tree to view live verification profile: ${treeToExport.url}
            </div>
          </div>
        </body>
      </html>
    `;

    await executePrintOrShareDocument(
      htmlContent,
      `Jagori Tree Tag - ${treeToExport.treeId}`,
      `tag_${treeToExport.treeId}`
    );
  };

  // Helper to escape HTML characters
  const escapeHtml = (str) => {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  // Universal Document Print & Sharing Pipeline (Bulletproof on Web, Android & iOS)
  const executePrintOrShareDocument = async (htmlContent, documentTitle, filenamePrefix) => {
    // 1. WEB PLATFORM: Desktop Chrome, Safari, Edge, Mobile Web Browsers
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        const webHtml = htmlContent.replace(
          '<body>',
          `<body>
            <div id="jagori-web-print-header" class="no-print" style="position: sticky; top: 0; z-index: 999999; background: #15803d; color: white; padding: 12px 18px; margin: -8mm -8mm 16px -8mm; box-shadow: 0 4px 10px rgba(0,0,0,0.15); display: flex; justify-content: space-between; align-items: center; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
              <div>
                <strong style="font-size: 15px;">🌿 ${escapeHtml(documentTitle)}</strong>
                <div style="font-size: 11px; opacity: 0.9; margin-top: 2px;">A4 Format Ready • Click below to print or save as PDF</div>
              </div>
              <div style="display: flex; gap: 8px;">
                <button onclick="window.print()" style="background: #ffffff; color: #15803d; border: none; font-weight: 800; font-size: 13px; padding: 8px 18px; border-radius: 6px; cursor: pointer; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">
                  🖨️ Print / Save as PDF
                </button>
                <button onclick="window.close()" style="background: rgba(255,255,255,0.2); color: white; border: 1px solid rgba(255,255,255,0.4); font-weight: 600; font-size: 12px; padding: 8px 14px; border-radius: 6px; cursor: pointer;">
                  Close ✕
                </button>
              </div>
            </div>
            <style>
              @media print {
                #jagori-web-print-header, .no-print {
                  display: none !important;
                }
              }
            </style>`
        );

        const blob = new Blob([webHtml], { type: 'text/html;charset=utf-8;' });
        const url = URL.createObjectURL(blob);

        const printWin = window.open(url, '_blank');
        if (printWin) {
          printWin.focus();
          setTimeout(() => {
            try {
              printWin.print();
            } catch (_) {}
          }, 600);
        } else {
          // Fallback if popup blocked: use hidden iframe
          const iframe = document.createElement('iframe');
          iframe.style.position = 'fixed';
          iframe.style.right = '0';
          iframe.style.bottom = '0';
          iframe.style.width = '0';
          iframe.style.height = '0';
          iframe.style.border = '0';
          document.body.appendChild(iframe);
          iframe.onload = () => {
            setTimeout(() => {
              try {
                iframe.contentWindow.focus();
                iframe.contentWindow.print();
              } catch (_) {}
              setTimeout(() => {
                if (iframe.parentNode) document.body.removeChild(iframe);
                URL.revokeObjectURL(url);
              }, 2000);
            }, 300);
          };
          iframe.src = url;
        }
      } catch (webErr) {
        console.warn('Web print error:', webErr);
        Alert.alert('Print Notice', 'Could not open print window. Please allow popups for this site.');
      }
      return;
    }

    // 2. MOBILE PLATFORM: Expo Go (Android & iOS)
    try {
      if (Platform.OS === 'android') {
        // On Android, Print.printAsync natively launches Android Print Spooler with "Save as PDF" & connected printers
        await Print.printAsync({ html: htmlContent });
        return;
      }

      // iOS and other mobile platforms: printToFileAsync + native share sheet
      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: documentTitle,
          UTI: 'com.adobe.pdf',
        });
      } else {
        await Print.printAsync({ html: htmlContent });
      }
    } catch (mobileErr) {
      console.warn('Mobile PDF share error, attempting system Print fallback:', mobileErr);
      try {
        await Print.printAsync({ html: htmlContent });
      } catch (printErr) {
        console.warn('System print manager error:', printErr);
        Alert.alert(
          'Export Notice',
          'Unable to open print or share dialog on this device. Please check app permissions.'
        );
      }
    }
  };

  // Generate and Print Multi-Page A4 QR Sheet for Batch Tree Plantations
  const handlePrintBatchA4Sheet = async (
    treesToPrint,
    dateLabel = 'Batch Plantation',
    density = 6,
    qrType = qrCodeType
  ) => {
    if (!treesToPrint || treesToPrint.length === 0) {
      Alert.alert('Notice', 'No trees available in this batch to print.');
      return;
    }

    try {
      setIsBatchPrinting(true);

      const pageSize = density === 4 ? 4 : 6;
      const totalPages = Math.ceil(treesToPrint.length / pageSize);

      // Split trees into page chunks
      const pages = [];
      for (let i = 0; i < treesToPrint.length; i += pageSize) {
        pages.push(treesToPrint.slice(i, i + pageSize));
      }

      const qrSize = pageSize === 4 ? 140 : 105;

      const pagesHtml = pages
        .map((pageTrees, pageIndex) => {
          const pageNum = pageIndex + 1;
          const tagsHtml = pageTrees
            .map((tree) => {
              const qrData =
                qrType === 'OFFLINE'
                  ? (tree.qrText || buildTreeQrText(tree))
                  : (tree.url || buildPublicTreeUrl(tree.treeId));

              const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${qrSize * 2}x${qrSize * 2}&data=${encodeURIComponent(
                qrData
              )}`;

              return `
              <div class="tag-card">
                <span class="cut-guide">✂️ Cut</span>
                <div class="tag-top">
                  <span class="tag-brand">🌿 JAGORI FOUNDATION</span>
                  <span class="tag-qr-type">${qrType === 'OFFLINE' ? '📴 OFFLINE' : '🌐 WEB'}</span>
                </div>
                <div class="tag-content">
                  <div class="tag-qr-wrap">
                    <img class="tag-qr-img" src="${qrImageUrl}" width="${qrSize}" height="${qrSize}" alt="QR Code" />
                  </div>
                  <div class="tag-id-small">${escapeHtml(tree.treeId)}</div>
                  <div class="tag-species-name">${escapeHtml(tree.species || 'Specimen')}</div>
                </div>
              </div>
            `;
            })
            .join('');

          return `
          <div class="page-container">
            <div class="batch-header">
              <div>
                <div class="batch-title">🌿 JAGORI FOUNDATION • TREE CONSERVATION PROJECT</div>
                <div class="batch-sub">Field Plantation QR Tags • Batch Date: <strong>${escapeHtml(dateLabel)}</strong></div>
              </div>
              <div class="batch-page-badge">Page ${pageNum} of ${totalPages} (${pageTrees.length} Tags)</div>
            </div>

            <div class="${pageSize === 4 ? 'grid-4' : 'grid-6'}">
              ${tagsHtml}
            </div>

            <div class="batch-footer">
              <span>✂️ Cut along dashed lines. Laminate or place in waterproof sleeve before tying to tree stake.</span>
              <span>Total Planted in Batch: ${treesToPrint.length} Trees</span>
            </div>
          </div>
        `;
        })
        .join('');

      const fullHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>Jagori A4 QR Tags - ${escapeHtml(dateLabel)}</title>
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            @page {
              size: A4 portrait;
              margin: 8mm 8mm;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
              background: #ffffff;
              color: #1e293b;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .page-container {
              width: 100%;
              max-width: 194mm;
              margin: 0 auto;
              page-break-after: always;
              break-after: page;
              padding: 4mm 0;
              display: flex;
              flex-direction: column;
              min-height: 275mm;
              max-height: 278mm;
              justify-content: space-between;
            }
            .page-container:last-child {
              page-break-after: auto;
              break-after: auto;
            }
            .batch-header {
              border-bottom: 2px solid #15803d;
              padding-bottom: 5px;
              margin-bottom: 8px;
              display: flex;
              justify-content: space-between;
              align-items: flex-end;
            }
            .batch-title {
              font-size: 13px;
              font-weight: 800;
              color: #14532d;
              letter-spacing: 0.5px;
            }
            .batch-sub {
              font-size: 11px;
              color: #15803d;
              font-weight: 600;
              margin-top: 1px;
            }
            .batch-page-badge {
              font-size: 10px;
              font-weight: bold;
              color: #334155;
              background: #f1f5f9;
              padding: 3px 8px;
              border-radius: 6px;
              border: 1px solid #cbd5e1;
            }
            .grid-6 {
              display: grid;
              grid-template-columns: repeat(2, 1fr);
              grid-template-rows: repeat(3, 1fr);
              grid-gap: 8px;
              flex: 1;
            }
            .grid-4 {
              display: grid;
              grid-template-columns: repeat(2, 1fr);
              grid-template-rows: repeat(2, 1fr);
              grid-gap: 12px;
              flex: 1;
            }
            .tag-card {
              border: 2px dashed #64748b;
              border-radius: 8px;
              padding: 6px 8px;
              background: #ffffff;
              display: flex;
              flex-direction: column;
              justify-content: flex-start;
              align-items: center;
              position: relative;
              overflow: hidden;
              text-align: center;
            }
            .cut-guide {
              position: absolute;
              top: 4px;
              right: 8px;
              font-size: 8px;
              color: #94a3b8;
              font-weight: bold;
            }
            .tag-top {
              width: 100%;
              border-bottom: 1px solid #e2e8f0;
              padding-bottom: 3px;
              margin-bottom: 5px;
              display: flex;
              justify-content: space-between;
              align-items: center;
              padding-right: 36px;
            }
            .tag-brand {
              font-size: 9px;
              font-weight: 800;
              color: #15803d;
              letter-spacing: 0.5px;
            }
            .tag-qr-type {
              font-size: 8px;
              font-weight: 700;
              color: #475569;
              background: #f1f5f9;
              padding: 1px 5px;
              border-radius: 3px;
              border: 1px solid #cbd5e1;
            }
            .tag-content {
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              width: 100%;
              flex: 1;
            }
            .tag-qr-wrap {
              background: #ffffff;
              padding: 4px;
              border-radius: 6px;
              border: 1px solid #cbd5e1;
              display: inline-block;
            }
            .tag-qr-img {
              display: block;
              margin: 0 auto;
            }
            .tag-id-small {
              font-size: 11px;
              font-family: monospace, monospace;
              color: #475569;
              font-weight: 600;
              margin-top: 5px;
              letter-spacing: 0.5px;
            }
            .tag-species-name {
              font-size: 13px;
              font-weight: 700;
              color: #15803d;
              margin-top: 2px;
              max-width: 95%;
              word-break: break-word;
              line-height: 1.25;
            }
            .batch-footer {
              border-top: 1px dashed #cbd5e1;
              padding-top: 3px;
              margin-top: 6px;
              display: flex;
              justify-content: space-between;
              font-size: 9px;
              color: #64748b;
            }
          </style>
        </head>
        <body>
          ${pagesHtml}
        </body>
      </html>
    `;

      await executePrintOrShareDocument(
        fullHtml,
        `Jagori A4 Tree QR Tags - ${dateLabel}`,
        `jagori_batch_${dateLabel}`
      );
    } catch (err) {
      console.warn('Batch print error:', err);
      Alert.alert('Print Error', 'Unable to generate A4 printable sheet.');
    } finally {
      setIsBatchPrinting(false);
    }
  };

  // Helper stats for Dashboard
  const totalTreesCount = trees.length;
  const healthyCount = trees.filter((t) => t.survivalStatus === 'Healthy').length;
  const needsCareCount = trees.filter((t) => t.survivalStatus === 'Needs Care').length;
  const stuntedCount = trees.filter((t) => t.survivalStatus === 'Stunted').length;

  const handleSelectStatusFilter = (filter) => {
    if (selectedStatusFilter === filter) {
      setSelectedStatusFilter('ALL');
    } else {
      setSelectedStatusFilter(filter);
      // Auto-expand all matching dates when filtering so user immediately sees the tree items
      const matchingDates = {};
      trees
        .filter((t) => filter === 'ALL' || t.survivalStatus === filter)
        .forEach((t) => {
          if (t.plantationDate) matchingDates[t.plantationDate] = true;
        });
      setExpandedDates(matchingDates);
    }
  };

  // Filtered Trees for Dashboard Inventory List
  const filteredTrees = trees.filter((t) => {
    if (selectedStatusFilter !== 'ALL' && t.survivalStatus !== selectedStatusFilter) {
      return false;
    }
    if (!dashboardSearchQuery.trim()) return true;
    const q = dashboardSearchQuery.toLowerCase();
    return (
      t.treeId.toLowerCase().includes(q) ||
      t.species.toLowerCase().includes(q) ||
      (t.village && t.village.toLowerCase().includes(q)) ||
      (t.donorName && t.donorName.toLowerCase().includes(q)) ||
      (t.plantationDate && t.plantationDate.toLowerCase().includes(q))
    );
  });

  // Group trees by plantation date for single-date expandable rows
  const groupedTreesByDate = React.useMemo(() => {
    const groups = {};
    filteredTrees.forEach((t) => {
      const d = t.plantationDate || 'Undated';
      if (!groups[d]) {
        groups[d] = [];
      }
      groups[d].push(t);
    });

    return Object.keys(groups)
      .sort((a, b) => new Date(b) - new Date(a))
      .map((date) => ({
        date,
        trees: groups[date],
      }));
  }, [filteredTrees]);

  const toggleDateExpanded = (dateStr) => {
    setExpandedDates((prev) => ({
      ...prev,
      [dateStr]: !prev[dateStr],
    }));
  };

  const toggleExpandAll = () => {
    const allDates = groupedTreesByDate.map((g) => g.date);
    const areAllExpanded =
      allDates.length > 0 && allDates.every((d) => expandedDates[d]);
    if (areAllExpanded) {
      setExpandedDates({});
    } else {
      const allTrue = {};
      allDates.forEach((d) => {
        allTrue[d] = true;
      });
      setExpandedDates(allTrue);
    }
  };

  // Filtered Trees for Update Tree Screen (Real-time search or full list)
  const filteredTreesForUpdate = React.useMemo(() => {
    if (!searchTreeId.trim()) return trees;
    const q = searchTreeId.toLowerCase().trim();
    return trees.filter(
      (t) =>
        t.treeId.toLowerCase().includes(q) ||
        t.species.toLowerCase().includes(q) ||
        (t.village && t.village.toLowerCase().includes(q)) ||
        (t.plantationDate && t.plantationDate.toLowerCase().includes(q)) ||
        (t.donorName && t.donorName.toLowerCase().includes(q))
    );
  }, [trees, searchTreeId]);

  return (
    <KeyboardAvoidingView
      style={styles.keyboardAvoidingContainer}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.mainScrollView}
        contentContainerStyle={[
          styles.container,
          keyboardHeight > 0 && { paddingBottom: keyboardHeight + 120 },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={true}
      >
      {/* ============================================================== */}
      {/* SCREEN 0: PUBLIC READ-ONLY TREE VERIFICATION PAGE (QR SCANNERS) */}
      {/* ============================================================== */}
      {currentScreen === 'PUBLIC_VIEW' && (
        <View style={styles.publicWrapper}>
          {/* Admin Preview Return Banner */}
          {isAdminPreview && (
            <View style={styles.previewModeBanner}>
              <Text style={styles.previewModeText}>
                ADMIN PREVIEW • Read-Only Visitor View
              </Text>
              <TouchableOpacity
                style={styles.previewReturnBtn}
                onPress={() => setCurrentScreen('DASHBOARD')}
              >
                <Text style={styles.previewReturnBtnText}>← Return to Dashboard</Text>
              </TouchableOpacity>
            </View>
          )}

          {isLoadingPublicTree ? (
            <View style={styles.publicLoadingBox}>
              <ActivityIndicator size="large" color="#15803d" />
              <Text style={styles.publicLoadingText}>Loading tree verification profile...</Text>
            </View>
          ) : publicTree ? (
            <View style={styles.publicCard}>
              {/* Official Header */}
              <View style={styles.publicHeader}>
                <View style={styles.publicLogoBadge}>
                  <Text style={styles.publicLogoIcon}>🌿</Text>
                </View>
                <Text style={styles.publicOrgTitle}>JAGORI FOUNDATION</Text>
                <Text style={styles.publicRegistrySubtitle}>
                  Tree Conservation & Verification Registry
                </Text>
                <View style={styles.verifiedPill}>
                  <Text style={styles.verifiedPillText}>✓ CERTIFIED FIELD SPECIMEN</Text>
                </View>
              </View>

              {/* Photo Showcase if available */}
              {publicTree.treePhoto && (
                <View style={styles.publicPhotoWrap}>
                  <Image source={{ uri: publicTree.treePhoto }} style={styles.publicPhoto} />
                  <Text style={styles.publicPhotoVerifiedBadge}>✓ Verified Field Photograph</Text>
                </View>
              )}

              {/* Verified Categories Header */}
              <View style={styles.categorySectionHeader}>
                <Text style={styles.categorySectionTitle}>Official Record (11 Categories)</Text>
              </View>

              {/* 1. TREE ID */}
              <View style={styles.publicCategoryRow}>
                <Text style={styles.publicCategoryIndex}>1</Text>
                <View style={styles.publicCategoryInfo}>
                  <Text style={styles.publicCategoryLabel}>Tree ID</Text>
                  <Text style={styles.publicCategoryValueHighlight}>{publicTree.treeId}</Text>
                </View>
              </View>

              {/* 2. SPECIES */}
              <View style={styles.publicCategoryRow}>
                <Text style={styles.publicCategoryIndex}>2</Text>
                <View style={styles.publicCategoryInfo}>
                  <Text style={styles.publicCategoryLabel}>Species / Tree Name</Text>
                  <Text style={styles.publicCategoryValue}>{publicTree.species}</Text>
                </View>
              </View>

              {/* 3. PLANTATION DATE */}
              <View style={styles.publicCategoryRow}>
                <Text style={styles.publicCategoryIndex}>3</Text>
                <View style={styles.publicCategoryInfo}>
                  <Text style={styles.publicCategoryLabel}>Plantation Date</Text>
                  <Text style={styles.publicCategoryValue}>{publicTree.plantationDate}</Text>
                </View>
              </View>

              {/* 4. GPS LOCATION */}
              <View style={styles.publicCategoryRow}>
                <Text style={styles.publicCategoryIndex}>4</Text>
                <View style={styles.publicCategoryInfo}>
                  <Text style={styles.publicCategoryLabel}>GPS Location</Text>
                  <Text style={styles.publicCategoryValueMono}>
                    {publicTree.lat}, {publicTree.lng}
                  </Text>
                  {publicTree.lat && publicTree.lat !== 'N/A' && (
                    <>
                      <TouchableOpacity
                        style={styles.googleMapsMiniBtn}
                        onPress={() => openGoogleMaps(publicTree.lat, publicTree.lng)}
                      >
                        <Text style={styles.googleMapsMiniBtnText}>🗺️ Open in Google Maps (Turn-by-Turn Navigation)</Text>
                      </TouchableOpacity>

                      {Platform.OS === 'web' && (
                        <View style={styles.mapEmbedWrapper}>
                          <iframe
                            title={`Map for Tree ${publicTree.treeId}`}
                            width="100%"
                            height="220"
                            style={{ border: 0, borderRadius: 10 }}
                            loading="lazy"
                            src={`https://maps.google.com/maps?q=${encodeURIComponent(`${publicTree.lat},${publicTree.lng}`)}&z=16&output=embed`}
                          />
                        </View>
                      )}
                    </>
                  )}
                </View>
              </View>

              {/* 5. DONOR NAME */}
              <View style={styles.publicCategoryRow}>
                <Text style={styles.publicCategoryIndex}>5</Text>
                <View style={styles.publicCategoryInfo}>
                  <Text style={styles.publicCategoryLabel}>Donor / Caretaker Name</Text>
                  <Text style={styles.publicCategoryValue}>{publicTree.donorName}</Text>
                </View>
              </View>

              {/* 6. VILLAGE */}
              <View style={styles.publicCategoryRow}>
                <Text style={styles.publicCategoryIndex}>6</Text>
                <View style={styles.publicCategoryInfo}>
                  <Text style={styles.publicCategoryLabel}>Village / Locality</Text>
                  <Text style={styles.publicCategoryValue}>{publicTree.village}</Text>
                </View>
              </View>

              {/* 7. TREE PHOTO */}
              <View style={styles.publicCategoryRow}>
                <Text style={styles.publicCategoryIndex}>7</Text>
                <View style={styles.publicCategoryInfo}>
                  <Text style={styles.publicCategoryLabel}>Tree Photo</Text>
                  <Text style={styles.publicCategoryValue}>
                    {publicTree.treePhoto ? '✓ Captured & Verified On-Site' : 'No photo uploaded'}
                  </Text>
                </View>
              </View>

              {/* 8. HEIGHT */}
              <View style={styles.publicCategoryRow}>
                <Text style={styles.publicCategoryIndex}>8</Text>
                <View style={styles.publicCategoryInfo}>
                  <Text style={styles.publicCategoryLabel}>Height</Text>
                  <Text style={styles.publicCategoryValue}>{publicTree.height}</Text>
                </View>
              </View>

              {/* 9. GIRTH */}
              <View style={styles.publicCategoryRow}>
                <Text style={styles.publicCategoryIndex}>9</Text>
                <View style={styles.publicCategoryInfo}>
                  <Text style={styles.publicCategoryLabel}>Girth (Trunk Circumference)</Text>
                  <Text style={styles.publicCategoryValue}>{publicTree.girth}</Text>
                </View>
              </View>

              {/* 10. LAST INSPECTION */}
              <View style={styles.publicCategoryRow}>
                <Text style={styles.publicCategoryIndex}>10</Text>
                <View style={styles.publicCategoryInfo}>
                  <Text style={styles.publicCategoryLabel}>Last Inspection</Text>
                  <Text style={styles.publicCategoryValue}>{publicTree.lastInspection}</Text>
                </View>
              </View>

              {/* 11. SURVIVAL STATUS */}
              <View style={[styles.publicCategoryRow, { borderBottomWidth: 0 }]}>
                <Text style={styles.publicCategoryIndex}>11</Text>
                <View style={styles.publicCategoryInfo}>
                  <Text style={styles.publicCategoryLabel}>Survival Status</Text>
                  <View
                    style={[
                      styles.publicStatusBadge,
                      {
                        backgroundColor: getStatusBadgeStyle(publicTree.survivalStatus).bg,
                        borderColor: getStatusBadgeStyle(publicTree.survivalStatus).border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.publicStatusText,
                        { color: getStatusBadgeStyle(publicTree.survivalStatus).text },
                      ]}
                    >
                      {getStatusBadgeStyle(publicTree.survivalStatus).icon} {publicTree.survivalStatus}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Environmental Notice */}
              <View style={styles.publicNoticeBox}>
                <Text style={styles.publicNoticeIcon}>🌱</Text>
                <Text style={styles.publicNoticeText}>
                  This specimen is actively monitored and protected under Jagori Charitable Trust.
                </Text>
              </View>

              {/* Institutional Footer */}
              <View style={styles.publicFooter}>
                <Text style={styles.publicFooterText}>
                  Jagori Charitable Trust
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.publicCard}>
              <Text style={styles.publicOrgTitle}>Tree Not Found</Text>
              <Text style={styles.emptyTreesSub}>
                Unable to locate this tree in the official registry.
              </Text>
            </View>
          )}
        </View>
      )}

      {/* ============================================================== */}
      {/* SCREEN 1: ADMIN DASHBOARD */}
      {/* ============================================================== */}
      {currentScreen === 'DASHBOARD' && (
        <View style={styles.dashboardWrapper}>
          {/* Dashboard Header Box */}
          <View style={styles.dashboardHeaderCard}>
            <View style={styles.dashboardHeaderCardInner}>
              <View style={styles.dashboardLogoBadge}>
                <Text style={styles.dashboardLogoIcon}>🌳</Text>
              </View>
              <View style={styles.dashboardHeaderTextWrap}>
                <Text style={styles.dashboardHeaderTitle}>Jagori Tree Plantation Registry</Text>
                <Text style={styles.dashboardHeaderSubtitle}>
                  Jagori Charitable Trust
                </Text>
              </View>
            </View>

            {/* Cloud Sync Status & Donor Export Bar */}
            <View style={styles.dashboardActionBar}>
              <TouchableOpacity
                style={[
                  styles.syncStatusBadge,
                  cloudSyncStatus === 'SYNCED' && styles.syncStatusBadgeSuccess,
                  cloudSyncStatus === 'PENDING' && styles.syncStatusBadgePending,
                  cloudSyncStatus === 'SYNCING' && styles.syncStatusBadgeSyncing,
                  cloudSyncStatus === 'OFFLINE' && styles.syncStatusBadgeOffline,
                ]}
                onPress={syncPendingTreesWithCloud}
                disabled={isSyncing}
              >
                {isSyncing ? (
                  <ActivityIndicator size="small" color="#15803d" />
                ) : (
                  <Text style={styles.syncStatusBadgeText}>
                    {cloudSyncStatus === 'SYNCED' && '🟢 Cloud Synced'}
                    {cloudSyncStatus === 'PENDING' && `🟠 ${pendingSyncCount} Pending Sync • Tap to Sync`}
                    {cloudSyncStatus === 'SYNCING' && '🔄 Syncing to Cloud...'}
                    {cloudSyncStatus === 'OFFLINE' && '📶 Offline Mode • Tap to Retry'}
                  </Text>
                )}
              </TouchableOpacity>

              <View style={styles.headerRightActions}>
                <TouchableOpacity
                  style={styles.batchPrintHeaderBtn}
                  onPress={() => setShowBatchPrintModal(true)}
                >
                  <Text style={styles.batchPrintHeaderBtnText}>🖨️ Batch A4 QRs</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.csvExportBtn}
                  onPress={handleExportCSV}
                >
                  <Text style={styles.csvExportBtnText}>📥 Export CSV</Text>
                </TouchableOpacity>

              </View>
            </View>
          </View>

          {/* Registry Stats Overview (Interactive: Click to filter tree records) */}
          <View style={styles.statsRow}>
            {/* 1. Total Trees */}
            <TouchableOpacity
              style={[
                styles.statBox,
                selectedStatusFilter === 'ALL' && styles.statBoxActiveTotal,
              ]}
              activeOpacity={0.7}
              onPress={() => handleSelectStatusFilter('ALL')}
            >
              {isLoadingTrees ? (
                <ActivityIndicator size="small" color="#15803d" />
              ) : (
                <Text style={styles.statNum}>{totalTreesCount}</Text>
              )}
              <Text style={styles.statLabel}>Total Trees</Text>
            </TouchableOpacity>

            {/* 2. Healthy */}
            <TouchableOpacity
              style={[
                styles.statBox,
                selectedStatusFilter === 'Healthy' && styles.statBoxActiveHealthy,
              ]}
              activeOpacity={0.7}
              onPress={() => handleSelectStatusFilter('Healthy')}
            >
              <Text style={[styles.statNum, { color: '#15803d' }]}>{healthyCount}</Text>
              <Text style={styles.statLabel}>Healthy 🟢</Text>
            </TouchableOpacity>

            {/* 3. Needs Care */}
            <TouchableOpacity
              style={[
                styles.statBox,
                selectedStatusFilter === 'Needs Care' && styles.statBoxActiveNeedsCare,
              ]}
              activeOpacity={0.7}
              onPress={() => handleSelectStatusFilter('Needs Care')}
            >
              <Text style={[styles.statNum, { color: '#d97706' }]}>{needsCareCount}</Text>
              <Text style={styles.statLabel}>Needs Care 🟡</Text>
            </TouchableOpacity>

            {/* 4. Stunted */}
            <TouchableOpacity
              style={[
                styles.statBox,
                selectedStatusFilter === 'Stunted' && styles.statBoxActiveStunted,
              ]}
              activeOpacity={0.7}
              onPress={() => handleSelectStatusFilter('Stunted')}
            >
              <Text style={[styles.statNum, { color: '#ea580c' }]}>{stuntedCount}</Text>
              <Text style={styles.statLabel}>Stunted 🟠</Text>
            </TouchableOpacity>
          </View>

          {/* Management Modules */}
          <TouchableOpacity
            style={styles.actionCardAdd}
            activeOpacity={0.85}
            onPress={() => {
              handleResetAddForm();
              setCurrentScreen('ADD_TREE');
            }}
          >
            <View style={styles.actionIconWrapAdd}>
              <Text style={styles.actionIcon}>🌱</Text>
            </View>
            <View style={styles.actionContent}>
              <View style={styles.actionHeaderRow}>
                <Text style={styles.actionTitleAdd}>Add Tree</Text>
                <View style={styles.newBadge}>
                  <Text style={styles.newBadgeText}>NEW RECORD</Text>
                </View>
              </View>
            </View>
            <Text style={styles.actionArrow}>➔</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCardUpdate}
            activeOpacity={0.85}
            onPress={() => {
              setSelectedTree(null);
              setSearchTreeId('');
              setCurrentScreen('UPDATE_TREE');
            }}
          >
            <View style={styles.actionIconWrapUpdate}>
              <Text style={styles.actionIcon}>📝</Text>
            </View>
            <View style={styles.actionContent}>
              <View style={styles.actionHeaderRow}>
                <Text style={styles.actionTitleUpdate}>Update Tree</Text>
                <View style={styles.inspectBadge}>
                  <Text style={styles.inspectBadgeText}>AUDIT & EDIT</Text>
                </View>
              </View>
            </View>
            <Text style={styles.actionArrow}>➔</Text>
          </TouchableOpacity>

          {/* ============================================================== */}
          {/* TREES BY PLANTATION DATE (INTERACTIVE SINGLE-DATE ROWS) */}
          {/* ============================================================== */}
          <View style={styles.registrySectionContainer}>
            <View style={styles.registryHeaderRow}>
              <View>
                <Text style={styles.dashboardSectionHeader}>
                  {selectedStatusFilter === 'ALL'
                    ? 'Trees by Plantation Date'
                    : `${selectedStatusFilter} Trees`}
                </Text>
                <Text style={styles.registrySubtitle}>
                  {filteredTrees.length} {filteredTrees.length === 1 ? 'tree' : 'trees'} across {groupedTreesByDate.length} {groupedTreesByDate.length === 1 ? 'date' : 'dates'} • Tap date to view
                </Text>
              </View>

              {groupedTreesByDate.length > 0 && (
                <TouchableOpacity
                  style={styles.expandAllBtn}
                  onPress={toggleExpandAll}
                >
                  <Text style={styles.expandAllBtnText}>
                    {groupedTreesByDate.every((g) => expandedDates[g.date]) ? 'Collapse All' : 'Expand All'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Active Status Filter Indicator Banner */}
            {selectedStatusFilter !== 'ALL' && (
              <View style={styles.activeFilterBanner}>
                <View style={styles.activeFilterTextRow}>
                  <Text style={styles.activeFilterLabel}>
                    Showing:{' '}
                    <Text style={styles.activeFilterValue}>
                      {selectedStatusFilter === 'Healthy' && '🟢 Healthy'}
                      {selectedStatusFilter === 'Needs Care' && '🟡 Needs Care'}
                      {selectedStatusFilter === 'Stunted' && '🟠 Stunted'}
                      {selectedStatusFilter === 'Dead' && '🔴 Dead'}
                    </Text>
                  </Text>
                  <Text style={styles.activeFilterCount}>
                    ({filteredTrees.length} {filteredTrees.length === 1 ? 'tree' : 'trees'})
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.clearFilterBtn}
                  onPress={() => setSelectedStatusFilter('ALL')}
                >
                  <Text style={styles.clearFilterBtnText}>Show All Trees ✕</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Quick Filter Search */}
            <View style={styles.filterSearchBox}>
              <Text style={styles.filterSearchIcon}>🔍</Text>
              <TextInput
                style={styles.filterSearchInput}
                placeholder="Search by ID, species, village, date..."
                placeholderTextColor="#94a3b8"
                value={dashboardSearchQuery}
                onChangeText={setDashboardSearchQuery}
              />
              {dashboardSearchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setDashboardSearchQuery('')}>
                  <Text style={styles.filterClearIcon}>✕</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Date Rows */}
            {groupedTreesByDate.length > 0 ? (
              groupedTreesByDate.map((group) => {
                const isExpanded = Boolean(
                  expandedDates[group.date] ||
                  dashboardSearchQuery.trim() ||
                  selectedStatusFilter !== 'ALL'
                );
                return (
                  <View key={group.date} style={styles.dateGroupWrapper}>
                    {/* Interactive Date Row with Direct A4 Print Action */}
                    <View style={[styles.dateRow, isExpanded && styles.dateRowActive]}>
                      <TouchableOpacity
                        style={styles.dateRowLeftClickable}
                        activeOpacity={0.7}
                        onPress={() => toggleDateExpanded(group.date)}
                      >
                        <View style={styles.dateIconWrap}>
                          <Text style={styles.dateIcon}>📅</Text>
                        </View>
                        <View>
                          <Text style={styles.dateTitle}>{group.date}</Text>
                          <Text style={styles.dateSubtitle}>
                            {group.trees.length} {group.trees.length === 1 ? 'tree planted' : 'trees planted'}
                          </Text>
                        </View>
                      </TouchableOpacity>

                      <View style={styles.dateRowRight}>
                        <TouchableOpacity
                          style={styles.dateBatchPrintBtn}
                          activeOpacity={0.75}
                          onPress={() => handlePrintBatchA4Sheet(group.trees, group.date)}
                        >
                          <Text style={styles.dateBatchPrintBtnText}>🖨️ A4 QRs</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.dateExpandToggleBtn}
                          activeOpacity={0.7}
                          onPress={() => toggleDateExpanded(group.date)}
                        >
                          <View style={styles.dateCountPill}>
                            <Text style={styles.dateCountPillText}>
                              {group.trees.length} {group.trees.length === 1 ? 'Tree' : 'Trees'}
                            </Text>
                          </View>
                          <Text style={styles.dateChevron}>{isExpanded ? '▲' : '▼'}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* All Trees Planted on this Date (Shown when clicked) */}
                    {isExpanded && (
                      <View style={styles.dateTreesList}>
                        {group.trees.map((item) => {
                          const statusStyle = getStatusBadgeStyle(item.survivalStatus);
                          return (
                            <TouchableOpacity
                              key={item.treeId}
                              style={styles.treeRecordCard}
                              activeOpacity={0.8}
                              onPress={() => {
                                applySelectedTree(item);
                                setSearchTreeId(item.treeId);
                                setCurrentScreen('UPDATE_TREE');
                              }}
                            >
                              {/* Header: Tree ID & Survival Status */}
                              <View style={styles.treeRecordTop}>
                                <View style={styles.treeRecordIdWrap}>
                                  <Text style={styles.treeRecordIdText}>{item.treeId}</Text>
                                </View>
                                <View
                                  style={[
                                    styles.treeRecordStatusBadge,
                                    {
                                      backgroundColor: statusStyle.bg,
                                      borderColor: statusStyle.border,
                                    },
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.treeRecordStatusText,
                                      { color: statusStyle.text },
                                    ]}
                                  >
                                    {statusStyle.icon} {item.survivalStatus}
                                  </Text>
                                </View>
                              </View>

                              {/* Middle Info: Species & Donor/Caretaker */}
                              <View style={styles.treeRecordMetaRow}>
                                <View style={styles.treeRecordMetaItem}>
                                  <Text style={styles.treeRecordMetaLabel}>SPECIES</Text>
                                  <Text style={styles.treeRecordSpeciesVal}>🌿 {item.species}</Text>
                                </View>
                                <View style={styles.treeRecordMetaItemRight}>
                                  <Text style={styles.treeRecordMetaLabel}>DONOR / CARETAKER</Text>
                                  <Text style={styles.treeRecordPlantedVal}>{item.donorName}</Text>
                                </View>
                              </View>

                              {/* Footer: Village & Edit Hint */}
                              <View style={styles.treeRecordFooter}>
                                <Text style={styles.treeRecordVillageText}>
                                  📍 {item.village || 'Field Registry'} {item.height ? `• 📏 ${item.height}` : ''}
                                </Text>
                                <Text style={styles.treeRecordActionHint}>
                                  Edit ➔
                                </Text>
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}
                  </View>
                );
              })
            ) : (
              <View style={styles.emptyTreesBox}>
                <Text style={styles.emptyTreesIcon}>🌱</Text>
                <Text style={styles.emptyTreesTitle}>No matching trees found</Text>
                <Text style={styles.emptyTreesSub}>
                  {dashboardSearchQuery
                    ? 'Try clearing your search query'
                    : 'Tap "+ Add Tree" to register your first tree'}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.footerNote}>
            <Text style={styles.footerNoteText}>
              Jagori Charitable Trust
            </Text>
          </View>
        </View>
      )}

      {/* ============================================================== */}
      {/* SCREEN 2: ADD TREE */}
      {/* ============================================================== */}
      {currentScreen === 'ADD_TREE' && (
        <View style={styles.screenWrapper}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => setCurrentScreen('DASHBOARD')}
          >
            <Text style={styles.backBtnText}>← Back to Dashboard</Text>
          </TouchableOpacity>

          {!savedTree ? (
            <View style={styles.card}>
              {/* 1. TREE ID */}
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionNum}>1</Text>
                <Text style={styles.label}>Tree ID</Text>
              </View>
              <View style={styles.idRow}>
                <TextInput
                  style={[styles.input, styles.idInput]}
                  value={treeId}
                  onChangeText={setTreeId}
                  placeholder="e.g. JGF-2026-1234"
                />
                <TouchableOpacity
                  style={styles.regenerateBtn}
                  onPress={() => setTreeId(generateNewTreeId())}
                >
                  <Text style={styles.regenerateBtnText}>🔄 New</Text>
                </TouchableOpacity>
              </View>

              {/* 2. SPECIES */}
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionNum}>2</Text>
                <Text style={styles.label}>Species / Tree Name</Text>
              </View>
              <TextInput
                style={styles.input}
                placeholder="e.g. Neem, Peepal, Banyan, Teak"
                value={species}
                onChangeText={setSpecies}
              />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.speciesChipsContainer}
              >
                {COMMON_SPECIES.map((s) => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.chip, species === s && styles.chipActive]}
                    onPress={() => setSpecies(s)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        species === s && styles.chipTextActive,
                      ]}
                    >
                      {s}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* 3. PLANTATION DATE */}
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionNum}>3</Text>
                <Text style={styles.label}>Plantation Date</Text>
              </View>
              <TextInput
                style={styles.input}
                placeholder="YYYY-MM-DD"
                value={plantationDate}
                onChangeText={setPlantationDate}
              />

              {/* 4. GPS LOCATION */}
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionNum}>4</Text>
                <Text style={styles.label}>GPS Location</Text>
              </View>

              <TouchableOpacity
                style={styles.locationBtn}
                onPress={fetchLocation}
                disabled={isLocating}
              >
                {isLocating ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.btnText}>
                    {latitude && longitude
                      ? '📍 Refresh GPS (Auto-Detect)'
                      : '📍 Auto-Fetch Current GPS'}
                  </Text>
                )}
              </TouchableOpacity>

              <View style={styles.orRow}>
                <View style={styles.orLine} />
                <Text style={styles.orText}>OR ENTER MANUALLY</Text>
                <View style={styles.orLine} />
              </View>

              <View style={styles.coordColumnsRow}>
                <View style={styles.coordColumn}>
                  <Text style={styles.subFieldLabel}>Latitude (°N/S)</Text>
                  <TextInput
                    style={styles.coordInput}
                    placeholder="e.g. 32.219042"
                    value={latitude}
                    onChangeText={setLatitude}
                    keyboardType="numbers-and-punctuation"
                  />
                </View>
                <View style={styles.coordColumn}>
                  <Text style={styles.subFieldLabel}>Longitude (°E/W)</Text>
                  <TextInput
                    style={styles.coordInput}
                    placeholder="e.g. 76.323404"
                    value={longitude}
                    onChangeText={setLongitude}
                    keyboardType="numbers-and-punctuation"
                  />
                </View>
              </View>

              {latitude && longitude ? (
                <View style={styles.gpsBox}>
                  <Text style={styles.gpsText}>
                    📍 Tagged: {latitude}, {longitude}
                  </Text>
                </View>
              ) : (
                <Text style={styles.hintText}>
                  Auto-fetch GPS or manually enter Latitude & Longitude in the columns above
                </Text>
              )}

              {/* 5. DONOR NAME */}
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionNum}>5</Text>
                <Text style={styles.label}>Donor Name</Text>
              </View>
              <TextInput
                style={styles.input}
                placeholder="e.g. Community Donor / Sunita Sharma"
                value={donorName}
                onChangeText={setDonorName}
              />

              {/* 6. VILLAGE */}
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionNum}>6</Text>
                <Text style={styles.label}>Village / Location</Text>
              </View>
              <TextInput
                style={styles.input}
                placeholder="e.g. Dharamsala, Rait, Kangra"
                value={village}
                onChangeText={setVillage}
              />

              {/* 7. TREE PHOTO */}
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionNum}>7</Text>
                <Text style={styles.label}>Tree Photo</Text>
              </View>
              {treePhoto ? (
                <View style={styles.photoPreviewWrapper}>
                  <Image source={{ uri: treePhoto }} style={styles.photoPreview} />
                  <View style={styles.photoActionsRow}>
                    <TouchableOpacity
                      style={styles.photoChangeBtn}
                      onPress={() =>
                        pickPhotoFromGallery((uri, b64) => {
                          setTreePhoto(uri);
                          setTreePhotoBase64(b64);
                        })
                      }
                    >
                      <Text style={styles.photoBtnSmallText}>Change</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.photoRemoveBtn}
                      onPress={() => {
                        setTreePhoto(null);
                        setTreePhotoBase64(null);
                      }}
                    >
                      <Text style={styles.photoBtnSmallText}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View style={styles.photoButtonsRow}>
                  <TouchableOpacity
                    style={styles.photoBtn}
                    onPress={() =>
                      pickPhotoFromCamera((uri, b64) => {
                        setTreePhoto(uri);
                        setTreePhotoBase64(b64);
                      })
                    }
                  >
                    <Text style={styles.photoBtnText}>📷 Camera</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.photoBtn}
                    onPress={() =>
                      pickPhotoFromGallery((uri, b64) => {
                        setTreePhoto(uri);
                        setTreePhotoBase64(b64);
                      })
                    }
                  >
                    <Text style={styles.photoBtnText}>🖼️ Gallery</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* 8. HEIGHT */}
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionNum}>8</Text>
                <Text style={styles.label}>Height</Text>
              </View>
              <TextInput
                style={styles.input}
                placeholder="e.g. 4.5 ft or 1.4 m"
                value={height}
                onChangeText={setHeight}
              />

              {/* 9. GIRTH */}
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionNum}>9</Text>
                <Text style={styles.label}>Girth (Trunk Circumference)</Text>
              </View>
              <TextInput
                style={styles.input}
                placeholder="e.g. 15 cm or 6 in"
                value={girth}
                onChangeText={setGirth}
              />

              {/* 10. LAST INSPECTION */}
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionNum}>10</Text>
                <Text style={styles.label}>Last Inspection</Text>
              </View>
              <TextInput
                style={styles.input}
                placeholder="YYYY-MM-DD"
                value={lastInspection}
                onChangeText={setLastInspection}
              />

              {/* 11. SURVIVAL STATUS */}
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionNum}>11</Text>
                <Text style={styles.label}>Survival Status</Text>
              </View>
              <View style={styles.statusOptionsContainer}>
                {SURVIVAL_STATUS_OPTIONS.map((item) => {
                  const isSelected = survivalStatus === item.label;
                  return (
                    <TouchableOpacity
                      key={item.label}
                      style={[
                        styles.statusOptionBtn,
                        { borderColor: item.color },
                        isSelected && { backgroundColor: item.bg, borderWidth: 2 },
                      ]}
                      onPress={() => setSurvivalStatus(item.label)}
                    >
                      <Text style={styles.statusOptionIcon}>{item.icon}</Text>
                      <Text
                        style={[
                          styles.statusOptionText,
                          { color: item.color },
                          isSelected && { fontWeight: 'bold' },
                        ]}
                      >
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* SUBMIT BUTTON */}
              <TouchableOpacity
                style={styles.saveBtn}
                onPress={handleSaveNewTree}
                disabled={isSaving}
              >
                {isSaving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.btnText}>🌱 Save Tree & Generate QR</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={styles.cardHeader}>✅ Tree Successfully Tagged!</Text>
              <Text style={styles.treeId}>{savedTree.treeId}</Text>

              <View style={styles.qrWrapper}>
                <View style={styles.qrToggleRow}>
                  <TouchableOpacity
                    style={[styles.qrToggleBtn, qrCodeType === 'OFFLINE' && styles.qrToggleBtnActive]}
                    onPress={() => setQrCodeType('OFFLINE')}
                  >
                    <Text
                      style={[
                        styles.qrToggleBtnText,
                        qrCodeType === 'OFFLINE' && styles.qrToggleBtnTextActive,
                      ]}
                    >
                      📴 Offline Info (No Wi-Fi)
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.qrToggleBtn, qrCodeType === 'WEB' && styles.qrToggleBtnActive]}
                    onPress={() => setQrCodeType('WEB')}
                  >
                    <Text
                      style={[
                        styles.qrToggleBtnText,
                        qrCodeType === 'WEB' && styles.qrToggleBtnTextActive,
                      ]}
                    >
                      🌐 Web Link
                    </Text>
                  </TouchableOpacity>
                </View>

                <QRCode
                  value={
                    qrCodeType === 'OFFLINE'
                      ? (savedTree.qrText || buildTreeQrText(savedTree))
                      : savedTree.url
                  }
                  size={170}
                />
                <Text style={styles.qrTreeIdSmall}>{savedTree.treeId}</Text>
                <Text style={styles.qrSpeciesBelow}>{savedTree.species}</Text>
                <Text style={styles.qrUrlText}>
                  {qrCodeType === 'OFFLINE'
                    ? '✓ Self-contained specimen record. Works on ANY phone camera without Wi-Fi or internet.'
                    : savedTree.url}
                </Text>
              </View>

              <View style={styles.qrScannableNote}>
                <Text style={styles.qrScannableText}>
                  {qrCodeType === 'OFFLINE'
                    ? '📱 Anyone scanning this QR tag with an iPhone or Android camera immediately sees all tree details & GPS location without needing any network or app.'
                    : '📱 Anyone scanning this QR code will see the read-only public web certificate without edit access.'}
                </Text>
              </View>

              <TouchableOpacity
                style={styles.previewPublicBtn}
                onPress={() => {
                  setPublicTree(savedTree);
                  setIsAdminPreview(true);
                  setCurrentScreen('PUBLIC_VIEW');
                }}
              >
                <Text style={styles.previewPublicBtnText}>
                  👁️ Preview Public Scanner Page
                </Text>
              </TouchableOpacity>

              {savedTree.treePhoto && (
                <View style={styles.summaryPhotoContainer}>
                  <Image source={{ uri: savedTree.treePhoto }} style={styles.summaryPhoto} />
                </View>
              )}

              <Text style={styles.summarySubheading}>
                Tree Record Details (In Sequence):
              </Text>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>1. Tree ID:</Text>
                <Text style={[styles.detailValue, styles.detailBold]}>{savedTree.treeId}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>2. Species:</Text>
                <Text style={styles.detailValue}>{savedTree.species}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>3. Plantation Date:</Text>
                <Text style={styles.detailValue}>{savedTree.plantationDate}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>4. GPS Location:</Text>
                <Text style={styles.detailValue}>
                  {savedTree.lat}, {savedTree.lng}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>5. Donor Name:</Text>
                <Text style={styles.detailValue}>{savedTree.donorName}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>6. Village:</Text>
                <Text style={styles.detailValue}>{savedTree.village}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>7. Tree Photo:</Text>
                <Text style={styles.detailValue}>
                  {savedTree.treePhoto ? 'Attached 📷' : 'None'}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>8. Height:</Text>
                <Text style={styles.detailValue}>{savedTree.height}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>9. Girth:</Text>
                <Text style={styles.detailValue}>{savedTree.girth}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>10. Last Inspection:</Text>
                <Text style={styles.detailValue}>{savedTree.lastInspection}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>11. Survival Status:</Text>
                <View style={styles.statusBadgeWrap}>
                  <Text style={styles.statusBadgeText}>{savedTree.survivalStatus}</Text>
                </View>
              </View>

              <TouchableOpacity
                style={styles.pdfBtn}
                onPress={() => handleExportPDF(savedTree)}
              >
                <Text style={styles.btnText}>🖨️ Export Printable QR Slip (PDF)</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.batchPrintTodayBtn}
                onPress={() => {
                  const todayBatch = trees.filter(
                    (t) => (t.plantationDate || todayStr) === (savedTree.plantationDate || todayStr)
                  );
                  handlePrintBatchA4Sheet(todayBatch, savedTree.plantationDate || todayStr);
                }}
              >
                <Text style={styles.batchPrintTodayBtnText}>
                  🖨️ Print All Trees Planted on {savedTree.plantationDate} (A4 Sheet)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.resetBtn} onPress={handleResetAddForm}>
                <Text style={styles.resetBtnText}>+ Tag Next Tree</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.resetBtn, { marginTop: 8, borderColor: '#388e3c' }]}
                onPress={() => setCurrentScreen('DASHBOARD')}
              >
                <Text style={[styles.resetBtnText, { color: '#2e7d32' }]}>
                  ← Back to Dashboard
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* ============================================================== */}
      {/* SCREEN 3: UPDATE TREE */}
      {/* ============================================================== */}
      {currentScreen === 'UPDATE_TREE' && (
        <View style={styles.screenWrapper}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => setCurrentScreen('DASHBOARD')}
          >
            <Text style={styles.backBtnText}>← Back to Dashboard</Text>
          </TouchableOpacity>

          <Text style={styles.screenTitle}>Update Tree Record</Text>

          {/* List of All Planted Trees (When no tree is actively selected) */}
          {!selectedTree ? (
            <View style={styles.updateTreesListContainer}>
              {/* Search Box Card */}
              <View style={styles.card}>
                <Text style={styles.label}>Search Planted Trees</Text>
                <View style={styles.searchRow}>
                  <TextInput
                    style={[styles.input, styles.searchInput]}
                    placeholder="Search by ID, species, village, date..."
                    value={searchTreeId}
                    onChangeText={setSearchTreeId}
                    autoCapitalize="none"
                  />
                  {searchTreeId.length > 0 && (
                    <TouchableOpacity
                      style={styles.searchClearBtn}
                      onPress={() => setSearchTreeId('')}
                    >
                      <Text style={styles.searchClearBtnText}>✕</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={styles.searchBtn}
                    onPress={() => handleSearchTree(searchTreeId)}
                    disabled={isSearching}
                  >
                    {isSearching ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.searchBtnText}>🔍 Find</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              {/* Section Header */}
              <View style={styles.updateSectionHeaderRow}>
                <View>
                  <Text style={styles.dashboardSectionHeader}>
                    All Planted Trees ({filteredTreesForUpdate.length})
                  </Text>
                  <Text style={styles.registrySubtitle}>
                    Tap any tree below to edit growth measurements, survival status & photos
                  </Text>
                </View>
              </View>

              {/* Full List of Trees */}
              {filteredTreesForUpdate.length > 0 ? (
                filteredTreesForUpdate.map((item) => {
                  const statusStyle = getStatusBadgeStyle(item.survivalStatus);
                  return (
                    <TouchableOpacity
                      key={item.treeId}
                      style={styles.treeRecordCard}
                      activeOpacity={0.8}
                      onPress={() => {
                        applySelectedTree(item);
                        setSearchTreeId(item.treeId);
                      }}
                    >
                      {/* Top: Tree ID & Status Badge */}
                      <View style={styles.treeRecordTop}>
                        <View style={styles.treeRecordIdWrap}>
                          <Text style={styles.treeRecordIdText}>{item.treeId}</Text>
                        </View>
                        <View
                          style={[
                            styles.treeRecordStatusBadge,
                            {
                              backgroundColor: statusStyle.bg,
                              borderColor: statusStyle.border,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.treeRecordStatusText,
                              { color: statusStyle.text },
                            ]}
                          >
                            {statusStyle.icon} {item.survivalStatus}
                          </Text>
                        </View>
                      </View>

                      {/* Middle: Species & Plantation Date */}
                      <View style={styles.treeRecordMetaRow}>
                        <View style={styles.treeRecordMetaItem}>
                          <Text style={styles.treeRecordMetaLabel}>SPECIES</Text>
                          <Text style={styles.treeRecordSpeciesVal}>🌿 {item.species}</Text>
                        </View>
                        <View style={styles.treeRecordMetaItemRight}>
                          <Text style={styles.treeRecordMetaLabel}>PLANTATION DATE</Text>
                          <Text style={styles.treeRecordPlantedVal}>📅 {item.plantationDate}</Text>
                        </View>
                      </View>

                      {/* Footer: Village & Edit Hint */}
                      <View style={styles.treeRecordFooter}>
                        <Text style={styles.treeRecordVillageText}>
                          📍 {item.village || 'Field Registry'} {item.height ? `• 📏 ${item.height}` : ''}
                        </Text>
                        <View style={styles.editTreeBadgeBtn}>
                          <Text style={styles.editTreeBadgeBtnText}>✏️ Edit Tree ➔</Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })
              ) : (
                <View style={styles.emptyTreesBox}>
                  <Text style={styles.emptyTreesTitle}>
                    {'No trees found matching "' + searchTreeId + '"'}
                  </Text>
                  <Text style={styles.emptyTreesSub}>Try clearing your search term</Text>
                </View>
              )}
            </View>
          ) : (
            <View>
              {/* Active Tree Banner with Back to All Trees List Button */}
              <View style={styles.selectedTreeBanner}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.selectedTreeBannerTitle}>Currently Editing</Text>
                  <Text style={styles.selectedTreeBannerId}>
                    {selectedTree.treeId} • {selectedTree.species}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.changeTreeBtn}
                  onPress={() => {
                    setSelectedTree(null);
                    setSearchTreeId('');
                  }}
                >
                  <Text style={styles.changeTreeBtnText}>← All Trees List</Text>
                </TouchableOpacity>
              </View>

              {/* Display & Update Tree Info Card */}
              <View style={styles.card}>
              <View style={styles.treeFoundHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.treeFoundId}>{selectedTree.treeId}</Text>
                  <Text style={styles.treeFoundSub}>
                    Planted on {selectedTree.plantationDate} in {selectedTree.village}
                  </Text>
                  <View style={styles.permanentQrBadge}>
                    <Text style={styles.permanentQrBadgeText}>✓ Permanent QR Tag Active</Text>
                  </View>
                </View>
                <View style={styles.miniQrBadge}>
                  <QRCode value={selectedTree.url} size={64} />
                </View>
              </View>

              {/* Informational banner about existing QR code */}
              <View style={styles.qrSyncNoticeBox}>
                <Text style={styles.qrSyncNoticeIcon}>🔗</Text>
                <Text style={styles.qrSyncNoticeText}>
                  Editing this tree updates the original record directly. The physical QR tag attached to this tree remains permanent — anyone scanning it will automatically see these updated records. No new QR code needed.
                </Text>
              </View>

              {/* Public Preview Button for Admin */}
              <TouchableOpacity
                style={styles.previewPublicBtnSmall}
                onPress={() => {
                  setPublicTree(selectedTree);
                  setIsAdminPreview(true);
                  setCurrentScreen('PUBLIC_VIEW');
                }}
              >
                <Text style={styles.previewPublicBtnSmallText}>
                  👁️ Preview Public Scanner Page (What Visitors See)
                </Text>
              </TouchableOpacity>

              <Text style={styles.summarySubheading}>Tree Information (In Sequence):</Text>

              {/* 1. Tree ID */}
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>1. Tree ID:</Text>
                <Text style={[styles.detailValue, styles.detailBold]}>
                  {selectedTree.treeId}
                </Text>
              </View>

              {/* 2. Species */}
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>2. Species:</Text>
                <TextInput
                  style={[styles.inlineInput, { width: 140 }]}
                  value={updateSpecies}
                  onChangeText={setUpdateSpecies}
                />
              </View>

              {/* 3. Plantation Date */}
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>3. Plantation Date:</Text>
                <Text style={styles.detailValue}>{selectedTree.plantationDate}</Text>
              </View>

              {/* 4. GPS Location */}
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>4. GPS Location:</Text>
                <Text style={styles.detailValue}>
                  {selectedTree.lat}, {selectedTree.lng}
                </Text>
              </View>

              {/* 5. Donor Name */}
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>5. Donor Name:</Text>
                <TextInput
                  style={[styles.inlineInput, { width: 160 }]}
                  value={updateDonorName}
                  onChangeText={setUpdateDonorName}
                />
              </View>

              {/* 6. Village */}
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>6. Village:</Text>
                <TextInput
                  style={[styles.inlineInput, { width: 140 }]}
                  value={updateVillage}
                  onChangeText={setUpdateVillage}
                />
              </View>

              {/* 7. Tree Photo */}
              <View style={{ marginVertical: 10 }}>
                <Text style={styles.detailLabel}>7. Tree Photo:</Text>
                {updatePhoto ? (
                  <View style={{ alignItems: 'center', marginTop: 8 }}>
                    <Image source={{ uri: updatePhoto }} style={styles.updatePhotoPreview} />
                    <View style={styles.photoActionsRow}>
                      <TouchableOpacity
                        style={styles.photoChangeBtn}
                        onPress={() =>
                          pickPhotoFromGallery((uri, b64) => {
                            setUpdatePhoto(uri);
                            setUpdatePhotoBase64(b64);
                          })
                        }
                      >
                        <Text style={styles.photoBtnSmallText}>Change Photo</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.photoRemoveBtn}
                        onPress={() => {
                          setUpdatePhoto(null);
                          setUpdatePhotoBase64(null);
                        }}
                      >
                        <Text style={styles.photoBtnSmallText}>Remove</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <View style={[styles.photoButtonsRow, { marginTop: 6 }]}>
                    <TouchableOpacity
                      style={styles.photoBtn}
                      onPress={() =>
                        pickPhotoFromCamera((uri, b64) => {
                          setUpdatePhoto(uri);
                          setUpdatePhotoBase64(b64);
                        })
                      }
                    >
                      <Text style={styles.photoBtnText}>📷 Retake Photo</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.photoBtn}
                      onPress={() =>
                        pickPhotoFromGallery((uri, b64) => {
                          setUpdatePhoto(uri);
                          setUpdatePhotoBase64(b64);
                        })
                      }
                    >
                      <Text style={styles.photoBtnText}>🖼️ Choose Photo</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {/* 8. Height */}
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>8. Height (Updated):</Text>
                <TextInput
                  style={[styles.inlineInput, { width: 120 }]}
                  placeholder="e.g. 5.6 ft"
                  value={updateHeight}
                  onChangeText={setUpdateHeight}
                />
              </View>

              {/* 9. Girth */}
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>9. Girth (Updated):</Text>
                <TextInput
                  style={[styles.inlineInput, { width: 120 }]}
                  placeholder="e.g. 18 cm"
                  value={updateGirth}
                  onChangeText={setUpdateGirth}
                />
              </View>

              {/* 10. Last Inspection */}
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>10. Last Inspection:</Text>
                <TextInput
                  style={[styles.inlineInput, { width: 130 }]}
                  placeholder="YYYY-MM-DD"
                  value={updateLastInspection}
                  onChangeText={setUpdateLastInspection}
                />
              </View>

              {/* 11. Survival Status */}
              <View style={{ marginVertical: 10 }}>
                <Text style={[styles.detailLabel, { marginBottom: 8 }]}>
                  11. Survival Status:
                </Text>
                <View style={styles.statusOptionsContainer}>
                  {SURVIVAL_STATUS_OPTIONS.map((item) => {
                    const isSelected = updateSurvivalStatus === item.label;
                    return (
                      <TouchableOpacity
                        key={item.label}
                        style={[
                          styles.statusOptionBtn,
                          { borderColor: item.color },
                          isSelected && { backgroundColor: item.bg, borderWidth: 2 },
                        ]}
                        onPress={() => setUpdateSurvivalStatus(item.label)}
                      >
                        <Text style={styles.statusOptionIcon}>{item.icon}</Text>
                        <Text
                          style={[
                            styles.statusOptionText,
                            { color: item.color },
                            isSelected && { fontWeight: 'bold' },
                          ]}
                        >
                          {item.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Save Updates Button */}
              <TouchableOpacity
                style={styles.saveBtn}
                onPress={handleSaveTreeUpdate}
                disabled={isUpdating}
              >
                {isUpdating ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.btnText}>💾 Save Tree Updates</Text>
                )}
              </TouchableOpacity>

              {/* Delete Tree Record Button */}
              <TouchableOpacity
                style={styles.deleteTreeBtn}
                onPress={() => handleDeleteTree(selectedTree.treeId)}
                disabled={isUpdating}
              >
                <Text style={styles.deleteTreeBtnText}>🗑️ Delete Tree Record</Text>
              </TouchableOpacity>

              {/* Bottom Quick Switcher */}
              <View style={styles.switchTreeSection}>
                <Text style={styles.switchTreeSectionTitle}>
                  Switch to Another Tree ({trees.length} total registered):
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.quickChipsScroll}
                >
                  {trees.map((t) => (
                    <TouchableOpacity
                      key={t.treeId}
                      style={[
                        styles.quickTreeChip,
                        selectedTree &&
                          selectedTree.treeId === t.treeId &&
                          styles.quickTreeChipActive,
                      ]}
                      onPress={() => {
                        applySelectedTree(t);
                        setSearchTreeId(t.treeId);
                      }}
                    >
                      <Text
                        style={[
                          styles.quickTreeChipText,
                          selectedTree &&
                            selectedTree.treeId === t.treeId &&
                            styles.quickTreeChipTextActive,
                        ]}
                      >
                        {t.treeId} ({t.species})
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>
          </View>
        )}
        </View>
      )}
      </ScrollView>

      {/* Quick Dismiss button floating above keyboard when open */}
      {keyboardHeight > 0 && (
        <TouchableOpacity
          style={[
            styles.keyboardDismissFloat,
            { bottom: Platform.OS === 'ios' ? keyboardHeight + 12 : 18 },
          ]}
          onPress={Keyboard.dismiss}
          activeOpacity={0.85}
        >
          <Text style={styles.keyboardDismissText}>Hide Keyboard ⌨️ ✕</Text>
        </TouchableOpacity>
      )}


      {/* Batch A4 QR Print Sheet Modal */}
      <Modal
        visible={showBatchPrintModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowBatchPrintModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.batchModalOverlay}
        >
          <View style={styles.batchModalCard}>
            <View style={styles.batchModalHeader}>
              <View style={styles.batchModalIconWrap}>
                <Text style={styles.batchModalIcon}>🖨️</Text>
              </View>
              <Text style={styles.batchModalTitle}>Print A4 Batch QR Tags</Text>
              <Text style={styles.batchModalSubtitle}>
                Generate a multi-page printable A4 PDF for trees planted on the same day.
              </Text>
            </View>

            <ScrollView style={styles.batchModalScroll} showsVerticalScrollIndicator={false}>
              {/* Section 1: Choose Plantation Date */}
              <Text style={styles.batchSectionTitle}>1. Select Plantation Date Batch:</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.batchDatesScroll}
              >
                <TouchableOpacity
                  style={[
                    styles.batchDateChip,
                    batchSelectedDate === 'ALL' && styles.batchDateChipActive,
                  ]}
                  onPress={() => setBatchSelectedDate('ALL')}
                >
                  <Text
                    style={[
                      styles.batchDateChipText,
                      batchSelectedDate === 'ALL' && styles.batchDateChipTextActive,
                    ]}
                  >
                    🌟 All Plantations ({trees.length})
                  </Text>
                </TouchableOpacity>

                {groupedTreesByDate.map((g) => {
                  const isSelected = batchSelectedDate === g.date;
                  return (
                    <TouchableOpacity
                      key={g.date}
                      style={[
                        styles.batchDateChip,
                        isSelected && styles.batchDateChipActive,
                      ]}
                      onPress={() => setBatchSelectedDate(g.date)}
                    >
                      <Text
                        style={[
                          styles.batchDateChipText,
                          isSelected && styles.batchDateChipTextActive,
                        ]}
                      >
                        📅 {g.date} ({g.trees.length})
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Section 2: Choose Tag Density / Size */}
              <Text style={styles.batchSectionTitle}>2. Tags per A4 Sheet (Size & Density):</Text>
              <View style={styles.batchDensityRow}>
                <TouchableOpacity
                  style={[
                    styles.batchDensityCard,
                    batchTagDensity === 6 && styles.batchDensityCardActive,
                  ]}
                  onPress={() => setBatchTagDensity(6)}
                >
                  <View style={styles.batchDensityRadio}>
                    <Text style={styles.batchDensityRadioIcon}>
                      {batchTagDensity === 6 ? '🔘' : '⚪'}
                    </Text>
                    <Text style={styles.batchDensityTitle}>6 Tags per Sheet</Text>
                  </View>
                  <Text style={styles.batchDensityBadge}>Standard Field Tags • Recommended</Text>
                  <Text style={styles.batchDensitySub}>
                    2 columns × 3 rows. Crisp ~3.6 in. × 3.4 in. tag boxes with bold QR, species &amp; cut guidelines.
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.batchDensityCard,
                    batchTagDensity === 4 && styles.batchDensityCardActive,
                  ]}
                  onPress={() => setBatchTagDensity(4)}
                >
                  <View style={styles.batchDensityRadio}>
                    <Text style={styles.batchDensityRadioIcon}>
                      {batchTagDensity === 4 ? '🔘' : '⚪'}
                    </Text>
                    <Text style={styles.batchDensityTitle}>4 Tags per Sheet</Text>
                  </View>
                  <Text style={styles.batchDensityBadge}>Large Plaque Tags</Text>
                  <Text style={styles.batchDensitySub}>
                    2 columns × 2 rows. Large ~3.6 in. × 5.1 in. plates with extra-large QR codes for tree trunks.
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Section 3: QR Code Data Format */}
              <Text style={styles.batchSectionTitle}>3. QR Code Data Format:</Text>
              <View style={styles.batchQrToggleRow}>
                <TouchableOpacity
                  style={[
                    styles.batchQrToggleBtn,
                    batchQrType === 'OFFLINE' && styles.batchQrToggleBtnActive,
                  ]}
                  onPress={() => setBatchQrType('OFFLINE')}
                >
                  <Text
                    style={[
                      styles.batchQrToggleBtnText,
                      batchQrType === 'OFFLINE' && styles.batchQrToggleBtnTextActive,
                    ]}
                  >
                    📴 Offline Info (Zero Wi-Fi Needed)
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.batchQrToggleBtn,
                    batchQrType === 'WEB' && styles.batchQrToggleBtnActive,
                  ]}
                  onPress={() => setBatchQrType('WEB')}
                >
                  <Text
                    style={[
                      styles.batchQrToggleBtnText,
                      batchQrType === 'WEB' && styles.batchQrToggleBtnTextActive,
                    ]}
                  >
                    🌐 Web Link (Online Certificate)
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Section 4: Live Sheet Output Summary */}
              {(() => {
                const selectedBatch =
                  batchSelectedDate === 'ALL'
                    ? trees
                    : trees.filter((t) => (t.plantationDate || 'Undated') === batchSelectedDate);
                const count = selectedBatch.length;
                const pagesNeeded = Math.ceil(count / batchTagDensity);

                return (
                  <View style={styles.batchSummaryBox}>
                    <View style={styles.batchSummaryTopRow}>
                      <Text style={styles.batchSummaryTitle}>📄 Print Output Preview:</Text>
                      <View style={styles.batchSummaryPagesPill}>
                        <Text style={styles.batchSummaryPagesPillText}>
                          {pagesNeeded} A4 {pagesNeeded === 1 ? 'Sheet' : 'Sheets'}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.batchSummaryText}>
                      • Selected Batch: <Text style={styles.batchSummaryBold}>{batchSelectedDate === 'ALL' ? 'All Trees' : batchSelectedDate}</Text> ({count} total {count === 1 ? 'tag' : 'tags'})
                    </Text>
                    <Text style={styles.batchSummaryText}>
                      • Density: <Text style={styles.batchSummaryBold}>{batchTagDensity} tags per sheet</Text> (automatically splits across {pagesNeeded} pages).
                    </Text>
                    <Text style={styles.batchSummaryText}>
                      • Format: <Text style={styles.batchSummaryBold}>{batchQrType === 'OFFLINE' ? 'Self-Contained Specimen Tag (Works 100% Offline)' : 'Web Certificate Link'}</Text>.
                    </Text>
                    <Text style={styles.batchSummaryHint}>
                      ✂️ Each tag includes a dashed cutting border, QR code, Tree ID, and Species name.
                    </Text>
                  </View>
                );
              })()}
            </ScrollView>

            {/* Modal Actions */}
            <View style={styles.batchModalBtnRow}>
              <TouchableOpacity
                style={styles.batchCancelBtn}
                onPress={() => setShowBatchPrintModal(false)}
                disabled={isBatchPrinting}
              >
                <Text style={styles.batchCancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.batchGenerateBtn}
                disabled={isBatchPrinting}
                onPress={async () => {
                  const selectedBatch =
                    batchSelectedDate === 'ALL'
                      ? trees
                      : trees.filter((t) => (t.plantationDate || 'Undated') === batchSelectedDate);

                  setShowBatchPrintModal(false);
                  await handlePrintBatchA4Sheet(
                    selectedBatch,
                    batchSelectedDate === 'ALL' ? 'All Registered Plantations' : batchSelectedDate,
                    batchTagDensity,
                    batchQrType
                  );
                }}
              >
                {isBatchPrinting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.batchGenerateBtnText}>🖨️ Generate & Print A4 PDF</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardAvoidingContainer: {
    flex: 1,
    backgroundColor: '#f1f8e9',
  },
  mainScrollView: {
    flex: 1,
  },
  keyboardDismissFloat: {
    position: 'absolute',
    right: 16,
    backgroundColor: '#1b5e20',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 5,
    elevation: 6,
    zIndex: 9999,
  },
  keyboardDismissText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  container: {
    padding: 16,
    paddingTop: Platform.OS === 'web' ? 24 : 48,
    backgroundColor: '#f1f8e9',
    flexGrow: 1,
  },
  screenWrapper: {
    maxWidth: 600,
    width: '100%',
    alignSelf: 'center',
    paddingBottom: 80,
  },
  screenTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1b5e20',
    letterSpacing: -0.4,
    marginBottom: 16,
  },

  // ==========================================
  // PUBLIC READ-ONLY TREE SCREEN (FOR QR SCANNERS)
  // ==========================================
  publicWrapper: {
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
    paddingBottom: 40,
  },
  previewModeBanner: {
    backgroundColor: '#fef3c7',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: 10,
    padding: 10,
    marginBottom: 16,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  previewModeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#92400e',
    flex: 1,
  },
  previewReturnBtn: {
    backgroundColor: '#1b5e20',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  previewReturnBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  publicLoadingBox: {
    padding: 60,
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#c8e6c9',
  },
  publicLoadingText: {
    marginTop: 14,
    fontSize: 14,
    color: '#1b5e20',
    fontWeight: '600',
  },
  publicCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 22,
    borderWidth: 1,
    borderColor: '#c8e6c9',
    shadowColor: '#1b5e20',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 3,
  },
  publicHeader: {
    alignItems: 'center',
    marginBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f8e9',
    paddingBottom: 16,
  },
  publicLogoBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#e8f5e9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#c8e6c9',
  },
  publicLogoIcon: {
    fontSize: 24,
  },
  publicOrgTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#1b5e20',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  publicRegistrySubtitle: {
    fontSize: 12,
    color: '#558b2f',
    textAlign: 'center',
    marginTop: 2,
    fontWeight: '600',
  },
  verifiedPill: {
    backgroundColor: '#e8f5e9',
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#a5d6a7',
  },
  verifiedPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#1b5e20',
    letterSpacing: 0.5,
  },
  publicPhotoWrap: {
    marginBottom: 18,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#c8e6c9',
  },
  publicPhoto: {
    width: '100%',
    height: 230,
    backgroundColor: '#f1f8e9',
  },
  publicPhotoVerifiedBadge: {
    fontSize: 11,
    color: '#1b5e20',
    fontWeight: '600',
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#e8f5e9',
    textAlign: 'center',
  },
  categorySectionHeader: {
    backgroundColor: '#e8f5e9',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#c8e6c9',
  },
  categorySectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1b5e20',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  publicCategoryRow: {
    flexDirection: 'row',
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f8e9',
    alignItems: 'flex-start',
  },
  publicCategoryIndex: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#e8f5e9',
    color: '#1b5e20',
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 22,
    marginRight: 10,
    marginTop: 1,
  },
  publicCategoryInfo: {
    flex: 1,
  },
  publicCategoryLabel: {
    fontSize: 11,
    color: '#558b2f',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  publicCategoryValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2e7d32',
  },
  publicCategoryValueHighlight: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1b5e20',
    letterSpacing: 0.5,
  },
  publicCategoryValueMono: {
    fontSize: 13,
    color: '#1b5e20',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontWeight: '600',
  },
  publicCategoryValueMuted: {
    fontSize: 13,
    color: '#7cb342',
    fontStyle: 'italic',
  },
  googleMapsMiniBtn: {
    backgroundColor: '#e8f5e9',
    borderWidth: 1,
    borderColor: '#a5d6a7',
    borderRadius: 6,
    paddingVertical: 5,
    paddingHorizontal: 10,
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  googleMapsMiniBtnText: {
    color: '#1b5e20',
    fontSize: 11,
    fontWeight: '700',
  },
  mapEmbedWrapper: {
    width: '100%',
    marginTop: 8,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#c8e6c9',
  },
  publicStatusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignSelf: 'flex-start',
    marginTop: 3,
  },
  publicStatusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  publicNoticeBox: {
    flexDirection: 'row',
    backgroundColor: '#e8f5e9',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    marginTop: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#c8e6c9',
  },
  publicNoticeIcon: {
    fontSize: 18,
    marginRight: 10,
  },
  publicNoticeText: {
    flex: 1,
    fontSize: 11,
    color: '#1b5e20',
    lineHeight: 16,
    fontWeight: '500',
  },
  publicFooter: {
    alignItems: 'center',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#f1f8e9',
  },
  publicFooterText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#558b2f',
    textAlign: 'center',
  },
  publicFooterSub: {
    fontSize: 10,
    color: '#7cb342',
    marginTop: 3,
    textAlign: 'center',
  },

  // ==========================================
  // DASHBOARD STYLES
  // ==========================================
  dashboardWrapper: {
    maxWidth: 600,
    width: '100%',
    alignSelf: 'center',
    paddingBottom: 32,
  },
  dashboardHeaderCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: '#c8e6c9',
    shadowColor: '#1b5e20',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  dashboardHeaderCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dashboardLogoBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#e8f5e9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#c8e6c9',
  },
  dashboardLogoIcon: {
    fontSize: 22,
  },
  dashboardHeaderTextWrap: {
    flex: 1,
  },
  dashboardHeaderTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1b5e20',
    letterSpacing: -0.3,
  },
  dashboardHeaderSubtitle: {
    fontSize: 11,
    color: '#558b2f',
    marginTop: 2,
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
    marginBottom: 16,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#c8e6c9',
    shadowColor: '#1b5e20',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 4,
    elevation: 1,
  },
  statBoxActiveTotal: {
    borderColor: '#1b5e20',
    borderWidth: 2,
    backgroundColor: '#e8f5e9',
    shadowOpacity: 0.12,
  },
  statBoxActiveHealthy: {
    borderColor: '#15803d',
    borderWidth: 2,
    backgroundColor: '#f0fdf4',
    shadowOpacity: 0.12,
  },
  statBoxActiveNeedsCare: {
    borderColor: '#d97706',
    borderWidth: 2,
    backgroundColor: '#fffbeb',
    shadowOpacity: 0.12,
  },
  statBoxActiveStunted: {
    borderColor: '#ea580c',
    borderWidth: 2,
    backgroundColor: '#fff7ed',
    shadowOpacity: 0.12,
  },
  statNum: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1b5e20',
  },
  statLabel: {
    fontSize: 10,
    color: '#558b2f',
    marginTop: 3,
    fontWeight: '700',
    textAlign: 'center',
  },
  activeFilterBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#a5d6a7',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
    shadowColor: '#1b5e20',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    elevation: 1,
  },
  activeFilterTextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  activeFilterLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2e7d32',
  },
  activeFilterValue: {
    fontWeight: '800',
  },
  activeFilterCount: {
    fontSize: 12,
    color: '#558b2f',
    fontWeight: '700',
  },
  clearFilterBtn: {
    backgroundColor: '#e8f5e9',
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#c8e6c9',
  },
  clearFilterBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1b5e20',
  },
  actionCardAdd: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: '#2e7d32',
    shadowColor: '#1b5e20',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  actionIconWrapAdd: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#e8f5e9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
    borderWidth: 1,
    borderColor: '#c8e6c9',
  },
  actionCardUpdate: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1.5,
    borderColor: '#388e3c',
    shadowColor: '#1b5e20',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  actionIconWrapUpdate: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#e8f5e9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
    borderWidth: 1,
    borderColor: '#c8e6c9',
  },
  actionIcon: {
    fontSize: 22,
  },
  actionContent: {
    flex: 1,
  },
  actionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionTitleAdd: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1b5e20',
  },
  actionTitleUpdate: {
    fontSize: 16,
    fontWeight: '800',
    color: '#2e7d32',
  },
  newBadge: {
    backgroundColor: '#e8f5e9',
    paddingVertical: 2,
    paddingHorizontal: 7,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#c8e6c9',
  },
  newBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#1b5e20',
    letterSpacing: 0.5,
  },
  inspectBadge: {
    backgroundColor: '#e8f5e9',
    paddingVertical: 2,
    paddingHorizontal: 7,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#c8e6c9',
  },
  inspectBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#2e7d32',
    letterSpacing: 0.5,
  },
  actionArrow: {
    fontSize: 16,
    color: '#558b2f',
    fontWeight: '800',
    marginLeft: 8,
  },

  // ==========================================
  // REGISTRY LIST STYLES (ALL REGISTERED TREES)
  // ==========================================
  registrySectionContainer: {
    marginTop: 4,
    marginBottom: 16,
  },
  registryHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  dashboardSectionHeader: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1b5e20',
  },
  registrySubtitle: {
    fontSize: 12,
    color: '#558b2f',
    marginTop: 2,
    fontWeight: '500',
  },
  expandAllBtn: {
    backgroundColor: '#e8f5e9',
    borderWidth: 1,
    borderColor: '#c8e6c9',
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  expandAllBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1b5e20',
  },
  dateGroupWrapper: {
    marginBottom: 10,
  },
  dateRow: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#c8e6c9',
    shadowColor: '#1b5e20',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    elevation: 1,
  },
  dateRowActive: {
    borderColor: '#2e7d32',
    backgroundColor: '#e8f5e9',
  },
  dateRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  dateIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#e8f5e9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  dateIcon: {
    fontSize: 16,
  },
  dateTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1b5e20',
  },
  dateSubtitle: {
    fontSize: 11,
    color: '#558b2f',
    marginTop: 1,
    fontWeight: '500',
  },
  dateRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dateCountPill: {
    backgroundColor: '#e8f5e9',
    borderRadius: 12,
    paddingVertical: 3,
    paddingHorizontal: 9,
    borderWidth: 1,
    borderColor: '#c8e6c9',
  },
  dateCountPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1b5e20',
  },
  dateChevron: {
    fontSize: 11,
    color: '#2e7d32',
    fontWeight: '800',
  },
  dateTreesList: {
    marginTop: 8,
    paddingLeft: 8,
    borderLeftWidth: 2,
    borderLeftColor: '#2e7d32',
  },
  filterSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#c8e6c9',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 12,
  },
  filterSearchIcon: {
    fontSize: 14,
    marginRight: 8,
    color: '#558b2f',
  },
  filterSearchInput: {
    flex: 1,
    fontSize: 13,
    color: '#1b5e20',
  },
  filterClearIcon: {
    fontSize: 13,
    color: '#558b2f',
    paddingHorizontal: 4,
  },
  treeRecordCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#c8e6c9',
    shadowColor: '#1b5e20',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 4,
    elevation: 1,
  },
  treeRecordTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  treeRecordIdWrap: {
    backgroundColor: '#e8f5e9',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#c8e6c9',
  },
  treeRecordIdText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1b5e20',
    letterSpacing: 0.3,
  },
  treeRecordStatusBadge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  treeRecordStatusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  treeRecordMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#fafffa',
    borderRadius: 8,
    padding: 9,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e8f5e9',
  },
  treeRecordMetaItem: {
    flex: 1,
  },
  treeRecordMetaItemRight: {
    flex: 1,
    alignItems: 'flex-end',
  },
  treeRecordMetaLabel: {
    fontSize: 9,
    color: '#558b2f',
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  treeRecordSpeciesVal: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1b5e20',
  },
  treeRecordPlantedVal: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2e7d32',
  },
  treeRecordFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 2,
  },
  treeRecordVillageText: {
    fontSize: 12,
    color: '#558b2f',
    fontWeight: '500',
  },
  treeRecordActionHint: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1b5e20',
  },
  emptyTreesBox: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#c8e6c9',
  },
  emptyTreesIcon: {
    fontSize: 28,
    marginBottom: 8,
  },
  emptyTreesTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1b5e20',
  },
  emptyTreesSub: {
    fontSize: 12,
    color: '#558b2f',
    marginTop: 4,
    textAlign: 'center',
  },
  footerNote: {
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#c8e6c9',
  },
  footerNoteText: {
    fontSize: 11,
    color: '#558b2f',
    textAlign: 'center',
    fontWeight: '500',
  },

  // ==========================================
  // FORM & SHARED STYLES
  // ==========================================
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingVertical: 7,
    paddingHorizontal: 12,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#c8e6c9',
  },
  backBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1b5e20',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 18,
    shadowColor: '#1b5e20',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#c8e6c9',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    marginBottom: 6,
  },
  sectionNum: {
    backgroundColor: '#1b5e20',
    color: '#ffffff',
    width: 20,
    height: 20,
    borderRadius: 10,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 20,
    marginRight: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1b5e20',
  },
  input: {
    borderWidth: 1,
    borderColor: '#c8e6c9',
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    backgroundColor: '#fafafa',
    color: '#1b5e20',
  },
  idRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  idInput: {
    flex: 1,
    fontWeight: '700',
    color: '#1b5e20',
  },
  regenerateBtn: {
    marginLeft: 8,
    backgroundColor: '#e8f5e9',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#c8e6c9',
  },
  regenerateBtnText: {
    color: '#1b5e20',
    fontWeight: '700',
    fontSize: 12,
  },
  speciesChipsContainer: {
    flexDirection: 'row',
    marginTop: 8,
    marginBottom: 4,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: '#e8f5e9',
    borderWidth: 1,
    borderColor: '#c8e6c9',
    marginRight: 6,
  },
  chipActive: {
    backgroundColor: '#1b5e20',
    borderColor: '#1b5e20',
  },
  chipText: {
    fontSize: 12,
    color: '#2e7d32',
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#ffffff',
  },
  locationBtn: {
    backgroundColor: '#388e3c',
    padding: 11,
    borderRadius: 8,
    alignItems: 'center',
  },
  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 10,
  },
  orLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#c8e6c9',
  },
  orText: {
    marginHorizontal: 10,
    fontSize: 10,
    color: '#558b2f',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  coordColumnsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  coordColumn: {
    flex: 1,
  },
  subFieldLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#558b2f',
    marginBottom: 4,
  },
  coordInput: {
    borderWidth: 1,
    borderColor: '#c8e6c9',
    borderRadius: 8,
    padding: 9,
    fontSize: 13,
    backgroundColor: '#ffffff',
    color: '#1b5e20',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  gpsBox: {
    marginTop: 8,
    padding: 8,
    backgroundColor: '#e8f5e9',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#c8e6c9',
  },
  gpsText: {
    fontSize: 12,
    color: '#2e7d32',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontWeight: '600',
  },
  hintText: {
    fontSize: 11,
    color: '#558b2f',
    marginTop: 5,
  },
  photoButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  photoBtn: {
    flex: 1,
    backgroundColor: '#e8f5e9',
    borderWidth: 1,
    borderColor: '#c8e6c9',
    padding: 11,
    borderRadius: 8,
    alignItems: 'center',
  },
  photoBtnText: {
    color: '#1b5e20',
    fontWeight: '700',
    fontSize: 13,
  },
  photoPreviewWrapper: {
    alignItems: 'center',
    marginVertical: 6,
  },
  photoPreview: {
    width: '100%',
    height: 180,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#c8e6c9',
  },
  photoActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 8,
    gap: 8,
  },
  photoChangeBtn: {
    flex: 1,
    backgroundColor: '#e8f5e9',
    padding: 8,
    borderRadius: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#c8e6c9',
  },
  photoRemoveBtn: {
    flex: 1,
    backgroundColor: '#fee2e2',
    padding: 8,
    borderRadius: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  photoBtnSmallText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1b5e20',
  },
  statusOptionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  statusOptionBtn: {
    flexBasis: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: '#ffffff',
  },
  statusOptionIcon: {
    fontSize: 12,
    marginRight: 6,
  },
  statusOptionText: {
    fontSize: 12,
    fontWeight: '500',
  },
  saveBtn: {
    backgroundColor: '#1b5e20',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 20,
    shadowColor: '#1b5e20',
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 2,
  },
  pdfBtn: {
    backgroundColor: '#2e7d32',
    padding: 13,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 14,
  },
  resetBtn: {
    borderWidth: 1,
    borderColor: '#1b5e20',
    padding: 11,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
    backgroundColor: '#ffffff',
  },
  resetBtnText: {
    color: '#1b5e20',
    fontWeight: '700',
    fontSize: 13,
  },
  btnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  cardHeader: {
    fontSize: 18,
    fontWeight: '800',
    color: '#2e7d32',
    textAlign: 'center',
    marginBottom: 4,
  },
  treeId: {
    fontSize: 15,
    fontWeight: '700',
    color: '#558b2f',
    textAlign: 'center',
    marginBottom: 10,
  },
  qrWrapper: {
    alignItems: 'center',
    marginVertical: 10,
    padding: 14,
    backgroundColor: '#fafffa',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#c8e6c9',
  },
  qrToggleRow: {
    flexDirection: 'row',
    backgroundColor: '#edf7ed',
    borderRadius: 8,
    padding: 3,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#c8e6c9',
    width: '100%',
  },
  qrToggleBtn: {
    flex: 1,
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  qrToggleBtnActive: {
    backgroundColor: '#2e7d32',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  qrToggleBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#2e7d32',
    textAlign: 'center',
  },
  qrToggleBtnTextActive: {
    color: '#ffffff',
  },
  qrTreeIdSmall: {
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    color: '#475569',
    fontWeight: '600',
    marginTop: 8,
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  qrSpeciesBelow: {
    fontSize: 15,
    fontWeight: '700',
    color: '#15803d',
    marginTop: 2,
    textAlign: 'center',
  },
  qrUrlText: {
    fontSize: 11,
    color: '#558b2f',
    marginTop: 8,
    textAlign: 'center',
  },
  qrScannableNote: {
    backgroundColor: '#e8f5e9',
    borderRadius: 8,
    padding: 10,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: '#c8e6c9',
  },
  qrScannableText: {
    fontSize: 11,
    color: '#1b5e20',
    textAlign: 'center',
    fontWeight: '500',
    lineHeight: 15,
  },
  previewPublicBtn: {
    backgroundColor: '#2e7d32',
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginVertical: 6,
  },
  previewPublicBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 12,
  },
  previewPublicBtnSmall: {
    backgroundColor: '#e8f5e9',
    borderWidth: 1,
    borderColor: '#c8e6c9',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    marginVertical: 10,
  },
  previewPublicBtnSmallText: {
    color: '#1b5e20',
    fontSize: 12,
    fontWeight: '700',
  },
  summaryPhotoContainer: {
    marginVertical: 10,
    alignItems: 'center',
  },
  summaryPhoto: {
    width: '100%',
    height: 170,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#c8e6c9',
  },
  summarySubheading: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1b5e20',
    marginTop: 14,
    marginBottom: 8,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f8e9',
  },
  detailLabel: {
    fontWeight: '600',
    color: '#558b2f',
    fontSize: 12,
  },
  detailValue: {
    color: '#222222',
    fontSize: 12,
    maxWidth: '55%',
    textAlign: 'right',
    fontWeight: '500',
  },
  detailBold: {
    fontWeight: '700',
    color: '#1b5e20',
  },
  statusBadgeWrap: {
    backgroundColor: '#e8f5e9',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#c8e6c9',
  },
  statusBadgeText: {
    color: '#1b5e20',
    fontWeight: '700',
    fontSize: 11,
  },

  // ==========================================
  // UPDATE TREE SCREEN STYLES
  // ==========================================
  updateTreesListContainer: {
    marginTop: 4,
    marginBottom: 16,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontWeight: '600',
    color: '#1b5e20',
  },
  searchClearBtn: {
    paddingHorizontal: 6,
    paddingVertical: 8,
  },
  searchClearBtnText: {
    fontSize: 13,
    color: '#558b2f',
    fontWeight: '700',
  },
  searchBtn: {
    backgroundColor: '#1b5e20',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    minWidth: 70,
    alignItems: 'center',
  },
  searchBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 12,
  },
  updateSectionHeaderRow: {
    marginBottom: 12,
  },
  editTreeBadgeBtn: {
    backgroundColor: '#e8f5e9',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#c8e6c9',
  },
  editTreeBadgeBtnText: {
    color: '#1b5e20',
    fontSize: 12,
    fontWeight: '700',
  },
  selectedTreeBanner: {
    backgroundColor: '#e8f5e9',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#c8e6c9',
  },
  selectedTreeBannerTitle: {
    fontSize: 11,
    color: '#558b2f',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  selectedTreeBannerId: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1b5e20',
    marginTop: 2,
  },
  changeTreeBtn: {
    backgroundColor: '#ffffff',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#c8e6c9',
  },
  changeTreeBtnText: {
    color: '#1b5e20',
    fontWeight: '700',
    fontSize: 12,
  },
  switchTreeSection: {
    marginTop: 18,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#c8e6c9',
  },
  switchTreeSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1b5e20',
    marginBottom: 10,
  },
  quickChipsLabel: {
    fontSize: 11,
    color: '#558b2f',
    marginTop: 12,
    marginBottom: 6,
  },
  quickChipsScroll: {
    flexDirection: 'row',
  },
  quickTreeChip: {
    backgroundColor: '#e8f5e9',
    borderWidth: 1,
    borderColor: '#c8e6c9',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 14,
    marginRight: 6,
  },
  quickTreeChipActive: {
    backgroundColor: '#1b5e20',
    borderColor: '#1b5e20',
  },
  quickTreeChipText: {
    fontSize: 11,
    color: '#1b5e20',
    fontWeight: '600',
  },
  quickTreeChipTextActive: {
    color: '#ffffff',
  },
  treeFoundHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fafffa',
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#c8e6c9',
  },
  treeFoundId: {
    fontSize: 17,
    fontWeight: '800',
    color: '#1b5e20',
  },
  treeFoundSub: {
    fontSize: 11,
    color: '#558b2f',
    marginTop: 2,
  },
  miniQrBadge: {
    backgroundColor: '#ffffff',
    padding: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#c8e6c9',
  },
  inlineInput: {
    borderWidth: 1,
    borderColor: '#c8e6c9',
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    fontSize: 12,
    backgroundColor: '#ffffff',
    textAlign: 'right',
    color: '#1b5e20',
  },
  updatePhotoPreview: {
    width: '100%',
    height: 170,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#c8e6c9',
  },
  permanentQrBadge: {
    backgroundColor: '#e8f5e9',
    borderRadius: 6,
    paddingVertical: 2,
    paddingHorizontal: 6,
    alignSelf: 'flex-start',
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#c8e6c9',
  },
  permanentQrBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#1b5e20',
  },
  qrSyncNoticeBox: {
    flexDirection: 'row',
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
    alignItems: 'center',
  },
  qrSyncNoticeIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  qrSyncNoticeText: {
    flex: 1,
    fontSize: 11,
    color: '#166534',
    lineHeight: 15,
    fontWeight: '500',
  },
  pdfHelperHint: {
    fontSize: 10,
    color: '#65a30d',
    textAlign: 'center',
    marginTop: -8,
    marginBottom: 12,
    fontStyle: 'italic',
  },

  // ==========================================
  // SYNC BAR & ADMIN CONTROLS
  // ==========================================
  dashboardActionBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#dcfce7',
  },
  syncStatusBadge: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  syncStatusBadgeSuccess: {
    backgroundColor: '#f0fdf4',
    borderColor: '#86efac',
  },
  syncStatusBadgePending: {
    backgroundColor: '#fffbeb',
    borderColor: '#fde68a',
  },
  syncStatusBadgeSyncing: {
    backgroundColor: '#f0fdf4',
    borderColor: '#86efac',
  },
  syncStatusBadgeOffline: {
    backgroundColor: '#fef2f2',
    borderColor: '#fca5a5',
  },
  syncStatusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#166534',
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  csvExportBtn: {
    backgroundColor: '#15803d',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  csvExportBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  deleteTreeBtn: {
    backgroundColor: '#fff1f2',
    borderWidth: 1,
    borderColor: '#fecdd3',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 4,
  },
  deleteTreeBtnText: {
    color: '#e11d48',
    fontSize: 13,
    fontWeight: '700',
  },
  lockAdminBtn: {
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  lockAdminBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#991b1b',
  },

  // ==========================================
  // PIN AUTHENTICATION MODAL STYLES
  // ==========================================
  pinModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  pinModalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  pinModalHeader: {
    alignItems: 'center',
    marginBottom: 16,
  },
  pinModalIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#f0fdf4',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  pinModalIcon: {
    fontSize: 22,
  },
  pinModalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#166534',
    textAlign: 'center',
  },
  pinModalSubtitle: {
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 16,
  },
  pinInput: {
    backgroundColor: '#f9fafb',
    borderWidth: 1.5,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#111827',
    textAlign: 'center',
    letterSpacing: 4,
    fontWeight: '700',
    marginBottom: 16,
  },
  pinBtnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  pinCancelBtn: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    paddingVertical: 11,
    borderRadius: 8,
    alignItems: 'center',
  },
  pinCancelBtnText: {
    color: '#4b5563',
    fontWeight: '700',
    fontSize: 13,
  },
  pinSubmitBtn: {
    flex: 1.4,
    backgroundColor: '#15803d',
    paddingVertical: 11,
    borderRadius: 8,
    alignItems: 'center',
  },
  pinSubmitBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },

  // ==========================================
  // BATCH PRINT A4 QR SHEET STYLES
  // ==========================================
  batchPrintHeaderBtn: {
    backgroundColor: '#166534',
    paddingVertical: 6,
    paddingHorizontal: 11,
    borderRadius: 6,
    alignItems: 'center',
    shadowColor: '#166534',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    elevation: 2,
  },
  batchPrintHeaderBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  dateRowLeftClickable: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  dateBatchPrintBtn: {
    backgroundColor: '#1b5e20',
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: 6,
    alignItems: 'center',
    marginRight: 6,
    shadowColor: '#1b5e20',
    shadowOpacity: 0.12,
    shadowRadius: 2,
    elevation: 1,
  },
  dateBatchPrintBtnText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
  dateExpandToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  batchPrintTodayBtn: {
    backgroundColor: '#e8f5e9',
    borderColor: '#2e7d32',
    borderWidth: 1.5,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  batchPrintTodayBtnText: {
    color: '#1b5e20',
    fontSize: 12,
    fontWeight: '700',
  },
  batchModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  batchModalCard: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '88%',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 16,
    elevation: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  batchModalHeader: {
    alignItems: 'center',
    marginBottom: 14,
  },
  batchModalIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#f0fdf4',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  batchModalIcon: {
    fontSize: 22,
  },
  batchModalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#14532d',
    textAlign: 'center',
  },
  batchModalSubtitle: {
    fontSize: 11,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 3,
  },
  batchModalScroll: {
    marginVertical: 6,
  },
  batchSectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#15803d',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 10,
    marginBottom: 6,
  },
  batchDatesScroll: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  batchDateChip: {
    backgroundColor: '#f8fafc',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  batchDateChipActive: {
    backgroundColor: '#15803d',
    borderColor: '#15803d',
  },
  batchDateChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  batchDateChipTextActive: {
    color: '#ffffff',
  },
  batchDensityRow: {
    gap: 8,
    marginBottom: 6,
  },
  batchDensityCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
  },
  batchDensityCardActive: {
    borderColor: '#15803d',
    backgroundColor: '#f0fdf4',
  },
  batchDensityRadio: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  batchDensityRadioIcon: {
    fontSize: 13,
  },
  batchDensityTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
  },
  batchDensityBadge: {
    fontSize: 10,
    fontWeight: '700',
    color: '#166534',
    marginTop: 2,
  },
  batchDensitySub: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 3,
    lineHeight: 15,
  },
  batchQrToggleRow: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    padding: 3,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  batchQrToggleBtn: {
    flex: 1,
    paddingVertical: 7,
    paddingHorizontal: 6,
    borderRadius: 6,
    alignItems: 'center',
  },
  batchQrToggleBtnActive: {
    backgroundColor: '#15803d',
  },
  batchQrToggleBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
    textAlign: 'center',
  },
  batchQrToggleBtnTextActive: {
    color: '#ffffff',
  },
  batchSummaryBox: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
    marginBottom: 4,
  },
  batchSummaryTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  batchSummaryTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1e293b',
  },
  batchSummaryPagesPill: {
    backgroundColor: '#e0f2fe',
    borderWidth: 1,
    borderColor: '#bae6fd',
    borderRadius: 6,
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  batchSummaryPagesPillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0369a1',
  },
  batchSummaryText: {
    fontSize: 11,
    color: '#334155',
    lineHeight: 16,
    marginBottom: 2,
  },
  batchSummaryBold: {
    fontWeight: '800',
    color: '#0f172a',
  },
  batchSummaryHint: {
    fontSize: 10,
    color: '#64748b',
    fontStyle: 'italic',
    marginTop: 4,
  },
  batchModalBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  batchCancelBtn: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  batchCancelBtnText: {
    color: '#475569',
    fontWeight: '700',
    fontSize: 12,
  },
  batchGenerateBtn: {
    flex: 1.6,
    backgroundColor: '#15803d',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    shadowColor: '#15803d',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 3,
  },
  batchGenerateBtnText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 12,
  },
});