'use client';

import { useEffect, useState } from 'react';
import { Download, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PwaInstall() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [online, setOnline] = useState(true);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    setOnline(navigator.onLine);
    setInstalled(window.matchMedia('(display-mode: standalone)').matches);
    navigator.serviceWorker?.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => undefined);
    const ready = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPromptEvent); };
    const wentOnline = () => setOnline(true);
    const wentOffline = () => setOnline(false);
    const appInstalled = () => { setInstalled(true); setInstallPrompt(null); };
    window.addEventListener('beforeinstallprompt', ready);
    window.addEventListener('online', wentOnline);
    window.addEventListener('offline', wentOffline);
    window.addEventListener('appinstalled', appInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', ready);
      window.removeEventListener('online', wentOnline);
      window.removeEventListener('offline', wentOffline);
      window.removeEventListener('appinstalled', appInstalled);
    };
  }, []);

  if (!online) return <span className="hidden items-center gap-1.5 rounded-xl bg-[#fff0e9] px-3 py-2 text-xs font-bold text-[#b44e38] sm:flex"><WifiOff className="size-4"/> Offline</span>;
  if (!installPrompt || installed) return null;
  return <Button variant="outline" className="hidden h-10 rounded-xl sm:flex" onClick={async()=>{await installPrompt.prompt();const choice=await installPrompt.userChoice;if(choice.outcome==='accepted')setInstallPrompt(null)}}><Download/> Install app</Button>;
}