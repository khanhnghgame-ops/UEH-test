import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, Key, ShieldAlert, Camera, User, Check, ChevronRight, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

interface FirstTimeOnboardingProps {
  open: boolean;
  userId: string;
  userFullName: string;
  onComplete: () => void;
}

type Step = 'password' | 'avatar';

export default function FirstTimeOnboarding({ 
  open, 
  userId, 
  userFullName,
  onComplete 
}: FirstTimeOnboardingProps) {
  const { toast } = useToast();
  const { refreshProfile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Step state
  const [currentStep, setCurrentStep] = useState<Step>('password');
  
  // Password state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  
  // Avatar state
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword.length < 6) {
      toast({
        title: 'Mật khẩu quá ngắn',
        description: 'Mật khẩu mới phải có ít nhất 6 ký tự',
        variant: 'destructive',
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: 'Mật khẩu không khớp',
        description: 'Vui lòng nhập lại mật khẩu xác nhận',
        variant: 'destructive',
      });
      return;
    }

    if (newPassword === '123456') {
      toast({
        title: 'Mật khẩu không hợp lệ',
        description: 'Vui lòng chọn mật khẩu khác với mật khẩu mặc định',
        variant: 'destructive',
      });
      return;
    }

    setIsChangingPassword(true);

    const { data, error } = await supabase.functions.invoke('manage-users', {
      body: {
        action: 'update_password',
        user_id: userId,
        password: newPassword,
      }
    });

    setIsChangingPassword(false);

    if (error || data?.error) {
      toast({
        title: 'Đổi mật khẩu thất bại',
        description: data?.error || error?.message || 'Có lỗi xảy ra',
        variant: 'destructive',
      });
      return;
    }

    toast({
      title: 'Đổi mật khẩu thành công! ✓',
      description: 'Tài khoản của bạn đã được bảo mật',
    });

    // Move to avatar step
    setCurrentStep('avatar');
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Định dạng không hợp lệ',
        description: 'Vui lòng chọn file ảnh (JPEG, PNG, GIF, WebP)',
        variant: 'destructive',
      });
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      toast({
        title: 'File quá lớn',
        description: 'Kích thước ảnh tối đa là 5MB',
        variant: 'destructive',
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      setPreviewUrl(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
    
    setSelectedFile(file);
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleAvatarUpload = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    try {
      const fileExt = selectedFile.name.split('.').pop();
      const filePath = `${userId}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, selectedFile, { 
          upsert: true,
          contentType: selectedFile.type 
        });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      const newAvatarUrl = urlData.publicUrl;

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: newAvatarUrl })
        .eq('id', userId);

      if (updateError) throw updateError;

      toast({
        title: 'Hoàn tất! 🎉',
        description: 'Ảnh đại diện đã được cập nhật',
      });

      await refreshProfile();
      onComplete();
    } catch (error: any) {
      toast({
        title: 'Lỗi tải ảnh',
        description: error.message || 'Có lỗi xảy ra khi tải ảnh lên',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleSkipAvatar = () => {
    toast({
      title: 'Chào mừng bạn! 🎉',
      description: 'Bạn có thể cập nhật ảnh đại diện sau trong cài đặt',
    });
    onComplete();
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent 
        className="sm:max-w-4xl w-[95vw] aspect-video max-h-[85vh] p-0 overflow-hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <div className="flex h-full">
          {/* Left side - Visual/Branding */}
          <div className="hidden md:flex w-2/5 bg-gradient-to-br from-primary via-primary/90 to-primary/80 p-8 flex-col justify-between text-primary-foreground">
            <div>
              <Sparkles className="w-10 h-10 mb-4 opacity-90" />
              <h2 className="text-2xl font-bold mb-2">Chào mừng bạn!</h2>
              <p className="text-primary-foreground/80 text-sm">
                Thiết lập tài khoản để bắt đầu sử dụng hệ thống quản lý dự án nhóm.
              </p>
            </div>
            
            {/* Step indicators */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors",
                  currentStep === 'password' 
                    ? "bg-white text-primary" 
                    : "bg-white/20 text-white"
                )}>
                  {currentStep === 'avatar' ? <Check className="w-4 h-4" /> : '1'}
                </div>
                <div className={cn(
                  "text-sm font-medium",
                  currentStep === 'password' ? "text-white" : "text-white/70"
                )}>
                  Đổi mật khẩu
                  <span className="block text-xs text-white/60">Bắt buộc</span>
                </div>
              </div>
              
              <div className="w-px h-4 bg-white/30 ml-4" />
              
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors",
                  currentStep === 'avatar' 
                    ? "bg-white text-primary" 
                    : "bg-white/20 text-white/60"
                )}>
                  2
                </div>
                <div className={cn(
                  "text-sm font-medium",
                  currentStep === 'avatar' ? "text-white" : "text-white/60"
                )}>
                  Ảnh đại diện
                  <span className="block text-xs text-white/50">Khuyến nghị</span>
                </div>
              </div>
            </div>
          </div>
          
          {/* Right side - Form content */}
          <div className="flex-1 p-6 md:p-8 flex flex-col justify-center">
            {currentStep === 'password' ? (
              <>
                <DialogHeader className="mb-6">
                  <DialogTitle className="flex items-center gap-2 text-xl">
                    <ShieldAlert className="w-6 h-6 text-amber-500" />
                    Bảo mật tài khoản
                  </DialogTitle>
                  <DialogDescription className="text-base">
                    Đây là lần đăng nhập đầu tiên. Vui lòng đổi mật khẩu mặc định để bảo vệ tài khoản của bạn.
                  </DialogDescription>
                </DialogHeader>
                
                <form onSubmit={handlePasswordSubmit} className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="newPassword" className="text-sm font-medium">
                      Mật khẩu mới
                    </Label>
                    <div className="relative">
                      <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="newPassword"
                        type="password"
                        placeholder="Tối thiểu 6 ký tự"
                        className="pl-10 h-11"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        required
                        autoFocus
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword" className="text-sm font-medium">
                      Xác nhận mật khẩu
                    </Label>
                    <div className="relative">
                      <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="confirmPassword"
                        type="password"
                        placeholder="Nhập lại mật khẩu mới"
                        className="pl-10 h-11"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  
                  <Button 
                    type="submit" 
                    disabled={isChangingPassword} 
                    className="w-full h-11 text-base mt-2"
                  >
                    {isChangingPassword ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : null}
                    Tiếp tục
                    <ChevronRight className="w-4 h-4 ml-2" />
                  </Button>
                </form>
              </>
            ) : (
              <>
                <DialogHeader className="mb-6">
                  <DialogTitle className="flex items-center gap-2 text-xl">
                    <User className="w-6 h-6 text-primary" />
                    Ảnh đại diện
                  </DialogTitle>
                  <DialogDescription className="text-base">
                    Thêm ảnh đại diện giúp đồng đội dễ dàng nhận diện bạn trong hệ thống.
                  </DialogDescription>
                </DialogHeader>
                
                <div className="flex flex-col items-center gap-6 py-4">
                  {/* Avatar preview/upload area */}
                  <div 
                    className="relative group cursor-pointer"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Avatar className="h-32 w-32 border-4 border-background shadow-xl">
                      {previewUrl ? (
                        <AvatarImage src={previewUrl} alt="Preview" />
                      ) : (
                        <AvatarFallback className="bg-muted text-muted-foreground text-3xl">
                          {getInitials(userFullName)}
                        </AvatarFallback>
                      )}
                    </Avatar>
                    
                    {/* Camera overlay */}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                      <Camera className="w-8 h-8 text-white" />
                    </div>
                  </div>
                  
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  
                  <div className="text-center">
                    <Button 
                      type="button" 
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      className="mb-2"
                    >
                      <Camera className="w-4 h-4 mr-2" />
                      {previewUrl ? 'Chọn ảnh khác' : 'Chọn ảnh'}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      JPEG, PNG, GIF hoặc WebP • Tối đa 5MB
                    </p>
                  </div>
                </div>
                
                <DialogFooter className="gap-2 sm:gap-3 mt-4">
                  <Button 
                    variant="ghost" 
                    onClick={handleSkipAvatar}
                    disabled={isUploading}
                    className="flex-1 sm:flex-none"
                  >
                    Bỏ qua
                  </Button>
                  <Button 
                    onClick={handleAvatarUpload} 
                    disabled={!selectedFile || isUploading}
                    className="flex-1 sm:flex-none"
                  >
                    {isUploading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Hoàn tất
                    <Check className="w-4 h-4 ml-2" />
                  </Button>
                </DialogFooter>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
