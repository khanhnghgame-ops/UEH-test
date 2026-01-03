import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { HardDrive, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FileSizeLimitSelectorProps {
  value: number; // in bytes
  onChange: (value: number) => void;
  disabled?: boolean;
}

const PRESET_OPTIONS = [
  { label: '10 MB', value: 10 * 1024 * 1024, isDefault: true },
  { label: '50 MB', value: 50 * 1024 * 1024, isDefault: false },
  { label: '100 MB', value: 100 * 1024 * 1024, isDefault: false },
];

const MAX_CUSTOM_MB = 500;
const MIN_CUSTOM_MB = 1;

export function formatFileSizeMB(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) {
    return mb % 1 === 0 ? `${mb} MB` : `${mb.toFixed(1)} MB`;
  }
  return `${(bytes / 1024).toFixed(0)} KB`;
}

export default function FileSizeLimitSelector({
  value,
  onChange,
  disabled = false
}: FileSizeLimitSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [customValue, setCustomValue] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);

  // Check if current value matches a preset
  const matchedPreset = PRESET_OPTIONS.find(opt => opt.value === value);
  const isCustom = !matchedPreset && value !== PRESET_OPTIONS[0].value;

  const handlePresetSelect = (presetValue: number) => {
    onChange(presetValue);
    setShowCustomInput(false);
    setIsOpen(false);
  };

  const handleCustomSubmit = () => {
    const mb = parseFloat(customValue);
    if (!isNaN(mb) && mb >= MIN_CUSTOM_MB && mb <= MAX_CUSTOM_MB) {
      onChange(Math.round(mb * 1024 * 1024));
      setShowCustomInput(false);
      setIsOpen(false);
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          className={cn(
            "h-7 px-2 text-xs gap-1.5 font-normal",
            isCustom && "border-primary/50"
          )}
        >
          <HardDrive className="w-3 h-3 text-muted-foreground" />
          {isCustom ? formatFileSizeMB(value) : matchedPreset?.label || '10 MB'}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-2" align="start">
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground uppercase px-1">
            Giới hạn upload
          </Label>
          
          {PRESET_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => handlePresetSelect(option.value)}
              className={cn(
                "w-full flex items-center justify-between px-2 py-1.5 rounded text-xs transition-colors",
                value === option.value 
                  ? "bg-primary/10 text-primary" 
                  : "hover:bg-muted"
              )}
            >
              <span className="flex items-center gap-2">
                {option.label}
                {option.isDefault && (
                  <span className="text-[9px] text-muted-foreground">(mặc định)</span>
                )}
              </span>
              {value === option.value && <Check className="w-3 h-3" />}
            </button>
          ))}

          <div className="border-t pt-1 mt-1">
            {showCustomInput ? (
              <div className="flex gap-1">
                <Input
                  type="number"
                  placeholder={`${MIN_CUSTOM_MB}-${MAX_CUSTOM_MB}`}
                  value={customValue}
                  onChange={(e) => setCustomValue(e.target.value)}
                  className="h-7 text-xs"
                  min={MIN_CUSTOM_MB}
                  max={MAX_CUSTOM_MB}
                  autoFocus
                />
                <Button
                  type="button"
                  size="sm"
                  className="h-7 px-2"
                  onClick={handleCustomSubmit}
                >
                  MB
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setCustomValue(isCustom ? String(Math.round(value / (1024 * 1024))) : '');
                  setShowCustomInput(true);
                }}
                className={cn(
                  "w-full flex items-center justify-between px-2 py-1.5 rounded text-xs transition-colors",
                  isCustom 
                    ? "bg-primary/10 text-primary" 
                    : "hover:bg-muted text-muted-foreground"
                )}
              >
                <span>Tùy chỉnh...</span>
                {isCustom && (
                  <span className="text-primary">{formatFileSizeMB(value)}</span>
                )}
              </button>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
