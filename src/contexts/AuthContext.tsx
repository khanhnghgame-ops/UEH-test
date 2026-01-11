import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { Profile, UserRole, AppRole } from '@/types/database';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  roles: AppRole[];
  isLoading: boolean;
  isAdmin: boolean;
  isLeader: boolean;
  isApproved: boolean;
  mustChangePassword: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, studentId: string, fullName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    
    if (profileData) {
      setProfile(profileData as Profile);
    }

    const { data: rolesData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId);
    
    if (rolesData) {
      setRoles(rolesData.map(r => r.role as AppRole));
    }
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id);
    }
  };

  useEffect(() => {
    let isMounted = true;
    
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return;
      
      // Handle token refresh errors gracefully
      if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') {
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          // Use setTimeout to avoid blocking
          setTimeout(() => {
            if (isMounted) fetchProfile(session.user.id);
          }, 0);
        }
      } else if (event === 'SIGNED_OUT') {
        setSession(null);
        setUser(null);
        setProfile(null);
        setRoles([]);
      }
      
      if (isMounted) setIsLoading(false);
    });

    // Get initial session - handle errors gracefully
    const initSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (!isMounted) return;
        
        if (error) {
          // Handle invalid refresh token by clearing session
          console.warn('Session error:', error.message);
          setSession(null);
          setUser(null);
          setProfile(null);
          setRoles([]);
          setIsLoading(false);
          return;
        }
        
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          await fetchProfile(session.user.id);
        }
      } catch (err) {
        console.warn('Auth initialization error:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    
    initSession();

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const signUp = async (email: string, password: string, studentId: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: {
          student_id: studentId,
          full_name: fullName,
        },
      },
    });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setRoles([]);
  };

  // System-level roles (from user_roles table)
  // isAdmin: có quyền cao nhất - quản lý hệ thống, xem tất cả data
  const isAdmin = roles.includes('admin');
  
  // isLeader: được quyền tạo project mới (system-level leader hoặc admin)
  // Sau khi cleanup: chỉ admin mới có role trong user_roles, nên isLeader = isAdmin
  const isLeader = roles.includes('leader') || isAdmin;
  
  // BỎ CƠ CHẾ DUYỆT TÀI KHOẢN: tất cả user đã đăng nhập đều được xem là hợp lệ
  const isApproved = true;
  const mustChangePassword = profile?.must_change_password ?? false;

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        roles,
        isLoading,
        isAdmin,
        isLeader,
        isApproved,
        mustChangePassword,
        signIn,
        signUp,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}