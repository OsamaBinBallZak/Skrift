import { useMemo, useState } from 'react';
import { Modal, View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import type { Ambiguity, AmbiguityCandidate } from '../lib/sanitise';

type Props = {
  visible: boolean;
  occurrences: Ambiguity[];
  onResolve: (decisions: Record<string, string>) => void;
  onCancel: () => void;
};

/**
 * Mobile port of frontend-new/src/components/DisambiguationModal.tsx.
 *
 * Flat list of (alias, offset) rows: pick a candidate per ambiguity. When
 * the same alias appears multiple times, a "use this for all `Alex`s below"
 * shortcut lets the user resolve them in one tap.
 *
 * The resolved decisions map is keyed `${alias}@${offset}` and value is
 * the canonical chosen — same shape sanitise.ts expects.
 */
export function DisambiguationModal({ visible, occurrences, onResolve, onCancel }: Props) {
  const { theme } = useTheme();
  const [choices, setChoices] = useState<Record<string, string>>({});

  const grouped = useMemo(() => {
    const map = new Map<string, Ambiguity[]>();
    for (const o of occurrences) {
      const arr = map.get(o.alias) ?? [];
      arr.push(o);
      map.set(o.alias, arr);
    }
    return Array.from(map.entries());
  }, [occurrences]);

  const totalCount = occurrences.length;
  const resolvedCount = Object.keys(choices).length;
  const allResolved = resolvedCount >= totalCount;

  function key(o: Ambiguity) {
    return `${o.alias}@${o.offset}`;
  }

  function setChoice(o: Ambiguity, canonical: string) {
    setChoices((prev) => ({ ...prev, [key(o)]: canonical }));
  }

  function applyToAllInGroup(alias: string, canonical: string) {
    setChoices((prev) => {
      const next = { ...prev };
      for (const o of occurrences) {
        if (o.alias === alias) {
          next[key(o)] = canonical;
        }
      }
      return next;
    });
  }

  const styles = StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: '#0009',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: theme.bg,
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      maxHeight: '85%',
      paddingBottom: 24,
    },
    header: {
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
    },
    title: {
      fontSize: 17,
      fontWeight: '600',
      color: theme.textPrimary,
    },
    subtitle: {
      fontSize: 13,
      color: theme.textSecondary,
      marginTop: 4,
    },
    content: {
      padding: 16,
    },
    aliasGroup: {
      marginBottom: 18,
    },
    aliasHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    aliasName: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.textPrimary,
    },
    aliasCount: {
      fontSize: 12,
      color: theme.textMuted,
    },
    occurrence: {
      backgroundColor: theme.surface,
      borderRadius: 10,
      padding: 12,
      marginBottom: 8,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
    },
    contextRow: {
      fontSize: 13,
      color: theme.textSecondary,
      marginBottom: 8,
    },
    contextHighlight: {
      color: theme.accent,
      fontWeight: '600',
    },
    candidateRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    candidate: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      backgroundColor: theme.surfaceHover,
    },
    candidateSelected: {
      backgroundColor: theme.accent + '30',
      borderColor: theme.accent,
    },
    candidateText: {
      color: theme.textPrimary,
      fontSize: 13,
      fontWeight: '500',
    },
    applyAllRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginBottom: 6,
    },
    applyAllChip: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 6,
      backgroundColor: theme.surfaceHover,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
    },
    applyAllText: {
      fontSize: 11,
      color: theme.textSecondary,
    },
    footer: {
      flexDirection: 'row',
      gap: 12,
      paddingHorizontal: 20,
      paddingTop: 12,
    },
    footerBtn: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cancelBtn: {
      backgroundColor: theme.surfaceHover,
    },
    confirmBtn: {
      backgroundColor: theme.accent,
    },
    confirmBtnDisabled: {
      opacity: 0.4,
    },
    btnText: {
      fontSize: 15,
      fontWeight: '600',
    },
    cancelText: {
      color: theme.textPrimary,
    },
    confirmText: {
      color: '#fff',
    },
  });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.header}>
            <Text style={styles.title}>Pick a name</Text>
            <Text style={styles.subtitle}>
              {resolvedCount} of {totalCount} resolved
            </Text>
          </View>

          <ScrollView style={styles.content}>
            {grouped.map(([alias, ambigs]) => (
              <View key={alias} style={styles.aliasGroup}>
                <View style={styles.aliasHeader}>
                  <Text style={styles.aliasName}>"{alias}"</Text>
                  <Text style={styles.aliasCount}>
                    {ambigs.length} {ambigs.length === 1 ? 'mention' : 'mentions'}
                  </Text>
                </View>

                {ambigs.length > 1 && (
                  <View style={styles.applyAllRow}>
                    {/* Use the first occurrence's candidates — they're identical across the group. */}
                    {ambigs[0].candidates.map((c) => (
                      <Pressable
                        key={c.canonical}
                        onPress={() => applyToAllInGroup(alias, c.canonical)}
                        style={({ pressed }) => [styles.applyAllChip, pressed && { opacity: 0.7 }]}
                      >
                        <Text style={styles.applyAllText}>
                          All → {canonicalLabel(c)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                )}

                {ambigs.map((o, i) => {
                  const chosen = choices[key(o)];
                  return (
                    <View key={`${alias}-${o.offset}-${i}`} style={styles.occurrence}>
                      <Text style={styles.contextRow}>
                        …{o.contextBefore}
                        <Text style={styles.contextHighlight}>{o.alias}</Text>
                        {o.contextAfter}…
                      </Text>
                      <View style={styles.candidateRow}>
                        {o.candidates.map((c) => (
                          <Pressable
                            key={c.canonical}
                            onPress={() => setChoice(o, c.canonical)}
                            style={({ pressed }) => [
                              styles.candidate,
                              chosen === c.canonical && styles.candidateSelected,
                              pressed && { opacity: 0.7 },
                            ]}
                          >
                            <Text style={styles.candidateText}>{canonicalLabel(c)}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  );
                })}
              </View>
            ))}
          </ScrollView>

          <View style={styles.footer}>
            <Pressable
              onPress={onCancel}
              style={({ pressed }) => [styles.footerBtn, styles.cancelBtn, pressed && { opacity: 0.7 }]}
            >
              <Text style={[styles.btnText, styles.cancelText]}>Skip</Text>
            </Pressable>
            <Pressable
              disabled={!allResolved}
              onPress={() => onResolve(choices)}
              style={({ pressed }) => [
                styles.footerBtn,
                styles.confirmBtn,
                !allResolved && styles.confirmBtnDisabled,
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text style={[styles.btnText, styles.confirmText]}>Apply</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function canonicalLabel(c: AmbiguityCandidate): string {
  if (c.canonical.startsWith('[[') && c.canonical.endsWith(']]')) {
    return c.canonical.slice(2, -2);
  }
  return c.canonical;
}
