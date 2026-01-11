import { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import {
  BookOpen,
  User,
  Mail,
  Link2,
  Pencil,
  Loader2,
  FileText,
  ExternalLink,
  ImagePlus,
  X,
  Image,
} from 'lucide-react';

interface GroupInfo {
  id: string;
  name: string;
  description: string | null;
  class_code: string | null;
  instructor_name: string | null;
  instructor_email: string | null;
  zalo_link: string | null;
  additional_info: string | null;
  image_url?: string | null;
}

interface GroupInfoCardProps {
  group: GroupInfo;
  canEdit: boolean;
  onUpdate: () => void;
}

export default function GroupInfoCard({ group, canEdit, onUpdate }: GroupInfoCardProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Edit form state
  const [editName, setEditName] = useState(group.name);
  const [editDescription, setEditDescription] = useState(group.description || '');
  const [editClassCode, setEditClassCode] = useState(group.class_code || '');
  const [editInstructorName, setEditInstructorName] = useState(group.instructor_name || '');
  const [editInstructorEmail, setEditInstructorEmail] = useState(group.instructor_email || '');
  const [editZaloLink, setEditZaloLink] = useState(group.zalo_link || '');
  const [editAdditionalInfo, setEditAdditionalInfo] = useState(group.additional_info || '');
  const [editImageUrl, setEditImageUrl] = useState(group.image_url || '');

  const handleOpenEdit = () => {
    setEditName(group.name);
    setEditDescription(group.description || '');
    setEditClassCode(group.class_code || '');
    setEditInstructorName(group.instructor_name || '');
    setEditInstructorEmail(group.instructor_email || '');
    setEditZaloLink(group.zalo_link || '');
    setEditAdditionalInfo(group.additional_info || '');
    setEditImageUrl(group.image_url || '');
    setIsEditDialogOpen(true);
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Lỗi', description: 'Vui lòng chọn file ảnh', variant: 'destructive' });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'Lỗi', description: 'Kích thước ảnh không được vượt quá 5MB', variant: 'destructive' });
      return;
    }

    setIsUploadingImage(true);
    try {
      const fileExt = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = `${group.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('project-images')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('project-images')
        .getPublicUrl(fileName);

      setEditImageUrl(urlData.publicUrl);
      toast({ title: 'Thành công', description: 'Đã tải ảnh lên' });
    } catch (error: any) {
      toast({ title: 'Lỗi', description: error.message || 'Không thể tải ảnh lên', variant: 'destructive' });
    } finally {
      setIsUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveImage = () => {
    setEditImageUrl('');
  };

  const handleSave = async () => {
    if (!editName.trim()) {
      toast({
        title: 'Lỗi',
        description: 'Tên nhóm không được để trống',
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);

    try {
      const { error } = await supabase
        .from('groups')
        .update({
          name: editName.trim(),
          description: editDescription.trim() || null,
          class_code: editClassCode.trim() || null,
          instructor_name: editInstructorName.trim() || null,
          instructor_email: editInstructorEmail.trim() || null,
          zalo_link: editZaloLink.trim() || null,
          additional_info: editAdditionalInfo.trim() || null,
          image_url: editImageUrl.trim() || null,
        })
        .eq('id', group.id);

      if (error) throw error;

      toast({
        title: 'Thành công',
        description: 'Đã cập nhật thông tin nhóm',
      });

      setIsEditDialogOpen(false);
      onUpdate();
    } catch (error: any) {
      toast({
        title: 'Lỗi',
        description: error.message || 'Không thể cập nhật thông tin nhóm',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <Card>
        {/* Project Image Banner */}
        {group.image_url && (
          <div className="relative w-full h-40 overflow-hidden rounded-t-lg">
            <img 
              src={group.image_url} 
              alt={group.name}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
          </div>
        )}
        
        <CardHeader className={`flex flex-row items-center justify-between pb-2 ${group.image_url ? '-mt-8 relative z-10' : ''}`}>
          <CardTitle className="text-base flex items-center gap-2">
            <BookOpen className="w-4 h-4" />
            Thông tin học phần
          </CardTitle>
          {canEdit && (
            <Button variant="ghost" size="sm" onClick={handleOpenEdit}>
              <Pencil className="w-4 h-4 mr-1" />
              Chỉnh sửa
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 text-sm">
            {/* Class Code */}
            <div className="flex items-start gap-2">
              <BookOpen className="w-4 h-4 mt-0.5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Lớp học phần</p>
                <p className="font-medium">{group.class_code || 'Chưa cập nhật'}</p>
              </div>
            </div>

            {/* Instructor Name */}
            <div className="flex items-start gap-2">
              <User className="w-4 h-4 mt-0.5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Giảng viên</p>
                <p className="font-medium">{group.instructor_name || 'Chưa cập nhật'}</p>
              </div>
            </div>

            {/* Instructor Email */}
            <div className="flex items-start gap-2">
              <Mail className="w-4 h-4 mt-0.5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Email giảng viên</p>
                {group.instructor_email ? (
                  <a 
                    href={`mailto:${group.instructor_email}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {group.instructor_email}
                  </a>
                ) : (
                  <p className="font-medium text-muted-foreground">Chưa cập nhật</p>
                )}
              </div>
            </div>

            {/* Contact Link */}
            <div className="flex items-start gap-2">
              <Link2 className="w-4 h-4 mt-0.5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Link liên hệ nhóm</p>
                {group.zalo_link ? (
                  <a 
                    href={group.zalo_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-primary hover:underline flex items-center gap-1"
                  >
                    Mở link <ExternalLink className="w-3 h-3" />
                  </a>
                ) : (
                  <p className="font-medium text-muted-foreground">Chưa cập nhật</p>
                )}
              </div>
            </div>

            {/* Additional Info */}
            {group.additional_info && (
              <div className="flex items-start gap-2">
                <FileText className="w-4 h-4 mt-0.5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Thông tin thêm</p>
                  <p className="font-medium whitespace-pre-wrap">{group.additional_info}</p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Chỉnh sửa thông tin nhóm</DialogTitle>
            <DialogDescription>
              Cập nhật thông tin học phần và giảng viên
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Project Image Upload */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Image className="w-4 h-4" />
                Ảnh Project
              </Label>
              
              {editImageUrl ? (
                <div className="relative group">
                  <img 
                    src={editImageUrl} 
                    alt="Project preview"
                    className="w-full h-32 object-cover rounded-lg border"
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="absolute top-2 right-2 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={handleRemoveImage}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <div
                  className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/50 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {isUploadingImage ? (
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">Đang tải lên...</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <ImagePlus className="w-8 h-8 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">Nhấn để chọn ảnh (tối đa 5MB)</p>
                    </div>
                  )}
                </div>
              )}
              
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
              
              {editImageUrl && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full gap-2"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingImage}
                >
                  {isUploadingImage ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ImagePlus className="w-4 h-4" />
                  )}
                  Thay đổi ảnh
                </Button>
              )}
            </div>

            <div className="border-t pt-4 space-y-2">
              <Label htmlFor="edit-name">Tên nhóm *</Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Tên nhóm"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="edit-description">Mô tả</Label>
              <Textarea
                id="edit-description"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Mô tả về nhóm..."
              />
            </div>

            <div className="border-t pt-4">
              <p className="text-sm font-medium mb-3">Thông tin học phần</p>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-class-code">Tên lớp học phần</Label>
                  <Input
                    id="edit-class-code"
                    value={editClassCode}
                    onChange={(e) => setEditClassCode(e.target.value)}
                    placeholder="VD: 24D1INF50107612"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-instructor-name">Tên giảng viên</Label>
                  <Input
                    id="edit-instructor-name"
                    value={editInstructorName}
                    onChange={(e) => setEditInstructorName(e.target.value)}
                    placeholder="VD: ThS. Nguyễn Văn A"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-instructor-email">Email giảng viên</Label>
                  <Input
                    id="edit-instructor-email"
                    type="email"
                    value={editInstructorEmail}
                    onChange={(e) => setEditInstructorEmail(e.target.value)}
                    placeholder="email@ueh.edu.vn"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-zalo-link">Link liên hệ nhóm</Label>
                  <Input
                    id="edit-zalo-link"
                    value={editZaloLink}
                    onChange={(e) => setEditZaloLink(e.target.value)}
                    placeholder="Link Zalo / Messenger / Discord..."
                  />
                  <p className="text-xs text-muted-foreground">
                    Hỗ trợ link Zalo, Messenger, Discord, Google Meet...
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-additional-info">Thông tin bổ sung</Label>
                  <Textarea
                    id="edit-additional-info"
                    value={editAdditionalInfo}
                    onChange={(e) => setEditAdditionalInfo(e.target.value)}
                    placeholder="Ghi chú thêm..."
                    rows={3}
                  />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Hủy
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Đang lưu...
                </>
              ) : (
                'Lưu thay đổi'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
