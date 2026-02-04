import { useEffect, useState } from 'react';
import { Download, X, Smartphone, Globe } from 'lucide-react';

// Extended Navigator interface for iOS
interface ExtendedNavigator extends Navigator {
  standalone?: boolean;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PWAInstallPrompt() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Check if app is already installed (standalone mode)
    const checkStandalone = () => {
      // Method 1: Check display-mode
      if (window.matchMedia('(display-mode: standalone)').matches) {
        console.log('📱 App is running in standalone mode (display-mode check)');
        return true;
      }
      
      // Method 2: Check iOS-specific standalone property
      const extendedNavigator = navigator as ExtendedNavigator;
      if (extendedNavigator.standalone) {
        console.log('📱 App is running in standalone mode (iOS standalone check)');
        return true;
      }
      
      // Method 3: Check for presence of other PWA indicators
      const hasStandaloneIndicators = (
        window.matchMedia('(display-mode: fullscreen)').matches ||
        window.matchMedia('(display-mode: minimal-ui)').matches
      );
      
      return hasStandaloneIndicators;
    };

    if (checkStandalone()) {
      setIsStandalone(true);
      console.log('✅ App is already installed, hiding install prompt');
      return;
    }

    // Check platform
    const userAgent = navigator.userAgent.toLowerCase();
    const isIOSDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIOSDevice);

    // Check if already shown and dismissed recently (using localStorage)
    const dismissedAt = localStorage.getItem('pwaPromptDismissed');
    const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
    
    if (dismissedAt && (Date.now() - parseInt(dismissedAt)) < ONE_WEEK_MS) {
      console.log('⏰ Install prompt was recently dismissed, not showing');
      return;
    }

    // Handle beforeinstallprompt event (Android/Chrome)
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      console.log('🔔 PWA install prompt available (Android/Chrome)');
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      
      // Show with slight delay for better UX
      setTimeout(() => setShowPrompt(true), 1000);
    };

    // Show iOS instructions after delay if no Android prompt
    const showIOSPrompt = () => {
      setTimeout(() => {
        if (!deferredPrompt && isIOSDevice && !isStandalone) {
          console.log('📱 Showing iOS installation instructions');
          setShowPrompt(true);
        }
      }, 2000);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    
    // Only set up iOS prompt if not already in standalone mode
    if (!isStandalone) {
      showIOSPrompt();
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, [deferredPrompt, isStandalone]);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      try {
        console.log('📲 Triggering PWA installation...');
        await deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`✅ User response: ${outcome}`);
        
        if (outcome === 'accepted') {
          console.log('🎉 PWA installation accepted');
        }
        
        setShowPrompt(false);
        setDeferredPrompt(null);
        localStorage.removeItem('pwaPromptDismissed'); // Clear dismissal on install
      } catch (error) {
        console.error('❌ Installation failed:', error);
      }
    } else if (isIOS) {
      // For iOS, we can't trigger install directly, but we can show instructions
      // The actual install happens through Safari's share menu
      console.log('📱 iOS install instructions shown');
      setShowPrompt(false);
      localStorage.setItem('pwaPromptDismissed', Date.now().toString());
    }
  };

  const handleDismiss = () => {
    console.log('✋ PWA prompt dismissed');
    setShowPrompt(false);
    // Store dismissal timestamp
    localStorage.setItem('pwaPromptDismissed', Date.now().toString());
  };

  const handleClose = () => {
    console.log('❌ PWA prompt closed');
    setShowPrompt(false);
  };

  // Don't show if app is already installed or in standalone mode
  if (isStandalone) {
    console.log('🚫 Not showing prompt - app is already installed');
    return null;
  }

  if (!showPrompt) return null;

  // iOS-specific installation instructions
  if (isIOS) {
    return (
      <div className="fixed bottom-4 left-4 right-4 z-50 sm:max-w-md sm:left-auto sm:right-4">
        <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 p-4 animate-fade-in-up">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                <Smartphone size={20} className="text-white" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">Install KalaboBoarding App</h3>
                <p className="text-sm text-gray-600">Get the full app experience</p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Close"
            >
              <X size={20} className="text-gray-500" />
            </button>
          </div>
          
          <div className="space-y-3 mb-4">
            <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
              <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                <span className="text-blue-600 font-bold text-sm">1</span>
              </div>
              <p className="text-sm text-gray-700">Tap the <span className="font-semibold">Share</span> button in Safari</p>
            </div>
            
            <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
              <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                <span className="text-blue-600 font-bold text-sm">2</span>
              </div>
              <p className="text-sm text-gray-700">Scroll and select <span className="font-semibold">"Add to Home Screen"</span></p>
            </div>
            
            <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
              <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                <span className="text-blue-600 font-bold text-sm">3</span>
              </div>
              <p className="text-sm text-gray-700">Tap <span className="font-semibold">"Add"</span> to install</p>
            </div>
          </div>
          
          <div className="flex gap-2">
            <button
              onClick={handleDismiss}
              className="flex-1 py-2.5 px-4 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
            >
              Maybe later
            </button>
            <button
              onClick={handleInstallClick}
              className="flex-1 py-2.5 px-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg font-semibold hover:from-blue-700 hover:to-blue-800 transition-all shadow-sm"
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Android/Chrome PWA install prompt
  if (deferredPrompt) {
    return (
      <div className="fixed bottom-4 left-4 right-4 z-50 sm:max-w-md sm:left-auto sm:right-4">
        <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl shadow-2xl p-4 animate-fade-in-up">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <Download size={20} className="text-white" />
              </div>
              <div>
                <h3 className="font-bold text-white">Install KalaboBoarding App</h3>
                <p className="text-sm text-blue-100">Install for faster access and offline use</p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="p-1 hover:bg-white/20 rounded-lg transition-colors"
              aria-label="Close"
            >
              <X size={20} className="text-white" />
            </button>
          </div>
          
          <div className="space-y-3 mb-4">
            <div className="flex items-center gap-3 p-3 bg-white/10 rounded-lg backdrop-blur-sm">
              <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0">
                <Globe size={16} className="text-white" />
              </div>
              <p className="text-sm text-blue-50">Full Progressive Web App experience</p>
            </div>
            
            <div className="flex items-center gap-3 p-3 bg-white/10 rounded-lg backdrop-blur-sm">
              <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0">
                <Smartphone size={16} className="text-white" />
              </div>
              <p className="text-sm text-blue-50">Works offline after installation</p>
            </div>
          </div>
          
          <div className="flex gap-2">
            <button
              onClick={handleDismiss}
              className="flex-1 py-2.5 px-4 bg-white/20 text-white rounded-lg font-medium hover:bg-white/30 transition-colors backdrop-blur-sm"
            >
              Not now
            </button>
            <button
              onClick={handleInstallClick}
              className="flex-1 py-2.5 px-4 bg-white text-blue-600 rounded-lg font-semibold hover:bg-gray-50 transition-colors shadow-lg flex items-center justify-center gap-2"
            >
              <Download size={18} />
              Install App
            </button>
          </div>
          
          <p className="text-xs text-blue-200/70 text-center mt-3">
            This will install the full PWA on your device
          </p>
        </div>
      </div>
    );
  }

  return null;
}