import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type PresenceStatus = 'online' | 'idle' | 'offline';

export interface UserPresence {
  status: PresenceStatus;
  lastSeen: string;
  userId: string;
}

export function useUserPresence(groupId?: string) {
  const { user } = useAuth();
  const [presenceMap, setPresenceMap] = useState<Map<string, UserPresence>>(new Map());
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!user || !groupId) return;

    setIsConnected(false);
    setPresenceMap(new Map());

    const channelName = `presence:${groupId}`;
    const channel = supabase.channel(channelName, {
      config: {
        presence: { key: user.id },
      },
    });

    let idleTimeout: ReturnType<typeof setTimeout> | null = null;
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

        const next = new Map<string, UserPresence>();
        Object.entries(state).forEach(([key, presences]) => {
          if (presences && presences.length > 0) {
            const latestPresence = presences[presences.length - 1];
            const id = latestPresence.userId || key;
            next.set(id, {
              status: latestPresence.status || 'online',
              lastSeen: latestPresence.lastSeen || new Date().toISOString(),
              userId: id,
            });
          }
        });

        setPresenceMap(next);
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        if (!newPresences || newPresences.length === 0) return;
        const presence = newPresences[newPresences.length - 1];
        const id = presence.userId || key;

        setPresenceMap((prev) => {
          const next = new Map(prev);
          next.set(id, {
            status: presence.status || 'online',
            lastSeen: presence.lastSeen || new Date().toISOString(),
            userId: id,
          });
          return next;
        });
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        const id = leftPresences?.[0]?.userId || key;
        setPresenceMap((prev) => {
          const next = new Map(prev);
          next.set(id, {
            status: 'offline',
            lastSeen: new Date().toISOString(),
            userId: id,
          });
          return next;
        });
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          setIsConnected(true);
          await updatePresence('online');
          handleActivity();
        }
      });

    // Activity listeners
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'] as const;
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
      if (idleTimeout) clearTimeout(idleTimeout);
      events.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
      document.removeEventListener('visibilitychange', handleVisibilityChange);

      supabase.removeChannel(channel);
    };
  }, [user, groupId]);

  const getPresenceStatus = useCallback(
    (userId: string): PresenceStatus => {
      const presence = presenceMap.get(userId);
      return presence?.status || 'offline';
    },
    [presenceMap]
  );

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

