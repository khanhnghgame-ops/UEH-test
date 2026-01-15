import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import UserAvatar from '@/components/UserAvatar';
import { 
  User, 
  Mail, 
  GraduationCap, 
  BookOpen, 
  Phone, 
  Sparkles, 
  FileText,
  Crown,
  Shield,
  UserCheck
} from 'lucide-react';
import type { Profile } from '@/types/database';

interface ProfileViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: Profile | null;
  role?: 'admin' | 'leader' | 'member';
  isGroupCreator?: boolean;
}

export default function ProfileViewDialog({
  open,
  onOpenChange,
  profile,
  role = 'member',
  isGroupCreator = false,
}: ProfileViewDialogProps) {
  if (!profile) return null;

  const getRoleBadge = () => {
    if (isGroupCreator) {
      return <Badge className="bg-warning/10 text-warning gap-1"><Crown className="w-3 h-3" />Trưởng nhóm</Badge>;
    }
    switch (role) {
      case 'admin':
        return <Badge className="bg-destructive/10 text-destructive gap-1"><Shield className="w-3 h-3" />Admin</Badge>;
      case 'leader':
        return <Badge className="bg-warning/10 text-warning gap-1"><Crown className="w-3 h-3" />Phó nhóm</Badge>;
      default:
        return <Badge variant="secondary" className="gap-1"><UserCheck className="w-3 h-3" />Thành viên</Badge>;
    }
  };

  const InfoItem = ({ icon: Icon, label, value }: { icon: any; label: string; value: string | null }) => {
    if (!value) return null;
    return (
      <div className="flex items-start gap-3 py-2">
        <Icon className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-sm font-medium break-words">{value}</p>
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg">Hồ sơ thành viên</DialogTitle>
        </DialogHeader>
        
        <div className="flex flex-col items-center gap-4 py-4">
          <UserAvatar 
            src={profile.avatar_url} 
            name={profile.full_name}
            size="xl"
            className="border-4 border-background shadow-xl"
          />
          
          <div className="text-center">
            <h3 className="text-xl font-bold">{profile.full_name}</h3>
            <p className="text-sm text-muted-foreground">{profile.student_id}</p>
            <div className="mt-2">
              {getRoleBadge()}
            </div>
          </div>
        </div>

        <Separator />

        <div className="space-y-1">
          <InfoItem icon={Mail} label="Email" value={profile.email} />
          <InfoItem icon={GraduationCap} label="Khóa" value={profile.year_batch} />
          <InfoItem icon={BookOpen} label="Ngành" value={profile.major} />
          <InfoItem icon={Phone} label="Số điện thoại" value={profile.phone} />
          <InfoItem icon={Sparkles} label="Kỹ năng / Thế mạnh" value={profile.skills} />
          <InfoItem icon={FileText} label="Giới thiệu" value={profile.bio} />
        </div>

        {!profile.year_batch && !profile.major && !profile.phone && !profile.skills && !profile.bio && (
          <p className="text-center text-sm text-muted-foreground py-4">
            Thành viên chưa cập nhật thông tin bổ sung
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
