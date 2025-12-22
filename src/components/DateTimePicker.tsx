import * as React from "react";
import { format, addDays, addWeeks, addMonths, startOfDay, setHours, setMinutes } from "date-fns";
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

interface DateTimePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function DateTimePicker({ value, onChange, placeholder = "Chọn deadline", className }: DateTimePickerProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  
  const dateValue = value ? new Date(value) : undefined;
  const hours = dateValue ? dateValue.getHours() : 23;
  const minutes = dateValue ? dateValue.getMinutes() : 59;

  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      const newDate = setMinutes(setHours(date, hours), minutes);
      onChange(newDate.toISOString().slice(0, 16));
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

  const quickOptions = [
    { label: 'Hôm nay', value: 'today' },
    { label: 'Ngày mai', value: 'tomorrow' },
    { label: '3 ngày', value: '3days' },
    { label: '1 tuần', value: '1week' },
    { label: '2 tuần', value: '2weeks' },
    { label: '1 tháng', value: '1month' },
  ];

  const handleQuickSelect = (option: string) => {
    const now = new Date();
    let newDate: Date;

    switch (option) {
      case 'today':
        newDate = setMinutes(setHours(now, 23), 59);
        break;
      case 'tomorrow':
        newDate = setMinutes(setHours(addDays(now, 1), 23), 59);
        break;
      case '3days':
        newDate = setMinutes(setHours(addDays(now, 3), 23), 59);
        break;
      case '1week':
        newDate = setMinutes(setHours(addWeeks(now, 1), 23), 59);
        break;
      case '2weeks':
        newDate = setMinutes(setHours(addWeeks(now, 2), 23), 59);
        break;
      case '1month':
        newDate = setMinutes(setHours(addMonths(now, 1), 23), 59);
        break;
      default:
        return;
    }

    onChange(newDate.toISOString().slice(0, 16));
    setIsOpen(false);
  };

  const generateHourOptions = () => {
    return Array.from({ length: 24 }, (_, i) => ({
      value: i.toString(),
      label: i.toString().padStart(2, '0'),
    }));
  };

  const generateMinuteOptions = () => {
    return Array.from({ length: 60 }, (_, i) => ({
      value: i.toString(),
      label: i.toString().padStart(2, '0'),
    }));
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal h-11 group",
            !value && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
          <span className="flex-1 truncate">
            {value ? (
              format(new Date(value), "dd/MM/yyyy 'lúc' HH:mm", { locale: vi })
            ) : (
              placeholder
            )}
          </span>
          {value && (
            <X 
              className="h-4 w-4 opacity-50 hover:opacity-100 shrink-0" 
              onClick={(e) => {
                e.stopPropagation();
                onChange('');
              }}
            />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 bg-popover border shadow-lg" align="start">
        {/* Quick Select */}
        <div className="p-3 border-b">
          <p className="text-xs font-medium text-muted-foreground mb-2">Chọn nhanh</p>
          <div className="grid grid-cols-3 gap-1.5">
            {quickOptions.map((opt) => (
              <Button
                key={opt.value}
                variant="outline"
                size="sm"
                onClick={() => handleQuickSelect(opt.value)}
                className="text-xs h-7 px-2"
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Calendar */}
        <Calendar
          mode="single"
          selected={dateValue}
          onSelect={handleDateSelect}
          initialFocus
          className="p-3 pointer-events-auto"
          locale={vi}
        />

        {/* Time Select */}
        <div className="p-3 border-t bg-muted/30">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-xs font-medium">Giờ:</span>
            <Select
              value={hours.toString()}
              onValueChange={(val) => handleTimeChange('hours', val)}
            >
              <SelectTrigger className="w-14 h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-48 bg-popover">
                {generateHourOptions().map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="text-xs">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-muted-foreground">:</span>
            <Select
              value={minutes.toString()}
              onValueChange={(val) => handleTimeChange('minutes', val)}
            >
              <SelectTrigger className="w-14 h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-48 bg-popover">
                {generateMinuteOptions().map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="text-xs">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Footer */}
        {value && (
          <div className="p-2 border-t flex justify-end">
            <Button
              size="sm"
              onClick={() => setIsOpen(false)}
              className="text-xs h-7"
            >
              Xong
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
