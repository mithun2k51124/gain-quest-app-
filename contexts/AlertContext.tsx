import React, { createContext, useContext, useState, ReactNode } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { useTheme } from './ThemeContext';

type AlertButton = {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
};

type AlertState = {
  visible: boolean;
  title: string;
  message?: string;
  buttons?: AlertButton[];
};

type AlertContextType = {
  showAlert: (title: string, message?: string, buttons?: AlertButton[]) => void;
};

const AlertContext = createContext<AlertContextType | undefined>(undefined);

export function AlertProvider({ children }: { children: ReactNode }) {
  const { C } = useTheme();
  const styles = makeStyles(C);
  
  const [alertState, setAlertState] = useState<AlertState>({
    visible: false,
    title: '',
  });

  const showAlert = (title: string, message?: string, buttons?: AlertButton[]) => {
    setAlertState({
      visible: true,
      title,
      message,
      buttons: buttons || [{ text: 'OK', onPress: () => {} }],
    });
  };

  const closeAlert = () => {
    setAlertState(prev => ({ ...prev, visible: false }));
  };

  const handlePress = (btn: AlertButton) => {
    closeAlert();
    setTimeout(() => {
      if (btn.onPress) btn.onPress();
    }, 100);
  };

  return (
    <AlertContext.Provider value={{ showAlert }}>
      {children}
      
      <Modal
        visible={alertState.visible}
        transparent
        animationType="fade"
        onRequestClose={closeAlert}
      >
        <View style={styles.overlay}>
          <View style={styles.card}>
            <Text style={styles.title}>{alertState.title}</Text>
            {alertState.message ? (
              <Text style={styles.message}>{alertState.message}</Text>
            ) : null}
            
            <View style={styles.btnRow}>
              {alertState.buttons?.map((btn, i) => (
                <TouchableOpacity
                  key={i}
                  style={[
                    styles.btn,
                    btn.style === 'cancel' ? styles.btnCancel : styles.btnDefault,
                    btn.style === 'destructive' && styles.btnDestructive,
                    alertState.buttons?.length === 1 && { flex: 0, minWidth: 120 }
                  ]}
                  onPress={() => handlePress(btn)}
                >
                  <Text style={[
                    styles.btnText,
                    btn.style === 'cancel' ? styles.btnTextCancel : styles.btnTextDefault,
                    btn.style === 'destructive' && styles.btnTextDestructive
                  ]}>
                    {btn.text}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>
    </AlertContext.Provider>
  );
}

export function useCustomAlert() {
  const context = useContext(AlertContext);
  if (!context) {
    throw new Error('useCustomAlert must be used within an AlertProvider');
  }
  return context;
}

function makeStyles(C: any) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(20,25,35,0.4)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    card: {
      width: '100%',
      maxWidth: 340,
      backgroundColor: C.card || '#FFFFFF',
      borderRadius: 24,
      padding: 24,
      shadowColor: '#BFC8D6',
      shadowOffset: { width: 8, height: 8 },
      shadowOpacity: 0.9,
      shadowRadius: 16,
      elevation: 10,
      alignItems: 'center',
    },
    title: {
      fontSize: 20,
      fontWeight: '800',
      color: C.text,
      marginBottom: 10,
      textAlign: 'center',
    },
    message: {
      fontSize: 14,
      color: C.textSub,
      marginBottom: 24,
      textAlign: 'center',
      lineHeight: 20,
    },
    btnRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 12,
      width: '100%',
    },
    btn: {
      flex: 1,
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    btnDefault: {
      backgroundColor: C.accent,
      shadowColor: C.accent,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 6,
      elevation: 4,
    },
    btnCancel: {
      backgroundColor: C.bg,
      borderWidth: 1,
      borderColor: C.border,
    },
    btnDestructive: {
      backgroundColor: C.red || '#FF5722',
    },
    btnText: {
      fontSize: 15,
      fontWeight: '700',
    },
    btnTextDefault: {
      color: '#fff',
    },
    btnTextCancel: {
      color: C.textSub,
    },
    btnTextDestructive: {
      color: '#fff',
    }
  });
}
