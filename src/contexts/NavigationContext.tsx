import { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

interface TabHistoryEntry {
  tabId: string;
  timestamp: number;
}

interface NavigationContextType {
  // Tab history management
  tabHistory: TabHistoryEntry[];
  currentTab: string;
  setCurrentTab: (tabId: string) => void;
  
  // Navigation actions
  goBack: (availableTabs: string[], fallbackPath?: string) => void;
  goNext: (availableTabs: string[]) => void;
  
  // State checks
  canGoBack: (availableTabs: string[]) => boolean;
  canGoNext: (availableTabs: string[]) => boolean;
  isFirstTab: (availableTabs: string[]) => boolean;
  isLastTab: (availableTabs: string[]) => boolean;
  
  // Reset history (e.g., when entering a new group)
  resetHistory: () => void;
}

const NavigationContext = createContext<NavigationContextType | undefined>(undefined);

export function NavigationProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  
  const [tabHistory, setTabHistory] = useState<TabHistoryEntry[]>([]);
  const [currentTab, setCurrentTabState] = useState<string>('');
  
  // Track current route to reset history when navigating to different pages
  const [lastRoute, setLastRoute] = useState<string>('');
  
  useEffect(() => {
    const currentPath = location.pathname;
    // Reset history when navigating to a completely different route
    // (e.g., from /groups/123 to /groups/456 or /dashboard)
    const currentBase = currentPath.split('/').slice(0, 3).join('/');
    const lastBase = lastRoute.split('/').slice(0, 3).join('/');
    
    if (currentBase !== lastBase) {
      setTabHistory([]);
      setCurrentTabState('');
    }
    setLastRoute(currentPath);
  }, [location.pathname, lastRoute]);
  
  const setCurrentTab = useCallback((tabId: string) => {
    if (tabId === currentTab) return;
    
    // Add to history if not the same as current
    if (currentTab) {
      setTabHistory(prev => {
        // Prevent duplicates at the end
        const lastEntry = prev[prev.length - 1];
        if (lastEntry?.tabId === currentTab) {
          return prev;
        }
        return [...prev, { tabId: currentTab, timestamp: Date.now() }];
      });
    }
    
    setCurrentTabState(tabId);
  }, [currentTab]);
  
  const resetHistory = useCallback(() => {
    setTabHistory([]);
    setCurrentTabState('');
  }, []);
  
  const isFirstTab = useCallback((availableTabs: string[]) => {
    if (availableTabs.length === 0) return true;
    return currentTab === availableTabs[0];
  }, [currentTab]);
  
  const isLastTab = useCallback((availableTabs: string[]) => {
    if (availableTabs.length === 0) return true;
    return currentTab === availableTabs[availableTabs.length - 1];
  }, [currentTab]);
  
  const canGoBack = useCallback((availableTabs: string[]) => {
    // Can go back if there's history or if not on first tab
    if (tabHistory.length > 0) return true;
    if (!currentTab) return false;
    
    const currentIndex = availableTabs.indexOf(currentTab);
    return currentIndex > 0;
  }, [tabHistory, currentTab]);
  
  const canGoNext = useCallback((availableTabs: string[]) => {
    if (!currentTab) return availableTabs.length > 0;
    
    const currentIndex = availableTabs.indexOf(currentTab);
    return currentIndex >= 0 && currentIndex < availableTabs.length - 1;
  }, [currentTab]);
  
  const goBack = useCallback((availableTabs: string[], fallbackPath?: string) => {
    // First, try to pop from history
    if (tabHistory.length > 0) {
      const newHistory = [...tabHistory];
      let targetTab: string | null = null;
      
      // Find the most recent valid tab in history
      while (newHistory.length > 0 && !targetTab) {
        const entry = newHistory.pop()!;
        if (availableTabs.includes(entry.tabId)) {
          targetTab = entry.tabId;
        }
      }
      
      if (targetTab) {
        setTabHistory(newHistory);
        setCurrentTabState(targetTab);
        return;
      }
    }
    
    // Fallback: go to previous tab in flow
    const currentIndex = availableTabs.indexOf(currentTab);
    if (currentIndex > 0) {
      const prevTab = availableTabs[currentIndex - 1];
      setCurrentTabState(prevTab);
      return;
    }
    
    // If at first tab or no tabs, optionally navigate away
    // But NEVER automatically go to lobby - only if explicitly requested
    if (fallbackPath) {
      navigate(fallbackPath);
    }
  }, [tabHistory, currentTab, navigate]);
  
  const goNext = useCallback((availableTabs: string[]) => {
    const currentIndex = availableTabs.indexOf(currentTab);
    
    // If not found or at last tab, do nothing
    if (currentIndex < 0 || currentIndex >= availableTabs.length - 1) {
      return;
    }
    
    // Find next valid tab
    const nextTab = availableTabs[currentIndex + 1];
    setCurrentTab(nextTab);
  }, [currentTab, setCurrentTab]);
  
  return (
    <NavigationContext.Provider 
      value={{ 
        tabHistory,
        currentTab,
        setCurrentTab,
        goBack,
        goNext,
        canGoBack,
        canGoNext,
        isFirstTab,
        isLastTab,
        resetHistory
      }}
    >
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation() {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error('useNavigation must be used within a NavigationProvider');
  }
  return context;
}
