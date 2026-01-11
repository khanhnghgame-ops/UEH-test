import { useEffect, useRef, useCallback, useState } from 'react';

interface UseAutosaveOptions {
  data: string;
  onSave: (data: string) => Promise<void>;
  delay?: number;
  enabled?: boolean;
}

export function useAutosave({ data, onSave, delay = 1500, enabled = true }: UseAutosaveOptions) {
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  
  const lastSavedData = useRef(data);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  const save = useCallback(async (dataToSave: string) => {
    if (!isMountedRef.current) return;
    
    // Don't save if data hasn't changed
    if (dataToSave === lastSavedData.current) {
      setHasUnsavedChanges(false);
      return;
    }
    
    setIsSaving(true);
    try {
      await onSave(dataToSave);
      if (isMountedRef.current) {
        lastSavedData.current = dataToSave;
        setLastSaved(new Date());
        setHasUnsavedChanges(false);
      }
    } catch (error) {
      console.error('Autosave error:', error);
    } finally {
      if (isMountedRef.current) {
        setIsSaving(false);
      }
    }
  }, [onSave]);

  // Debounced autosave effect
  useEffect(() => {
    if (!enabled) return;
    
    // Check if data has changed
    if (data !== lastSavedData.current) {
      setHasUnsavedChanges(true);
      
      // Clear previous timeout
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      
      // Set new timeout
      saveTimeoutRef.current = setTimeout(() => {
        save(data);
      }, delay);
    }
    
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [data, delay, enabled, save]);

  // Force save immediately
  const forceSave = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    save(data);
  }, [data, save]);

  // Update lastSavedData when initial data changes (e.g., when switching notes)
  const resetSavedData = useCallback((newData: string) => {
    lastSavedData.current = newData;
    setHasUnsavedChanges(false);
  }, []);

  return {
    isSaving,
    lastSaved,
    hasUnsavedChanges,
    forceSave,
    resetSavedData
  };
}
