# TravelMate — Full Setup Guide

## 1. Install All Dependencies

Run these commands in your project root:

```bash
# Navigation
npm install @react-navigation/drawer @react-navigation/bottom-tabs @react-navigation/stack @react-navigation/native
npm install react-native-screens react-native-safe-area-context react-native-gesture-handler react-native-reanimated

# Drawer needs this gesture handler — add to App.js top import:
# import 'react-native-gesture-handler';

# Maps & Location
npx expo install expo-location react-native-maps

# Image Picker
npx expo install expo-image-picker

# Firebase (if not already installed)
npm install firebase

# Icons (if not already installed)
npm install @expo/vector-icons
```

## 2. Firebase Project Setup

In your Firebase Console:

### Realtime Database Rules
```json
{
  "rules": {
    "groups": {
      "$groupId": {
        ".read": "auth != null",
        ".write": "auth != null"
      }
    }
  }
}
```

### Firebase Storage Rules
```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /groups/{groupId}/memories/{allPaths=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

## 3. app.json Permissions

Add these to your `app.json` under `expo`:

```json
{
  "expo": {
    "plugins": [
      [
        "expo-location",
        {
          "locationAlwaysAndWhenInUsePermission": "Allow TravelMate to use your location to share with teammates."
        }
      ],
      [
        "expo-image-picker",
        {
          "photosPermission": "Allow TravelMate to access your photos for Trip Memories."
        }
      ]
    ]
  }
}
```

## 4. File Structure

```
your-project/
├── App.js                              ← REPLACE with provided file
├── src/
│   ├── firebase/
│   │   └── config.js                  ← REPLACE with provided file
│   ├── navigation/
│   │   └── DrawerContent.js           ← NEW file
│   ├── screens/
│   │   ├── TripMemoriesScreen.js      ← NEW file
│   │   └── LiveLocationScreen.js      ← NEW file
│   ├── hooks/
│   │   └── useGroupMembers.js         ← NEW file
│   └── utils/
│       └── uploadImage.js             ← NEW file
```

## 5. Reanimated Plugin (Required for Drawer)

In `babel.config.js`, ensure this plugin is last:

```js
module.exports = function(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['react-native-reanimated/plugin'], // must be last
  };
};
```

After changes, clear cache:
```bash
npx expo start --clear
```
