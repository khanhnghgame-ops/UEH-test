import { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { 
  Loader2, 
  Key, 
  ShieldAlert, 
  Camera, 
  User, 
  Check, 
  ChevronRight, 
  Sparkles,
  GraduationCap,
  BookOpen,
  Phone,
  FileText,
  Mail
} from 'lucide-react';
import { cn } from '@/lib/utils';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

interface FirstTimeOnboardingProps {
  open: boolean;
  userId: string;
  userFullName: string;
  userEmail: string;
  userStudentId: string;
  onComplete: () => void;
}

type Step = 'password' | 'profile';

export default function FirstTimeOnboarding({ 
  open, 
  userId, 
  userFullName,
  userEmail,
  userStudentId,
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
  
  // Extended profile state
  const [yearBatch, setYearBatch] = useState('');
  const [major, setMajor] = useState('');
  const [phone, setPhone] = useState('');
  const [skills, setSkills] = useState('');
  const [bio, setBio] = useState('');
  const [isSaving, setIsSaving] = useState(false);

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

    // Move to profile step
    setCurrentStep('profile');
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

  const handleComplete = async () => {
    setIsSaving(true);
    try {
      // Upload avatar if selected
      if (selectedFile) {
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

        // Update profile with avatar and extended info
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ 
            avatar_url: newAvatarUrl,
            year_batch: yearBatch || null,
            major: major || null,
            phone: phone || null,
            skills: skills || null,
            bio: bio || null,
          })
          .eq('id', userId);

        if (updateError) throw updateError;
      } else {
        // Update only extended info
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ 
            year_batch: yearBatch || null,
            major: major || null,
            phone: phone || null,
            skills: skills || null,
            bio: bio || null,
          })
          .eq('id', userId);

        if (updateError) throw updateError;
      }

      toast({
        title: 'Hoàn tất! 🎉',
        description: 'Chào mừng bạn đến với hệ thống',
      });

      await refreshProfile();
      onComplete();
    } catch (error: any) {
      toast({
        title: 'Lỗi',
        description: error.message || 'Có lỗi xảy ra',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSkip = () => {
    toast({
      title: 'Chào mừng bạn! 🎉',
      description: 'Bạn có thể cập nhật thông tin sau trong mục Thông tin cá nhân',
    });
    onComplete();
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent 
        className="w-[95vw] max-w-[1280px] h-[90vh] max-h-[720px] p-0 overflow-hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <div className="flex h-full">
          {/* Left side - Visual/Branding */}
          <div className="hidden md:flex w-[320px] shrink-0 bg-gradient-to-br from-primary via-primary/90 to-primary/80 p-8 flex-col justify-between text-primary-foreground">
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
                  {currentStep === 'profile' ? <Check className="w-4 h-4" /> : '1'}
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
                  currentStep === 'profile' 
                    ? "bg-white text-primary" 
                    : "bg-white/20 text-white/60"
                )}>
                  2
                </div>
                <div className={cn(
                  "text-sm font-medium",
                  currentStep === 'profile' ? "text-white" : "text-white/60"
                )}>
                  Bổ sung thông tin
                  <span className="block text-xs text-white/50">Không bắt buộc</span>
                </div>
              </div>
            </div>
          </div>
          
          {/* Right side - Form content */}
          <div className="flex-1 p-6 md:p-8 flex flex-col overflow-hidden">
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
                
                <form onSubmit={handlePasswordSubmit} className="space-y-5 flex-1">
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
                <DialogHeader className="mb-4 shrink-0">
                  <DialogTitle className="flex items-center gap-2 text-xl">
                    <User className="w-6 h-6 text-primary" />
                    Thông tin cá nhân
                  </DialogTitle>
                  <DialogDescription>
                    Xem lại thông tin và bổ sung thêm (không bắt buộc - có thể bỏ qua)
                  </DialogDescription>
                </DialogHeader>

                <div className="flex-1 space-y-4 overflow-y-auto pr-2">
                  {/* Read-only info from Leader */}
                  <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                    <p className="text-xs text-muted-foreground font-medium mb-3">Thông tin đã được nhập sẵn</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="flex items-center gap-2 text-sm">
                        <User className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span className="font-medium truncate">{userFullName}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <GraduationCap className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span className="truncate">{userStudentId}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span className="truncate">{userEmail}</span>
                      </div>
                    </div>
                  </div>

                  {/* Avatar upload */}
                  <div className="flex items-center gap-4">
                    <div 
                      className="relative group cursor-pointer shrink-0"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Avatar className="h-16 w-16 border-2 border-background shadow-lg">
                        {previewUrl ? (
                          <AvatarImage src={previewUrl} alt="Preview" />
                        ) : (
                          <AvatarFallback className="bg-muted text-muted-foreground text-lg">
                            {getInitials(userFullName)}
                          </AvatarFallback>
                        )}
                      </Avatar>
                      <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                        <Camera className="w-5 h-5 text-white" />
                      </div>
                    </div>
                    <div>
                      <Button 
                        type="button" 
                        variant="outline"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Camera className="w-4 h-4 mr-2" />
                        {previewUrl ? 'Đổi ảnh' : 'Thêm ảnh đại diện'}
                      </Button>
                      <p className="text-xs text-muted-foreground mt-1">Tối đa 5MB</p>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                  </div>

                  {/* Extended profile fields */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="yearBatch" className="text-xs flex items-center gap-1.5">
                        <GraduationCap className="w-3.5 h-3.5" />
                        Khóa
                      </Label>
                      <Input
                        id="yearBatch"
                        placeholder="VD: K47, K48..."
                        value={yearBatch}
                        onChange={(e) => setYearBatch(e.target.value)}
                        className="h-9"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="major" className="text-xs flex items-center gap-1.5">
                        <BookOpen className="w-3.5 h-3.5" />
                        Ngành
                      </Label>
                      <Input
                        id="major"
                        placeholder="VD: Quản trị kinh doanh..."
                        value={major}
                        onChange={(e) => setMajor(e.target.value)}
                        className="h-9"
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-1.5">
                    <Label htmlFor="phone" className="text-xs flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5" />
                      Số điện thoại
                    </Label>
                    <Input
                      id="phone"
                      placeholder="VD: 0901234567"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="h-9"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="skills" className="text-xs flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" />
                      Kỹ năng / Thế mạnh
                    </Label>
                    <Textarea
                      id="skills"
                      placeholder="VD: Thiết kế, PowerPoint, Excel, Thuyết trình..."
                      value={skills}
                      onChange={(e) => setSkills(e.target.value)}
                      rows={2}
                      className="resize-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="bio" className="text-xs flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5" />
                      Giới thiệu ngắn
                    </Label>
                    <Textarea
                      id="bio"
                      placeholder="Viết vài dòng về bản thân..."
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      rows={2}
                      className="resize-none"
                    />
                  </div>
                </div>
                
                <DialogFooter className="gap-2 sm:gap-3 mt-4 pt-4 border-t shrink-0">
                  <Button 
                    variant="outline" 
                    onClick={handleSkip}
                    disabled={isSaving}
                    className="flex-1 sm:flex-none"
                  >
                    Bỏ qua, vào hệ thống
                  </Button>
                  <Button 
                    onClick={handleComplete} 
                    disabled={isSaving}
                    className="flex-1 sm:flex-none"
                  >
                    {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Lưu và tiếp tục
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
