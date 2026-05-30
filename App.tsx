/**
 * FaceShield Edge v2.0
 * Root application entry point
 */
import React from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createStackNavigator} from '@react-navigation/stack';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {PermissionsScreen} from './src/screens/PermissionsScreen';
import {AttendanceScreen} from './src/screens/AttendanceScreen';
import {EnrollmentScreen} from './src/screens/EnrollmentScreen';
import {AdminConfigScreen} from './src/screens/AdminConfigScreen';
import {HomeScreen} from './src/screens/HomeScreen';
import {SyncService} from './src/services/SyncService';

export type RootStackParamList = {
  Permissions: undefined;
  Home: undefined;
  Attendance: {employeeId: string};
  Enrollment: undefined;
  AdminConfig: undefined;
  AttendanceSuccess: {similarityScore: number};
};

const Stack = createStackNavigator<RootStackParamList>();

// Boot the background sync service on app start
SyncService.getInstance().startListening();

export default function App(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator
          initialRouteName="Permissions"
          screenOptions={{
            headerStyle: {backgroundColor: '#1a1a2e'},
            headerTintColor: '#ffffff',
            headerTitleStyle: {fontWeight: 'bold'},
          }}>
          <Stack.Screen
            name="Permissions"
            component={PermissionsScreen}
            options={{headerShown: false}}
          />
          <Stack.Screen
            name="Home"
            component={HomeScreen}
            options={{title: 'FaceShield Edge'}}
          />
          <Stack.Screen
            name="Attendance"
            component={AttendanceScreen}
            options={{title: 'Verify Attendance'}}
          />
          <Stack.Screen
            name="Enrollment"
            component={EnrollmentScreen}
            options={{title: 'Enroll Employee'}}
          />
          <Stack.Screen
            name="AdminConfig"
            component={AdminConfigScreen}
            options={{title: 'Admin Configuration'}}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
