import * as React from "react";
import { format, startOfDay, setHours, setMinutes } from "date-fns";
import { vi } from "date-fns/locale";
import { CalendarIcon, Clock, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { parseLocalDateTime } from "@/lib/datetime";
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

interface DeadlineHourPickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

// Only allow these hours: 20, 21, 22, 23 - default is 22
const ALLOWED_HOURS = [
  { value: "20", label: "20H" },
  { value: "21", label: "21H" },
  { value: "22", label: "22H" },
  { value: "23", label: "23H" },
];

export function DeadlineHourPicker({ 
  value, 
  onChange, 
  placeholder = "Chọn ngày", 
  className,
}: DeadlineHourPickerProps) {
  const [isDateOpen, setIsDateOpen] = React.useState(false);
  
  const dateValue = parseLocalDateTime(value) || undefined;
  const hours = dateValue ? dateValue.getHours() : 22;

  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      // Use existing hour or default to 22
      const existingHour = dateValue ? dateValue.getHours() : 22;
      // Validate hour is in allowed list, otherwise default to 22
      const validHour = ALLOWED_HOURS.some(h => parseInt(h.value) === existingHour) ? existingHour : 22;
      const newDate = setMinutes(setHours(date, validHour), 0);
      // Format manually to avoid timezone conversion issues (don't use toISOString which converts to UTC)
      const year = newDate.getFullYear();
      const month = String(newDate.getMonth() + 1).padStart(2, '0');
      const day = String(newDate.getDate()).padStart(2, '0');
      const hours = String(newDate.getHours()).padStart(2, '0');
      const minutes = String(newDate.getMinutes()).padStart(2, '0');
      onChange(`${year}-${month}-${day}T${hours}:${minutes}`);
      setIsDateOpen(false);
    }
  };

  const handleHourChange = (val: string) => {
    const numVal = parseInt(val, 10);
    // Create a new date object to avoid mutating the existing one
    let baseDate = dateValue ? new Date(dateValue) : startOfDay(new Date());
    const newDate = setMinutes(setHours(baseDate, numVal), 0);
    // Format as ISO string for datetime-local input format
    const year = newDate.getFullYear();
    const month = String(newDate.getMonth() + 1).padStart(2, '0');
    const day = String(newDate.getDate()).padStart(2, '0');
    const hours = String(newDate.getHours()).padStart(2, '0');
    const minutes = String(newDate.getMinutes()).padStart(2, '0');
    onChange(`${year}-${month}-${day}T${hours}:${minutes}`);
  };

  const clearValue = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
  };

  // Get display hour value, ensuring it's one of the allowed hours
  const displayHour = ALLOWED_HOURS.some(h => parseInt(h.value) === hours) ? hours.toString() : "22";

  return (
    <div className={cn("flex items-center gap-3", className)}>
      {/* Date Picker */}
      <div className="flex-1">
        <Popover open={isDateOpen} onOpenChange={setIsDateOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "w-full justify-start text-left font-normal h-9",
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

      {/* Hour Picker - Simple dropdown with only 20H, 21H, 22H, 23H */}
      <div className="flex items-center gap-1.5">
        <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
        <Select
          value={displayHour}
          onValueChange={handleHourChange}
          disabled={!dateValue}
        >
          <SelectTrigger className="w-20 h-9 text-sm">
            <SelectValue placeholder="22H" />
          </SelectTrigger>
          <SelectContent className="bg-popover">
            {ALLOWED_HOURS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value} className="text-sm font-medium">
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}