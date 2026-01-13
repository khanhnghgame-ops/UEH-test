import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Share2, Copy, ExternalLink, Users, Activity, Loader2, Lock, Unlock, Eye, RefreshCw } from 'lucide-react';

interface ShareSettingsCardProps {
  groupId: string;
  isPublic: boolean;
  shareToken: string | null;
  showMembersPublic: boolean;
  showActivityPublic: boolean;
  onUpdate: () => void;
}

// Generate a random token client-side
function generateToken(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

export default function ShareSettingsCard({
  groupId,
  isPublic,
  shareToken,
  showMembersPublic,
  showActivityPublic,
  onUpdate,
}: ShareSettingsCardProps) {
  const { toast } = useToast();
  const [isUpdating, setIsUpdating] = useState(false);
  const [localIsPublic, setLocalIsPublic] = useState(isPublic);
  const [localShareToken, setLocalShareToken] = useState(shareToken);
  const [localShowMembers, setLocalShowMembers] = useState(showMembersPublic);
  const [localShowActivity, setLocalShowActivity] = useState(showActivityPublic);

  useEffect(() => {
    setLocalIsPublic(isPublic);
    setLocalShareToken(shareToken);
    setLocalShowMembers(showMembersPublic);
    setLocalShowActivity(showActivityPublic);
  }, [isPublic, shareToken, showMembersPublic, showActivityPublic]);

  const publicLink = localShareToken 
    ? `${window.location.origin}/s/${localShareToken}` 
    : null;

  const handleToggleShare = async (enabled: boolean) => {
    setIsUpdating(true);
    try {
      let newToken = localShareToken;
      
      // Always generate a new token when enabling if there's no token
      if (enabled && !newToken) {
        newToken = generateToken();
      }

      const { error } = await supabase
        .from('groups')
        .update({
          is_public: enabled,
          share_token: newToken,
        })
        .eq('id', groupId);

      if (error) throw error;

      setLocalIsPublic(enabled);
      setLocalShareToken(newToken);
      
      toast({
        title: enabled ? 'Đã bật chia sẻ' : 'Đã tắt chia sẻ',
        description: enabled 
          ? 'Link xem project đã được tạo' 
          : 'Link xem project đã bị vô hiệu hóa',
      });
      onUpdate();
    } catch (error: any) {
      console.error('Toggle share error:', error);
      toast({ title: 'Lỗi', description: error.message, variant: 'destructive' });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRegenerateToken = async () => {
    setIsUpdating(true);
    try {
      const newToken = generateToken();

      const { error } = await supabase
        .from('groups')
        .update({ share_token: newToken })
        .eq('id', groupId);

      if (error) throw error;

      setLocalShareToken(newToken);
      toast({ title: 'Đã tạo link mới', description: 'Link cũ sẽ không còn hoạt động' });
      onUpdate();
    } catch (error: any) {
      toast({ title: 'Lỗi', description: error.message, variant: 'destructive' });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleUpdateVisibility = async (field: 'show_members_public' | 'show_activity_public', value: boolean) => {
    try {
      const { error } = await supabase
        .from('groups')
        .update({ [field]: value })
        .eq('id', groupId);

      if (error) throw error;

      if (field === 'show_members_public') {
        setLocalShowMembers(value);
      } else {
        setLocalShowActivity(value);
      }
      
      toast({ title: 'Đã cập nhật', description: 'Cài đặt hiển thị đã được lưu' });
      onUpdate();
    } catch (error: any) {
      toast({ title: 'Lỗi', description: error.message, variant: 'destructive' });
    }
  };

  const copyLink = () => {
    if (publicLink) {
      navigator.clipboard.writeText(publicLink);
      toast({ title: 'Đã sao chép', description: 'Link đã được sao chép vào clipboard' });
    }
  };

  const openLink = () => {
    if (publicLink) {
      window.open(publicLink, '_blank');
    }
  };

  return (
    <Card className="border-2 border-primary/20">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20">
            <Share2 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg">Link xem Project (Read-only)</CardTitle>
            <CardDescription>
              Chia sẻ link để người ngoài hệ thống xem tiến độ mà không cần đăng nhập
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Main Toggle */}
        <div className="flex items-center justify-between p-4 rounded-xl bg-muted/50 border">
          <div className="flex items-center gap-3">
            {localIsPublic ? (
              <div className="p-2 rounded-lg bg-success/20">
                <Unlock className="w-4 h-4 text-success" />
              </div>
            ) : (
              <div className="p-2 rounded-lg bg-muted-foreground/20">
                <Lock className="w-4 h-4 text-muted-foreground" />
              </div>
            )}
            <div>
              <p className="font-medium">
                {localIsPublic ? 'Đang mở chia sẻ' : 'Đang khóa chia sẻ'}
              </p>
              <p className="text-sm text-muted-foreground">
                {localIsPublic 
                  ? 'Bất kỳ ai có link đều có thể xem' 
                  : 'Chỉ thành viên project mới xem được'}
              </p>
            </div>
          </div>
          <Switch
            checked={localIsPublic}
            onCheckedChange={handleToggleShare}
            disabled={isUpdating}
          />
        </div>

        {/* Share Link - Always show when public is enabled */}
        {localIsPublic && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Link chia sẻ công khai</Label>
              <div className="flex gap-2">
                <Input
                  value={publicLink || 'Đang tạo link...'}
                  readOnly
                  className="flex-1 bg-muted/50 font-mono text-sm"
                />
                <Button 
                  variant="outline" 
                  size="icon" 
                  onClick={copyLink} 
                  title="Sao chép link"
                  disabled={!publicLink}
                >
                  <Copy className="w-4 h-4" />
                </Button>
                <Button 
                  variant="outline" 
                  size="icon" 
                  onClick={openLink} 
                  title="Mở trong tab mới"
                  disabled={!publicLink}
                >
                  <ExternalLink className="w-4 h-4" />
                </Button>
                <Button 
                  variant="outline" 
                  size="icon" 
                  onClick={handleRegenerateToken} 
                  title="Tạo link mới"
                  disabled={isUpdating}
                >
                  <RefreshCw className={`w-4 h-4 ${isUpdating ? 'animate-spin' : ''}`} />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Người có link này có thể xem tiến độ project mà không cần đăng nhập
              </p>
            </div>

            {/* Visibility Options */}
            <div className="p-4 rounded-xl border bg-muted/30 space-y-4">
              <div className="flex items-center gap-2 mb-3">
                <Eye className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Tùy chọn hiển thị</span>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm">Hiển thị danh sách thành viên</span>
                </div>
                <Switch
                  checked={localShowMembers}
                  onCheckedChange={(v) => handleUpdateVisibility('show_members_public', v)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm">Hiển thị nhật ký hoạt động</span>
                </div>
                <Switch
                  checked={localShowActivity}
                  onCheckedChange={(v) => handleUpdateVisibility('show_activity_public', v)}
                />
              </div>
            </div>

            {/* Info Badge */}
            <div className="flex items-center gap-2 p-3 rounded-lg bg-warning/10 border border-warning/20 text-warning">
              <Eye className="w-4 h-4 shrink-0" />
              <span className="text-sm">
                Chế độ chỉ xem – người có link không thể chỉnh sửa bất kỳ nội dung nào
              </span>
            </div>
          </div>
        )}

        {isUpdating && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
