import * as React from "react";
import { format, addDays, addWeeks, startOfDay, setHours, setMinutes } from "date-fns";
import { vi } from "date-fns/locale";
import { CalendarIcon, Clock } from "lucide-react";

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

export function DateTimePicker({ value, onChange, placeholder = "Chọn ngày giờ", className }: DateTimePickerProps) {
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
    } else {
      newDate = setMinutes(newDate, numVal);
    }
    
    // If no date was selected, also set today's date
    if (!dateValue) {
      newDate = setMinutes(setHours(new Date(), numVal), type === 'minutes' ? numVal : minutes);
    }
    
    onChange(newDate.toISOString().slice(0, 16));
  };

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
      default:
        return;
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
    return Array.from({ length: 12 }, (_, i) => ({
      value: (i * 5).toString(),
      label: (i * 5).toString().padStart(2, '0'),
    }));
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal h-11",
            !value && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {value ? (
            format(new Date(value), "dd/MM/yyyy 'lúc' HH:mm", { locale: vi })
          ) : (
            <span>{placeholder}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 bg-popover border shadow-lg" align="start">
        <div className="p-3 border-b bg-muted/30">
          <p className="text-sm font-medium mb-2">Chọn nhanh</p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleQuickSelect('today')}
              className="text-xs h-7"
            >
              Hôm nay
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleQuickSelect('tomorrow')}
              className="text-xs h-7"
            >
              Ngày mai
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleQuickSelect('3days')}
              className="text-xs h-7"
            >
              3 ngày
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleQuickSelect('1week')}
              className="text-xs h-7"
            >
              1 tuần
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleQuickSelect('2weeks')}
              className="text-xs h-7"
            >
              2 tuần
            </Button>
          </div>
        </div>

        <Calendar
          mode="single"
          selected={dateValue}
          onSelect={handleDateSelect}
          initialFocus
          className="p-3 pointer-events-auto"
          locale={vi}
        />

        <div className="p-3 border-t bg-muted/30">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Giờ:</span>
            <Select
              value={hours.toString()}
              onValueChange={(val) => handleTimeChange('hours', val)}
            >
              <SelectTrigger className="w-16 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-48 bg-popover">
                {generateHourOptions().map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span>:</span>
            <Select
              value={(Math.floor(minutes / 5) * 5).toString()}
              onValueChange={(val) => handleTimeChange('minutes', val)}
            >
              <SelectTrigger className="w-16 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-48 bg-popover">
                {generateMinuteOptions().map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {value && (
          <div className="p-2 border-t flex justify-between items-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onChange('')}
              className="text-xs text-muted-foreground"
            >
              Xóa
            </Button>
            <Button
              size="sm"
              onClick={() => setIsOpen(false)}
              className="text-xs"
            >
              Xong
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
