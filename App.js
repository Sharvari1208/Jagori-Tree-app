import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import * as Location from 'expo-location';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import QRCode from 'react-native-qrcode-svg';

export default function App() {
  const [species, setSpecies] = useState('');
  const [plantationDate, setPlantationDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [location, setLocation] = useState(null);
  const [isLocating, setIsLocating] = useState(false);
  const [savedTree, setSavedTree] = useState(null);

  // 1. High Accuracy GPS Fetch
  const fetchLocation = async () => {
    try {
      setIsLocating(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'GPS permission is required to tag tree coordinates.');
        setIsLocating(false);
        return;
      }

      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      setLocation({
        latitude: currentLocation.coords.latitude.toFixed(6),
        longitude: currentLocation.coords.longitude.toFixed(6),
      });
    } catch (error) {
      Alert.alert('Error', 'Unable to fetch current GPS coordinates.');
    } finally {
      setIsLocating(false);
    }
  };

  // 2. Tag Tree & Generate QR
  const handleSaveTree = () => {
    if (!species.trim()) {
      Alert.alert('Validation Error', 'Please enter a tree species/name.');
      return;
    }
    if (!location) {
      Alert.alert('Validation Error', 'Please fetch the GPS coordinates first.');
      return;
    }

    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const treeId = `JGF-2026-${randomSuffix}`;
    const publicUrl = `https://jagori-trees.org/tree/${treeId}`;

    const newTree = {
      id: treeId,
      species: species.trim(),
      date: plantationDate,
      lat: location.latitude,
      lng: location.longitude,
      url: publicUrl,
    };

    setSavedTree(newTree);
  };

  // 3. Generate Printable QR Slip PDF
  const handleExportPDF = async () => {
    if (!savedTree) return;

    const qrImageSvg = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(
      savedTree.url
    )}`;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <style>
            body {
              font-family: Arial, sans-serif;
              display: flex;
              justify-content: center;
              padding: 24px;
            }
            .badge {
              width: 320px;
              border: 2px dashed #2e7d32;
              border-radius: 12px;
              padding: 20px;
              text-align: center;
              background-color: #fafffa;
            }
            .header {
              font-size: 16px;
              font-weight: bold;
              color: #1b5e20;
              margin-bottom: 4px;
            }
            .sub {
              font-size: 11px;
              color: #666;
              margin-bottom: 14px;
            }
            .qr-container {
              margin: 12px 0;
            }
            .qr-container img {
              width: 160px;
              height: 160px;
            }
            .field {
              font-size: 13px;
              margin: 4px 0;
              color: #333;
            }
            .bold {
              font-weight: bold;
            }
            .tree-id {
              font-size: 15px;
              font-weight: bold;
              color: #2e7d32;
              margin-top: 8px;
            }
          </style>
        </head>
        <body>
          <div class="badge">
            <div class="header">JAGORI FOUNDATION</div>
            <div class="sub">Tree Conservation & Tagging Registry</div>
            <div class="qr-container">
              <img src="${qrImageSvg}" alt="Tree QR" />
            </div>
            <div class="tree-id">${savedTree.id}</div>
            <div class="field"><span class="bold">Species:</span> ${savedTree.species}</div>
            <div class="field"><span class="bold">Planted:</span> ${savedTree.date}</div>
            <div class="field"><span class="bold">GPS:</span> ${savedTree.lat},${savedTree.lng}</div>
          </div>
        </body>
      </html>
    `;

    try {
      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
    } catch (error) {
      Alert.alert('Error', 'Unable to create or share printable tag.');
    }
  };

  const handleReset = () => {
    setSpecies('');
    setLocation(null);
    setSavedTree(null);
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.headerTitle}>🌿 Tree Field Tagger</Text>
      <Text style={styles.subTitle}>Jagori Foundation Geo-Registry</Text>

      {!savedTree ? (
        <View style={styles.card}>
          <Text style={styles.label}>Tree Species / Common Name</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Neem, Peepal, Banyan"
            value={species}
            onChangeText={setSpecies}
          />

          <Text style={styles.label}>Plantation Date</Text>
          <TextInput
            style={styles.input}
            value={plantationDate}
            onChangeText={setPlantationDate}
          />

          <Text style={styles.label}>GPS Location</Text>
          <TouchableOpacity
            style={styles.locationBtn}
            onPress={fetchLocation}
            disabled={isLocating}
          >
            {isLocating ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnText}>
                {location ? '📍 Refresh GPS Coordinates' : '📍 Fetch Current GPS'}
              </Text>
            )}
          </TouchableOpacity>

          {location && (
            <View style={styles.gpsBox}>
              <Text style={styles.gpsText}>Lat: {location.latitude}</Text>
              <Text style={styles.gpsText}>Lng: {location.longitude}</Text>
            </View>
          )}

          <TouchableOpacity style={styles.saveBtn} onPress={handleSaveTree}>
            <Text style={styles.btnText}>Save Tree & Generate QR</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.cardHeader}>✅ Tree Successfully Tagged!</Text>
          <Text style={styles.treeId}>{savedTree.id}</Text>

          <View style={styles.qrWrapper}>
            <QRCode value={savedTree.url} size={180} />
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Species:</Text>
            <Text style={styles.detailValue}>{savedTree.species}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Date:</Text>
            <Text style={styles.detailValue}>{savedTree.date}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>GPS:</Text>
            <Text style={styles.detailValue}>
              {savedTree.lat}, {savedTree.lng}
            </Text>
          </View>

          <TouchableOpacity style={styles.pdfBtn} onPress={handleExportPDF}>
            <Text style={styles.btnText}>🖨️ Export Printable QR Slip (PDF)</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.resetBtn} onPress={handleReset}>
            <Text style={styles.resetBtnText}>+ Tag Next Tree</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    paddingTop: 60,
    backgroundColor: '#f1f8e9',
    flexGrow: 1,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#1b5e20',
    textAlign: 'center',
  },
  subTitle: {
    fontSize: 14,
    color: '#558b2f',
    textAlign: 'center',
    marginBottom: 24,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: '#c8e6c9',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    backgroundColor: '#fafafa',
  },
  locationBtn: {
    backgroundColor: '#388e3c',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 6,
  },
  saveBtn: {
    backgroundColor: '#1b5e20',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 24,
  },
  pdfBtn: {
    backgroundColor: '#2e7d32',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 18,
  },
  resetBtn: {
    borderWidth: 1,
    borderColor: '#1b5e20',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  resetBtnText: {
    color: '#1b5e20',
    fontWeight: 'bold',
    fontSize: 15,
  },
  btnText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 15,
  },
  gpsBox: {
    marginTop: 10,
    padding: 10,
    backgroundColor: '#e8f5e9',
    borderRadius: 6,
  },
  gpsText: {
    fontSize: 13,
    color: '#2e7d32',
    fontFamily: 'monospace',
  },
  cardHeader: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2e7d32',
    textAlign: 'center',
    marginBottom: 4,
  },
  treeId: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#558b2f',
    textAlign: 'center',
    marginBottom: 16,
  },
  qrWrapper: {
    alignItems: 'center',
    marginVertical: 14,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  detailLabel: {
    fontWeight: '600',
    color: '#555',
  },
  detailValue: {
    color: '#222',
  },
});