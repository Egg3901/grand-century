import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { MenuButton } from './GameMenus';
import { screenStyles as s } from './CampaignScreens';

export const LAKESIDE_ACCOUNT_URL = 'https://lakesidegames.net/account';
export function AccountScreen({ onBack }: { onBack: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const open = async () => {
    setBusy(true); setError('');
    try { await WebBrowser.openBrowserAsync(LAKESIDE_ACCOUNT_URL, { presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN, controlsColor: '#d6b475', toolbarColor: '#102b35' }); }
    catch { setError('Could not open Lakeside account. Check your connection and try again.'); }
    finally { setBusy(false); }
  };
  return <ScrollView style={s.page} contentContainerStyle={s.content}>
    <MenuButton label="Back to main menu" onPress={onBack} />
    <Text style={s.label}>LAKESIDE GAMES</Text><Text accessibilityRole="header" style={s.title}>Your Lakeside account</Text>
    <View style={s.card}><Text style={s.heading}>One account for Lakeside</Text><Text style={s.text}>Sign in with your existing Lakeside Games account or create an account through the account portal.</Text>
      <MenuButton label="Sign in to Lakeside" onPress={() => { void open(); }} disabled={busy} />
      <Text style={s.text}>Opens the secure Lakeside account portal. If you are already signed in, you can manage your account there. Close the browser to return to your game.</Text>
    </View>
    <Text style={s.text}>Grand Century campaigns are stored on this device. Account sign-in does not upload or sync saves.</Text>
    {!!error && <Text accessibilityRole="alert" style={s.text}>{error}</Text>}
  </ScrollView>;
}
