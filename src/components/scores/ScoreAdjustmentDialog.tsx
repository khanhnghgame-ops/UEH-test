import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Plus, Minus } from 'lucide-react';

interface ScoreAdjustmentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (adjustment: number, reason: string) => Promise<void>;
  title: string;
  currentScore: number;
  memberName: string;
  isLoading?: boolean;
}

export default function ScoreAdjustmentDialog({
  isOpen,
  onClose,
  onSave,
  title,
  currentScore,
  memberName,
  isLoading = false,
}: ScoreAdjustmentDialogProps) {
  const [adjustment, setAdjustment] = useState<number>(0);
  const [reason, setReason] = useState('');
  const [adjustType, setAdjustType] = useState<'add' | 'subtract'>('add');

  const handleSave = async () => {
    if (!reason.trim()) return;
    const finalAdjustment = adjustType === 'subtract' ? -Math.abs(adjustment) : Math.abs(adjustment);
    await onSave(finalAdjustment, reason.trim());
    setAdjustment(0);
    setReason('');
    setAdjustType('add');
  };

  const newScore = currentScore + (adjustType === 'subtract' ? -Math.abs(adjustment) : Math.abs(adjustment));

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Điều chỉnh điểm cho <span className="font-semibold text-foreground">{memberName}</span>
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {/* Current Score Display */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
            <span className="text-sm text-muted-foreground">Điểm hiện tại:</span>
            <span className="text-lg font-bold">{currentScore.toFixed(1)}</span>
          </div>

          {/* Adjustment Type Toggle */}
          <div className="space-y-2">
            <Label>Loại điều chỉnh</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={adjustType === 'add' ? 'default' : 'outline'}
                size="sm"
                className="flex-1"
                onClick={() => setAdjustType('add')}
              >
                <Plus className="w-4 h-4 mr-1" />
                Cộng điểm
              </Button>
              <Button
                type="button"
                variant={adjustType === 'subtract' ? 'destructive' : 'outline'}
                size="sm"
                className="flex-1"
                onClick={() => setAdjustType('subtract')}
              >
                <Minus className="w-4 h-4 mr-1" />
                Trừ điểm
              </Button>
            </div>
          </div>

          {/* Adjustment Amount */}
          <div className="space-y-2">
            <Label>Số điểm điều chỉnh</Label>
            <Input
              type="number"
              min={0}
              max={100}
              step={1}
              value={adjustment}
              onChange={(e) => setAdjustment(Number(e.target.value))}
              placeholder="Nhập số điểm..."
            />
          </div>

          {/* New Score Preview */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-primary/10 border border-primary/20">
            <span className="text-sm font-medium">Điểm sau điều chỉnh:</span>
            <span className={`text-lg font-bold ${newScore < currentScore ? 'text-destructive' : 'text-green-600'}`}>
              {newScore.toFixed(1)}
            </span>
          </div>

          {/* Reason - Required */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1">
              Lý do <span className="text-destructive">*</span>
            </Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Nhập lý do điều chỉnh điểm (bắt buộc)..."
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              Lý do sẽ được hiển thị cho thành viên xem
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Hủy
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={isLoading || !reason.trim() || adjustment === 0}
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Lưu điều chỉnh
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
