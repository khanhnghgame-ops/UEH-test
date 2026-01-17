import { useState, useEffect } from 'react';
import { Clock, AlertTriangle, CheckCircle } from 'lucide-react';
import { getDeadlineTimeMs } from '@/lib/datetime';

interface CountdownTimerProps {
  deadline: string;
  showIcon?: boolean;
  className?: string;
}

export function CountdownTimer({ deadline, showIcon = true, className = '' }: CountdownTimerProps) {
  const [timeLeft, setTimeLeft] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
    isOverdue: boolean;
    isPastDeadline: boolean;
  }>({ days: 0, hours: 0, minutes: 0, seconds: 0, isOverdue: false, isPastDeadline: false });

  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = Date.now();
      const deadlineTime = getDeadlineTimeMs(deadline);

      if (!deadlineTime) {
        return { days: 0, hours: 0, minutes: 0, seconds: 0, isOverdue: false, isPastDeadline: true };
      }

      const difference = deadlineTime - now;

      if (difference <= 0) {
        return { days: 0, hours: 0, minutes: 0, seconds: 0, isOverdue: true, isPastDeadline: true };
      }

      const days = Math.floor(difference / (1000 * 60 * 60 * 24));
      const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((difference % (1000 * 60)) / 1000);

      const isOverdue = days === 0 && hours < 24;

      return { days, hours, minutes, seconds, isOverdue, isPastDeadline: false };
    };

    setTimeLeft(calculateTimeLeft());
    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft());
    }, 1000);

    return () => clearInterval(timer);
  }, [deadline]);

  if (timeLeft.isPastDeadline) {
    return (
      <div className={`flex items-center gap-1.5 text-destructive font-medium ${className}`}>
        {showIcon && <AlertTriangle className="w-4 h-4" />}
        <span>Đã quá hạn</span>
      </div>
    );
  }

  const getColorClass = () => {
    if (timeLeft.days === 0 && timeLeft.hours < 6) return 'text-destructive';
    if (timeLeft.days === 0) return 'text-warning';
    if (timeLeft.days <= 2) return 'text-accent';
    return 'text-muted-foreground';
  };

  // Format time with 2 units for better readability
  const formatTimeDisplay = () => {
    const { days, hours, minutes, seconds } = timeLeft;
    
    if (days > 0) {
      // Ngày + giờ
      return `${days} ngày ${hours} giờ`;
    } else if (hours > 0) {
      // Giờ + phút
      return `${hours} giờ ${minutes} phút`;
    } else {
      // Phút + giây
      return `${minutes} phút ${seconds} giây`;
    }
  };

  return (
    <div className={`flex items-center gap-1.5 ${getColorClass()} ${className}`}>
      {showIcon && <Clock className="w-4 h-4" />}
      <span className="font-medium tabular-nums">
        Còn {formatTimeDisplay()}
      </span>
    </div>
  );
}