import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Scale } from 'lucide-react';
import type { Stage } from '@/types/database';
import type { StageWeight } from '@/types/processScores';

interface StageWeightDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (weights: { stageId: string; weight: number }[]) => Promise<void>;
  stages: Stage[];
  currentWeights: StageWeight[];
  isLoading?: boolean;
}

export default function StageWeightDialog({
  isOpen,
  onClose,
  onSave,
  stages,
  currentWeights,
  isLoading = false,
}: StageWeightDialogProps) {
  const [weights, setWeights] = useState<Record<string, number>>({});

  useEffect(() => {
    // Initialize weights from current values or default to 1
    const initialWeights: Record<string, number> = {};
    stages.forEach(stage => {
      const existing = currentWeights.find(w => w.stage_id === stage.id);
      initialWeights[stage.id] = existing?.weight ?? 1;
    });
    setWeights(initialWeights);
  }, [stages, currentWeights, isOpen]);

  const handleSave = async () => {
    const weightArray = Object.entries(weights).map(([stageId, weight]) => ({
      stageId,
      weight,
    }));
    await onSave(weightArray);
  };

  const totalWeight = Object.values(weights).reduce((sum, w) => sum + w, 0);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scale className="w-5 h-5 text-primary" />
            Thiết lập trọng số giai đoạn
          </DialogTitle>
          <DialogDescription>
            Trọng số xác định mức độ quan trọng của mỗi giai đoạn trong điểm cuối cùng
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {stages.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Chưa có giai đoạn nào
            </p>
          ) : (
            <>
              {stages
                .sort((a, b) => a.order_index - b.order_index)
                .map((stage) => (
                  <div key={stage.id} className="flex items-center gap-4">
                    <div className="flex-1">
                      <Label className="text-sm font-medium">{stage.name}</Label>
                    </div>
                    <div className="w-24">
                      <Input
                        type="number"
                        min={0}
                        max={10}
                        step={0.5}
                        value={weights[stage.id] ?? 1}
                        onChange={(e) => setWeights(prev => ({
                          ...prev,
                          [stage.id]: Number(e.target.value)
                        }))}
                      />
                    </div>
                  </div>
                ))}

              {/* Total Weight Display */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border">
                <span className="text-sm font-medium">Tổng trọng số:</span>
                <span className="text-lg font-bold">{totalWeight.toFixed(1)}</span>
              </div>

              <p className="text-xs text-muted-foreground">
                Điểm cuối = Σ(Điểm giai đoạn × Trọng số) / Tổng trọng số
              </p>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Hủy
          </Button>
          <Button onClick={handleSave} disabled={isLoading || stages.length === 0}>
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Lưu trọng số
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
