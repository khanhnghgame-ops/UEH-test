import * as React from "react";
import { format, startOfDay, setHours, setMinutes } from "date-fns";
import { vi } from "date-fns/locale";
import { CalendarIcon, Clock, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

interface DateTimePickerSeparateProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  defaultHour?: number;
  defaultMinute?: number;
}

export function DateTimePickerSeparate({ 
  value, 
  onChange, 
  placeholder = "Chọn ngày", 
  className,
  defaultHour = 22,
  defaultMinute = 0
}: DateTimePickerSeparateProps) {
  const [isDateOpen, setIsDateOpen] = React.useState(false);
  
  const dateValue = value ? new Date(value) : undefined;
  const hours = dateValue ? dateValue.getHours() : defaultHour;
  const minutes = dateValue ? dateValue.getMinutes() : defaultMinute;

  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      // Use existing time or default time
      const existingHours = dateValue ? dateValue.getHours() : defaultHour;
      const existingMinutes = dateValue ? dateValue.getMinutes() : defaultMinute;
      const newDate = setMinutes(setHours(date, existingHours), existingMinutes);
      onChange(newDate.toISOString().slice(0, 16));
      setIsDateOpen(false);
    }
  };

  const handleTimeChange = (type: 'hours' | 'minutes', val: string) => {
    const numVal = parseInt(val, 10);
    let newDate = dateValue || startOfDay(new Date());
    
    if (type === 'hours') {
      newDate = setHours(newDate, numVal);
      newDate = setMinutes(newDate, minutes);
    } else {
      newDate = setHours(newDate, hours);
      newDate = setMinutes(newDate, numVal);
    }
    
    onChange(newDate.toISOString().slice(0, 16));
  };

  const generateHourOptions = () => {
    return Array.from({ length: 24 }, (_, i) => ({
      value: i.toString(),
      label: i.toString().padStart(2, '0'),
    }));
  };

  const generateMinuteOptions = () => {
    // Only show 00, 15, 30, 45 for cleaner UI
    return [0, 15, 30, 45].map(i => ({
      value: i.toString(),
      label: i.toString().padStart(2, '0'),
    }));
  };

  const clearValue = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
  };

  return (
    <div className={cn("flex flex-col sm:flex-row gap-3", className)}>
      {/* Date Picker */}
      <div className="flex-1 space-y-1.5">
        <Label className="text-xs text-muted-foreground">Ngày deadline</Label>
        <Popover open={isDateOpen} onOpenChange={setIsDateOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "w-full justify-start text-left font-normal h-10",
                !value && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
              <span className="flex-1 truncate">
                {dateValue ? (
                  format(dateValue, "dd/MM/yyyy", { locale: vi })
                ) : (
                  placeholder
                )}
              </span>
              {value && (
                <X 
                  className="h-4 w-4 opacity-50 hover:opacity-100 shrink-0" 
                  onClick={clearValue}
                />
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0 bg-popover border shadow-lg" align="start">
            <Calendar
              mode="single"
              selected={dateValue}
              onSelect={handleDateSelect}
              initialFocus
              className="p-3 pointer-events-auto"
              locale={vi}
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* Time Picker */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Giờ deadline</Label>
        <div className="flex items-center gap-1.5 h-10">
          <div className="flex items-center gap-1 px-3 py-2 border rounded-md bg-background">
            <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
            <Select
              value={hours.toString()}
              onValueChange={(val) => handleTimeChange('hours', val)}
              disabled={!dateValue}
            >
              <SelectTrigger className="w-14 h-7 text-sm border-0 bg-transparent p-0 focus:ring-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-48 bg-popover">
                {generateHourOptions().map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="text-sm">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-muted-foreground font-medium">:</span>
            <Select
              value={minutes.toString()}
              onValueChange={(val) => handleTimeChange('minutes', val)}
              disabled={!dateValue}
            >
              <SelectTrigger className="w-14 h-7 text-sm border-0 bg-transparent p-0 focus:ring-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-48 bg-popover">
                {generateMinuteOptions().map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="text-sm">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {!dateValue && (
            <span className="text-xs text-muted-foreground italic">Mặc định: 22:00</span>
          )}
        </div>
      </div>
    </div>
  );
}
