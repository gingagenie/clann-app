import { useEffect, useRef, useState } from 'react'
import { Platform, StatusBar, StyleSheet, View } from 'react-native'
import { WebView } from 'react-native-webview'
import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'

const APP_URL = 'https://clann.onrender.com'
const SUPABASE_URL = 'https://pdztoctoyptmfhzhndck.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBkenRvY3RveXB0bWZoemhuZGNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2MTM1NDksImV4cCI6MjA5MDE4OTU0OX0.Z0xWbSFGpUc5H3Jgm_DQHm9uvRleY8Uc664j3KnHa1E'

// Show notifications even when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
})

async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) return null

  const { status: existing } = await Notifications.getPermissionsAsync()
  let finalStatus = existing

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync()
    finalStatus = status
  }

  if (finalStatus !== 'granted') return null

  const token = await Notifications.getDevicePushTokenAsync()
  return token.data as string
}

async function saveTokenToSupabase(token: string, userId: string, householdId: string) {
  await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Prefer': 'resolution=merge-duplicates',
    },
    body: JSON.stringify({
      user_id: userId,
      household_id: householdId,
      endpoint: token,
      p256dh: 'fcm',
      auth: 'fcm',
    }),
  })
}

export default function App() {
  const webViewRef = useRef<WebView>(null)
  const [currentUrl, setCurrentUrl] = useState(APP_URL)

  useEffect(() => {
    // Handle notification taps — navigate WebView to the right page
    const sub = Notifications.addNotificationResponseReceivedListener(response => {
      const url = response.notification.request.content.data?.url as string | undefined
      if (url) {
        const target = APP_URL + url
        setCurrentUrl(target)
        webViewRef.current?.injectJavaScript(`window.location.href = '${target}'; true;`)
      }
    })
    return () => sub.remove()
  }, [])

  // Called from the web app via postMessage to register push token
  const handleWebMessage = async (event: { nativeEvent: { data: string } }) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data)

      if (msg.type === 'REGISTER_PUSH') {
        const token = await registerForPushNotifications()
        if (token && msg.userId && msg.householdId) {
          await saveTokenToSupabase(token, msg.userId, msg.householdId)
          webViewRef.current?.injectJavaScript(`
            window.__nativePushToken = ${JSON.stringify(token)};
            window.dispatchEvent(new CustomEvent('nativePushRegistered', { detail: { token: ${JSON.stringify(token)} } }));
            true;
          `)
        }
      }
    } catch {
      // ignore malformed messages
    }
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FAF8F3" />
      <WebView
        ref={webViewRef}
        source={{ uri: currentUrl }}
        style={styles.webview}
        onMessage={handleWebMessage}
        javaScriptEnabled
        domStorageEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        injectedJavaScriptBeforeContentLoaded={`
          window.__isNativeApp = true;
          true;
        `}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF8F3',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  webview: {
    flex: 1,
  },
})
