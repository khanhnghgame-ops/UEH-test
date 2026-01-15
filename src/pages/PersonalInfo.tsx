import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { 
  User, 
  Mail, 
  GraduationCap, 
  BookOpen, 
  Phone, 
  Sparkles, 
  FileText,
  Camera,
  Loader2,
  Save,
  Shield,
  Crown,
  UserCheck
} from 'lucide-react';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export default function PersonalInfo() {
  const { user, profile, isAdmin, isLeader, refreshProfile } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  
  // Form state
  const [yearBatch, setYearBatch] = useState('');
  const [major, setMajor] = useState('');
  const [phone, setPhone] = useState('');
  const [skills, setSkills] = useState('');
  const [bio, setBio] = useState('');

  useEffect(() => {
    if (profile) {
      setYearBatch((profile as any).year_batch || '');
      setMajor((profile as any).major || '');
      setPhone((profile as any).phone || '');
      setSkills((profile as any).skills || '');
      setBio((profile as any).bio || '');
    }
  }, [profile]);

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getRoleBadge = () => {
    if (isAdmin) return <Badge className="bg-destructive/10 text-destructive gap-1"><Shield className="w-3 h-3" />Admin</Badge>;
    if (isLeader) return <Badge className="bg-warning/10 text-warning gap-1"><Crown className="w-3 h-3" />Leader</Badge>;
    return <Badge variant="secondary" className="gap-1"><UserCheck className="w-3 h-3" />Member</Badge>;
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

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

    setIsUploadingAvatar(true);
    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `${user.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true, contentType: file.type });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: urlData.publicUrl })
        .eq('id', user.id);

      if (updateError) throw updateError;

      toast({ title: 'Thành công', description: 'Đã cập nhật ảnh đại diện' });
      await refreshProfile();
    } catch (error: any) {
      toast({
        title: 'Lỗi',
        description: error.message || 'Có lỗi xảy ra khi tải ảnh lên',
        variant: 'destructive',
      });
    } finally {
      setIsUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSave = async () => {
    if (!user) return;
    setIsSaving(true);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          year_batch: yearBatch || null,
          major: major || null,
          phone: phone || null,
          skills: skills || null,
          bio: bio || null,
        })
        .eq('id', user.id);

      if (error) throw error;

      toast({ title: 'Thành công', description: 'Đã cập nhật thông tin cá nhân' });
      setIsEditing(false);
      await refreshProfile();
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

  const InfoItem = ({ icon: Icon, label, value }: { icon: any; label: string; value: string | null | undefined }) => {
    return (
      <div className="flex items-start gap-3 py-3">
        <Icon className="w-5 h-5 mt-0.5 text-muted-foreground shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="font-medium">{value || <span className="text-muted-foreground italic">Chưa cập nhật</span>}</p>
        </div>
      </div>
    );
  };

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Thông tin cá nhân</h1>
          <p className="text-muted-foreground">Xem và cập nhật thông tin cá nhân của bạn</p>
        </div>

        {/* Profile Card */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <User className="w-5 h-5" />
              Hồ sơ
            </CardTitle>
            <CardDescription>Thông tin cơ bản do hệ thống quản lý</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-6 items-center sm:items-start">
              {/* Avatar section */}
              <div className="relative group">
                <Avatar className="h-28 w-28 border-4 border-background shadow-xl">
                  {profile?.avatar_url ? (
                    <AvatarImage src={profile.avatar_url} alt={profile.full_name} />
                  ) : (
                    <AvatarFallback className="bg-muted text-muted-foreground text-2xl">
                      {profile?.full_name ? getInitials(profile.full_name) : 'U'}
                    </AvatarFallback>
                  )}
                </Avatar>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingAvatar}
                  className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                >
                  {isUploadingAvatar ? (
                    <Loader2 className="w-6 h-6 text-white animate-spin" />
                  ) : (
                    <Camera className="w-6 h-6 text-white" />
                  )}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarChange}
                  className="hidden"
                />
              </div>

              {/* Basic info */}
              <div className="flex-1 text-center sm:text-left">
                <h3 className="text-xl font-bold">{profile?.full_name}</h3>
                <p className="text-muted-foreground">{profile?.student_id}</p>
                <p className="text-sm text-muted-foreground">{profile?.email}</p>
                <div className="mt-2">{getRoleBadge()}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Extended Info Card */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Thông tin bổ sung
                </CardTitle>
                <CardDescription>Thông tin giúp Leader hiểu rõ hơn về bạn</CardDescription>
              </div>
              {!isEditing && (
                <Button variant="outline" onClick={() => setIsEditing(true)}>
                  Chỉnh sửa
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {isEditing ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="yearBatch" className="flex items-center gap-2">
                      <GraduationCap className="w-4 h-4" />
                      Khóa
                    </Label>
                    <Input
                      id="yearBatch"
                      placeholder="VD: K47, K48..."
                      value={yearBatch}
                      onChange={(e) => setYearBatch(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="major" className="flex items-center gap-2">
                      <BookOpen className="w-4 h-4" />
                      Ngành
                    </Label>
                    <Input
                      id="major"
                      placeholder="VD: Quản trị kinh doanh..."
                      value={major}
                      onChange={(e) => setMajor(e.target.value)}
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="phone" className="flex items-center gap-2">
                    <Phone className="w-4 h-4" />
                    Số điện thoại
                  </Label>
                  <Input
                    id="phone"
                    placeholder="VD: 0901234567"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="skills" className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4" />
                    Kỹ năng / Thế mạnh
                  </Label>
                  <Textarea
                    id="skills"
                    placeholder="VD: Thiết kế đồ họa, PowerPoint, Excel, Thuyết trình..."
                    value={skills}
                    onChange={(e) => setSkills(e.target.value)}
                    rows={2}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="bio" className="flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Giới thiệu ngắn
                  </Label>
                  <Textarea
                    id="bio"
                    placeholder="Viết vài dòng giới thiệu về bản thân..."
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    rows={3}
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <Button onClick={handleSave} disabled={isSaving}>
                    {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    <Save className="w-4 h-4 mr-2" />
                    Lưu thay đổi
                  </Button>
                  <Button variant="ghost" onClick={() => setIsEditing(false)} disabled={isSaving}>
                    Hủy
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <InfoItem icon={GraduationCap} label="Khóa" value={(profile as any)?.year_batch} />
                <Separator />
                <InfoItem icon={BookOpen} label="Ngành" value={(profile as any)?.major} />
                <Separator />
                <InfoItem icon={Phone} label="Số điện thoại" value={(profile as any)?.phone} />
                <Separator />
                <InfoItem icon={Sparkles} label="Kỹ năng / Thế mạnh" value={(profile as any)?.skills} />
                <Separator />
                <InfoItem icon={FileText} label="Giới thiệu ngắn" value={(profile as any)?.bio} />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
