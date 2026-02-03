import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PWAInstallPrompt() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Check if running on iOS
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent);
    setIsIOS(isIOSDevice);

    // Handle beforeinstallprompt event (Android/Chrome)
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Handle app installed event
    const handleAppInstalled = () => {
      console.log('PWA was installed');
      setShowPrompt(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`User response: ${outcome}`);
      setShowPrompt(false);
      setDeferredPrompt(null);
    } catch (error) {
      console.error('Installation failed:', error);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
  };

  if (!showPrompt && !isIOS) return null;

  // Show iOS install instructions
  if (isIOS && !showPrompt) {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-white border-t border-gray-200 shadow-2xl animate-slide-up">
        <div className="max-w-7xl mx-auto flex items-start gap-4">
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900 mb-1">Install KalaboBoarding</h3>
            <p className="text-sm text-gray-600 mb-3">
              Tap the Share button, then select "Add to Home Screen" to install the app on your iOS device.
            </p>
          </div>
          <button
            onClick={handleDismiss}
            className="flex-shrink-0 p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X size={20} className="text-gray-500" />
          </button>
        </div>
      </div>
    );
  }

  // Show Android install prompt
  if (showPrompt && deferredPrompt) {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-gradient-to-r from-blue-600 to-blue-700 shadow-2xl animate-slide-up">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 flex-1">
            <Download size={24} className="text-white flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-white">Install KalaboBoarding</h3>
              <p className="text-blue-100 text-sm">Get instant access on your home screen</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleDismiss}
              className="px-4 py-2 text-blue-100 hover:bg-blue-500/30 rounded-lg transition-colors font-medium"
            >
              Not now
            </button>
            <button
              onClick={handleInstallClick}
              className="px-6 py-2 bg-white text-blue-600 rounded-lg font-semibold hover:bg-blue-50 transition-colors shadow-lg"
            >
              Install
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
