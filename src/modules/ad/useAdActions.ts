// Kontextaktionen der AD-Konsole, die aus Liste, Kontextmenü und Eigenschaftenfenstern genutzt werden

import { useMemo } from 'react'
import { A } from '@/core/actions'
import { findComputer, findUser, primaryComputerOf, setComputerEnabled, setUserEnabled, unlockUser } from '@/core/ops/ad'
import { useStore } from '@/core/store'
import { useRun } from './parts'

/** Eigene Aktionstypen (noch nicht in core/actions.ts eingetragen) */
export const AD_GROUP_UPDATED = A.adGroupUpdated

export function useAdActions() {
  const run = useRun()
  const toast = useStore((s) => s.toast)
  const openRdp = useStore((s) => s.openRdp)
  const navigate = useStore((s) => s.navigate)
  const openBrowser = useStore((s) => s.openBrowser)

  return useMemo(() => {
    const world = () => useStore.getState().world
    return {
      unlock(sam: string) {
        const u = findUser(world(), sam)
        if (!u) return toast('Benutzer nicht gefunden.', 'error')
        if (!u.lockedOut) return toast(`Das Konto „${u.displayName}“ ist nicht gesperrt.`, 'info')
        run((w) => unlockUser(w, u.sam), { type: A.adUnlock, target: u.sam }, `Das Konto „${u.displayName}“ wurde entsperrt.`)
      },
      setUserEnabled(sam: string, enabled: boolean) {
        const u = findUser(world(), sam)
        if (!u) return toast('Benutzer nicht gefunden.', 'error')
        if (u.enabled === enabled) return toast(`Das Konto ist bereits ${enabled ? 'aktiviert' : 'deaktiviert'}.`, 'info')
        if (!enabled && u.sam === world().tech.sam) return toast('Sie können Ihr eigenes Konto nicht deaktivieren.', 'error')
        run((w) => setUserEnabled(w, u.sam, enabled), { type: enabled ? A.adUserEnabled : A.adUserDisabled, target: u.sam }, `Das Objekt „${u.displayName}“ wurde ${enabled ? 'aktiviert' : 'deaktiviert'}.`)
      },
      rdpUser(sam: string) {
        const c = primaryComputerOf(world(), sam)
        if (!c) return toast('Diesem Benutzer ist kein Computer zugeordnet (Attribut „Verwaltet von“ am Computerobjekt).', 'warning')
        openRdp(c.name)
      },
      rdpComputer(name: string) {
        const c = findComputer(world(), name)
        if (!c) return toast('Computer nicht gefunden.', 'error')
        openRdp(c.name)
      },
      setComputerEnabled(name: string, enabled: boolean) {
        const c = findComputer(world(), name)
        if (!c) return toast('Computer nicht gefunden.', 'error')
        if (c.enabled === enabled) return toast(`Das Computerkonto ist bereits ${enabled ? 'aktiviert' : 'deaktiviert'}.`, 'info')
        run((w) => setComputerEnabled(w, c.name, enabled), { type: A.adComputerUpdated, target: c.name, detail: enabled ? 'aktiviert' : 'deaktiviert' }, `Das Computerkonto „${c.name}“ wurde ${enabled ? 'aktiviert' : 'deaktiviert'}.`)
      },
      inventory(hostname: string) {
        navigate('assets', { hostname })
      },
      cloudAdmin(upn: string) {
        openBrowser(`https://admin.cloudadmin.example/users/${upn}`)
      },
    }
  }, [run, toast, openRdp, navigate, openBrowser])
}
