import { createContext, useContext, useState, type ReactNode } from 'react';
import { boot } from './boot';

export interface Session { user: string; csrf: string }
interface Ctx {
  session: Session | null;
  setSession: (s: Session | null) => void;
  /** console account dialog opened from the menu (over the current page) */
  dialog: 'tokens' | 'password' | null;
  setDialog: (d: 'tokens' | 'password' | null) => void;
}
const C = createContext<Ctx | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(boot.session ?? null);
  const [dialog, setDialog] = useState<'tokens' | 'password' | null>(null);
  return <C.Provider value={{ session, setSession, dialog, setDialog }}>{children}</C.Provider>;
}
export function useSession() {
  const c = useContext(C);
  if (!c) throw new Error('SessionProvider missing');
  return c;
}
