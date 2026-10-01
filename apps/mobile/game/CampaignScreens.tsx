import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { DEFAULT_SCENARIO_ID, listScenarios, loadScenario } from '../../../src/data/generated';
import { CAMPAIGN_MAP_MODES, type CampaignMapMode } from '../../../src/shared/campaignMap';
import { campaignRoster, validSeed, type CampaignConfig, type NativeSave } from './campaign';
import { deleteNativeSave, listNativeSaves, newSaveId } from './nativeSaves';
import { NationFlag } from './NationFlag';
import { MenuButton } from './GameMenus';
import { gpRankFor } from '../../../src/shared/greatPowers';

export const screenStyles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#102b35' },
  content: { padding: 22, gap: 18, paddingBottom: 44 },
  title: { color: '#f4eddf', fontWeight: '800', fontSize: 30 },
  label: { color: '#d6b475', fontWeight: '800', fontSize: 12, letterSpacing: 1.3 },
  text: { color: '#c6d2d2', fontSize: 15, lineHeight: 22 },
  card: { backgroundColor: '#193a44', borderColor: '#35545c', borderWidth: 1, borderRadius: 14, padding: 16, gap: 12 },
  input: { backgroundColor: '#102b35', color: '#f4eddf', borderColor: '#688088', borderWidth: 1, borderRadius: 9, padding: 13, fontSize: 16, minHeight: 48 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  choice: { backgroundColor: '#193a44', padding: 14, borderWidth: 1, borderColor: '#53717a', borderRadius: 10, minHeight: 48, gap: 4 },
  selected: { borderColor: '#d6b475', backgroundColor: '#29464c' },
  heading: { color: '#f4eddf', fontSize: 17, fontWeight: '700' },
  choiceHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#8fa3a6', alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: '#d6b475' },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#d6b475' },
  nationRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 12, minHeight: 56, borderRadius: 10, borderWidth: 1, borderColor: 'transparent' },
  nationName: { color: '#f4eddf', fontSize: 16, fontWeight: '700' },
  nationMeta: { color: '#a9bcbd', fontSize: 13, marginTop: 2 },
  rank: { color: '#d6b475', fontSize: 12, fontWeight: '800', letterSpacing: 1 },
});
const words = (key: string) => key.replaceAll('_', ' ').replace(/^./, (c) => c.toUpperCase());
const s = screenStyles;
function Choice({ title, detail, selected, onPress }: { title: string; detail?: string; selected: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ selected }} onPress={onPress} style={[s.choice, selected && s.selected]}>
    <View style={s.choiceHead}><View style={[s.radio, selected && s.radioOn]}>{selected && <View style={s.radioDot} />}</View><Text style={[s.heading, { flex: 1 }]}>{title}</Text></View>
    {detail && <Text style={[s.text, { paddingLeft: 28 }]}>{detail}</Text>}
  </Pressable>;
}
function NationRow({ nation, provinces, rank, selected, onPress }: { nation: { tag: string; name: string; color: readonly number[]; government: string }; provinces: number; rank: number; selected: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`Select ${nation.name}`} accessibilityState={{ selected }} onPress={onPress} style={[s.nationRow, selected && s.selected]}>
    <NationFlag tag={nation.tag} name={nation.name} color={nation.color} size={26} />
    <View style={{ flex: 1 }}>
      <Text style={s.nationName}>{nation.name}</Text>
      <Text style={s.nationMeta}>{words(nation.government)} · {provinces} {provinces === 1 ? 'province' : 'provinces'}</Text>
    </View>
    {rank > 0 && rank <= 8 && <Text style={s.rank}>GP {rank}</Text>}
  </Pressable>;
}
export function CampaignSetup({ onBack, onStart, busy, notice }: { onBack: () => void; onStart: (config: CampaignConfig) => void; busy: boolean; notice: string }) {
  const [name, setName] = useState('');
  const [seedInput, setSeed] = useState('1830');
  const [scenarioId, setScenarioId] = useState(DEFAULT_SCENARIO_ID);
  const scenarios = useMemo(() => listScenarios().filter((s) => s.status === 'playable' || s.status === 'preview'), []);
  const [mode, setMode] = useState<CampaignMapMode>('historical');
  const [query, setQuery] = useState('');
  const [nationTag, setNationTag] = useState('ENG');
  const [autosave, setAutosave] = useState(5);
  const [step, setStep] = useState<'world' | 'nation'>('world');
  const seed = validSeed(seedInput);
  const roster = useMemo(() => campaignRoster(seed ?? 1830, mode, scenarioId), [seed, mode, scenarioId]);
  const nations = roster.nations.filter((n) => !['UNC', 'UNA', 'COL'].includes(n.tag));
  const selected = nations.find((n) => n.tag === nationTag) ?? nations[0];
  const owned = roster.provinces.filter((p) => p.ownerTag === selected.tag);
  const provinceCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of roster.provinces) counts.set(p.ownerTag, (counts.get(p.ownerTag) ?? 0) + 1);
    return counts;
  }, [roster]);
  const matches = nations.filter((n) => `${n.name} ${n.tag}`.toLowerCase().includes(query.trim().toLowerCase()));
  const powers = matches.filter((n) => gpRankFor(n) > 0).sort((a, b) => gpRankFor(a) - gpRankFor(b));
  const others = matches.filter((n) => gpRankFor(n) === 0).sort((a, b) => a.name.localeCompare(b.name));
  const nationRow = (n: (typeof nations)[number]) => <NationRow key={n.tag} nation={n} provinces={provinceCounts.get(n.tag) ?? 0} rank={gpRankFor(n)} selected={n.tag === selected.tag} onPress={() => setNationTag(n.tag)} />;
  const scenario = loadScenario(scenarioId).manifest;
  return <ScrollView style={s.page} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
    <MenuButton label={step === 'world' ? 'Back to main menu' : 'Back to campaign options'} onPress={step === 'world' ? onBack : () => setStep('world')} disabled={busy} />
    <Text style={s.label}>NEW CAMPAIGN / {step === 'world' ? '1. WORLD' : '2. NATION'}</Text>
    <Text accessibilityRole="header" style={s.title}>{step === 'world' ? 'Shape your campaign' : 'Choose your nation'}</Text>
    {step === 'world' ? <>
      <Text style={s.label}>SCENARIO</Text>
      {scenarios.map((era) => <Choice key={era.id} title={`${era.startDate.year} · ${era.title}`} detail={`${era.status === 'preview' ? 'Preview scenario. ' : ''}${era.summary}`} selected={scenarioId === era.id} onPress={() => { setScenarioId(era.id); setNationTag('ENG'); }} />)}
      <Text style={s.text}>Start date: {scenario.startDate.day}/{scenario.startDate.month}/{scenario.startDate.year}.</Text>
      <Text style={s.label}>CAMPAIGN NAME</Text>
      <TextInput style={s.input} accessibilityLabel="Campaign name" value={name} onChangeText={setName} placeholder="My grand campaign" placeholderTextColor="#a8b8b9" maxLength={60} />
      <Text style={s.label}>WORLD RULES</Text>
      {CAMPAIGN_MAP_MODES.map((m) => <Choice key={m.id} title={m.label} detail={m.blurb} selected={mode === m.id} onPress={() => setMode(m.id)} />)}
      <Text style={s.label}>WORLD SEED</Text>
      <TextInput style={s.input} accessibilityLabel="World seed" value={seedInput} onChangeText={setSeed} keyboardType="number-pad" maxLength={10} />
      {seed === null && <Text style={s.text}>Enter a whole number from 1 to 2147483647.</Text>}
      <MenuButton label="Randomize seed" onPress={() => setSeed(String(1 + Math.floor(Math.random() * 2147483646)))} />
      <Text style={s.text}>The same seed and world rules recreate the same starting world.</Text>
      <Text style={s.label}>AUTOSAVE</Text>
      <View style={s.row}>{[1, 5, 10].map((minutes) => <View style={{ flex: 1 }} key={minutes}><Choice title={`${minutes} min`} selected={autosave === minutes} onPress={() => setAutosave(minutes)} /></View>)}</View>
      <Text style={s.text}>Keeps two recovery points per campaign. Manual saves remain until you delete them.</Text>
      <MenuButton label="Choose nation" disabled={seed === null || busy} onPress={() => setStep('nation')} />
    </> : <>
      <View style={s.card}>
        <View style={s.row}><NationFlag tag={selected.tag} name={selected.name} color={selected.color} size={36} /><Text style={[s.heading, { flex: 1 }]}>{selected.name}</Text></View>
        <Text style={s.text}>{words(selected.government)} · {owned.length} provinces{gpRankFor(selected) > 0 ? ` · Great Power #${gpRankFor(selected)}` : ''}</Text>
        <Text style={s.text}>{selected.eraSummary ?? `Capital: ${roster.provinces.find((p) => p.id === selected.capitalProvinceId)?.name ?? 'Unknown'}. Lead ${selected.primaryCulture.replaceAll('_', ' ')} society into a new century.`}</Text>
        <Text style={s.text}>{name.trim() || `${selected.name} campaign`} · Seed {seed} · Autosave every {autosave} min</Text>
        <MenuButton label={`Begin campaign as ${selected.name}`} disabled={busy} onPress={() => { if (seed !== null) onStart({ id: newSaveId(), name: name.trim() || `${selected.name} campaign`, seed, mapMode: mode, scenarioId, playerNation: roster.nations.indexOf(selected), autosaveMinutes: autosave }); }} />
      </View>
      <TextInput style={s.input} accessibilityLabel="Search nations" placeholder="Search nations" placeholderTextColor="#a8b8b9" value={query} onChangeText={setQuery} />
      {powers.length > 0 && <Text style={s.label}>GREAT POWERS</Text>}
      {powers.map(nationRow)}
      {others.length > 0 && <Text style={s.label}>{powers.length > 0 ? 'OTHER NATIONS' : 'NATIONS'}</Text>}
      {others.map(nationRow)}
      {matches.length === 0 && <Text style={s.text}>No nation matches "{query.trim()}".</Text>}
    </>}
    {busy && <Text style={s.text}>Preparing and saving your campaign...</Text>}
    {!!notice && <Text accessibilityRole="alert" style={s.text}>{notice}</Text>}
  </ScrollView>;
}
export function SaveLibrary({ onBack, onLoad, onSave, busy, notice, campaignName }: { onBack: () => void; onLoad: (save: NativeSave) => void; onSave?: (label: string) => Promise<boolean>; busy: boolean; notice: string; campaignName?: string }) {
  const [revision, setRevision] = useState(0);
  const [label, setLabel] = useState(campaignName ?? '');
  const [error, setError] = useState('');
  const saves = useMemo(() => { try { return listNativeSaves(); } catch { return null; } }, [revision, busy]);
  return <ScrollView style={s.page} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
    <MenuButton label="Back to main menu" onPress={onBack} disabled={busy} />
    <Text style={s.label}>YOUR CAMPAIGNS</Text><Text accessibilityRole="header" style={s.title}>Save library</Text>
    <Text style={s.text}>Saved on this device. Each checkpoint can be loaded independently.</Text>
    {!!(error || notice) && <Text accessibilityRole="alert" style={s.text}>{error || notice}</Text>}
    {onSave && <View style={s.card}><Text style={s.heading}>Save current campaign</Text><TextInput style={s.input} accessibilityLabel="Save name" value={label} onChangeText={setLabel} maxLength={80} /><MenuButton label="Create save" disabled={busy} onPress={() => { void onSave(label).then(() => setRevision((n) => n + 1)); }} /></View>}
    {saves === null && <><Text style={s.text}>Could not read your saves. Your files have not been changed.</Text><MenuButton label="Retry saves" onPress={() => setRevision((n) => n + 1)} /></>}
    {saves?.length === 0 && <Text style={s.text}>No saves yet. Start a campaign to create your first checkpoint.</Text>}
    {saves?.map((save) => <View style={s.card} key={save.id}>
      <Text style={s.label}>{save.kind === 'auto' ? 'AUTOSAVE' : 'MANUAL SAVE'} / {save.config.name}</Text><Text style={s.heading}>{save.label}</Text>
      <Text style={s.text}>{save.nation} · {save.date}</Text><Text style={s.text}>{new Date(save.updatedAt).toLocaleString()}</Text>
      <MenuButton label={`Load ${save.label}`} disabled={busy} onPress={() => onLoad(save)} />
      <MenuButton label={`Delete ${save.label}`} disabled={busy} onPress={() => Alert.alert('Delete this save?', `${save.label} (${save.nation}, ${save.date}) will be permanently removed from this device. Other saves are kept.`, [{ text: 'Keep save', style: 'cancel' }, { text: 'Delete save', style: 'destructive', onPress: () => { try { deleteNativeSave(save.id); setError(''); setRevision((n) => n + 1); } catch { setError('Could not delete this save. Please try again.'); } } }])} />
    </View>)}
    {busy && <Text style={s.text}>Working...</Text>}
  </ScrollView>;
}
