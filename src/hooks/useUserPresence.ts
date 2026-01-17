import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type PresenceStatus = 'online' | 'idle' | 'offline';

export interface UserPresence {
  status: PresenceStatus;
  lastSeen: string;
  userId: string;
}

// Global presence map - shared across all hook instances
const globalPresenceMap = new Map<string, UserPresence>();
const listeners = new Set<() => void>();

const notifyListeners = () => {
  listeners.forEach((listener) => listener());
};

export function useUserPresence(groupId?: string) {
  const { user } = useAuth();
  const [presenceMap, setPresenceMap] = useState<Map<string, UserPresence>>(new Map());
  const [isConnected, setIsConnected] = useState(false);

  // Force re-render when global presence changes
  const forceUpdate = useCallback(() => {
    setPresenceMap(new Map(globalPresenceMap));
  }, []);

  useEffect(() => {
    if (!user || !groupId) return;

    // Register this component as a listener
    listeners.add(forceUpdate);

    const channelName = `presence:${groupId}`;
    const channel = supabase.channel(channelName, {
      config: {
        presence: { key: user.id },
      },
    });

    let idleTimeout: NodeJS.Timeout | null = null;
    let isIdle = false;

    const updatePresence = async (status: PresenceStatus) => {
      try {
        await channel.track({
          status,
          lastSeen: new Date().toISOString(),
          userId: user.id,
        });
      } catch (error) {
        console.error('Error tracking presence:', error);
      }
    };

    const handleActivity = () => {
      if (isIdle) {
        isIdle = false;
        updatePresence('online');
      }
      
      if (idleTimeout) clearTimeout(idleTimeout);
      idleTimeout = setTimeout(() => {
        isIdle = true;
        updatePresence('idle');
      }, 5 * 60 * 1000); // 5 minutes idle
    };

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<UserPresence>();
        
        // Update global presence map
        globalPresenceMap.clear();
        Object.entries(state).forEach(([key, presences]) => {
          if (presences && presences.length > 0) {
            const latestPresence = presences[presences.length - 1];
            globalPresenceMap.set(latestPresence.userId || key, {
              status: latestPresence.status || 'online',
              lastSeen: latestPresence.lastSeen || new Date().toISOString(),
              userId: latestPresence.userId || key,
            });
          }
        });
        
        notifyListeners();
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        if (newPresences && newPresences.length > 0) {
          const presence = newPresences[0];
          globalPresenceMap.set(presence.userId || key, {
            status: presence.status || 'online',
            lastSeen: presence.lastSeen || new Date().toISOString(),
            userId: presence.userId || key,
          });
          notifyListeners();
        }
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        if (leftPresences && leftPresences.length > 0) {
          const presence = leftPresences[0];
          globalPresenceMap.set(presence.userId || key, {
            status: 'offline',
            lastSeen: new Date().toISOString(),
            userId: presence.userId || key,
          });
          notifyListeners();
        }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          setIsConnected(true);
          await updatePresence('online');
          handleActivity();
        }
      });

    // Activity listeners
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach((event) => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    // Visibility change handler
    const handleVisibilityChange = () => {
      if (document.hidden) {
        updatePresence('idle');
      } else {
        updatePresence('online');
        handleActivity();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Cleanup
    return () => {
      listeners.delete(forceUpdate);
      if (idleTimeout) clearTimeout(idleTimeout);
      events.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      
      updatePresence('offline');
      supabase.removeChannel(channel);
    };
  }, [user, groupId, forceUpdate]);

  const getPresenceStatus = useCallback((userId: string): PresenceStatus => {
    const presence = presenceMap.get(userId);
    return presence?.status || 'offline';
  }, [presenceMap]);

  const isUserOnline = useCallback((userId: string): boolean => {
    return getPresenceStatus(userId) === 'online';
  }, [getPresenceStatus]);

  return {
    presenceMap,
    getPresenceStatus,
    isUserOnline,
    isConnected,
  };
}
