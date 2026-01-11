import { useState, useEffect } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import UserAvatar from '@/components/UserAvatar';
import {
  MessageSquarePlus,
  Send,
  MoreVertical,
  Trash2,
  EyeOff,
  Eye,
  MessageCircle,
  Loader2,
  Lightbulb,
  Clock,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';

interface Feedback {
  id: string;
  user_id: string;
  title: string;
  content: string;
  is_hidden: boolean;
  created_at: string;
  updated_at: string;
  user_name?: string;
  user_student_id?: string;
  user_avatar_url?: string;
  comment_count?: number;
}

interface FeedbackComment {
  id: string;
  feedback_id: string;
  user_id: string;
  content: string;
  is_hidden: boolean;
  created_at: string;
  user_name?: string;
  user_student_id?: string;
  user_avatar_url?: string;
}

interface FeedbackComment {
  id: string;
  feedback_id: string;
  user_id: string;
  content: string;
  is_hidden: boolean;
  created_at: string;
  user_name?: string;
  user_student_id?: string;
}

export default function FeedbackPage() {
  const { user, profile, isAdmin } = useAuth();
  const { toast } = useToast();

  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');

  // Comment state
  const [expandedFeedback, setExpandedFeedback] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, FeedbackComment[]>>({});
  const [loadingComments, setLoadingComments] = useState<Record<string, boolean>>({});
  const [newComment, setNewComment] = useState<Record<string, string>>({});
  const [postingComment, setPostingComment] = useState<Record<string, boolean>>({});

  // Delete state
  const [feedbackToDelete, setFeedbackToDelete] = useState<Feedback | null>(null);
  const [commentToDelete, setCommentToDelete] = useState<FeedbackComment | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    fetchFeedbacks();
  }, []);

  const fetchFeedbacks = async () => {
    setIsLoading(true);
    try {
      const { data: feedbacksData, error } = await supabase
        .from('feedbacks')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (feedbacksData && feedbacksData.length > 0) {
        // Get user profiles
        const userIds = [...new Set(feedbacksData.map(f => f.user_id))];
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, student_id, avatar_url')
          .in('id', userIds);

        const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

        // Get comment counts
        const feedbackIds = feedbacksData.map(f => f.id);
        const { data: commentCounts } = await supabase
          .from('feedback_comments')
          .select('feedback_id')
          .in('feedback_id', feedbackIds)
          .eq('is_hidden', false);

        const countMap = new Map<string, number>();
        commentCounts?.forEach(c => {
          countMap.set(c.feedback_id, (countMap.get(c.feedback_id) || 0) + 1);
        });

        setFeedbacks(feedbacksData.map(f => ({
          ...f,
          user_name: profileMap.get(f.user_id)?.full_name || 'Unknown',
          user_student_id: profileMap.get(f.user_id)?.student_id || '',
          user_avatar_url: profileMap.get(f.user_id)?.avatar_url || null,
          comment_count: countMap.get(f.id) || 0,
        })));
      } else {
        setFeedbacks([]);
      }
    } catch (error) {
      console.error('Error fetching feedbacks:', error);
      toast({
        title: 'Lỗi',
        description: 'Không thể tải danh sách góp ý',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchComments = async (feedbackId: string) => {
    setLoadingComments(prev => ({ ...prev, [feedbackId]: true }));
    try {
      const { data: commentsData, error } = await supabase
        .from('feedback_comments')
        .select('*')
        .eq('feedback_id', feedbackId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      if (commentsData && commentsData.length > 0) {
        const userIds = [...new Set(commentsData.map(c => c.user_id))];
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, student_id, avatar_url')
          .in('id', userIds);

        const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

        setComments(prev => ({
          ...prev,
          [feedbackId]: commentsData.map(c => ({
            ...c,
            user_name: profileMap.get(c.user_id)?.full_name || 'Unknown',
            user_student_id: profileMap.get(c.user_id)?.student_id || '',
            user_avatar_url: profileMap.get(c.user_id)?.avatar_url || null,
          })),
        }));
      } else {
        setComments(prev => ({ ...prev, [feedbackId]: [] }));
      }
    } catch (error) {
      console.error('Error fetching comments:', error);
    } finally {
      setLoadingComments(prev => ({ ...prev, [feedbackId]: false }));
    }
  };

  const handleCreateFeedback = async () => {
    if (!newTitle.trim() || !newContent.trim()) {
      toast({
        title: 'Lỗi',
        description: 'Vui lòng nhập tiêu đề và nội dung',
        variant: 'destructive',
      });
      return;
    }

    setIsCreating(true);
    try {
      const { error } = await supabase.from('feedbacks').insert({
        user_id: user!.id,
        title: newTitle.trim(),
        content: newContent.trim(),
      });

      if (error) throw error;

      toast({
        title: 'Thành công',
        description: 'Góp ý của bạn đã được gửi',
      });

      setIsCreateOpen(false);
      setNewTitle('');
      setNewContent('');
      fetchFeedbacks();
    } catch (error: any) {
      toast({
        title: 'Lỗi',
        description: error.message || 'Không thể gửi góp ý',
        variant: 'destructive',
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handlePostComment = async (feedbackId: string) => {
    const content = newComment[feedbackId]?.trim();
    if (!content) return;

    setPostingComment(prev => ({ ...prev, [feedbackId]: true }));
    try {
      const { error } = await supabase.from('feedback_comments').insert({
        feedback_id: feedbackId,
        user_id: user!.id,
        content,
      });

      if (error) throw error;

      setNewComment(prev => ({ ...prev, [feedbackId]: '' }));
      fetchComments(feedbackId);
      // Update comment count
      setFeedbacks(prev =>
        prev.map(f =>
          f.id === feedbackId
            ? { ...f, comment_count: (f.comment_count || 0) + 1 }
            : f
        )
      );
    } catch (error: any) {
      toast({
        title: 'Lỗi',
        description: error.message || 'Không thể gửi bình luận',
        variant: 'destructive',
      });
    } finally {
      setPostingComment(prev => ({ ...prev, [feedbackId]: false }));
    }
  };

  const handleDeleteFeedback = async () => {
    if (!feedbackToDelete) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('feedbacks')
        .delete()
        .eq('id', feedbackToDelete.id);

      if (error) throw error;

      toast({
        title: 'Đã xóa',
        description: 'Góp ý đã được xóa',
      });

      setFeedbackToDelete(null);
      fetchFeedbacks();
    } catch (error: any) {
      toast({
        title: 'Lỗi',
        description: error.message || 'Không thể xóa góp ý',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteComment = async () => {
    if (!commentToDelete) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('feedback_comments')
        .delete()
        .eq('id', commentToDelete.id);

      if (error) throw error;

      toast({
        title: 'Đã xóa',
        description: 'Bình luận đã được xóa',
      });

      setCommentToDelete(null);
      if (expandedFeedback) {
        fetchComments(expandedFeedback);
        setFeedbacks(prev =>
          prev.map(f =>
            f.id === expandedFeedback
              ? { ...f, comment_count: Math.max(0, (f.comment_count || 0) - 1) }
              : f
          )
        );
      }
    } catch (error: any) {
      toast({
        title: 'Lỗi',
        description: error.message || 'Không thể xóa bình luận',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleToggleHideFeedback = async (feedback: Feedback) => {
    try {
      const { error } = await supabase
        .from('feedbacks')
        .update({ is_hidden: !feedback.is_hidden })
        .eq('id', feedback.id);

      if (error) throw error;

      toast({
        title: feedback.is_hidden ? 'Đã hiện' : 'Đã ẩn',
        description: feedback.is_hidden ? 'Góp ý đã được hiện lại' : 'Góp ý đã bị ẩn',
      });

      fetchFeedbacks();
    } catch (error: any) {
      toast({
        title: 'Lỗi',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const toggleExpand = (feedbackId: string) => {
    if (expandedFeedback === feedbackId) {
      setExpandedFeedback(null);
    } else {
      setExpandedFeedback(feedbackId);
      if (!comments[feedbackId]) {
        fetchComments(feedbackId);
      }
    }
  };

  const formatTime = (dateStr: string) => {
    return format(new Date(dateStr), "dd/MM/yyyy 'lúc' HH:mm", { locale: vi });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <Lightbulb className="w-8 h-8 text-warning" />
              Góp ý & Cải tiến
            </h1>
            <p className="text-muted-foreground mt-1">
              Không gian trao đổi, góp ý về quy trình làm việc và cải tiến hệ thống
            </p>
          </div>

          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <MessageSquarePlus className="w-4 h-4" />
                Tạo góp ý mới
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Lightbulb className="w-5 h-5 text-warning" />
                  Tạo góp ý mới
                </DialogTitle>
                <DialogDescription>
                  Chia sẻ ý kiến của bạn về quy trình làm việc, cách phối hợp nhóm, hoặc đề xuất cải tiến hệ thống.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Tiêu đề <span className="text-destructive">*</span></Label>
                  <Input
                    value={newTitle}
                    onChange={e => setNewTitle(e.target.value)}
                    placeholder="VD: Đề xuất cải tiến giao diện quản lý task"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Nội dung chi tiết <span className="text-destructive">*</span></Label>
                  <Textarea
                    value={newContent}
                    onChange={e => setNewContent(e.target.value)}
                    placeholder="Mô tả chi tiết góp ý của bạn..."
                    className="min-h-[150px]"
                  />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                  Hủy
                </Button>
                <Button onClick={handleCreateFeedback} disabled={isCreating} className="gap-2">
                  {isCreating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  Gửi góp ý
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Guidelines */}
        <Card className="border-warning/30 bg-warning/5">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <Lightbulb className="w-5 h-5 text-warning shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-warning mb-1">Lưu ý về nội dung</p>
                <p className="text-muted-foreground">
                  Chức năng này dành cho góp ý về quy trình, cách làm việc và cải tiến hệ thống. 
                  <span className="text-destructive font-medium"> Không dùng</span> để thông báo công việc, nhắc deadline hay phân công task.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Feedback Feed */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : feedbacks.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <Lightbulb className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
              <h3 className="text-lg font-semibold mb-2">Chưa có góp ý nào</h3>
              <p className="text-muted-foreground mb-4">
                Hãy là người đầu tiên chia sẻ ý kiến của bạn!
              </p>
              <Button onClick={() => setIsCreateOpen(true)} className="gap-2">
                <MessageSquarePlus className="w-4 h-4" />
                Tạo góp ý đầu tiên
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {feedbacks.map(feedback => (
              <Card
                key={feedback.id}
                className={`transition-all ${
                  feedback.is_hidden ? 'opacity-60 border-destructive/30' : ''
                }`}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <UserAvatar 
                        src={feedback.user_avatar_url} 
                        name={feedback.user_name}
                        size="md"
                        className="shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold">{feedback.user_name}</span>
                          <span className="text-xs text-muted-foreground">
                            ({feedback.user_student_id})
                          </span>
                          {feedback.is_hidden && (
                            <Badge variant="destructive" className="text-xs">
                              <EyeOff className="w-3 h-3 mr-1" />
                              Đã ẩn
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                          <Clock className="w-3 h-3" />
                          {formatTime(feedback.created_at)}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    {(feedback.user_id === user?.id || isAdmin) && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-popover">
                          {isAdmin && (
                            <DropdownMenuItem onClick={() => handleToggleHideFeedback(feedback)}>
                              {feedback.is_hidden ? (
                                <>
                                  <Eye className="w-4 h-4 mr-2" />
                                  Hiện góp ý
                                </>
                              ) : (
                                <>
                                  <EyeOff className="w-4 h-4 mr-2" />
                                  Ẩn góp ý
                                </>
                              )}
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            onClick={() => setFeedbackToDelete(feedback)}
                            className="text-destructive"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Xóa góp ý
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>

                  <CardTitle className="text-lg mt-2">{feedback.title}</CardTitle>
                </CardHeader>

                <CardContent className="pt-0 space-y-4">
                  <p className="text-muted-foreground whitespace-pre-wrap">
                    {feedback.content}
                  </p>

                  {/* Comment toggle */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-2 text-muted-foreground hover:text-foreground"
                    onClick={() => toggleExpand(feedback.id)}
                  >
                    <MessageCircle className="w-4 h-4" />
                    {feedback.comment_count || 0} bình luận
                    {expandedFeedback === feedback.id ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </Button>

                  {/* Comments Section */}
                  {expandedFeedback === feedback.id && (
                    <div className="border-t pt-4 space-y-4">
                      {loadingComments[feedback.id] ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                        </div>
                      ) : (
                        <>
                          {/* Comment list */}
                          {comments[feedback.id]?.length > 0 && (
                            <ScrollArea className="max-h-[300px]">
                              <div className="space-y-3 pr-4">
                                {comments[feedback.id].map(comment => (
                                  <div
                                    key={comment.id}
                                    className={`flex gap-3 p-3 rounded-lg bg-muted/50 ${
                                      comment.is_hidden ? 'opacity-60' : ''
                                    }`}
                                  >
                                    <UserAvatar 
                                      src={comment.user_avatar_url} 
                                      name={comment.user_name}
                                      size="sm"
                                      className="shrink-0"
                                    />
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-medium text-sm">
                                          {comment.user_name}
                                        </span>
                                        <span className="text-xs text-muted-foreground">
                                          {formatTime(comment.created_at)}
                                        </span>
                                        {comment.is_hidden && (
                                          <Badge variant="secondary" className="text-xs">
                                            Đã ẩn
                                          </Badge>
                                        )}
                                      </div>
                                      <p className="text-sm mt-1 whitespace-pre-wrap">
                                        {comment.content}
                                      </p>
                                    </div>
                                    {(comment.user_id === user?.id || isAdmin) && (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 shrink-0"
                                        onClick={() => setCommentToDelete(comment)}
                                      >
                                        <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                                      </Button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </ScrollArea>
                          )}

                          {/* New comment input */}
                          <div className="flex gap-2">
                            <UserAvatar 
                              src={profile?.avatar_url} 
                              name={profile?.full_name}
                              size="sm"
                              className="shrink-0"
                            />
                            <div className="flex-1 flex gap-2">
                              <Input
                                placeholder="Viết bình luận..."
                                value={newComment[feedback.id] || ''}
                                onChange={e =>
                                  setNewComment(prev => ({
                                    ...prev,
                                    [feedback.id]: e.target.value,
                                  }))
                                }
                                onKeyDown={e => {
                                  if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handlePostComment(feedback.id);
                                  }
                                }}
                                className="flex-1"
                              />
                              <Button
                                size="icon"
                                onClick={() => handlePostComment(feedback.id)}
                                disabled={
                                  postingComment[feedback.id] ||
                                  !newComment[feedback.id]?.trim()
                                }
                              >
                                {postingComment[feedback.id] ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Send className="w-4 h-4" />
                                )}
                              </Button>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Delete Feedback Dialog */}
      <AlertDialog open={!!feedbackToDelete} onOpenChange={() => setFeedbackToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xóa góp ý</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc chắn muốn xóa góp ý này? Hành động này không thể hoàn tác và sẽ xóa toàn bộ bình luận liên quan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteFeedback}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
            >
              {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Xóa'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Comment Dialog */}
      <AlertDialog open={!!commentToDelete} onOpenChange={() => setCommentToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xóa bình luận</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc chắn muốn xóa bình luận này?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteComment}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
            >
              {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Xóa'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
