import React from 'react';
import { vexo } from 'vexo-analytics';

// Initialize Vexo at the root level, outside of any component
if (__DEV__ === false) {
  vexo('518dcd32-58f9-419b-a779-34914f758c90');
}

import MainDashboardScreen from './screens/MainDashboardScreen';

export default function App() {
  return <MainDashboardScreen />;
}
