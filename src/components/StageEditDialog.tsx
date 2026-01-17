import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';
import type { Stage } from '@/types/database';

interface StageEditDialogProps {
  stage: Stage | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  groupId: string;
}

export default function StageEditDialog({
  stage,
  isOpen,
  onClose,
  onSave,
  groupId,
}: StageEditDialogProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [name, setName] = useState(stage?.name || '');
  const [description, setDescription] = useState(stage?.description || '');

  // Reset form when stage changes or dialog opens
  useEffect(() => {
    if (stage && isOpen) {
      setName(stage.name);
      setDescription(stage.description || '');
    }
  }, [stage, isOpen]);

  const handleSave = async () => {
    if (!stage) return;
    if (!name.trim()) {
      toast({
        title: 'Lỗi',
        description: 'Vui lòng nhập tên giai đoạn',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await supabase
        .from('stages')
        .update({
          name: name.trim(),
          description: description.trim() || null,
        })
        .eq('id', stage.id);

      if (error) throw error;

      // Log activity
      await supabase.from('activity_logs').insert({
        user_id: user!.id,
        user_name: user?.email || 'Unknown',
        action: 'UPDATE_STAGE',
        action_type: 'stage',
        description: `Đổi tên giai đoạn thành "${name.trim()}"`,
        group_id: groupId,
        metadata: { stage_id: stage.id, old_name: stage.name, new_name: name.trim() }
      });

      toast({
        title: 'Thành công',
        description: 'Đã cập nhật giai đoạn',
      });

      onSave();
      onClose();
    } catch (error: any) {
      toast({
        title: 'Lỗi',
        description: error.message || 'Không thể cập nhật giai đoạn',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };


  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">Chỉnh sửa giai đoạn</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-5 py-4">
          <div className="space-y-2">
            <Label htmlFor="stage-name" className="text-sm font-medium">
              Tên giai đoạn <span className="text-destructive">*</span>
            </Label>
            <Input
              id="stage-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nhập tên giai đoạn..."
              className="h-11"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="stage-description" className="text-sm font-medium">Mô tả</Label>
            <Textarea
              id="stage-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Mô tả giai đoạn (tùy chọn)..."
              rows={3}
              className="resize-none"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Hủy</Button>
          <Button onClick={handleSave} disabled={isLoading} className="min-w-24">
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Đang lưu...
              </>
            ) : (
              'Lưu thay đổi'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
